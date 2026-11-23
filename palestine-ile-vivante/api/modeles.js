// Vercel : liste les modèles accessibles avec la clé du joueur (sert aussi à vérifier la clé).
// La clé arrive dans l'en-tête x-cle ; elle n'est ni stockée ni journalisée.
import { lireFournisseur } from './_fournisseurs.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const f = lireFournisseur(req);
  if (!f) return res.status(400).json({ erreur: 'fournisseur inconnu' });
  if (!f.cle) return res.status(401).json({ erreur: 'clé manquante' });
  try {
    const r = await fetch(`${f.base}/models`, { headers: { Authorization: `Bearer ${f.cle}` } });
    if (r.status === 400 || r.status === 401 || r.status === 403) return res.status(401).json({ erreur: `clé refusée par ${f.nom}` });
    if (!r.ok) return res.status(502).json({ erreur: `${f.nom} a répondu ${r.status}` });
    const j = await r.json();
    return res.status(200).json({ modeles: (j.data || []).map((m) => String(m.id).replace(/^models\//, '')) });
  } catch {
    return res.status(502).json({ erreur: `${f.nom} injoignable` });
  }
}
