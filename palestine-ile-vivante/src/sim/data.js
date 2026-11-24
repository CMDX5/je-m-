// Données de référence : noms (tous fictifs), métiers, lieux, chantiers.
// Un métier est une étiquette et un lieu de travail habituel : c'est la seule chose
// « attribuée » aux habitants. Ce qu'ils en pensent et ce qu'ils en font leur appartient.

export const PRENOMS_H = [
  'Ahmad', 'Mahmoud', 'Youssef', 'Khalil', 'Omar', 'Samir', 'Karim', 'Nabil', 'Fadi', 'Rami',
  'Tarek', 'Ziad', 'Bassam', 'Walid', 'Hani', 'Issa', 'Jamal', 'Majd', 'Adam', 'Yazan',
  'Amir', 'Sami', 'Hassan', 'Ibrahim', 'Salim', 'Fares', 'Nidal', 'Anas', 'Mounir', 'Elias',
];
export const PRENOMS_F = [
  'Fatima', 'Mariam', 'Layla', 'Nour', 'Rania', 'Huda', 'Salma', 'Amal', 'Dalia', 'Hiba',
  'Yasmin', 'Lina', 'Rasha', 'Samira', 'Jamila', 'Reem', 'Aya', 'Sara', 'Dana', 'Malak',
  'Haneen', 'Ghada', 'Suha', 'Widad', 'Aïcha', 'Zeina', 'Ranya', 'Mona', 'Siham', 'Tala',
];
export const NOMS_FAMILLE = [
  'Haddad', 'Khoury', 'Nasser', 'Saleh', 'Mansour', 'Awad', 'Odeh', 'Hamdan', 'Qasem', 'Jaber',
  'Shahin', 'Zayed', 'Farah', 'Sabbagh',
];

// lieu = lieu de travail habituel (clé de LIEUX)
export const METIERS = {
  agriculteur: { nom: 'Agriculteur', nomF: 'Agricultrice', couleur: 0x7a8f3a, lieu: 'champs' },
  pecheur: { nom: 'Pêcheur', nomF: 'Pêcheuse', couleur: 0x2f6f8f, lieu: 'jetee' },
  oleiculteur: { nom: 'Oléiculteur', nomF: 'Oléicultrice', couleur: 0x556b2f, lieu: 'oliveraie' },
  batisseur: { nom: 'Bâtisseur', nomF: 'Bâtisseuse', couleur: 0x8c7b6b, lieu: 'carriere' },
  charpentier: { nom: 'Charpentier', nomF: 'Charpentière', couleur: 0x6b4a2b, lieu: 'pinede' },
  artisan: { nom: 'Artisan', nomF: 'Artisane', couleur: 0xa0522d, lieu: 'atelier' },
  marchand: { nom: 'Marchand', nomF: 'Marchande', couleur: 0xb5652b, lieu: 'marche' },
  soignant: { nom: 'Soignant', nomF: 'Soignante', couleur: 0xe8e8e8, lieu: 'dispensaire' },
  enseignant: { nom: 'Enseignant', nomF: 'Enseignante', couleur: 0x3b5ba5, lieu: 'ecole' },
  imam: { nom: 'Imam', nomF: 'Imam', couleur: 0xf2efe6, lieu: 'mosquee' },
  eleve: { nom: 'Élève', nomF: 'Élève', couleur: 0xd9b44a, lieu: 'ecole' },
  enfant: { nom: 'Enfant', nomF: 'Enfant', couleur: 0xe0a060, lieu: null },
  ancien: { nom: 'Ancien', nomF: 'Ancienne', couleur: 0x9a8c98, lieu: null },
  sansmetier: { nom: 'Sans métier', nomF: 'Sans métier', couleur: 0xb0a89a, lieu: null },
};

// Métiers que le conseil peut confier à un adulte.
export const METIERS_ADULTES = ['agriculteur', 'pecheur', 'oleiculteur', 'batisseur', 'charpentier', 'artisan', 'marchand', 'soignant', 'enseignant', 'imam'];

// Lieux : zone du plan (ZONES) ou bâtiment, et ce qu'on y fait.
export const LIEUX = {
  champs: { zone: 'champs', nom: 'les champs', travail: 'cultiver' },
  oliveraie: { zone: 'oliveraie', nom: "l'oliveraie", travail: 'récolter les olives' },
  carriere: { zone: 'carriere', nom: 'la carrière', travail: 'tailler la pierre' },
  pinede: { zone: 'foret', nom: 'la pinède', travail: 'couper du bois' },
  marche: { zone: 'marche', nom: 'le marché', travail: 'tenir un étal' },
  port: { zone: 'port', nom: 'le port' },
  jetee: { zone: 'jetee', nom: 'la jetée', travail: 'pêcher' },
  plage: { zone: 'plage', nom: 'la plage' },
  source: { zone: 'source', nom: 'la source' },
  belvedere: { zone: 'belvedere', nom: 'le belvédère' },
  cour_ecole: { zone: 'cour_ecole', nom: "la cour de l'école" },
  mosquee: { bat: 'mosquee', nom: 'la mosquée', interieur: true },
  ecole: { bat: 'ecole', nom: "l'école", interieur: true, travail: 'faire classe' },
  dispensaire: { bat: 'dispensaire', nom: 'le dispensaire', interieur: true, travail: 'soigner' },
  atelier: { bat: 'atelier', nom: "l'atelier", interieur: true, travail: "travailler à l'atelier" },
  chantier: { nom: 'le chantier', travail: 'travailler au chantier' },
};

export const PROJETS = {
  puits: { nom: 'Puits communal', cout: { pierre: 40, bois: 10 }, travail: 60, effet: 'Eau potable : moins de maladies' },
  maison: { nom: 'Nouvelle maison', cout: { pierre: 60, bois: 30 }, travail: 110, effet: 'Une maison libre où s’installer' },
  jetee: { nom: 'Jetée agrandie', cout: { pierre: 35, bois: 35 }, travail: 80, effet: 'Deux places de pêche en plus' },
  ecole: { nom: "Agrandissement de l'école", cout: { pierre: 50, bois: 25 }, travail: 90, effet: 'Plus de place pour apprendre' },
};

export const NOMS_OBJETS = { nourriture: 'ration(s)', eau: 'dose(s) d’eau', pieces: 'pièce(s)', remedes: 'remède(s)', huile: 'jarre(s) d’huile' };

export function sansAccent(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
