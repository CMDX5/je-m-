// Relais de nuit : le village continue quand la page est fermée.
// Stockage simulé (avec écritures conditionnelles comme Vercel Blob), faux modèles, horloge accélérée.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Simulation } from '../src/sim/simulation.js';
import { faireVivre } from '../src/sim/relais.js';
import etat from '../api/etat.js';
import veille from '../api/veille.js';
import { definirMagasin, lancerRelais, INTERVALLE_RELAIS_MS } from '../api/_village.js';

// ---- stockage simulé ----
function faussMagasin() {
  let doc = null, version = 0;
  const m = {
    ecritures: 0,
    async lire() { return doc ? { doc: JSON.parse(JSON.stringify(doc)), etag: `e${version}` } : null; },
    async ecrire(d, etag) {
      if (etag && etag !== `e${version}`) { const e = new Error('précondition'); e.name = 'BlobPreconditionFailedError'; throw e; }
      doc = JSON.parse(JSON.stringify(d)); version++; m.ecritures++; return `e${version}`;
    },
    brut: () => doc,
    ecrireAilleurs(d) { doc = d; version++; }, // quelqu'un d'autre écrit pendant que le relais travaille
  };
  return m;
}
const res = () => { const r = { setHeader() {}, status(c) { r.code = c; return r; }, json(j) { r.body = j; return r; } }; return r; };
const CODE = 'mon-village-2026';
async function appeler(action, { code = CODE, client = 'page-A', reglages, sim } = {}) {
  const headers = { 'x-code': code, 'x-action': action, 'x-client': client, ...(reglages ? { 'x-reglages': JSON.stringify(reglages) } : {}) };
  const r = res();
  await etat({ method: 'POST', headers, body: sim ? gzipSync(Buffer.from(sim.serialiser())) : undefined }, r);
  return r;
}

// ---- faux modèles : chaque habitant du groupe reçoit une décision « rien » ----
const modelesOk = { modeles: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] };
const transportOk = (journal = []) => ({
  modeles: async () => ({ ok: true, status: 200, json: async () => modelesOk }),
  pensee: async (f, cle, { prompt, modele }) => {
    const ids = [...prompt.matchAll(/=== Habitant id=(\d+) ===/g)].map((x) => Number(x[1]));
    journal.push({ f, cle, modele, n: ids.length });
    const bilan = /"lecons"/.test(prompt);
    const habitants = ids.map((id) => (bilan ? { id, resume: 'Un jour de plus.', identite: 'Moi.', lecons: 'Il faut vivre.', questions: '' } : { id, pensee: 'Je continue.', humeur: 60, action: 'rien', duree_minutes: 30, parole: '' }));
    return { ok: true, status: 200, json: async () => ({ texte: JSON.stringify({ habitants }), quota: { jetons: 50000, jetonsReset: '1s', requetes: 20, requetesReset: '1s' }, jetonsUtilises: 3000 }) };
  },
});
const horlogeRapide = () => {
  let t = 1000;
  return { horloge: () => t, pause: async (ms) => { t += ms; await new Promise((r) => setImmediate(r)); } };
};
const nouveauVillage = () => { const s = new Simulation({ seed: 5 }).init(); s.update(30); return s; };

// ======== 1. faire vivre le village (moteur du relais) ========
{
  const sim = nouveauVillage();
  const calls = [];
  const h = horlogeRapide();
  const avant = sim.temps, vivantsAvant = sim.habitants.length;
  const r = await faireVivre({ etat: sim.serialiser(), cles: { groq: 'gsk_x', gemini: '' }, transport: transportOk(calls), budgetMs: 120000, ...h });
  assert.equal(r.ok, true);
  assert.ok(r.temps > avant + 60, `le temps a coulé (${Math.round(r.temps - avant)} minutes de jeu)`);
  assert.ok(r.stats.decisions > 50, `les habitants ont décidé (${r.stats.decisions} décisions)`);
  assert.ok(calls.length > 5 && calls.every((c) => c.cle === 'gsk_x' && c.f === 'groq'), 'avec la clé enregistrée du joueur');
  assert.ok(r.stats.minutesJeu <= 720, 'jamais plus de 12 h de jeu par passage');
  const apres = Simulation.charger(r.etat);
  assert.ok(Math.abs(apres.temps - r.temps) < 0.01);
  assert.ok(apres.habitants.length <= vivantsAvant + 1 && apres.habitants.length >= vivantsAvant - 3, 'le village est intact');
  assert.ok(apres.habitants.some((v) => v.nbDecisions > 0 && v.pensee === 'Je continue.'), 'ce sont leurs décisions qui ont été appliquées');
}
// le temps ne coule pas sans que les habitants pensent : plus de modèle disponible → arrêt, rien n'avance
{
  const sim = nouveauVillage();
  const h = horlogeRapide();
  const transport = { modeles: async () => ({ ok: true, status: 200, json: async () => modelesOk }), pensee: async () => ({ ok: false, status: 429, json: async () => ({ attente: 3600, quota: {} }) }) };
  const avant = sim.temps;
  const r = await faireVivre({ etat: sim.serialiser(), cles: { groq: 'gsk_x', gemini: '' }, transport, budgetMs: 600000, inactifMs: 30000, ...h });
  assert.equal(r.arret, 'quotas', 'quotas épuisés : le relais s\'arrête au lieu de tourner pour rien');
  assert.ok(r.temps - avant < 60, `et le monde n'a presque pas avancé (${Math.round(r.temps - avant)} minutes) : personne ne pensait`);
}
// aucune clé valable : rien ne se passe
{
  const sim = nouveauVillage();
  const r = await faireVivre({ etat: sim.serialiser(), cles: { groq: '', gemini: '' }, transport: transportOk(), budgetMs: 10000, ...horlogeRapide() });
  assert.equal(r.ok, false);
}

// ======== 2. le point d'accès « état » ========
{
  const m = faussMagasin(); definirMagasin(m);
  const sim = nouveauVillage();
  let r = await appeler('prendre', { code: 'court' }); assert.equal(r.code, 400, 'code trop court');
  r = await appeler('prendre'); assert.equal(r.code, 200); assert.equal(r.body.existe, false, 'premier passage : le village est créé avec ce code');
  r = await appeler('deposer', { sim, reglages: { idPartie: 'p1', veille: true, heures: 10, cles: { groq: 'gsk_secret', gemini: 'AIza_secret' }, liberer: true } });
  assert.equal(r.code, 200); assert.equal(r.body.veille, true); assert.equal(r.body.bail, null);
  assert.deepEqual(r.body.cles, { groq: true, gemini: true });
  assert.ok(!JSON.stringify(r.body).includes('secret'), 'les clés ne sont jamais renvoyées à la page');
  assert.ok(m.brut().veilleJusqua > Date.now() + 9 * 3600e3 && m.brut().veilleJusqua < Date.now() + 11 * 3600e3);
  r = await appeler('prendre', { code: 'autre-code-123' }); assert.equal(r.code, 403, 'mauvais code');
  r = await appeler('statut', { code: 'autre-code-123' }); assert.equal(r.code, 403);
  r = await appeler('prendre', { client: 'page-B' });
  assert.equal(r.code, 200); assert.ok(r.body.etat && JSON.parse(r.body.etat).version === 3, 'on retrouve l\'état déposé');
  r = await appeler('prendre', { client: 'page-A' }); assert.equal(r.code, 409, 'une autre page tient déjà le village');
  r = await appeler('deposer', { client: 'page-A', sim, reglages: {} }); assert.equal(r.code, 409, 'une page qui n\'a pas la main ne peut pas écraser');
  r = await appeler('prendre', { client: 'page-A', reglages: { force: true } }); assert.equal(r.code, 200, 'on peut reprendre la main (autre appareil)');
  r = await appeler('deposer', { client: 'page-A', reglages: { liberer: true } }); assert.equal(r.code, 200, 'sans nouvel état : seulement libérer');
  r = await appeler('reglages', { reglages: { veille: false, effacerCles: true } });
  assert.equal(r.body.veille, false); assert.deepEqual(r.body.cles, { groq: false, gemini: false }, 'effacer les clés du serveur');
  assert.equal(m.brut().cles.groq, '', 'effacées pour de bon');
  // un état invalide est refusé
  const faux = res(); await etat({ method: 'POST', headers: { 'x-code': CODE, 'x-action': 'deposer', 'x-client': 'page-A' }, body: gzipSync(Buffer.from('{"x":1}')) }, faux);
  assert.equal(faux.code, 400);
  const get = res(); await etat({ method: 'GET', headers: {} }, get); assert.equal(get.code, 405);
}

// ======== 3. lancer le relais : seulement quand il le faut ========
{
  const m = faussMagasin(); definirMagasin(m);
  const sim = nouveauVillage();
  const h = horlogeRapide();
  const maintenant = Date.now();
  let r = await lancerRelais({ maintenant, transport: transportOk(), ...h });
  assert.equal(r.raison, 'aucun village');
  await appeler('prendre');
  await appeler('deposer', { sim, reglages: { veille: false, cles: { groq: 'gsk_x' }, liberer: true } });
  r = await lancerRelais({ maintenant, transport: transportOk(), ...h }); assert.equal(r.raison, 'veille éteinte');
  await appeler('reglages', { reglages: { veille: true } });
  await appeler('prendre', { client: 'page-A' });
  r = await lancerRelais({ maintenant, transport: transportOk(), ...h }); assert.equal(r.raison, 'la page est ouverte', 'jamais en même temps que la page');
  await appeler('deposer', { client: 'page-A', reglages: { liberer: true, veille: true, heures: 2 } });
  r = await lancerRelais({ maintenant: maintenant + 3 * 3600e3, transport: transportOk(), ...h }); assert.equal(r.raison, 'veille éteinte', 'la veille s\'éteint après le délai choisi');
  const sansCle = faussMagasin(); definirMagasin(sansCle); await appeler('prendre'); await appeler('deposer', { sim, reglages: { veille: true, liberer: true } });
  r = await lancerRelais({ maintenant, transport: transportOk(), ...h }); assert.equal(r.raison, 'aucune clé');

  // le cas qui marche
  const m2 = faussMagasin(); definirMagasin(m2);
  await appeler('prendre'); await appeler('deposer', { sim, reglages: { idPartie: 'p1', veille: true, heures: 10, cles: { groq: 'gsk_x' }, liberer: true } });
  const t0 = m2.brut().temps;
  r = await lancerRelais({ maintenant, transport: transportOk(), budgetMs: 100000, ...h });
  assert.equal(r.fait, true); assert.ok(r.minutesJeu > 60);
  assert.ok(m2.brut().temps > t0 + 60, 'le village a avancé pendant que la page était fermée');
  assert.equal(m2.brut().relais.dernier, maintenant);
  r = await lancerRelais({ maintenant: maintenant + 60000, transport: transportOk(), ...h }); assert.equal(r.raison, 'trop tôt', 'pas deux relais coup sur coup');
  r = await lancerRelais({ maintenant: maintenant + INTERVALLE_RELAIS_MS + 1000, transport: transportOk(), budgetMs: 100000, ...h }); assert.equal(r.fait, true, 'puis il reprend');

  // la page revient pendant que le relais travaille : son travail est abandonné, jamais l'inverse
  const m3 = faussMagasin(); definirMagasin(m3);
  await appeler('prendre'); await appeler('deposer', { sim, reglages: { veille: true, heures: 10, cles: { groq: 'gsk_x' }, liberer: true } });
  const t1 = m3.brut().temps;
  const faireEtPageRevient = async (opts) => {
    const doc = m3.brut();
    m3.ecrireAilleurs({ ...doc, bail: { id: 'page-A', jusqua: Date.now() + 1e7 }, majA: 123 }); // la page prend la main en cours de route
    return faireVivre(opts);
  };
  r = await lancerRelais({ maintenant, transport: transportOk(), budgetMs: 50000, faire: faireEtPageRevient, ...h });
  assert.equal(r.fait, false); assert.equal(r.raison, 'la page a repris la main');
  assert.equal(m3.brut().majA, 123, 'ce que la page a écrit est intact');
  assert.equal(m3.brut().temps, t1, 'et l\'état n\'a pas été écrasé par le relais');
}

// ======== 4. le point d'accès « veille » (tâche planifiée) ========
{
  definirMagasin(faussMagasin());
  const r = res(); await veille({ method: 'GET', headers: {} }, r);
  assert.equal(r.code, 200); assert.equal(r.body.fait, false); assert.equal(r.body.raison, 'aucun village');
}

console.log('Relais de nuit : le village avance sans la page, jamais en même temps qu\'elle, clés jamais renvoyées. OK');
