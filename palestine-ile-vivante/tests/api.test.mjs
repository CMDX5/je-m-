// Points d'accès Vercel (api/pensee, api/modeles) et appels aux fournisseurs, avec un faux Gemini / Groq.
import assert from 'node:assert/strict';
import pensee from '../api/pensee.js';
import modeles from '../api/modeles.js';

let appels = [], reponse;
globalThis.fetch = async (url, o = {}) => { appels.push({ url, corps: o.body && JSON.parse(o.body) }); return reponse(url, o); };
const res = () => { const r = { setHeader() {}, status(c) { r.code = c; return r; }, json(j) { r.body = j; return r; } }; return r; };
const R = (status, body, headers = {}) => ({ ok: status < 300, status, headers: new Headers(headers), json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const req = (f, body) => ({ method: 'POST', headers: { 'x-fournisseur': f, 'x-cle': 'k' }, body });

reponse = () => R(429, '[{"error":{"code":429,"message":"... GenerateRequestsPerDayPerProjectPerModel-FreeTier ... Please retry in 41.2s."}}]');
let r = res(); await pensee(req('gemini', { prompt: 'x', modele: 'gemini-2.5-flash-lite' }), r);
assert.equal(r.code, 429); assert.equal(r.body.attente, 3600, 'quota du jour : longue attente');
assert.equal(appels.at(-1).url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
assert.equal(appels.at(-1).corps.reasoning_effort, 'low');

reponse = () => R(429, '{"error":{"message":"... PerMinute ... Please retry in 41.2s."}}');
r = res(); await pensee(req('gemini', { prompt: 'x', modele: 'gemini-2.5-flash' }), r);
assert.equal(r.body.attente, 42, 'quota par minute : le délai annoncé');

let n = 0; reponse = () => (n++ === 0 ? R(400, 'bad') : R(200, { choices: [{ message: { content: '{"a":1}' } }], usage: { total_tokens: 9 } }));
r = res(); await pensee(req('gemini', { prompt: 'x', modele: 'gemma-3-27b-it' }), r);
assert.equal(r.code, 200); assert.equal(r.body.texte, '{"a":1}'); assert.equal(r.body.jetonsUtilises, 9);
assert.equal(appels.at(-1).corps.reasoning_effort, undefined, 'repli sans le réglage de réflexion');

reponse = () => R(503, '{"error":{"message":"high demand"}}');
r = res(); await pensee(req('gemini', { prompt: 'x', modele: 'gemini-2.5-flash' }), r);
assert.equal(r.code, 503); assert.equal(r.body.attente, 60);
reponse = () => R(400, '{"error":"context_length_exceeded"}');
r = res(); await pensee(req('groq', { prompt: 'x', modele: 'qwen/qwen3.8-27b' }), r);
assert.equal(r.code, 422); assert.equal(r.body.retirer, true);
reponse = () => R(404, 'nope'); r = res(); await pensee(req('groq', { prompt: 'x', modele: 'm' }), r); assert.equal(r.code, 404);
reponse = () => R(401, 'no'); r = res(); await pensee(req('groq', { prompt: 'x', modele: 'm' }), r); assert.equal(r.code, 401);
r = res(); await pensee({ method: 'GET', headers: {} }, r); assert.equal(r.code, 405);
r = res(); await pensee({ method: 'POST', headers: { 'x-fournisseur': 'inconnu', 'x-cle': 'k' }, body: {} }, r); assert.equal(r.code, 400);
r = res(); await pensee({ method: 'POST', headers: { 'x-fournisseur': 'groq' }, body: { prompt: 'x', modele: 'm' } }, r); assert.equal(r.code, 401, 'sans clé');
r = res(); await pensee(req('groq', { prompt: '', modele: 'm' }), r); assert.equal(r.code, 400);

reponse = () => R(200, { data: [{ id: 'models/gemini-2.5-flash' }] });
r = res(); await modeles({ headers: { 'x-groq-key': 'gsk' } }, r);
assert.equal(appels.at(-1).url, 'https://api.groq.com/openai/v1/models', 'ancienne page : Groq par défaut');
r = res(); await modeles({ headers: { 'x-fournisseur': 'gemini', 'x-cle': 'k' } }, r);
assert.deepEqual(r.body, { modeles: ['gemini-2.5-flash'] }, 'le préfixe « models/ » est retiré');
reponse = () => R(400, 'API key not valid'); r = res(); await modeles({ headers: { 'x-fournisseur': 'gemini', 'x-cle': 'k' } }, r); assert.equal(r.code, 401);
reponse = () => { throw new Error('réseau'); }; r = res(); await modeles({ headers: { 'x-fournisseur': 'groq', 'x-cle': 'k' } }, r); assert.equal(r.code, 502);
console.log('Points d\'accès : appels Groq et Gemini, quotas, surcharges, modèles refusés. OK');

// un fournisseur qui ne répond jamais : la fonction rend la main au lieu de rester bloquée jusqu'à 300 s
{
  const vrai = globalThis.fetch;
  let signal = null;
  globalThis.fetch = async (url, o = {}) => { signal = o.signal; return new Promise((_, rej) => o.signal?.addEventListener('abort', () => rej(new Error('délai')))); };
  const { appelerPensee, listerModeles, DELAI_PENSEE_MS, DELAI_MODELES_MS } = await import('../api/_fournisseurs.js');
  assert.ok(DELAI_PENSEE_MS <= 60000 && DELAI_MODELES_MS <= 30000, 'délais courts');
  const f = { id: 'groq', nom: 'Groq', base: 'https://x', cle: 'k' };
  const t = appelerPensee(f, 'm', 'p'); await new Promise((r) => setTimeout(r, 5)); assert.ok(signal, 'un délai est posé sur l\'appel');
  signal.dispatchEvent(new Event('abort')); const rep = await t;
  assert.equal(rep.status, 502, 'refus propre, la page réessaiera');
  const t2 = listerModeles(f); await new Promise((r) => setTimeout(r, 5)); signal.dispatchEvent(new Event('abort'));
  assert.equal((await t2).status, 502);
  globalThis.fetch = vrai;
  console.log('Fournisseur muet : délai posé, réponse 502 au lieu de rester bloqué. OK');
}
