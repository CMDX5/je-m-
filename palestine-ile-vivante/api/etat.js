// Vercel : l'état du village, gardé hors de la page pour que le relais de nuit puisse le continuer.
// Tout passe par le code du village (choisi par le joueur) ; les clés ne sont jamais renvoyées.
// Corps de requête : l'état du village compressé (gzip), facultatif. Réglages dans l'en-tête x-reglages (JSON).
import { gunzipSync } from 'node:zlib';
import { modifier, vueDoc, docVide, codeValide, creerAcces, demarrerChaine, abandonnerChaine, dependances, DUREE_BAIL_MS, CODE_MIN } from './_village.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ETAT = 6 * 1024 * 1024;

function lireCorps(req) {
  const b = req.body;
  if (!b || (typeof b === 'object' && !Buffer.isBuffer(b) && !Object.keys(b).length)) return null;
  if (Buffer.isBuffer(b)) return b.length ? b : null;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST attendu' });
  const code = String(req.headers['x-code'] || '');
  const action = String(req.headers['x-action'] || '');
  const client = String(req.headers['x-client'] || '').slice(0, 64);
  let reglages = {};
  try { reglages = req.headers['x-reglages'] ? JSON.parse(String(req.headers['x-reglages'])) : {}; } catch { return res.status(400).json({ erreur: 'réglages illisibles' }); }
  if (code.length < CODE_MIN) return res.status(400).json({ erreur: `le code du village doit avoir au moins ${CODE_MIN} caractères` });
  if (!['prendre', 'deposer', 'reglages', 'statut'].includes(action)) return res.status(400).json({ erreur: 'action inconnue' });
  if ((action === 'prendre' || action === 'deposer') && !client) return res.status(400).json({ erreur: 'client manquant' });

  let etat = null;
  const corps = lireCorps(req);
  if (corps) {
    try { etat = gunzipSync(corps, { maxOutputLength: MAX_ETAT }).toString('utf8'); } catch { return res.status(400).json({ erreur: 'état illisible' }); }
    try { const j = JSON.parse(etat); if (j.version !== 3 || !Array.isArray(j.habitants)) throw new Error(); } catch { return res.status(400).json({ erreur: 'état invalide' }); }
  }
  const maintenant = Date.now();

  try {
    const r = await modifier((doc) => {
      if (doc && !codeValide(doc, code)) return { refus: 403 };
      // premier passage : le village est créé avec ce code
      const base = doc ?? docVide(code, maintenant);
      const bailLibre = !base.bail || base.bail.jusqua <= maintenant || base.bail.id === client;

      if (action === 'statut') return { doc: undefined, vue: vueDoc(base) };

      if (action === 'prendre') {
        if (!bailLibre && !reglages.force) return { refus: 409, vue: vueDoc(base) };
        const nouveau = { ...base, bail: { id: client, jusqua: maintenant + DUREE_BAIL_MS } };
        return { doc: nouveau, vue: vueDoc(nouveau), etat: base.etat };
      }
      if (action === 'deposer') {
        if (!bailLibre) return { refus: 409, vue: vueDoc(base) };
        const nouveau = { ...base };
        if (etat) {
          nouveau.etat = etat; nouveau.majA = maintenant;
          try { nouveau.temps = JSON.parse(etat).temps; } catch { /* déjà validé */ }
          if (reglages.idPartie) nouveau.idPartie = String(reglages.idPartie).slice(0, 64);
        }
        if (typeof reglages.veille === 'boolean') {
          nouveau.veille = reglages.veille;
          nouveau.veilleJusqua = reglages.veille ? maintenant + Math.min(24, Math.max(1, Number(reglages.heures) || 10)) * 3600 * 1000 : 0;
        }
        if (reglages.cles) nouveau.cles = { groq: String(reglages.cles.groq || nouveau.cles.groq || ''), gemini: String(reglages.cles.gemini || nouveau.cles.gemini || '') };
        nouveau.bail = reglages.liberer ? null : { id: client, jusqua: maintenant + DUREE_BAIL_MS };
        return { doc: nouveau, vue: vueDoc(nouveau) };
      }
      // reglages : désactiver la veille, effacer les clés, changer de code
      const nouveau = { ...base };
      if (typeof reglages.veille === 'boolean') { nouveau.veille = reglages.veille; nouveau.veilleJusqua = reglages.veille ? maintenant + 10 * 3600 * 1000 : 0; }
      if (reglages.effacerCles) nouveau.cles = { groq: '', gemini: '' };
      if (reglages.cles) nouveau.cles = { groq: String(reglages.cles.groq || nouveau.cles.groq || ''), gemini: String(reglages.cles.gemini || nouveau.cles.gemini || '') };
      if (reglages.nouveauCode && String(reglages.nouveauCode).length >= CODE_MIN) Object.assign(nouveau, creerAcces(String(reglages.nouveauCode)));
      return { doc: nouveau, vue: vueDoc(nouveau) };
    }, { maintenant });

    if (r.refus === 403) { await attendre(500); return res.status(403).json({ erreur: 'code du village incorrect' }); }
    if (r.refus === 409) return res.status(409).json({ erreur: 'une autre page tient déjà le village', ...r.vue });
    // la page s'en va en confiant le village : le relais de nuit démarre tout de suite
    let relais = null;
    if (action === 'deposer' && reglages.liberer && r.vue?.veille) {
      try {
        const d = await demarrerChaine({ maintenant: Date.now() });
        relais = { demarre: d.fait, raison: d.raison };
        if (d.fait) {
          try { await dependances.envoyer(d.corps, req.headers.host); } catch (e) { await abandonnerChaine(d.corps.chaineId); throw e; }
        }
      } catch (e) { console.error('ETAT relais', e?.message); relais = { demarre: false, raison: 'erreur' }; }
    }
    return res.status(200).json({ ...r.vue, ...(r.etat ? { etat: r.etat } : {}), ...(relais ? { relaisLance: relais } : {}) });
  } catch (e) {
    console.error('ETAT erreur', e?.name, e?.message);
    return res.status(503).json({ erreur: 'stockage du village indisponible pour le moment' });
  }
}
