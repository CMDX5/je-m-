// Vercel : regarder le village d'un autre, en lecture seule. Le lien contient un jeton propre au village (créé par son
// propriétaire, révocable). On ne renvoie QUE l'état du village (fictif) : jamais les clés, le code ni le bail.
import { stockage, partageValide } from './_village.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ erreur: 'GET attendu' });
  const jeton = String(req.query?.t || '');
  try {
    const lu = await (await stockage()).lire();
    if (!lu || !partageValide(lu.doc, jeton)) return res.status(404).json({ erreur: 'ce lien ne montre aucun village' });
    if (!lu.doc.etat) return res.status(404).json({ erreur: 'le village n’est pas encore prêt' });
    // la photo ne change que toutes les 10 min : le réseau de Vercel la garde 2 min pour ne pas relire le stockage à chaque visite
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('x-maj', String(lu.doc.majA || 0));
    res.setHeader('x-temps', String(lu.doc.temps || 0));
    return res.status(200).send(lu.doc.etat);
  } catch (e) {
    console.error('REGARDER erreur', e?.name, e?.message);
    return res.status(503).json({ erreur: 'le village ne répond pas pour le moment' });
  }
}
