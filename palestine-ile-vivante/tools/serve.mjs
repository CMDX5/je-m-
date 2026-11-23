// Serveur local : fichiers statiques + pensée des habitants (/api/pensee).
// `npm start` puis http://localhost:8080
//
// Fournisseur de pensée (variable LLM_PROVIDER, sinon détection automatique dans cet ordre) :
//   ollama     modèle local et GRATUIT (https://ollama.com). OLLAMA_MODEL (défaut qwen2.5:3b), OLLAMA_HOST.
//   openai     tout serveur compatible OpenAI : LM Studio, llama.cpp, OpenRouter, Groq…
//              OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_API_KEY.
//   anthropic  Claude Haiku 5.5 (payant, très peu cher). ANTHROPIC_API_KEY ou `ant auth login`.
// Sans fournisseur, le village reste figé : les habitants n'ont rien pour penser.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES } from '../src/sim/prompts.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const OPENAI_MODEL = process.env.OPENAI_MODEL || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const CLAUDE_MODELE = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const DELAI = Number(process.env.LLM_TIMEOUT_MS) || 120000;

// ---------- Fournisseurs ----------
async function ollama(T, prompt) {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(DELAI),
    body: JSON.stringify({
      model: OLLAMA_MODEL, stream: false, format: T.schema, keep_alive: '30m',
      options: { temperature: 0.8, num_predict: T.maxTokens, num_ctx: 4096 },
      messages: [{ role: 'system', content: T.systeme }, { role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`Ollama ${r.status} : ${(await r.text()).slice(0, 160)}`), { statut: r.status === 404 ? 503 : 502 });
  const j = await r.json();
  return j.message?.content ?? '';
}

async function openai(T, prompt) {
  const systeme = `${T.systeme}\n\nFormat de réponse : un objet JSON conforme à ce schéma, sans aucun texte autour :\n${JSON.stringify(T.schema)}`;
  const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(DELAI),
    headers: { 'Content-Type': 'application/json', ...(OPENAI_KEY ? { Authorization: `Bearer ${OPENAI_KEY}` } : {}) },
    body: JSON.stringify({
      model: OPENAI_MODEL, temperature: 0.8, max_tokens: T.maxTokens, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systeme }, { role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`API ${r.status} : ${(await r.text()).slice(0, 160)}`), { statut: r.status === 401 || r.status === 403 ? 503 : 502 });
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

let Anthropic = null, claude = null;
async function anthropic(T, prompt) {
  if (!claude) {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    claude = new Anthropic();
  }
  try {
    const rep = await claude.messages.create({
      model: CLAUDE_MODELE, max_tokens: 1500, system: T.systeme,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: T.schema } },
      messages: [{ role: 'user', content: prompt }],
    });
    if (rep.stop_reason === 'refusal') throw Object.assign(new Error('refus du modèle'), { statut: 502 });
    return rep.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (e) {
    if (Anthropic && e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('identifiants Anthropic refusés'), { statut: 503 });
    throw e;
  }
}

const FOURNISSEURS = {
  ollama: { appeler: ollama, modele: () => OLLAMA_MODEL, concurrence: Number(process.env.LLM_CONCURRENCE) || 2 },
  openai: { appeler: openai, modele: () => OPENAI_MODEL || '(modèle du serveur)', concurrence: Number(process.env.LLM_CONCURRENCE) || 4 },
  anthropic: { appeler: anthropic, modele: () => CLAUDE_MODELE, concurrence: Number(process.env.LLM_CONCURRENCE) || 6 },
};

// ---------- Détection ----------
let actif = null; // { nom, ... }
let raison = '';
let derniereDetection = 0;

async function detecter() {
  derniereDetection = Date.now();
  const voulu = process.env.LLM_PROVIDER;
  const essais = voulu && voulu !== 'auto' ? [voulu] : ['ollama', 'openai', 'anthropic'];
  const notes = [];
  for (const nom of essais) {
    try {
      if (nom === 'ollama') {
        const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const installes = (j.models || []).map((m) => m.name);
        if (installes.length && !installes.some((n) => n === OLLAMA_MODEL || n.startsWith(`${OLLAMA_MODEL}:`) || n.split(':')[0] === OLLAMA_MODEL)) {
          notes.push(`Ollama tourne mais le modèle « ${OLLAMA_MODEL} » n'est pas installé (installés : ${installes.join(', ') || 'aucun'}). Lancez : ollama pull ${OLLAMA_MODEL}`);
          continue;
        }
      } else if (nom === 'openai') {
        if (!OPENAI_BASE) { notes.push('OPENAI_BASE_URL non défini.'); continue; }
      } else if (nom === 'anthropic') {
        try { await import('@anthropic-ai/sdk'); } catch { notes.push('SDK Anthropic non installé (npm install).'); continue; }
        if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) { notes.push('Aucun identifiant Anthropic (ANTHROPIC_API_KEY).'); continue; }
      } else { notes.push(`Fournisseur inconnu : ${nom}`); continue; }
      actif = { nom, ...FOURNISSEURS[nom] };
      raison = '';
      return;
    } catch (e) {
      notes.push(nom === 'ollama' ? `Ollama injoignable sur ${OLLAMA_HOST}. Installez-le (https://ollama.com) puis : ollama pull ${OLLAMA_MODEL}` : `${nom} : ${e.message}`);
    }
  }
  actif = null;
  raison = notes.join(' ') || 'Aucun modèle de langage connecté.';
}

// ---------- Réponses ----------
function extraireJson(txt) {
  const s = String(txt).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch { /* on cherche un objet dans le texte */ }
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
  throw new SyntaxError('JSON introuvable');
}

async function lireCorps(req) {
  let n = 0;
  const morceaux = [];
  for await (const m of req) {
    n += m.length;
    if (n > 64 * 1024) throw Object.assign(new Error('requête trop grosse'), { statut: 413 });
    morceaux.push(m);
  }
  return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
}

function json(res, statut, objet) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(objet));
}

async function apiConfig(res) {
  if (!actif && Date.now() - derniereDetection > 4000) await detecter();
  json(res, 200, { disponible: !!actif, fournisseur: actif?.nom ?? null, modele: actif?.modele() ?? null, concurrence: actif?.concurrence ?? 2, raison });
}

async function apiPensee(req, res) {
  if (!actif) { await detecter(); if (!actif) return json(res, 503, { erreur: raison }); }
  try {
    const corps = await lireCorps(req);
    const T = TYPES[corps.type];
    if (!T || typeof corps.prompt !== 'string') return json(res, 400, { erreur: 'requête invalide' });
    const brut = await actif.appeler(T, corps.prompt.slice(0, 12000));
    const d = extraireJson(brut);
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new SyntaxError('réponse inattendue');
    return json(res, 200, d);
  } catch (e) {
    if (e.statut === 503) { actif = null; raison = `Le fournisseur a refusé la requête : ${e.message}`; return json(res, 503, { erreur: raison }); }
    if (e.statut) return json(res, e.statut, { erreur: e.message });
    if (e instanceof SyntaxError) return json(res, 502, { erreur: `réponse illisible du modèle (${e.message})` });
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return json(res, 504, { erreur: 'le modèle a mis trop de temps à répondre' });
    if (e.cause?.code === 'ECONNREFUSED' || e.message === 'fetch failed') { actif = null; raison = 'Le fournisseur de modèle est injoignable.'; return json(res, 503, { erreur: raison }); }
    console.error(e);
    return json(res, 502, { erreur: e.message.slice(0, 160) });
  }
}

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (chemin === '/api/config' && req.method === 'GET') return apiConfig(res);
  if (chemin === '/api/pensee' && req.method === 'POST') return apiPensee(req, res);
  const fichier = normalize(join(racine, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(racine)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': types[extname(fichier)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(port, async () => {
  await detecter();
  console.log(`Île Vivante : http://localhost:${port}`);
  console.log(actif ? `Pensée des habitants : ${actif.nom} (${actif.modele()})` : `Aucun modèle de langage connecté. ${raison}`);
});
