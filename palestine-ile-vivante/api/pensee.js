// Vercel : transmet au fournisseur choisi ce que perçoivent les habitants et renvoie leurs décisions.
// La clé du joueur arrive dans l'en-tête x-cle ; elle n'est ni stockée ni journalisée.
import { lireFournisseur } from './_fournisseurs.js';

// Gemini n'annonce pas toujours retry-after : on lit le délai dans le message d'erreur.
// Un quota « par jour » épuisé vaut une longue attente : le jeu passe alors à un autre modèle.
function attenteDepuis(r, texte) {
  if (/per ?day|PerDay|daily/i.test(texte)) return 3600;
  const entete = Number(r.headers.get('retry-after'));
  if (entete) return entete;
  const m = texte.match(/retry(?:Delay)?["\s:]*(?:in\s*)?"?([\d.]+)\s*s/i);
  return m ? Math.ceil(Number(m[1])) : 20;
}

async function appeler(f, modele, prompt, avecReflexionCourte) {
  // les modèles qui « réfléchissent » avant de répondre consomment ces jetons dans le quota gratuit
  const reflexion = avecReflexionCourte && (/gpt-oss/.test(modele) || (f.id === 'gemini' && /gemini/.test(modele))) ? { reasoning_effort: 'low' } : {};
  return fetch(`${f.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${f.cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modele, temperature: 0.8, max_tokens: 4000, response_format: { type: 'json_object' },
      ...reflexion,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST attendu' });
  const f = lireFournisseur(req);
  if (!f) return res.status(400).json({ erreur: 'fournisseur inconnu' });
  if (!f.cle) return res.status(401).json({ erreur: 'clé manquante' });
  const { prompt, modele } = req.body || {};
  if (typeof prompt !== 'string' || !prompt || prompt.length > 120000 || typeof modele !== 'string') return res.status(400).json({ erreur: 'requête invalide' });
  try {
    let r = await appeler(f, modele, prompt, true);
    // un modèle qui ne connaît pas le réglage de réflexion : nouvel essai sans lui
    if (r.status === 400) r = await appeler(f, modele, prompt, false);
    // quotas restants annoncés (Groq) : le jeu s'en sert pour régler son rythme
    const quota = {
      jetons: Number(r.headers.get('x-ratelimit-remaining-tokens') ?? NaN),
      jetonsReset: r.headers.get('x-ratelimit-reset-tokens') || '',
      requetes: Number(r.headers.get('x-ratelimit-remaining-requests') ?? NaN),
      requetesReset: r.headers.get('x-ratelimit-reset-requests') || '',
    };
    if (r.status === 429) {
      const texte = await r.text().catch(() => '');
      return res.status(429).json({ erreur: `limite ${f.nom} atteinte`, attente: attenteDepuis(r, texte), quota });
    }
    if (r.status === 401 || r.status === 403) return res.status(401).json({ erreur: `clé refusée par ${f.nom}` });
    if (r.status === 404) return res.status(404).json({ erreur: `modèle ${modele} introuvable chez ${f.nom}`, retirer: true });
    if (!r.ok) {
      const texte = (await r.text().catch(() => '')).slice(0, 300);
      // modèle surchargé ou en panne chez le fournisseur : passager, on réessaiera plus tard
      if (r.status >= 500) return res.status(503).json({ erreur: `${f.nom} surchargé`, attente: 60, detail: texte });
      // message trop long pour ce modèle, ou modèle qui refuse ce format : on ne s'en sert plus
      return res.status(422).json({ erreur: `${modele} ne convient pas`, retirer: true, detail: texte });
    }
    const j = await r.json();
    return res.status(200).json({ texte: j.choices?.[0]?.message?.content ?? '', quota, jetonsUtilises: j.usage?.total_tokens ?? null });
  } catch {
    return res.status(502).json({ erreur: `${f.nom} injoignable` });
  }
}
