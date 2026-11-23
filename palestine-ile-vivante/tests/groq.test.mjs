// Penseur Groq (mode en ligne) avec de faux points d'accès Vercel : clé, choix du modèle,
// groupe de décisions appliqué, limite gratuite respectée.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { PenseurGroq } from '../src/sim/penseur-groq.js';

const stock = {};
globalThis.localStorage = { getItem: (k) => stock[k] ?? null, setItem: (k, v) => { stock[k] = String(v); }, removeItem: (k) => { delete stock[k]; } };
let mode = 'ok', vus = [];
globalThis.fetch = async (url, opt = {}) => {
  vus.push({ url, cle: opt.headers?.['x-groq-key'] });
  const rep = (statut, corps) => ({ ok: statut < 300, status: statut, json: async () => corps });
  if (url === 'api/modeles') return opt.headers['x-groq-key'] === 'gsk_bonne' ? rep(200, { modeles: ['whisper-large-v3', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'] }) : rep(401, { erreur: 'clé refusée' });
  if (url === 'api/pensee') {
    if (mode === 'limite') return rep(429, { attente: 7 });
    const corps = JSON.parse(opt.body);
    const ids = [...corps.prompt.matchAll(/=== Habitant id=(\d+) ===/g)].map((m) => Number(m[1]));
    assert.equal(corps.modele, 'llama-3.3-70b-versatile');
    return rep(200, { texte: JSON.stringify({ habitants: ids.map((id) => ({ id, pensee: 'Je vais au marché.', humeur: 70, action: 'aller', lieu: 'marche', parole: '' })) }) });
  }
  throw new Error('url inattendue ' + url);
};

const sim = new Simulation({ seed: 5 }).init();
const p = new PenseurGroq(sim);
assert.equal(await p.verifier(), false, 'sans clé, pas de pensée');
assert.equal(await p.enregistrerCle('gsk_mauvaise'), false, 'mauvaise clé refusée');
assert.equal(stock['ile-vivante:groq'], undefined, 'une clé refusée est oubliée');
assert.equal(await p.enregistrerCle('gsk_bonne'), true);
assert.equal(p.modele, 'llama-3.3-70b-versatile', 'le meilleur modèle disponible est choisi');
p.tick();
assert.equal(p.actifs, 1, 'un groupe part réfléchir tout seul');
await new Promise((r) => setTimeout(r, 20));
assert.equal(p.stats.ok, 8, '8 habitants ont reçu leur décision');
assert.equal(sim.habitants.filter((v) => v.pensee === 'Je vais au marché.').length, 8);
p.tick();
assert.equal(p.actifs, 0, 'écart minimal entre deux appels respecté');
p.dernierEnvoi = -1e9; mode = 'limite';
p.tick();
await new Promise((r) => setTimeout(r, 20));
assert.ok(/reprennent dans 7 s/.test(p.derniereErreur), 'limite gratuite : pause annoncée');
p.dernierEnvoi = -1e9;
p.tick();
assert.equal(p.actifs, 0, 'pas de nouvel appel pendant la pause');
console.log('Groq : clé vérifiée, modèle choisi, décisions appliquées, limite respectée. OK');
