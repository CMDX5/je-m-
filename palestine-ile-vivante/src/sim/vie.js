// Cycle de vie : le calendrier du village et les lois du corps qui vieillit.
// Le jeu ne fait que vieillir les corps, constater un décès et mener une grossesse à son terme.
// Il ne décide jamais à la place de l'habitant : le deuil, l'envie d'un enfant, le prénom donné viennent d'eux.

export const MIN_JOUR = 1440;
export const ANNEE_JOURS = 2; // une année du village dure deux jours de jeu
export const ANNEE_MIN = ANNEE_JOURS * MIN_JOUR; // 2880 min
export const MOIS_MIN = ANNEE_MIN / 12; // 240 min : un mois = 4 h de jeu
export const SEMAINE_MIN = ANNEE_MIN / 52; // ≈ 55 min : une semaine
export const GROSSESSE_MOIS = 9;
export const AGE_NOURRISSON = 2; // avant 2 ans, un enfant est dans les bras : il ne décide pas encore
export const AGE_ADULTE = 17;
export const AGE_FECOND_MAX = 45;
export const DELAI_PRENOM_MIN = 12 * 60; // sans prénom donné par les parents au bout de 12 h, le village en choisit un
export const VALIDITE_SOUHAIT_MIN = 12 * 60; // un « j'aimerais un enfant avec toi » reste valable 12 h

// Risque de mourir sur une année (loi de Gompertz, village sans médecine moderne)
export function risqueDecesAnnuel(age) {
  if (age < 1) return 0.04;
  return Math.min(0.9, 0.0003 + 0.0004 * Math.exp(0.085 * Math.max(0, age - 20)));
}

// Probabilité de mourir pendant une heure de jeu : l'âge, la maladie et la faiblesse du corps l'augmentent.
export function risqueDecesHoraire(v) {
  const s = v.besoins.sante;
  const q = Math.min(0.95, risqueDecesAnnuel(v.age) * (1 + (v.malade ? 1.5 : 0) + (s < 40 ? 1 : 0) + (s < 20 ? 2 : 0)));
  return 1 - Math.pow(1 - q, 60 / ANNEE_MIN);
}

export function causeDeces(v) {
  const b = v.besoins;
  if (b.sante <= 5) {
    if (b.faim < 8 && b.soif < 8) return 'de faim et de soif';
    if (b.soif < 8) return 'de soif';
    if (b.faim < 8) return 'de faim';
    return v.malade ? 'de maladie' : 'de faiblesse';
  }
  if (v.age >= 60) return 'de vieillesse';
  return v.malade ? 'de maladie' : 'subitement';
}

export const ageEnAns = (v, t) => Math.floor((t - v.naissance) / ANNEE_MIN);

// « il y a 3 mois », « il y a 2 ans », « aujourd'hui »
export function depuis(t, maintenant) {
  const mois = Math.floor((maintenant - t) / MOIS_MIN);
  if (mois < 1) return 'aujourd’hui';
  if (mois < 24) return `il y a ${mois} mois`;
  const ans = Math.floor(mois / 12);
  return `il y a ${ans} an${ans > 1 ? 's' : ''}`;
}
export const moisDepuis = (t, maintenant) => Math.max(0, Math.floor((maintenant - t) / MOIS_MIN));
