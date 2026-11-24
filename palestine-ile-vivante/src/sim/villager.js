// Habitant : identité civile, corps, poche, et ce qu'il écrit lui-même
// (pensée, souvenirs, avis sur les autres, identité). Aucun trait de caractère n'est attribué.

import { METIERS } from './data.js';

export function creerHabitant({ id, prenom, nom, genre, age, foyer, rng }) {
  return {
    id, prenom, nom, genre, age, foyer,
    naissance: 0, // minutes de jeu (négatif : né avant l'arrivée du conseil)
    famille: [],
    conjoint: null, parents: [], // liens de parenté connus (utiles aux lois de la vie, pas à la pensée)
    enceinte: null, // { pere, debut, terme }
    nourrisson: false, // avant 2 ans : dans les bras, ne décide pas encore
    mort: null, // { t, cause }
    agonie: 0,
    metier: null,
    besoins: {
      faim: rng.range(55, 85),
      soif: rng.range(55, 85),
      energie: rng.range(65, 95),
      sante: age > 65 ? rng.range(60, 85) : rng.range(85, 100),
      securite: rng.range(60, 80),
    },
    poche: { nourriture: 0, eau: 0, pieces: rng.int(15, 45), huile: 0, remedes: 0 },
    // ce que l'habitant écrit lui-même
    humeur: 50,
    pensee: '',
    identite: '',
    resume: '',
    lecons: '', // ce qu'il a compris de la vie ici, écrit par lui le soir
    questions: '', // ce qu'il se demande en ce moment, écrit par lui le soir (souvent vide)
    souvenirs: [], // { t, texte }
    avis: {}, // id -> { t, texte }
    dialogue: [], // échanges avec le conseil
    // mécanique
    x: 0, z: 0, dir: 0, path: null, interieur: true, batiment: foyer,
    activite: null, conversation: null,
    statut: 'attend', // 'agit' | 'attend' | 'reflechit'
    depuis: 0, // depuis quand il attend une décision
    urgence: '',
    evenements: [], // ce qu'il a perçu depuis sa dernière décision
    parolePendante: null,
    competence: {},
    malade: false, reposJusqua: 0,
    echecs: 0, nbDecisions: 0, derniereBilan: -1e9, dernierAccouchement: -1e9,
    impaye: 0, chocJusqua: 0,
    stats: { paroles: 0, dons: 0, prises: 0, requetes: 0 },
  };
}

export function nomComplet(v) {
  return `${v.prenom} ${v.nom}`;
}

export function libelleMetier(v, m = v.metier) {
  const d = METIERS[m];
  if (!d) return '—';
  return v.genre === 'F' ? d.nomF : d.nom;
}

export function noter(v, t, texte) {
  v.evenements.push({ t, texte });
  if (v.evenements.length > 14) v.evenements.shift();
}

export function retenir(v, t, texte) {
  const s = String(texte || '').trim().slice(0, 600);
  if (!s) return;
  v.souvenirs.push({ t, texte: s });
  if (v.souvenirs.length > 100) v.souvenirs.shift();
}
