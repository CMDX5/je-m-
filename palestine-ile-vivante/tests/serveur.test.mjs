// Test de la chaîne serveur → modèle de langage, avec un FAUX serveur Ollama
// (même protocole : /api/tags, /api/chat avec schéma JSON en `format`).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Simulation } from '../src/sim/simulation.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const portFaux = 21000 + Math.floor(Math.random() * 2000);
const portJeu = portFaux + 3000;
let appels = [];
let mode = 'ok';
let cible = 'Omar';

const faux = createServer(async (req, res) => {
  const corps = await new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
  if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b' }] })); return; }
  if (req.url === '/api/chat') {
    const j = JSON.parse(corps);
    appels.push(j);
    if (mode === 'poubelle') { res.end(JSON.stringify({ message: { content: 'Je ne sais pas quoi dire.' } })); return; }
    if (j.messages[1].content.includes('tu vas dormir')) { res.end(JSON.stringify({ message: { content: JSON.stringify({ resume: 'Une vie simple.', identite: 'Je suis du village.' }) } })); return; }
    const d = { pensee: 'Je dois manger quelque chose.', humeur: 62, action: 'parler', personne: cible, parole: `Bonjour ${cible}, as-tu du pain ?`, ton: 'chaleureux', souvenir: `Je suis allé voir ${cible}.` };
    res.end(JSON.stringify({ message: { content: '```json\n' + JSON.stringify(d) + '\n```' } })); return;
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => faux.listen(portFaux, '127.0.0.1', r));

function lancer(env) {
  const p = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: String(portJeu), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  p.stdout.on('data', (d) => (sortie += d));
  p.stderr.on('data', (d) => (sortie += d));
  return { p, sortie: () => sortie };
}
const get = (u) => fetch(`http://127.0.0.1:${portJeu}${u}`).then(async (r) => ({ statut: r.status, corps: await r.json().catch(() => null) }));
const post = (u, o) => fetch(`http://127.0.0.1:${portJeu}${u}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(async (r) => ({ statut: r.status, corps: await r.json().catch(() => null) }));

try {
  // 1) avec Ollama
  let s = lancer({ LLM_PROVIDER: 'ollama', OLLAMA_HOST: `http://127.0.0.1:${portFaux}`, OLLAMA_MODEL: 'qwen2.5:3b' });
  await attendre(1200);
  let c = await get('/api/config');
  assert.equal(c.corps.disponible, true, `Ollama détecté (${s.sortie()})`);
  assert.equal(c.corps.fournisseur, 'ollama');

  const sim = new Simulation({ seed: 3 }).init();
  const v = sim.habitant(4);
  cible = sim.habitant(9).prenom;
  const prompt = sim.construirePrompt(v.id);
  let r = await post('/api/pensee', { type: 'decision', id: v.id, prompt });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  const q = appels.at(-1);
  assert.equal(q.stream, false);
  assert.equal(q.format.type, 'object', 'le schéma JSON est transmis à Ollama');
  assert.ok(q.messages[0].role === 'system' && /Tu es un habitant/.test(q.messages[0].content), 'le texte système est envoyé');
  assert.equal(q.messages[1].content, prompt, 'la perception est envoyée telle quelle');
  assert.equal(r.corps.action, 'parler', 'la réponse (même entourée de ```json) est décodée');
  // la décision est appliquée au monde
  sim.marquerEnvoye(v.id);
  sim.appliquer(v.id, r.corps);
  assert.equal(v.pensee, 'Je dois manger quelque chose.');
  assert.equal(v.humeur, 62);
  assert.ok(v.souvenirs.some((x) => x.texte.includes(cible)), 'le souvenir écrit par l’habitant est conservé');
  assert.equal(v.activite.action, 'parler');

  r = await post('/api/pensee', { type: 'bilan', id: v.id, prompt: 'Tu vas dormir. tu vas dormir' });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.resume, 'Une vie simple.');
  r = await post('/api/pensee', { type: 'nimportequoi', id: 1, prompt: 'x' });
  assert.equal(r.statut, 400);

  mode = 'poubelle';
  r = await post('/api/pensee', { type: 'decision', id: 1, prompt });
  assert.equal(r.statut, 502, 'une réponse illisible est signalée');
  mode = 'ok';

  // 2) Ollama disparaît
  faux.close(); faux.closeAllConnections?.();
  await attendre(100);
  r = await post('/api/pensee', { type: 'decision', id: 1, prompt });
  assert.equal(r.statut, 503, 'fournisseur injoignable → 503');
  c = await get('/api/config');
  assert.equal(c.corps.disponible, false);
  assert.ok(/ollama|injoignable/i.test(c.corps.raison), `message d'aide : ${c.corps.raison}`);
  s.p.kill();
  await attendre(300);

  // 3) aucun fournisseur
  s = lancer({ OLLAMA_HOST: `http://127.0.0.1:${portFaux}`, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', OPENAI_BASE_URL: '' });
  await attendre(1500);
  c = await get('/api/config');
  assert.equal(c.corps.disponible, false);
  assert.ok(/ollama pull/.test(c.corps.raison), `la raison explique comment installer le modèle : ${c.corps.raison}`);
  r = await post('/api/pensee', { type: 'decision', id: 1, prompt });
  assert.equal(r.statut, 503);
  s.p.kill();
  console.log('Serveur : Ollama (protocole simulé), réponse en JSON décodée et appliquée, pannes signalées. OK');
} finally {
  faux.close();
  faux.closeAllConnections?.();
}
process.exit(0);
