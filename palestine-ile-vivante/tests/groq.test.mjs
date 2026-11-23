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
const avant = p.stats.ok;
await relancer(p);
assert.equal(envois.at(-1), 'gemini|gemini-2.5-flash-lite');
assert.equal(p.stats.ok, avant + 8, 'Gemini a pris le relais');
assert.equal(p.parFournisseur.gemini, 8);
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
