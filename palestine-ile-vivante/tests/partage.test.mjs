// Lien de lecture seule : les amis regardent le village sans clé, sans rien pouvoir changer.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Simulation } from '../src/sim/simulation.js';
import etat from '../api/etat.js';
import regarder from '../api/regarder.js';
import { definirMagasin } from '../api/_village.js';

let doc = null, version = 0;
definirMagasin({
  async lire() { return doc ? { doc: JSON.parse(JSON.stringify(doc)), etag: `e${version}` } : null; },
  async ecrire(d) { doc = JSON.parse(JSON.stringify(d)); version++; return `e${version}`; },
});
const res = () => { const r = { h: {}, setHeader(k, v) { r.h[k.toLowerCase()] = v; }, status(c) { r.code = c; return r; }, json(j) { r.body = j; return r; }, send(t) { r.texte = t; return r; } }; return r; };
const CODE = 'village-des-amis-1';
const sim = new Simulation({ seed: 7 }).init();
const appeler = async (action, reglages = {}, avecEtat = false) => {
  const r = res();
  await etat({ method: 'POST', headers: { 'x-code': CODE, 'x-action': action, 'x-client': 'A', 'x-reglages': JSON.stringify(reglages) }, body: avecEtat ? gzipSync(Buffer.from(sim.serialiser())) : undefined }, r);
  return r;
};
const voir = async (t) => { const r = res(); await regarder({ method: 'GET', query: { t } }, r); return r; };

let r = await appeler('deposer', { idPartie: 'p', veille: true, heures: 6, cles: { groq: 'gsk_SECRET', gemini: 'AIza_SECRET' } }, true);
assert.equal(r.code, 200); assert.equal(r.body.partage, '', 'pas de lien tant qu’on n’en a pas créé');
assert.equal((await voir('')).code, 404, 'sans jeton : rien');
assert.equal((await voir('devine')).code, 404);

r = await appeler('reglages', { partage: true });
const jeton = r.body.partage;
assert.match(jeton, /^[0-9a-f]{24}$/, 'un jeton propre au village');
r = await appeler('reglages', { partage: true }); assert.equal(r.body.partage, jeton, 'redemander ne change pas le lien');

r = await voir(jeton);
assert.equal(r.code, 200);
assert.equal(JSON.parse(r.texte).version, 3, 'on reçoit l’état du village');
assert.ok(!/SECRET|codeHash|\"sel\"/.test(r.texte), 'jamais de clé, de code ou de sel');
assert.ok(Number(r.h['x-maj']) > 0);
assert.equal(Simulation.charger(r.texte).habitants.length, 50, 'le village se recharge tel quel');
assert.equal((await voir(jeton.slice(0, -1) + (jeton.endsWith('0') ? '1' : '0'))).code, 404, 'un jeton presque juste ne passe pas');
const post = res(); await regarder({ method: 'POST', query: { t: jeton } }, post); assert.equal(post.code, 405, 'lecture seule : GET uniquement');
assert.equal((await appeler('prendre', {}, false)).code, 200, 'le propriétaire garde la main avec son code');
assert.equal((await appeler('prendre', {}, false)).body.partage, jeton);

r = await appeler('reglages', { partage: false });
assert.equal(r.body.partage, '');
assert.equal((await voir(jeton)).code, 404, 'lien coupé : plus personne ne regarde');
console.log('Partage en lecture seule : lien secret, aucune clé divulguée, lien révocable. OK');
