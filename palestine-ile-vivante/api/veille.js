// Vercel : le relais de nuit. Appelé par la tâche planifiée (vercel.json) ; sans effet si la page est ouverte,
// si la veille est éteinte, si aucune clé n'est enregistrée ou si le dernier relais est trop récent.
import { lancerRelais } from './_village.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await lancerRelais({});
    console.log(`VEILLE ${JSON.stringify(r)}`);
    return res.status(200).json(r);
  } catch (e) {
    console.error('VEILLE erreur', e?.name, e?.message);
    return res.status(200).json({ fait: false, raison: 'erreur' });
  }
}
