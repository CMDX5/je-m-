// Relais de nuit : le village continue quand la page est fermée.
// Stockage simulé (avec écritures conditionnelles comme Vercel Blob), faux modèles, horloge accélérée.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Simulation } from '../src/sim/simulation.js';
import { faireVivre } from '../src/sim/relais.js';
import etat from '../api/etat.js';
import { creerHandler } from '../api/veille.js';
import { definirMagasin, demarrerChaine, executerMaillon, signer, signatureValide, dependances, POINT_MS } from '../api/_village.js';

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
const erreurOrigine = console.error;
console.error = (...a) => { if (!String(a[0]).startsWith('ETAT relais')) erreurOrigine(...a); }; // les échecs simulés sont attendus
const CODE = 'mon-village-2026';
dependances.envoyer = async () => { throw new Error('pas de réseau dans les tests'); }; // le premier passage ne part pas : voir la section 5
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

// ======== 3. la chaîne de passages ========
// fait tourner tous les passages d'une chaîne, chacun « 5 minutes » après le précédent, jusqu'à la fin
async function chaine(corpsDepart, { debutMs, transport, avantPassage, budgetMs = 100000 } = {}) {
  const h = horlogeRapide();
  let corps = corpsDepart, hop = 0, dernier = null, maintenant = debutMs;
  while (corps && hop < 60) {
    if (avantPassage) await avantPassage(hop);
    let suite = null;
    dernier = await executerMaillon(corps, { maintenant: () => maintenant, transport, budgetMs, suivant: async (c) => { suite = c; }, ...h });
    corps = suite; hop++; maintenant += 5 * 60000;
  }
  return { dernier, passages: hop };
}
async function prepare(sim, reglages = {}) {
  const m = faussMagasin(); definirMagasin(m);
  await appeler('prendre');
  await appeler('deposer', { sim, reglages: { idPartie: 'p1', veille: true, heures: 1, cles: { groq: 'gsk_x' }, liberer: true, ...reglages } });
  return m;
}

{
  const sim = nouveauVillage();
  const maintenant = Date.now();
  definirMagasin(faussMagasin());
  assert.equal((await demarrerChaine({ maintenant })).raison, 'aucun village');
  let m = await prepare(sim, { veille: false });
  assert.equal((await demarrerChaine({ maintenant })).raison, 'veille éteinte');
  m = await prepare(sim, { cles: { groq: '', gemini: '' } });
  assert.equal((await demarrerChaine({ maintenant })).raison, 'aucune clé');
  m = await prepare(sim); await appeler('prendre', { client: 'page-A' });
  assert.equal((await demarrerChaine({ maintenant })).raison, 'la page est ouverte', 'jamais en même temps que la page');
  assert.equal((await demarrerChaine({ maintenant: maintenant + 2 * 3600e3 })).raison, 'veille éteinte', 'la veille s\'éteint à l\'heure choisie');
}
{
  // une chaîne complète : une heure de veille, un passage toutes les 5 minutes
  const sim = nouveauVillage();
  const m = await prepare(sim);
  const t0 = m.brut().temps, debutMs = Date.now();
  const ecrituresAvant = m.ecritures;
  const d = await demarrerChaine({ maintenant: debutMs });
  assert.equal(d.fait, true);
  assert.equal((await demarrerChaine({ maintenant: debutMs + 1000 })).raison, 'le relais travaille déjà', 'une seule chaîne à la fois');
  const { dernier, passages } = await chaine(d.corps, { debutMs, transport: transportOk() });
  assert.ok(passages >= 10 && passages <= 14, `les passages s'enchaînent (${passages})`);
  assert.equal(dernier.fin, true); assert.equal(dernier.raison, 'heure atteinte');
  const doc = m.brut();
  assert.ok(doc.temps > t0 + 120, `le village a vécu pendant ce temps (${Math.round(doc.temps - t0)} minutes de jeu)`);
  assert.ok(doc.relais.minutesJeu > 120 && doc.relais.decisions > 100, 'cumul des passages');
  assert.equal(doc.relais.chaine, null, 'chaîne terminée');
  const ecritures = m.ecritures - ecrituresAvant;
  assert.ok(ecritures <= 6, `peu d'écritures malgré ${passages} passages : ${ecritures} (le stockage gratuit les compte)`);
  assert.ok(Simulation.charger(doc.etat).habitants.length >= 45, 'le village est intact');
}
{
  // la page revient en cours de route : le relais s'arrête sans rien écraser
  const sim = nouveauVillage();
  const m = await prepare(sim, { heures: 10 });
  const debutMs = Date.now();
  const d = await demarrerChaine({ maintenant: debutMs });
  let majAvant = null;
  const r = await chaine(d.corps, { debutMs, transport: transportOk(), avantPassage: async (hop) => { if (hop === 3) { await appeler('prendre', { client: 'page-A' }); majAvant = m.brut().majA; } } });
  assert.equal(r.dernier.fin, true); assert.equal(r.dernier.raison, 'la page a repris la main');
  assert.equal(m.brut().majA, majAvant, 'rien n\'a été écrit par le relais après la reprise');
  assert.equal(m.brut().bail.id, 'page-A');
}
{
  // la page reprend la main en écrivant elle-même pendant qu'un passage travaille : le travail du passage est abandonné
  const sim = nouveauVillage();
  const m = await prepare(sim, { heures: 10 });
  const debutMs = Date.now();
  const d = await demarrerChaine({ maintenant: debutMs });
  const h = horlogeRapide();
  const r = await executerMaillon({ ...d.corps, dernierPoint: debutMs - POINT_MS - 1000 }, {
    maintenant: () => debutMs, transport: transportOk(), budgetMs: 50000, suivant: async () => {},
    faire: async (o) => { const doc = m.brut(); m.ecrireAilleurs({ ...doc, majA: 777 }); return faireVivre(o); }, ...h,
  });
  assert.equal(r.raison, 'la page a repris la main');
  assert.equal(m.brut().majA, 777, 'ce que la page a écrit est intact');
}
{
  // quotas du jour épuisés : la chaîne s'arrête et enregistre
  const sim = nouveauVillage();
  const m = await prepare(sim, { heures: 10 });
  const debutMs = Date.now();
  const d = await demarrerChaine({ maintenant: debutMs });
  const transport = { modeles: async () => ({ ok: true, status: 200, json: async () => modelesOk }), pensee: async () => ({ ok: false, status: 429, json: async () => ({ attente: 3600, quota: {} }) }) };
  const h = horlogeRapide();
  const r = await executerMaillon(d.corps, { maintenant: () => debutMs, transport, budgetMs: 200000, suivant: async () => { throw new Error('ne doit pas continuer'); }, ...h });
  assert.equal(r.fin, true); assert.equal(r.raison, 'quotas gratuits épuisés');
  assert.equal(m.brut().relais.chaine, null);
  assert.equal(m.brut().relais.arret, 'quotas');
}
{
  // le passage suivant est refusé : le village est enregistré tel quel
  const sim = nouveauVillage();
  const m = await prepare(sim, { heures: 10 });
  const debutMs = Date.now(); const t0 = m.brut().temps;
  const d = await demarrerChaine({ maintenant: debutMs });
  const r = await executerMaillon(d.corps, { maintenant: () => debutMs, transport: transportOk(), budgetMs: 60000, suivant: async () => { throw new Error('réseau'); }, ...horlogeRapide() });
  assert.equal(r.raison, 'relais interrompu');
  assert.ok(m.brut().temps > t0, 'rien n\'est perdu');
}

// ======== 4. signature et point d'accès « veille » ========
{
  const corps = { chaineId: 'abc', etat: 'x', hop: 1 };
  const sig = signer(corps);
  assert.equal(signatureValide(corps, sig), true);
  assert.equal(signatureValide({ ...corps, hop: 2 }, sig), false, 'un corps modifié est refusé');
  assert.equal(signatureValide(corps, 'x'.repeat(64)), false);
  assert.equal(signatureValide(corps, undefined), false);

  const lances = [];
  const handler = creerHandler({ attendre: (p) => lances.push(p), traiter: async () => {} });
  let r = res(); await handler({ method: 'POST', headers: { 'x-chaine': 'faux' }, body: corps }, r); assert.equal(r.code, 401, 'sans signature valable, rien ne démarre');
  r = res(); await handler({ method: 'POST', headers: { 'x-chaine': sig }, body: corps }, r); assert.equal(r.code, 202); assert.equal(lances.length, 1);
  definirMagasin(faussMagasin());
  r = res(); await handler({ method: 'GET', headers: {} }, r); assert.equal(r.code, 200); assert.equal(r.body.raison, 'aucun village');
  const m = await prepare(nouveauVillage());
  r = res(); await handler({ method: 'GET', headers: {} }, r); assert.equal(r.code, 202, 'un appel sans signature démarre une chaîne si tout est réuni'); assert.equal(lances.length, 2);
  r = res(); await handler({ method: 'GET', headers: {} }, r); assert.equal(r.body.raison, 'le relais travaille déjà');
}

// ======== 5. le départ de la page lance la chaîne ========
{
  const envoyes = [];
  const avant = dependances.envoyer;
  dependances.envoyer = async (corps, hote) => { envoyes.push({ corps, hote }); };
  const m = faussMagasin(); definirMagasin(m);
  const sim = nouveauVillage();
  await appeler('prendre');
  let r = await appeler('deposer', { sim, reglages: { idPartie: 'p1', veille: true, heures: 8, cles: { groq: 'gsk_x' }, liberer: false } });
  assert.equal(envoyes.length, 0, 'tant que la page est ouverte, rien ne démarre');
  r = await appeler('deposer', { sim, reglages: { liberer: true } });
  assert.equal(r.code, 200); assert.equal(envoyes.length, 1, 'la page part : le relais démarre aussitôt');
  assert.equal(r.body.relaisLance.demarre, true);
  assert.equal(envoyes[0].corps.hop, 0); assert.ok(envoyes[0].corps.etat.length > 100);
  // sans veille armée : rien
  const m2 = faussMagasin(); definirMagasin(m2); await appeler('prendre');
  r = await appeler('deposer', { sim, reglages: { veille: false, liberer: true } });
  assert.equal(envoyes.length, 1); assert.equal(r.body.relaisLance, undefined);
  // l'appel interne échoue : la page n'en sait rien et le village est quand même sauvegardé
  dependances.envoyer = async () => { throw new Error('réseau'); };
  const m3 = faussMagasin(); definirMagasin(m3); await appeler('prendre');
  r = await appeler('deposer', { sim, reglages: { veille: true, heures: 8, cles: { groq: 'gsk_x' }, liberer: true } });
  assert.equal(r.code, 200); assert.ok(m3.brut().etat, 'le village est sauvegardé malgré tout');
  dependances.envoyer = avant;
  // un premier passage qui n'a pas pu partir n'empêche pas d'en relancer un
  const m4 = faussMagasin(); definirMagasin(m4); await appeler('prendre');
  await appeler('deposer', { sim, reglages: { veille: true, heures: 8, cles: { groq: 'gsk_x' }, liberer: true } });
  assert.equal(m4.brut().relais.chaine, null, 'la marque de chaîne est effacée');
  assert.equal((await demarrerChaine({ maintenant: Date.now() })).fait, true, 'et on peut relancer tout de suite');
}

console.log('Relais de nuit : chaîne de passages, une seule à la fois, jamais en même temps que la page, peu d\'écritures, signature. OK');
