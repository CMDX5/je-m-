// Les saisons de l'île : une année du village (2 jours de jeu) a UNE pluie, puis le beau temps, la chaleur, la saison sèche.
// Pure fonction du temps : aucune donnée à sauvegarder. Le jeu ne fait que décrire la météo et ses effets physiques ;
// ce que les habitants en pensent, en disent ou en font vient d'eux.
//
//   mois 1          : la pluie (4 h de jeu = 4 minutes à ×1), commence à 8 h du premier jour de chaque année
//   mois 2 à 4      : le beau temps, la terre est verte, l'air est doux
//   mois 5 à 8      : la chaleur monte, la terre sèche
//   mois 9 à 12     : la saison sèche, chaleur lourde, terre craquelée, jusqu'à la pluie suivante
import { ANNEE_MIN, MOIS_MIN } from './vie.js';

export const DEBUT_PLUIE_MIN = 8 * 60;
export const PLUIE_MIN = MOIS_MIN; // 240 minutes de jeu : quatre minutes à la vitesse ×1
const RAMPE_PLUIE_MIN = 36; // la pluie monte puis décroît en 36 minutes de jeu

const lerp = (a, b, t) => a + (b - a) * t;
// ---------- La date du village ----------
// Le jeu commence en novembre 2026. Les mois suivent les saisons : la pluie tombe en décembre, le beau temps vient de janvier
// à mars, la chaleur d'avril à juillet, la saison sèche d'août à novembre. Un mois du village dure 4 h de jeu.
export const DEBUT_CALENDRIER = { mois: 10, annee: 2026 }; // novembre 2026 (mois 0 = janvier)
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function dateDuVillage(temps) {
  const n = Math.floor((temps - DEBUT_PLUIE_MIN) / MOIS_MIN); // mois écoulés depuis la première pluie (décembre 2026)
  const total = 11 + n; // décembre = mois 11 de l'année 2026
  const mois = ((total % 12) + 12) % 12;
  const annee = DEBUT_CALENDRIER.annee + Math.floor(total / 12);
  return { mois, annee, texte: `${MOIS_COURTS[mois]} ${annee}` };
}

export const NOMS_SAISON = { pluie: 'Pluie', beau: 'Beau temps', chaleur: 'Chaleur', seche: 'Saison sèche' };

export function saison(temps) {
  const p = (((temps - DEBUT_PLUIE_MIN) % ANNEE_MIN) + ANNEE_MIN) % ANNEE_MIN; // minutes depuis le début de la dernière pluie
  const mois = p / MOIS_MIN; // 0 à 12
  let nom, t, chaleur, seche, verdure;
  if (mois < 1) { nom = 'pluie'; t = mois; chaleur = 0; seche = 0; verdure = lerp(0.4, 1, t); }
  else if (mois < 4) { nom = 'beau'; t = (mois - 1) / 3; chaleur = lerp(0.15, 0.35, t); seche = lerp(0.05, 0.25, t); verdure = lerp(1, 0.6, t); }
  else if (mois < 8) { nom = 'chaleur'; t = (mois - 4) / 4; chaleur = lerp(0.35, 1, t); seche = lerp(0.25, 0.65, t); verdure = lerp(0.6, 0.1, t); }
  else { nom = 'seche'; t = (mois - 8) / 4; chaleur = lerp(1, 0.55, t); seche = lerp(0.65, 1, t); verdure = lerp(0.1, 0, t); }
  const intensitePluie = nom === 'pluie' ? Math.max(0, Math.min(1, p / RAMPE_PLUIE_MIN, (PLUIE_MIN - p) / RAMPE_PLUIE_MIN)) : 0;
  return {
    nom, mois: Math.floor(mois) + 1, progression: t,
    chaleur, // 0 (frais) à 1 (pic de chaleur)
    seche, // 0 (terre détrempée) à 1 (terre craquelée)
    verdure, // 0 (paysage jaune) à 1 (tout est vert)
    pluie: nom === 'pluie', intensitePluie,
    jusquaPluie: nom === 'pluie' ? 0 : ANNEE_MIN - p, // minutes de jeu avant la prochaine pluie
    resteDePluie: nom === 'pluie' ? PLUIE_MIN - p : 0,
    depuisPluie: nom === 'pluie' ? 0 : p - PLUIE_MIN, // minutes de jeu depuis la fin de la dernière pluie
  };
}
