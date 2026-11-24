// Le village hors de la page : stockage privé (Vercel Blob), accès par code, relais de nuit.
// Fichier préfixé « _ » : Vercel ne le publie pas comme une fonction.
//
// Un seul document, chiffré par aucun secret du site : il contient l'état du village (fictif) et, si le joueur l'a demandé,
// ses clés Groq / Gemini (jamais renvoyées à la page). Il n'est lisible qu'avec le code choisi par le joueur.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { FOURNISSEURS, listerModeles, appelerPensee } from './_fournisseurs.js';
import { faireVivre } from '../src/sim/relais.js';

export const DUREE_BAIL_MS = 3 * 3600 * 1000; // une page ouverte garde la main 3 h sans rien écrire (renouvelée avant)
export const INTERVALLE_RELAIS_MS = 8 * 60 * 1000; // au plus un relais toutes les 8 minutes, quoi qu'on appelle
export const CODE_MIN = 8;
const CHEMIN = 'village/etat.json.gz';

// ---------- stockage ----------
let magasin = null;
export const definirMagasin = (m) => { magasin = m; };
export function estConflit(e) { return e?.name === 'BlobPreconditionFailedError' || e?.code === 'CONFLIT'; }

async function magasinBlob() {
  const { put, get } = await import('@vercel/blob');
  return {
    async lire() {
      let r;
      try { r = await get(CHEMIN, { access: 'private', useCache: false }); } catch (e) { if (e?.name === 'BlobNotFoundError') return null; throw e; }
      if (!r || r.statusCode !== 200) return null;
      const tampon = Buffer.from(await new Response(r.stream).arrayBuffer());
      return { doc: JSON.parse(gunzipSync(tampon).toString('utf8')), etag: r.blob.etag };
    },
    async ecrire(doc, etag) {
      const r = await put(CHEMIN, gzipSync(Buffer.from(JSON.stringify(doc))), {
        access: 'private', allowOverwrite: true, contentType: 'application/gzip', cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag } : {}),
      });
      return r.etag;
    },
  };
}
export async function stockage() { return (magasin ||= await magasinBlob()); }

// ---------- code du village ----------
const empreinte = (sel, code) => createHash('sha256').update(`${sel}:${code}`).digest('hex');
export function creerAcces(code) { const sel = randomBytes(8).toString('hex'); return { sel, codeHash: empreinte(sel, code) }; }
export function codeValide(doc, code) {
  if (!doc || typeof code !== 'string' || code.length < CODE_MIN) return false;
  const a = Buffer.from(empreinte(doc.sel, code)), b = Buffer.from(doc.codeHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const docVide = (code, maintenant) => ({
  v: 1, ...creerAcces(code), idPartie: null, temps: 0, majA: maintenant, bail: null, veille: false, veilleJusqua: 0,
  cles: { groq: '', gemini: '' }, relais: null, etat: null,
});

// Lecture puis écriture protégées : si quelqu'un a écrit entre-temps, on relit et on recommence (3 fois au plus).
export async function modifier(fn, { maintenant = Date.now() } = {}) {
  const m = await stockage();
  for (let essai = 0; essai < 3; essai++) {
    const lu = await m.lire();
    const resultat = fn(lu?.doc ?? null);
    if (!resultat || resultat.doc === undefined) return resultat ?? { sansEcriture: true };
    try {
      await m.ecrire(resultat.doc, lu?.etag);
      return resultat;
    } catch (e) { if (!estConflit(e)) throw e; }
  }
  const e = new Error('conflit persistant'); e.code = 'CONFLIT'; throw e;
}

// Ce que la page a le droit de voir : jamais les clés
export const vueDoc = (doc) => ({
  existe: !!doc?.etat, temps: doc?.temps ?? 0, idPartie: doc?.idPartie ?? null, majA: doc?.majA ?? 0,
  veille: !!doc?.veille, veilleJusqua: doc?.veilleJusqua ?? 0, relais: doc?.relais ?? null,
  cles: { groq: !!doc?.cles?.groq, gemini: !!doc?.cles?.gemini },
  bail: doc?.bail && doc.bail.jusqua > Date.now() ? { jusqua: doc.bail.jusqua } : null,
});

// ---------- le relais ----------
export const transportServeur = {
  modeles: async (f, cle) => { const r = await listerModeles({ id: f, ...FOURNISSEURS[f], cle }); return { ok: r.status < 300, status: r.status, json: async () => r.corps }; },
  pensee: async (f, cle, { prompt, modele }) => { const r = await appelerPensee({ id: f, ...FOURNISSEURS[f], cle }, modele, prompt); return { ok: r.status < 300, status: r.status, json: async () => r.corps }; },
};

// Fait vivre le village un moment s'il y a lieu. Renvoie { fait, raison, ... } ; ne lève pas d'erreur pour un cas normal.
export async function lancerRelais({ maintenant = Date.now(), budgetMs = 240000, faire = faireVivre, transport = transportServeur, horloge, pause } = {}) {
  const m = await stockage();
  const lu = await m.lire();
  const doc = lu?.doc;
  if (!doc?.etat) return { fait: false, raison: 'aucun village' };
  if (!doc.veille || maintenant > doc.veilleJusqua) return { fait: false, raison: 'veille éteinte' };
  if (doc.bail && doc.bail.jusqua > maintenant) return { fait: false, raison: 'la page est ouverte' };
  if (doc.relais?.dernier && maintenant - doc.relais.dernier < INTERVALLE_RELAIS_MS) return { fait: false, raison: 'trop tôt' };
  if (!doc.cles?.groq && !doc.cles?.gemini) return { fait: false, raison: 'aucune clé' };

  const options = { etat: doc.etat, cles: doc.cles, transport, budgetMs, ...(horloge ? { horloge } : {}), ...(pause ? { pause } : {}) };
  const r = await faire(options);
  if (!r.ok) {
    // on note l'échec (sans réécrire l'état) pour ne pas retenter à chaque appel
    try { await m.ecrire({ ...doc, relais: { ...(doc.relais || {}), dernier: maintenant, raison: r.raison } }, lu.etag); } catch { /* la page a repris la main */ }
    return { fait: false, raison: r.raison };
  }
  const nouveau = {
    ...doc, etat: r.etat, temps: r.temps, majA: maintenant,
    relais: { dernier: maintenant, ...r.stats, arret: r.arret, minutesJeuTotal: (doc.relais?.minutesJeuTotal || 0) + r.stats.minutesJeu },
  };
  try {
    await m.ecrire(nouveau, lu.etag); // refusé si la page a repris la main pendant ce temps : le travail du relais est alors abandonné
  } catch (e) {
    if (estConflit(e)) return { fait: false, raison: 'la page a repris la main', ...r.stats };
    throw e;
  }
  return { fait: true, ...r.stats, arret: r.arret };
}
