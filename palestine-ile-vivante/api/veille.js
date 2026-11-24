// Vercel : le relais de nuit. Chaque appel est un « passage » de 4 minutes au plus qui fait vivre le village, puis confie
// l'état au passage suivant (appel du serveur à lui-même, signé). Le premier passage est lancé quand la page s'en va
// (api/etat.js) ; un appel sans signature démarre une chaîne si les conditions sont réunies (page fermée, veille armée).
import { waitUntil } from '@vercel/functions';
import { demarrerChaine, executerMaillon, signatureValide, dependances, DUREE_MAILLON_S } from './_village.js';

export const config = { maxDuration: DUREE_MAILLON_S };

async function travailler(corps, hote) {
  try {
    const r = await executerMaillon(corps, { suivant: (c) => dependances.envoyer(c, hote) });
    console.log(`VEILLE ${JSON.stringify({ hop: corps.hop, ...r })}`);
  } catch (e) {
    console.error('VEILLE erreur', e?.name, e?.message);
  }
}

export function creerHandler({ attendre = waitUntil, traiter = travailler } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const hote = req.headers.host;
    try {
      const signature = req.headers['x-chaine'];
      if (signature) {
        const corps = req.body;
        if (!corps || typeof corps !== 'object' || !signatureValide(corps, signature)) return res.status(401).json({ erreur: 'signature invalide' });
        attendre(traiter(corps, hote)); // le passage continue en arrière-plan ; on répond tout de suite
        return res.status(202).json({ ok: true });
      }
      const d = await demarrerChaine({});
      if (!d.fait) return res.status(200).json({ fait: false, raison: d.raison });
      attendre(traiter(d.corps, hote));
      return res.status(202).json({ fait: true, demarre: true });
    } catch (e) {
      console.error('VEILLE erreur', e?.name, e?.message);
      return res.status(200).json({ fait: false, raison: 'erreur' });
    }
  };
}

export default creerHandler();
