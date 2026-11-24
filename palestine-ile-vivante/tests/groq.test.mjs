// Penseur en ligne (Groq + Gemini) avec de faux points d'accès Vercel : clés, choix du modèle,
// groupe de décisions appliqué, limites gratuites respectées, relais vers un autre modèle.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { PenseurGroq } from '../src/sim/penseur-groq.js';

const stock = {};
globalThis.localStorage = { getItem: (k) => stock[k] ?? null, setItem: (k, v) => { stock[k] = String(v); }, removeItem: (k) => { delete stock[k]; } };
let mode = 'ok';
const envois = [];
const limites = new Map(); // modèle → réponse 429 imposée
const erreurs = new Map(); // modèle → [statut, corps] imposés
globalThis.fetch = async (url, opt = {}) => {
  const h = opt.headers || {};
  const rep = (statut, corps) => ({ ok: statut < 300, status: statut, json: async () => corps });
  if (url === 'api/modeles') {
    if (h['x-fournisseur'] === 'groq') return h['x-cle'] === 'gsk_bonne' ? rep(200, { modeles: ['whisper-large-v3', 'allam-2-7b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'] }) : rep(401, { erreur: 'clé refusée' });
    if (h['x-fournisseur'] === 'gemini') return h['x-cle'] === 'AIza_bonne' ? rep(200, { modeles: ['text-embedding-004', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'imagen-3.0'] }) : rep(401, { erreur: 'clé refusée' });
  }
  if (url === 'api/pensee') {
    const corps = JSON.parse(opt.body);
    envois.push(`${h['x-fournisseur']}|${corps.modele}`);
    if (mode === 'limite') return rep(429, { attente: 7 });
    if (limites.has(corps.modele)) return rep(429, { attente: limites.get(corps.modele) });
    if (erreurs.has(corps.modele)) return rep(...erreurs.get(corps.modele));
    const ids = [...corps.prompt.matchAll(/=== Habitant id=(\d+) ===/g)].map((m) => Number(m[1]));
    return rep(200, { quota: { jetons: mode === 'serre' ? 100 : 50000, jetonsReset: '7.5s', requetes: 20, requetesReset: '2s' }, jetonsUtilises: 3000, texte: JSON.stringify({ habitants: ids.map((id) => ({ id, pensee: 'Je vais au marché.', humeur: 70, action: 'aller', lieu: 'marche', parole: '' })) }) });
  }
  throw new Error('url inattendue ' + url);
};
const attendre = () => new Promise((r) => setTimeout(r, 20));
// le temps du jeu n'avance pas ici : on remet chacun en attente de décision avant chaque envoi
const relancer = (p) => { for (const v of p.sim.habitants) if (v.statut !== 'reflechit') v.statut = 'attend'; p.dernierEnvoi = -1e9; p.tick(); return attendre(); };

const sim = new Simulation({ seed: 5 }).init();
const p = new PenseurGroq(sim);
assert.equal(await p.verifier(), false, 'sans clé, pas de pensée');
assert.equal(await p.enregistrerCle('gsk_mauvaise', 'groq'), false, 'mauvaise clé refusée');
assert.equal(stock['ile-vivante:groq'], undefined, 'une clé refusée est oubliée');
assert.equal(await p.enregistrerCle('gsk_bonne', 'groq'), true);
assert.equal(p.modele, 'llama-3.3-70b-versatile', 'le meilleur modèle disponible est choisi');
assert.deepEqual(p.entrees.map((e) => e.m), ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], 'seuls les modèles connus sont utilisés');
p.tick();
assert.equal(p.actifs, 1, 'un groupe part réfléchir tout seul');
await attendre();
assert.equal(p.stats.ok, 8, 'un groupe de 8 habitants a reçu sa décision');
assert.equal(sim.habitants.filter((v) => v.pensee === 'Je vais au marché.').length, 8);
p.tick();
assert.equal(p.actifs, 0, 'écart minimal entre deux appels respecté');

assert.deepEqual(p.entrees.map((e) => e.principal), [true, false], 'le petit modèle ne sert qu\'en secours');

// limite par minute sur le bon modèle : courte pause, sans alarmer le joueur ni passer au petit modèle
mode = 'limite';
await relancer(p);
assert.equal(sim.habitants.filter((v) => v.statut === 'attend' && v.priorite).length, 8, 'modèle indisponible : les 8 habitants gardent leur tour, en tête de file');
assert.ok(sim.habitants.every((v) => !v.echecs), 'personne n\'est réduit à ne rien faire');
assert.ok(p.pauses.get('groq|llama-3.3-70b-versatile') - performance.now() > 6000, 'limite gratuite : le modèle souffle');
assert.equal(p.derniereErreur, '', 'pause courte : pas de message');
const n = envois.length;
await relancer(p);
assert.equal(envois.length, n, 'pause courte : on attend le bon modèle plutôt que le modèle de secours');

// quota de jetons presque vide : le jeu attend la remise à zéro annoncée
mode = 'serre'; p.pauseJusqua = 0;
await relancer(p);
assert.ok(p.pauses.get('groq|llama-3.3-70b-versatile') - performance.now() > 6000, 'quota de jetons presque vide : ce modèle attend sa remise à zéro');

// quota du jour épuisé partout chez Groq, et pas de clé Gemini : message clair
mode = 'ok'; p.pauseJusqua = 0;
limites.set('llama-3.3-70b-versatile', 3600); limites.set('llama-3.1-8b-instant', 3600);
await relancer(p);
assert.equal(envois.at(-1), 'groq|llama-3.3-70b-versatile');
await relancer(p);
assert.equal(envois.at(-1), 'groq|llama-3.1-8b-instant', 'bon modèle épuisé pour longtemps : le modèle de secours prend le relais');
assert.match(p.derniereErreur, /reprennent dans \d+ min.*clé Gemini/, 'Groq épuisé : le joueur sait quoi faire');

// clé Gemini ajoutée : les habitants continuent avec Gemini, Flash-Lite d'abord
assert.equal(await p.enregistrerCle('AIza_mauvaise', 'gemini'), false, 'mauvaise clé Gemini refusée');
assert.equal(await p.enregistrerCle('AIza_bonne', 'gemini'), true);
assert.deepEqual(p.entrees.filter((e) => e.f === 'gemini').map((e) => e.m), ['gemini-2.5-flash-lite', 'gemini-2.5-flash'], 'Gemini : Flash-Lite puis Flash, rien d\'autre');
assert.deepEqual(p.entrees.map((e) => e.m), ['llama-3.3-70b-versatile', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'llama-3.1-8b-instant'], 'les bons modèles d\'abord, les autres en secours');
for (const m of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) p.pauser({ f: 'groq', m }, 3600e3);
const avant = p.stats.ok, tailleAvant = p.taille;
assert.ok(tailleAvant < 8, 'après des refus de limite, les groupes ont rétréci');
await relancer(p);
assert.equal(envois.at(-1), 'gemini|gemini-2.5-flash-lite');
assert.equal(p.stats.ok, avant + tailleAvant, 'Gemini a pris le relais');
assert.equal(p.parFournisseur.gemini, tailleAvant);
assert.equal(p.fournisseur, 'Groq + Gemini (gratuit)');

// Gemini surchargé (503) : ce modèle souffle, le suivant prend le relais, sans message technique
erreurs.set('gemini-2.5-flash-lite', [503, { erreur: 'Gemini surchargé', attente: 60, detail: 'high demand' }]);
await relancer(p);
assert.equal(p.derniereErreur, '', 'surcharge passagère : rien d\'effrayant pour le joueur');
assert.ok(p.pauses.get('gemini|gemini-2.5-flash-lite') - performance.now() > 50000);
await relancer(p);
assert.equal(envois.at(-1), 'gemini|gemini-2.5-flash', 'le modèle suivant prend le relais');
// modèle inadapté (message trop long pour lui) : écarté pour la partie
erreurs.set('gemini-2.5-flash', [422, { erreur: 'ne convient pas', retirer: true, detail: 'context_length_exceeded' }]);
await relancer(p);
assert.ok(!p.entrees.some((e) => e.m === 'gemini-2.5-flash'), 'modèle inadapté retiré');
assert.deepEqual(p.retires, ['gemini:gemini-2.5-flash']);
assert.equal(p.derniereErreur, '');
assert.match(p.erreurTechnique, /context_length_exceeded/, 'le détail reste disponible pour les rapports');

// retirer une clé
p.oublierCle('gemini');
assert.equal(stock['ile-vivante:gemini'], undefined);
assert.ok(p.entrees.every((e) => e.f === 'groq'));
console.log('En ligne : clés Groq et Gemini vérifiées, modèles choisis, limites respectées, relais entre fournisseurs. OK');

// Bilan du soir : quand peu d'habitants attendent, ceux qui dorment écrivent eux-mêmes ce qu'ils retiennent et ont compris
{
  const sim2 = new Simulation({ seed: 9 }).init();
  const p2 = new PenseurGroq(sim2);
  await p2.enregistrerCle('gsk_bonne', 'groq');
  limites.clear(); erreurs.clear();
  for (const v of sim2.habitants) v.statut = 'agit';
  for (const v of sim2.habitants.slice(0, 3)) v.bilanDu = true;
  const avantFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    if (url !== 'api/pensee') return avantFetch(url, opt);
    const corps = JSON.parse(opt.body);
    assert.match(corps.prompt, /"lecons"/, 'le bilan propose d\'écrire ce qu\'on a compris, sans exemple imposé');
    assert.match(corps.prompt, /"questions"/, 'le bilan laisse une case libre pour ce qu\'on se demande');
    assert.ok(!/Pourquoi|métier|à ta place/i.test(corps.prompt.split('Réponds uniquement')[1] || ''), 'aucune question ni exemple suggéré');
    const ids = [...corps.prompt.matchAll(/=== Habitant id=(\d+) ===/g)].map((m) => Number(m[1]));
    return { ok: true, status: 200, json: async () => ({ texte: JSON.stringify({ habitants: ids.map((id) => ({ id, resume: 'Une journée.', identite: 'Moi.', lecons: `Leçon de ${id}.`, questions: id % 2 ? `Pourquoi ${id} ?` : '' })) }) }) };
  };
  p2.tick();
  await attendre();
  const ecrits = sim2.habitants.slice(0, 3);
  assert.ok(ecrits.every((v) => v.lecons === `Leçon de ${v.id}.` && v.resume && !v.bilanDu), 'chacun garde SA leçon');
  assert.match(sim2.construirePrompt(ecrits[0].id), /Ce que tu as compris de la vie ici : Leçon de/, 'il relit sa leçon au moment de décider');
  const avecQ = ecrits.filter((v) => v.questions);
  assert.ok(avecQ.length > 0 && avecQ.length < ecrits.length, 'une case vide reste vide : on ne force personne à se poser des questions');
  assert.match(sim2.construirePrompt(avecQ[0].id), /Ce que tu te demandes en ce moment : Pourquoi/, 'il relit ses questions au moment de décider');
  globalThis.fetch = avantFetch;
  console.log('Bilan du soir : chaque habitant écrit et relit ce qu\'il a compris. OK');
}

// Plusieurs modèles réfléchissent en même temps, chacun pour son groupe
{
  const sim3 = new Simulation({ seed: 11 }).init();
  const p3 = new PenseurGroq(sim3);
  await p3.enregistrerCle('gsk_bonne', 'groq');
  await p3.enregistrerCle('AIza_bonne', 'gemini');
  limites.clear(); erreurs.clear();
  const avantFetch = globalThis.fetch;
  const enCours = new Set(); let maxSimultanes = 0;
  globalThis.fetch = async (url, opt = {}) => {
    if (url !== 'api/pensee') return avantFetch(url, opt);
    const m = JSON.parse(opt.body).modele;
    assert.ok(!enCours.has(m), 'jamais deux groupes sur le même modèle');
    enCours.add(m); maxSimultanes = Math.max(maxSimultanes, enCours.size);
    await new Promise((r) => setTimeout(r, 30));
    enCours.delete(m);
    return avantFetch(url, opt);
  };
  for (let i = 0; i < 3; i++) { p3.dernierEnvoi = -1e9; p3.tick(); }
  assert.equal(p3.actifs, 3, 'trois groupes partent ensemble');
  p3.dernierEnvoi = -1e9; p3.tick();
  assert.equal(p3.actifs, 3, 'pas plus de trois à la fois');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(maxSimultanes, 3);
  assert.equal(p3.actifs, 0);
  assert.equal(p3.stats.ok, 24, 'trois groupes de 8 décisions');
  globalThis.fetch = avantFetch;
  console.log('Parallèle : trois modèles différents pensent en même temps. OK');
}

// Le bilan du soir n'est jamais affamé, même quand beaucoup d'habitants attendent une décision
{
  const sim4 = new Simulation({ seed: 21 }).init();
  const p4 = new PenseurGroq(sim4);
  await p4.enregistrerCle('gsk_bonne', 'groq');
  limites.clear(); erreurs.clear();
  const avantFetch = globalThis.fetch;
  let bilans = 0, decisions = 0;
  globalThis.fetch = async (url, opt = {}) => {
    if (url !== 'api/pensee') return avantFetch(url, opt);
    const corps = JSON.parse(opt.body);
    const ids = [...corps.prompt.matchAll(/=== Habitant id=(\d+) ===/g)].map((m) => Number(m[1]));
    if (/"lecons"/.test(corps.prompt)) { bilans++; return { ok: true, status: 200, json: async () => ({ texte: JSON.stringify({ habitants: ids.map((id) => ({ id, resume: 'Un jour.', identite: 'Moi.', lecons: 'Rien encore.', questions: '' })) }) }) }; }
    decisions++;
    return avantFetch(url, opt);
  };
  for (const v of sim4.habitants.slice(0, 4)) v.bilanDu = true;
  for (let i = 0; i < 8; i++) {
    for (const v of sim4.habitants) if (!v.bilanDu) { v.statut = 'attend'; v.depuis = i; } // 46 habitants attendent toujours une décision
    p4.dernierEnvoi = -1e9; p4.tick(); await attendre();
  }
  assert.ok(bilans >= 1, `un bilan du soir est parti malgré la file de décisions (${bilans} bilan, ${decisions} décisions)`);
  assert.ok(decisions >= 3, 'les décisions restent prioritaires');
  assert.equal(sim4.habitants.filter((v) => v.bilanDu).length, 0, 'les quatre habitants ont fait leur bilan');
  globalThis.fetch = avantFetch;
  console.log('Équité : le bilan du soir part toutes les 3 décisions quand il y en a à faire. OK');
}

// Les groupes s'adaptent aux limites gratuites : plus petits après un refus, puis ils regrandissent peu à peu
{
  const sim5 = new Simulation({ seed: 31 }).init();
  const p5 = new PenseurGroq(sim5);
  await p5.enregistrerCle('gsk_bonne', 'groq');
  limites.clear(); erreurs.clear();
  assert.equal(p5.taille, 8);
  mode = 'limite';
  await relancer(p5);
  assert.equal(p5.taille, 6, 'un refus de limite : -2');
  for (const m of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) p5.pauses.set(`groq|${m}`, 0);
  await relancer(p5);
  for (const m of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) p5.pauses.set(`groq|${m}`, 0);
  await relancer(p5);
  assert.equal(p5.taille, 4, 'jamais moins de 4');
  await relancer(p5);
  for (const m of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) p5.pauses.set(`groq|${m}`, 0);
  await relancer(p5);
  assert.equal(p5.taille, 4);
  mode = 'ok';
  for (let i = 0; i < 6; i++) { for (const m of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) p5.pauses.set(`groq|${m}`, 0); await relancer(p5); }
  assert.equal(p5.taille, 5, 'après 6 réussites de suite : +1');
  console.log('Quotas : les groupes rétrécissent après un refus et regrandissent ensuite. OK');
}
