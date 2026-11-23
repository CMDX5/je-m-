// Serveur local : fichiers statiques + /api/esprit (réflexion et parole des habitants via Claude).
// `npm start` puis http://localhost:8080
// Sans identifiants Anthropic (ou sans le SDK installé), /api/esprit répond 503 et le jeu
// utilise ses réflexions locales : tout reste jouable.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const MODELE = 'claude-opus-5-5';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// ---------- Claude ----------
let Anthropic = null;
let client = null;
try {
  ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  client = new Anthropic(); // identifiants : ANTHROPIC_API_KEY, ou profil `ant auth login`
} catch (e) {
  console.log('Claude indisponible (SDK absent ou identifiants manquants) : réflexions locales uniquement.');
}
let enPanneJusqua = 0;

const GESTES = ['aucune', 'cultiver', 'pecher', 'olives', 'pierre', 'bois', 'artisanat', 'commercer', 'soigner', 'enseigner', 'construire', 'donner', 'visiter', 'aider', 'confronter', 'prier', 'plage', 'source', 'belvedere', 'place', 'port', 'rester', 'se_soigner'];

const INTENTION = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'cible', 'raison'],
  properties: {
    action: { type: 'string', enum: GESTES, description: "Ce que l'habitant compte faire demain ('aucune' si rien de particulier)." },
    cible: { type: 'string', description: "Prénom de la personne concernée, ou chaîne vide." },
    raison: { type: 'string', description: 'Pourquoi, en quelques mots, à la première personne.' },
  },
};

const SCHEMAS = {
  reflexion: {
    type: 'object',
    additionalProperties: false,
    required: ['pensee', 'croyances', 'intention'],
    properties: {
      pensee: { type: 'string', description: 'Ce que l’habitant se dit en repensant à sa journée : une ou deux phrases, à la première personne.' },
      croyances: {
        type: 'array',
        description: '0 à 3 conclusions qu’il tire sur quelqu’un ou sur le conseil.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sujet', 'valence', 'texte'],
          properties: {
            sujet: { type: 'string', description: "Prénom d'un habitant cité dans le contexte, ou « conseil »." },
            valence: { type: 'number', description: 'De -1 (très négatif) à 1 (très positif).' },
            texte: { type: 'string', description: 'La conclusion, à la première personne.' },
          },
        },
      },
      intention: INTENTION,
    },
  },
  dialogue: {
    type: 'object',
    additionalProperties: false,
    required: ['texte', 'ressenti', 'intention'],
    properties: {
      texte: { type: 'string', description: "La réponse de l'habitant au conseil, à l'oral, 1 à 4 phrases." },
      ressenti: { type: 'number', description: 'Comment il vit cet échange avec le conseil, de -1 à 1.' },
      intention: INTENTION,
    },
  },
};

const SYSTEME = `Tu prêtes ta voix à un habitant d'une simulation : un village fictif de 50 personnes sur une île de la Méditerranée.
Cet habitant n'est pas conscient : c'est un personnage simulé, avec des besoins, une personnalité, des relations et des souvenirs calculés par le jeu.
Ton rôle : exprimer de façon crédible ce que CE personnage penserait, à partir UNIQUEMENT du contexte fourni (son état, ses souvenirs, ses relations, ce qu'il a appris).
- Écris en français, à la première personne, avec des mots simples et concrets.
- N'invente pas d'événements absents du contexte ; tu peux interpréter, douter, en vouloir à quelqu'un, espérer.
- Respecte sa personnalité : un colérique peut être sec, un timide bref, un pieux peut évoquer sa foi avec retenue.
- Le « conseil » est le joueur, qui organise la vie du village ; le personnage le juge d'après ce qu'il en a vécu.
- Reste respectueux : pas de propos haineux ni de violence explicite.`;

async function appelerClaude(mode, corps) {
  const ctx = JSON.stringify(corps.habitant, null, 1).slice(0, 12000);
  const consigne = mode === 'reflexion'
    ? `Voici l'état de l'habitant ce soir. Qu'en retient-il ? Que conclut-il ? Que compte-t-il faire demain ?\n\n${ctx}`
    : `Voici l'état de l'habitant :\n${ctx}\n\nUn membre du conseil vient lui parler et lui dit :\n« ${String(corps.message || '').slice(0, 600)} »\n\nRéponds comme lui.`;
  const reponse = await client.beta.messages.create({
    model: MODELE,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEME,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMAS[mode] } },
    messages: [{ role: 'user', content: consigne }],
  });
  if (reponse.stop_reason === 'refusal') throw Object.assign(new Error('refus'), { statut: 422 });
  const texte = reponse.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(texte);
}

async function lireCorps(req) {
  let n = 0;
  const morceaux = [];
  for await (const m of req) {
    n += m.length;
    if (n > 64 * 1024) throw Object.assign(new Error('trop gros'), { statut: 413 });
    morceaux.push(m);
  }
  return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
}

function json(res, statut, objet) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(objet));
}

async function api(req, res) {
  if (req.method === 'GET') return json(res, 200, { disponible: !!client && Date.now() > enPanneJusqua, modele: MODELE });
  if (!client || Date.now() < enPanneJusqua) return json(res, 503, { erreur: 'Claude indisponible' });
  try {
    const corps = await lireCorps(req);
    const mode = corps.mode === 'dialogue' ? 'dialogue' : 'reflexion';
    return json(res, 200, await appelerClaude(mode, corps));
  } catch (e) {
    if (e.statut) return json(res, e.statut, { erreur: e.message });
    if (Anthropic && e instanceof Anthropic.AuthenticationError) {
      enPanneJusqua = Date.now() + 10 * 60 * 1000;
      console.log('Identifiants Anthropic refusés : réflexions locales pendant 10 min.');
      return json(res, 503, { erreur: 'identifiants' });
    }
    if (Anthropic && e instanceof Anthropic.RateLimitError) return json(res, 429, { erreur: 'limite de débit' });
    if (Anthropic && e instanceof Anthropic.APIError) return json(res, 502, { erreur: `API ${e.status}` });
    if (Anthropic && e instanceof Anthropic.APIConnectionError) { enPanneJusqua = Date.now() + 60 * 1000; return json(res, 503, { erreur: 'connexion' }); }
    if (e instanceof SyntaxError) return json(res, 502, { erreur: 'réponse illisible' });
    // identifiants absents ou autre problème de configuration : on bascule en réflexions locales
    enPanneJusqua = Date.now() + 10 * 60 * 1000;
    console.log(`Claude indisponible (${e.message.split('.')[0]}) : réflexions locales pendant 10 min.`);
    return json(res, 503, { erreur: 'indisponible' });
  }
}

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (chemin === '/api/esprit') return api(req, res);
  const fichier = normalize(join(racine, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(racine)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': types[extname(fichier)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(port, () => console.log(`Île Vivante : http://localhost:${port}${client ? ` (Claude : ${MODELE})` : ''}`));
