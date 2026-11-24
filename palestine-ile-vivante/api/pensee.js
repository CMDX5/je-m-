// Vercel : transmet au fournisseur choisi ce que perçoivent les habitants et renvoie leurs décisions.
// La clé du joueur arrive dans l'en-tête x-cle ; elle n'est ni stockée ni journalisée.
import { lireFournisseur, appelerPensee } from './_fournisseurs.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'POST attendu' });
  const f = lireFournisseur(req);
  if (!f) return res.status(400).json({ erreur: 'fournisseur inconnu' });
  if (!f.cle) return res.status(401).json({ erreur: 'clé manquante' });
  const { prompt, modele } = req.body || {};
  if (typeof prompt !== 'string' || !prompt || prompt.length > 120000 || typeof modele !== 'string') return res.status(400).json({ erreur: 'requête invalide' });
  const r = await appelerPensee(f, modele, prompt);
  return res.status(r.status).json(r.corps);
}
