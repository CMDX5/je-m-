// Vercel : reçoit le résumé périodique de la partie (village fictif uniquement, jamais la clé)
// et l'écrit dans les journaux du site, où Claude le lit pour surveiller le jeu.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST attendu' });
  const corps = req.body;
  const texte = JSON.stringify(corps ?? null);
  if (!corps || typeof corps !== 'object' || texte.length > 24000) return res.status(400).json({ erreur: 'rapport invalide' });
  console.log(`RAPPORT ${texte}`);
  return res.status(204).end();
}
