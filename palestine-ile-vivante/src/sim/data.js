// Données de référence : noms (tous fictifs), libellés des métiers reconnus,
// chantiers possibles et questions que les habitants peuvent porter à l'assemblée.
// Rien ici ne décide du comportement : ce sont des mots et des lois du monde.

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

// Métiers : uniquement des étiquettes que les autres posent sur ce qu'une personne fait le plus.
export const METIERS = {
  agriculteur: { nom: 'Agriculteur', nomF: 'Agricultrice', couleur: 0x7a8f3a },
  oleiculteur: { nom: 'Oléiculteur', nomF: 'Oléicultrice', couleur: 0x556b2f },
  pecheur: { nom: 'Pêcheur', nomF: 'Pêcheuse', couleur: 0x2f6f8f },
  marchand: { nom: 'Marchand', nomF: 'Marchande', couleur: 0xb5652b },
  batisseur: { nom: 'Bâtisseur', nomF: 'Bâtisseuse', couleur: 0x8c7b6b },
  charpentier: { nom: 'Charpentier', nomF: 'Charpentière', couleur: 0x6b4a2b },
  soignant: { nom: 'Soignant', nomF: 'Soignante', couleur: 0xe8e8e8 },
  enseignant: { nom: 'Enseignant', nomF: 'Enseignante', couleur: 0x3b5ba5 },
  artisan: { nom: 'Artisan', nomF: 'Artisane', couleur: 0xa0522d },
  eleve: { nom: 'Élève', nomF: 'Élève', couleur: 0xd9b44a },
  enfant: { nom: 'Enfant', nomF: 'Enfant', couleur: 0xe0a060 },
  ancien: { nom: 'Ancien', nomF: 'Ancienne', couleur: 0x9a8c98 },
  sans: { nom: 'Sans métier établi', nomF: 'Sans métier établi', couleur: 0x8a8070 },
};

// Gestes que le conseil peut demander à quelqu'un (une demande, pas un ordre).
export const DEMANDES = {
  cultiver: 'cultiver les champs', pecher: 'pêcher', olives: "récolter l'oliveraie", pierre: 'tailler la pierre',
  bois: 'couper du bois', artisanat: "travailler à l'atelier", commercer: 'tenir un étal', soigner: 'soigner au dispensaire',
  enseigner: 'faire classe', construire: 'aider au chantier', donner: 'apporter des vivres à la réserve',
};

export const PROJETS = {
  puits: { nom: 'Puits communal', cout: { pierre: 40, bois: 10 }, travail: 60, effet: 'Eau potable : moins de maladies' },
  maison: { nom: 'Nouvelle maison', cout: { pierre: 60, bois: 30 }, travail: 110, effet: 'Désengorge un foyer surpeuplé' },
  jetee: { nom: 'Jetée agrandie', cout: { pierre: 35, bois: 35 }, travail: 80, effet: 'Deux places de pêche en plus' },
  ecole: { nom: "Agrandissement de l'école", cout: { pierre: 50, bois: 25 }, travail: 90, effet: 'Plus de place pour apprendre' },
};

// Questions que les habitants portent eux-mêmes à l'assemblée quand un problème
// revient assez souvent dans leur vécu. Chacun vote selon SA propre expérience.
export const THEMES = {
  faim: {
    titre: 'Des familles n’ont plus de quoi manger',
    options: [
      { id: 'contribution', label: 'Chaque famille apporte une part de ses récoltes à la réserve' },
      { id: 'distribuer', label: 'Le conseil distribue la réserve commune maintenant' },
      { id: 'chacun', label: 'Chaque famille se débrouille' },
    ],
  },
  jetee: {
    titre: 'Il n’y a pas assez de place sur la jetée',
    options: [
      { id: 'rota', label: 'Instaurer un tour de rôle pour les barques' },
      { id: 'agrandir', label: 'Agrandir la jetée (chantier)' },
      { id: 'statu', label: 'Premier arrivé, premier servi' },
    ],
  },
  mer: {
    titre: 'Les filets reviennent presque vides',
    options: [
      { id: 'repos', label: 'Laisser la mer se reposer deux jours' },
      { id: 'moins', label: 'Pêcher avec moins de barques pendant trois jours' },
      { id: 'continuer', label: 'Continuer comme avant' },
    ],
  },
  foret: {
    titre: 'La pinède s’éclaircit dangereusement',
    options: [
      { id: 'repos', label: 'Interdire la coupe pendant trois jours' },
      { id: 'continuer', label: 'Continuer à couper' },
    ],
  },
  vol: {
    titre: 'Des vivres disparaissent dans les maisons',
    options: [
      { id: 'reparation', label: 'Qui est pris doit rendre le double' },
      { id: 'entraide', label: 'Le conseil aide les familles qui manquent de tout' },
      { id: 'surveillance', label: 'Les voisins veillent les uns sur les autres' },
    ],
  },
  disputes: {
    titre: 'Les disputes se multiplient au village',
    options: [
      { id: 'anciens', label: 'Confier la médiation à un conseil des anciens' },
      { id: 'fete', label: 'Organiser une fête de réconciliation (−30 nourriture)' },
      { id: 'rien', label: 'Laisser chacun régler ses affaires' },
    ],
  },
};
