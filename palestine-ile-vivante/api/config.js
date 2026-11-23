// Vercel : indique au jeu qu'il tourne en ligne et que la pensée passe par Groq.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ mode: 'groq' });
}
