// Vercel : liste les modèles Groq accessibles avec la clé du joueur (sert aussi à vérifier la clé).
// La clé arrive dans l'en-tête x-groq-key ; elle n'est ni stockée ni journalisée.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cle = req.headers['x-groq-key'];
  if (!cle) return res.status(401).json({ erreur: 'clé manquante' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${cle}` } });
    if (r.status === 401 || r.status === 403) return res.status(401).json({ erreur: 'clé refusée par Groq' });
    if (!r.ok) return res.status(502).json({ erreur: `Groq a répondu ${r.status}` });
    const j = await r.json();
    return res.status(200).json({ modeles: (j.data || []).map((m) => m.id) });
  } catch {
    return res.status(502).json({ erreur: 'Groq injoignable' });
  }
}
