// FIXTURE DE TEST — ce n'est pas un habitant : il tire des gestes valides au hasard
// pour vérifier que le MONDE (physique, économie, paroles) tient quoi qu'ils décident.
// Dans le jeu, c'est un modèle de langage qui décide.
import { ACTIONS } from '../src/sim/prompts.js';

const LIEUX = ['champs', 'jetee', 'oliveraie', 'carriere', 'pinede', 'marche', 'port', 'plage', 'source', 'belvedere', 'mosquee', 'ecole', 'dispensaire', 'atelier', 'maison'];
const TONS = ['calme', 'chaleureux', 'tendu', 'colere', 'triste', 'joyeux'];

export function decider(sim, v, rng) {
  const proches = sim.habitants.filter((o) => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 12);
  const autre = proches.length ? rng.pick(proches) : rng.pick(sim.habitants.filter((o) => o !== v));
  let action = rng.pick(ACTIONS);
  // un minimum de bon sens pour que la simulation avance (le fixture ne « pense » pas)
  if (v.besoins.faim < 30 && rng.chance(0.7)) action = rng.chance(0.5) ? 'acheter' : 'manger';
  if (v.besoins.soif < 30 && rng.chance(0.7)) action = 'boire';
  if (v.besoins.energie < 25 && rng.chance(0.7)) action = 'dormir';
  const d = {
    pensee: `Je pense à ${autre.prenom}.`, humeur: rng.int(10, 90), action, parole: '',
    lieu: rng.pick(LIEUX), personne: autre.prenom, objet: rng.pick(['nourriture', 'eau', 'pieces', 'remedes']),
    quantite: rng.int(1, 5), pret: rng.chance(0.3), duree_minutes: rng.int(15, 150), ton: rng.pick(TONS),
  };
  if (['parler', 'donner'].includes(action) || rng.chance(0.2)) d.parole = `Bonjour ${autre.prenom}, comment vas-tu ?`;
  if (rng.chance(0.2)) d.souvenir = `J'ai croisé ${autre.prenom}.`;
  if (rng.chance(0.1)) { d.avis_sur = autre.prenom; d.avis = 'Quelqu\'un de bien.'; }
  if (rng.chance(0.03)) d.requete_conseil = 'Pourriez-vous augmenter le salaire ?';
  if (action === 'travailler' && rng.chance(0.5)) delete d.lieu;
  if (action === 'acheter') d.objet = 'nourriture';
  if (action === 'prendre' && rng.chance(0.5)) d.personne = '';
  return d;
}
