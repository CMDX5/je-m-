// Le village hors de la page : stockage privé (Vercel Blob), accès par code, relais de nuit.
// Fichier préfixé « _ » : Vercel ne le publie pas comme une fonction.
//
// Un seul document, chiffré par aucun secret du site : il contient l'état du village (fictif) et, si le joueur l'a demandé,
// ses clés Groq / Gemini (jamais renvoyées à la page). Il n'est lisible qu'avec le code choisi par le joueur.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { FOURNISSEURS, listerModeles, appelerPensee } from './_fournisseurs.js';
import { faireVivre } from '../src/sim/relais.js';

export const DUREE_BAIL_MS = 3 * 3600 * 1000; // une page ouverte garde la main 3 h sans rien écrire (renouvelée avant)
export const SUITE_MS = 35 * 60 * 1000; // une chaîne de relais est tenue pour vivante 35 min après son dernier point de sauvegarde
export const POINT_MS = 25 * 60 * 1000; // le village est sauvegardé au moins toutes les 25 min (peu d'écritures : le stockage gratuit en limite le nombre)
export const DUREE_MAILLON_S = Number(process.env.VEILLE_DUREE_S) || 300; // durée maximale d'un passage (api/veille.js)
export const BUDGET_MAILLON_MS = (DUREE_MAILLON_S - 70) * 1000; // on garde 70 s pour enregistrer et passer le relais
export const CODE_MIN = 8;
export const nouveauPartage = () => randomBytes(12).toString('hex'); // lien de lecture seule : ne permet que de regarder
export function partageValide(doc, jeton) {
  if (!doc?.partage || typeof jeton !== 'string' || jeton.length !== doc.partage.length) return false;
  return timingSafeEqual(Buffer.from(jeton), Buffer.from(doc.partage));
}
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
  cles: { groq: '', gemini: '' }, relais: null, etat: null, partage: '',
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
const chaineVivante = (doc, maintenant) => !!(doc?.relais?.chaine && doc.relais.chaine.vivantJusqua > maintenant);
export const vueDoc = (doc) => ({
  existe: !!doc?.etat, temps: doc?.temps ?? 0, idPartie: doc?.idPartie ?? null, majA: doc?.majA ?? 0,
  partage: doc?.partage || '', veille: !!doc?.veille, veilleJusqua: doc?.veilleJusqua ?? 0, relais: doc?.relais ? { ...doc.relais, chaine: undefined, enCours: chaineVivante(doc, Date.now()) } : null,
  cles: { groq: !!doc?.cles?.groq, gemini: !!doc?.cles?.gemini },
  bail: doc?.bail && doc.bail.jusqua > Date.now() ? { jusqua: doc.bail.jusqua } : null,
});

// ---------- le relais ----------
export const transportServeur = {
  modeles: async (f, cle) => { const r = await listerModeles({ id: f, ...FOURNISSEURS[f], cle }); return { ok: r.status < 300, status: r.status, json: async () => r.corps }; },
  pensee: async (f, cle, { prompt, modele }) => { const r = await appelerPensee({ id: f, ...FOURNISSEURS[f], cle }, modele, prompt); return { ok: r.status < 300, status: r.status, json: async () => r.corps }; },
};

// ---------- le relais : une chaîne de passages qui s'enchaînent ----------
// Un passage dure 4 minutes au plus (limite d'une fonction). Quand la page part, le serveur lance un premier passage ; chacun
// confie l'état du village au suivant (appel du serveur à lui-même, signé) ; le village n'est écrit dans le stockage que
// tous les 25 minutes et à la fin. La chaîne s'arrête : à l'heure choisie, quand les quotas gratuits sont épuisés, ou dès
// que la page reprend la main.
const secretChaine = () => process.env.CHAINE_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'secret-de-test';
export const signer = (corps) => createHmac('sha256', secretChaine()).update(JSON.stringify(corps)).digest('hex');
export function signatureValide(corps, signature) {
  const a = Buffer.from(signer(corps)), b = Buffer.from(String(signature || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
export const emballer = (etatJson) => gzipSync(Buffer.from(etatJson)).toString('base64');
export const deballer = (b64) => gunzipSync(Buffer.from(b64, 'base64'), { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8');

// Prépare le premier passage si les conditions sont réunies ; l'appelant le lance. Une seule chaîne à la fois.
export async function demarrerChaine({ maintenant = Date.now() } = {}) {
  const m = await stockage();
  const lu = await m.lire();
  const doc = lu?.doc;
  if (!doc?.etat) return { fait: false, raison: 'aucun village' };
  if (!doc.veille || maintenant > doc.veilleJusqua) return { fait: false, raison: 'veille éteinte' };
  if (doc.bail && doc.bail.jusqua > maintenant) return { fait: false, raison: 'la page est ouverte' };
  if (!doc.cles?.groq && !doc.cles?.gemini) return { fait: false, raison: 'aucune clé' };
  if (chaineVivante(doc, maintenant)) return { fait: false, raison: 'le relais travaille déjà' };
  const id = randomBytes(6).toString('hex');
  try {
    await m.ecrire({ ...doc, relais: { ...(doc.relais || {}), raison: undefined, chaine: { id, debut: maintenant, vivantJusqua: maintenant + SUITE_MS } } }, lu.etag);
  } catch (e) { if (estConflit(e)) return { fait: false, raison: 'conflit' }; throw e; }
  return { fait: true, corps: { chaineId: id, etat: emballer(doc.etat), temps: doc.temps, hop: 0, debut: maintenant, dernierPoint: maintenant, cumul: { minutesJeu: 0, decisions: 0, deces: 0, naissances: 0, appels: 0 } } };
}

// Le premier passage n'a pas pu partir : on efface la marque de chaîne pour qu'une autre tentative reste possible.
export async function abandonnerChaine(chaineId) {
  try {
    await modifier((doc) => (doc?.relais?.chaine?.id === chaineId ? { doc: { ...doc, relais: { ...doc.relais, chaine: null, raison: 'démarrage impossible' } } } : { sansEcriture: true }));
  } catch { /* la marque expirera d'elle-même */ }
}

// Un passage : fait vivre le village environ 4 minutes, puis le confie au suivant (ou s'arrête et enregistre).
export async function executerMaillon(corps, { maintenant = () => Date.now(), faire = faireVivre, transport = transportServeur, suivant, budgetMs = BUDGET_MAILLON_MS, horloge, pause } = {}) {
  const m = await stockage();
  const lu = await m.lire();
  const doc = lu?.doc;
  const arret = (raison) => ({ fait: false, fin: true, raison });
  if (!doc?.veille) return arret('veille éteinte');
  if (doc.bail && doc.bail.jusqua > maintenant()) return arret('la page a repris la main');
  if (doc.relais?.chaine?.id !== corps.chaineId) return arret('une autre chaîne a pris le relais');
  if (!doc.cles?.groq && !doc.cles?.gemini) return arret('aucune clé');
  // l'heure choisie est passée : le village est enregistré tel que le passage précédent l'a laissé, puis la chaîne s'arrête
  if (maintenant() > doc.veilleJusqua) {
    const cumulFin = corps.cumul;
    try {
      await m.ecrire({ ...doc, etat: deballer(corps.etat), temps: corps.temps ?? doc.temps, majA: maintenant(), relais: { ...(doc.relais || {}), dernier: maintenant(), ...cumulFin, arret: 'heure', raison: undefined, minutesJeuTotal: (doc.relais?.minutesJeuTotal || 0) + (cumulFin.minutesJeu - (corps.dejaEcrit || 0)), chaine: null } }, lu.etag);
    } catch (e) { if (!estConflit(e)) throw e; return arret('la page a repris la main'); }
    return { fait: true, fin: true, raison: 'heure atteinte', ...cumulFin };
  }

  const r = await faire({ etat: deballer(corps.etat), cles: doc.cles, transport, budgetMs, ...(horloge ? { horloge } : {}), ...(pause ? { pause } : {}) });
  const maint = maintenant();
  const ecrireMarque = async (raison) => { try { await m.ecrire({ ...doc, relais: { ...(doc.relais || {}), dernier: maint, raison, chaine: null } }, lu.etag); } catch { /* la page a repris la main */ } };
  if (!r.ok) { await ecrireMarque(r.raison); return arret(r.raison); }

  const cumul = {
    minutesJeu: corps.cumul.minutesJeu + r.stats.minutesJeu, decisions: corps.cumul.decisions + r.stats.decisions,
    deces: corps.cumul.deces + r.stats.deces, naissances: corps.cumul.naissances + r.stats.naissances, appels: corps.cumul.appels + r.stats.appels,
  };
  const fin = maint > doc.veilleJusqua || r.arret === 'quotas';
  const point = fin || maint - corps.dernierPoint >= POINT_MS;
  if (point) {
    const nouveau = {
      ...doc, etat: r.etat, temps: r.temps, majA: maint,
      relais: {
        dernier: maint, ...r.stats, arret: r.arret, raison: undefined,
        minutesJeuTotal: (doc.relais?.minutesJeuTotal || 0) + (cumul.minutesJeu - (corps.dejaEcrit || 0)),
        chaine: fin ? null : { id: corps.chaineId, debut: corps.debut, vivantJusqua: maint + SUITE_MS },
      },
    };
    nouveau.relais.minutesJeu = cumul.minutesJeu; nouveau.relais.decisions = cumul.decisions; nouveau.relais.deces = cumul.deces; nouveau.relais.naissances = cumul.naissances; nouveau.relais.appels = cumul.appels;
    try { await m.ecrire(nouveau, lu.etag); } catch (e) { if (estConflit(e)) return arret('la page a repris la main'); throw e; }
    corps = { ...corps, dejaEcrit: cumul.minutesJeu };
  }
  if (fin) return { fait: true, fin: true, raison: r.arret === 'quotas' ? 'quotas gratuits épuisés' : 'heure atteinte', ...cumul };
  const prochain = { chaineId: corps.chaineId, etat: emballer(r.etat), temps: r.temps, hop: corps.hop + 1, debut: corps.debut, dernierPoint: point ? maint : corps.dernierPoint, dejaEcrit: corps.dejaEcrit || 0, cumul };
  try { await suivant(prochain); } catch {
    // le relais n'a pas pu passer la main : on enregistre le village tel qu'il est, pour ne rien perdre
    try { await m.ecrire({ ...doc, etat: r.etat, temps: r.temps, majA: maint, relais: { ...(doc.relais || {}), dernier: maint, ...cumul, raison: 'relais interrompu', chaine: null } }, lu.etag); } catch { /* tant pis */ }
    return arret('relais interrompu');
  }
  return { fait: true, suite: true, hop: prochain.hop, ...cumul };
}

// Passe le village au passage suivant : appel du serveur à lui-même, signé (seul ce serveur connaît la clé de signature).
export const dependances = {
  async envoyer(corps, hote) {
    const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `https://${hote}`;
    const r = await fetch(`${base}/api/veille`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-chaine': signer(corps) }, body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
    });
    if (r.status !== 202 && !r.ok) throw new Error(`passage refusé (${r.status})`);
  },
};
