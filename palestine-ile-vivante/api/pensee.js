// Vercel : transmet à Groq ce que perçoivent les habitants et renvoie leurs décisions.
// La clé du joueur arrive dans l'en-tête x-groq-key ; elle n'est ni stockée ni journalisée.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST attendu' });
  const cle = req.headers['x-groq-key'];
  if (!cle) return res.status(401).json({ erreur: 'clé manquante' });
  const { prompt, modele } = req.body || {};
  if (typeof prompt !== 'string' || !prompt || prompt.length > 120000 || typeof modele !== 'string') return res.status(400).json({ erreur: 'requête invalide' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele, temperature: 0.8, max_tokens: 4000, response_format: { type: 'json_object' },
        // les modèles gpt-oss « réfléchissent » avant de répondre : ces jetons comptent dans le quota gratuit
        ...(/gpt-oss/.test(modele) ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    // quotas restants annoncés par Groq : le jeu s'en sert pour régler son rythme
    const quota = {
      jetons: Number(r.headers.get('x-ratelimit-remaining-tokens')),
      jetonsReset: r.headers.get('x-ratelimit-reset-tokens') || '',
      requetes: Number(r.headers.get('x-ratelimit-remaining-requests')),
      requetesReset: r.headers.get('x-ratelimit-reset-requests') || '',
    };
    if (r.status === 429) {
      const attente = Number(r.headers.get('retry-after')) || 20;
      return res.status(429).json({ erreur: 'limite Groq atteinte', attente, quota });
    }
    if (r.status === 401 || r.status === 403) return res.status(401).json({ erreur: 'clé refusée par Groq' });
    if (!r.ok) return res.status(502).json({ erreur: `Groq a répondu ${r.status} : ${(await r.text()).slice(0, 200)}` });
    const j = await r.json();
    return res.status(200).json({ texte: j.choices?.[0]?.message?.content ?? '', quota, jetonsUtilises: j.usage?.total_tokens ?? null });
  } catch {
    return res.status(502).json({ erreur: 'Groq injoignable' });
  }
}
