// Données de référence : noms, métiers, motifs de dispute, propositions d'assemblée.
// Tous les habitants sont fictifs.

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

// Métiers. `lieu` = zone ou bâtiment de travail, `prod` = production par heure travaillée.
export const METIERS = {
  agriculteur: { nom: 'Agriculteur', nomF: 'Agricultrice', lieu: 'champs', couleur: 0x7a8f3a, prod: { nourriture: 2.2 }, action: 'cultive les champs' },
  oleiculteur: { nom: 'Oléiculteur', nomF: 'Oléicultrice', lieu: 'oliveraie', couleur: 0x556b2f, prod: { huile: 0.55, nourriture: 0.3 }, action: "entretient l'oliveraie" },
  pecheur: { nom: 'Pêcheur', nomF: 'Pêcheuse', lieu: 'jetee', couleur: 0x2f6f8f, prod: { nourriture: 2.3 }, action: 'pêche au large du port' },
  marchand: { nom: 'Marchand', nomF: 'Marchande', lieu: 'marche', couleur: 0xb5652b, prod: { pieces: 1.0 }, action: 'tient un étal au marché' },
  batisseur: { nom: 'Bâtisseur', nomF: 'Bâtisseuse', lieu: 'carriere', couleur: 0x8c7b6b, prod: { pierre: 0.9 }, action: 'taille la pierre' },
  charpentier: { nom: 'Charpentier', nomF: 'Charpentière', lieu: 'foret', couleur: 0x6b4a2b, prod: { bois: 0.9 }, action: 'coupe et travaille le bois' },
  soignant: { nom: 'Soignant', nomF: 'Soignante', lieu: 'dispensaire', couleur: 0xe8e8e8, prod: { remedes: 0.35 }, action: 'soigne au dispensaire' },
  enseignant: { nom: 'Enseignant', nomF: 'Enseignante', lieu: 'ecole', couleur: 0x3b5ba5, prod: {}, action: "fait classe à l'école" },
  artisan: { nom: 'Artisan', nomF: 'Artisane', lieu: 'atelier', couleur: 0xa0522d, prod: { pieces: 0.7 }, action: "travaille à l'atelier" },
  imam: { nom: 'Imam', nomF: 'Imam', lieu: 'mosquee', couleur: 0xf2efe6, prod: {}, action: 'veille sur la mosquée' },
  eleve: { nom: 'Élève', nomF: 'Élève', lieu: 'ecole', couleur: 0xd9b44a, prod: {}, action: "apprend à l'école" },
  enfant: { nom: 'Enfant', nomF: 'Enfant', lieu: null, couleur: 0xe0a060, prod: {}, action: 'joue' },
  ancien: { nom: 'Ancien', nomF: 'Ancienne', lieu: 'marche', couleur: 0x9a8c98, prod: {}, action: 'conseille les plus jeunes' },
};

// Métiers que le joueur peut attribuer à un adulte.
export const METIERS_ADULTES = ['agriculteur', 'oleiculteur', 'pecheur', 'marchand', 'batisseur', 'charpentier', 'soignant', 'enseignant', 'artisan', 'imam'];

// Affinité d'un métier avec la personnalité (pour le métier souhaité).
export function affiniteMetier(m, t) {
  switch (m) {
    case 'agriculteur': return 0.5 * t.ardeur + 0.3 * (1 - t.curiosite) + 0.2;
    case 'oleiculteur': return 0.4 * t.ardeur + 0.3 * t.patience + 0.2;
    case 'pecheur': return 0.4 * t.curiosite + 0.4 * t.ardeur + 0.1;
    case 'marchand': return 0.6 * t.sociabilite + 0.3 * t.curiosite;
    case 'batisseur': return 0.6 * t.ardeur + 0.2 * (1 - t.sociabilite) + 0.1;
    case 'charpentier': return 0.4 * t.ardeur + 0.3 * t.patience + 0.1;
    case 'soignant': return 0.5 * t.generosite + 0.4 * t.patience;
    case 'enseignant': return 0.4 * t.patience + 0.3 * t.sociabilite + 0.3 * t.curiosite;
    case 'artisan': return 0.5 * t.patience + 0.4 * t.curiosite;
    case 'imam': return 0.6 * t.piete + 0.3 * t.patience;
    default: return 0;
  }
}

export const MOTIFS_DISPUTE = {
  agriculteur: ["le partage de l'eau d'irrigation", 'la limite entre deux parcelles'],
  oleiculteur: ['des oliviers taillés sans permission', 'le partage du pressoir'],
  pecheur: ['des filets de pêche abîmés', 'la meilleure place sur la jetée'],
  marchand: ['une dette au marché', 'des prix jugés injustes'],
  batisseur: ['un mur mal monté', 'des pierres empruntées et jamais rendues'],
  charpentier: ['des outils prêtés et abîmés'],
  artisan: ['une commande livrée en retard'],
  commun: ['une rumeur qui a circulé', 'du bruit tard dans la nuit', 'une parole blessante au marché', 'une vieille rancune de famille', 'des enfants qui se sont battus'],
};

// Propositions soumises à l'assemblée du village.
// Chaque option a un `attrait(traits)` (vote) et des `effets`.
export const PROPOSITIONS = [
  {
    id: 'huile',
    titre: "Que faire de la récolte d'huile d'olive ?",
    contexte: "Les jarres de l'entrepôt sont pleines. Les familles en parlent depuis des jours.",
    options: [
      { id: 'vendre', label: 'Vendre aux marchands du port', attrait: (t) => 0.4 + 0.4 * t.curiosite - 0.3 * t.generosite, effets: { convertir: { huile: -1, pieces: 3 } } },
      { id: 'partager', label: 'Partager entre les familles', attrait: (t) => 0.3 + 0.6 * t.generosite, effets: { moral: 6, partHuile: 0.5 } },
      { id: 'garder', label: "Garder en réserve pour l'hiver", attrait: (t) => 0.3 + 0.5 * t.patience, effets: { moral: 1 } },
    ],
  },
  {
    id: 'fete',
    titre: 'Organiser une fête pour la fin de la cueillette ?',
    contexte: "Les anciens rappellent qu'autrefois, la fin des récoltes se fêtait sur la place.",
    options: [
      { id: 'grande', label: 'Une grande fête (−40 nourriture)', attrait: (t) => 0.3 + 0.6 * t.sociabilite, effets: { nourriture: -40, moral: 12, social: 40, fete: true } },
      { id: 'modeste', label: 'Un repas modeste (−15 nourriture)', attrait: (t) => 0.5 + 0.2 * t.patience, effets: { nourriture: -15, moral: 5, social: 20, fete: true } },
      { id: 'non', label: 'Pas de fête cette année', attrait: (t) => 0.2 + 0.5 * (1 - t.sociabilite), effets: { moral: -2 } },
    ],
  },
  {
    id: 'rythme',
    titre: 'Faut-il allonger les journées de travail ?',
    contexte: 'Les réserves baissent et certains proposent de travailler plus tard.',
    options: [
      { id: 'long', label: 'Journées plus longues', attrait: (t) => 0.2 + 0.6 * t.ardeur, effets: { politique: { rythme: 'long' }, moral: -3 } },
      { id: 'normal', label: 'Garder le rythme actuel', attrait: (t) => 0.5, effets: { politique: { rythme: 'normal' } } },
      { id: 'repos', label: 'Plus de repos, quitte à produire moins', attrait: (t) => 0.2 + 0.5 * (1 - t.ardeur) + 0.2 * t.sociabilite, effets: { politique: { rythme: 'repos' }, moral: 4 } },
    ],
  },
  {
    id: 'chantier',
    titre: 'Quel chantier lancer en priorité ?',
    contexte: 'Les bâtisseurs attendent une décision collective avant de commencer.',
    options: [
      { id: 'puits', label: 'Un puits communal', attrait: (t) => 0.4 + 0.3 * t.patience, effets: { projet: 'puits' } },
      { id: 'maison', label: 'Une nouvelle maison', attrait: (t) => 0.4 + 0.3 * t.generosite, effets: { projet: 'maison' } },
      { id: 'jetee', label: 'Renforcer la jetée', attrait: (t) => 0.3 + 0.4 * t.curiosite, effets: { projet: 'jetee' } },
    ],
  },
  {
    id: 'rations',
    titre: 'Comment répartir la nourriture ?',
    contexte: "Le conseil doit fixer les portions servies à chaque repas.",
    options: [
      { id: 'genereuse', label: 'Portions généreuses', attrait: (t) => 0.3 + 0.4 * t.generosite + 0.2 * (1 - t.patience), effets: { politique: { rations: 'genereuse' }, moral: 3 } },
      { id: 'normale', label: 'Portions normales', attrait: (t) => 0.55, effets: { politique: { rations: 'normale' } } },
      { id: 'stricte', label: 'Rationner pour constituer des réserves', attrait: (t) => 0.2 + 0.5 * t.patience, effets: { politique: { rations: 'stricte' }, moral: -4 } },
    ],
  },
  {
    id: 'ecole',
    titre: "Les grands élèves doivent-ils aider aux récoltes l'après-midi ?",
    contexte: 'Les familles de cultivateurs manquent de bras, les enseignants s’inquiètent.',
    options: [
      { id: 'oui', label: 'Oui, aux champs après midi', attrait: (t) => 0.3 + 0.4 * t.ardeur, effets: { politique: { elevesAuxChamps: true } } },
      { id: 'non', label: "Non, l'école d'abord", attrait: (t) => 0.3 + 0.4 * t.curiosite + 0.2 * t.patience, effets: { politique: { elevesAuxChamps: false }, moral: 1 } },
    ],
  },
];

export const PROJETS = {
  puits: { nom: 'Puits communal', cout: { pierre: 40, bois: 10 }, travail: 60, effet: 'Santé et moral améliorés pour tous' },
  maison: { nom: 'Nouvelle maison', cout: { pierre: 60, bois: 30 }, travail: 110, effet: 'Désengorge les foyers surpeuplés' },
  jetee: { nom: 'Jetée renforcée', cout: { pierre: 35, bois: 35 }, travail: 80, effet: 'La pêche rapporte davantage' },
  ecole: { nom: "Agrandissement de l'école", cout: { pierre: 50, bois: 25 }, travail: 90, effet: 'Enfants et enseignants plus heureux' },
};
