// Habitant : identité, personnalité, besoins, relations et mémoire simulée.

import { clamp } from './rng.js';
import { METIERS } from './data.js';

export const TRAITS = {
  sociabilite: ['Réservé', 'Réservée', 'Sociable'],
  ardeur: ['Nonchalant', 'Nonchalante', 'Travailleur', 'Travailleuse'],
  generosite: ['Économe', 'Économe', 'Généreux', 'Généreuse'],
  temperament: ['Calme', 'Calme', 'Colérique', 'Colérique'],
  patience: ['Impatient', 'Impatiente', 'Patient', 'Patiente'],
  curiosite: ['Casanier', 'Casanière', 'Curieux', 'Curieuse'],
  piete: ['Discret sur la foi', 'Discrète sur la foi', 'Pieux', 'Pieuse'],
};

export const TRAIT_LABELS = {
  sociabilite: 'Sociabilité',
  ardeur: 'Ardeur au travail',
  generosite: 'Générosité',
  temperament: 'Tempérament vif',
  patience: 'Patience',
  curiosite: 'Curiosité',
  piete: 'Piété',
};

export function creerHabitant({ id, prenom, nom, genre, age, foyer, rng }) {
  const traits = {
    sociabilite: rng.trait(0.55),
    ardeur: rng.trait(0.55),
    generosite: rng.trait(0.5),
    temperament: rng.trait(0.4),
    patience: rng.trait(0.5),
    curiosite: rng.trait(0.5),
    piete: rng.trait(0.5, 0.25),
  };
  return {
    id, prenom, nom, genre, age, foyer,
    traits,
    besoins: {
      faim: rng.range(60, 90),
      energie: rng.range(65, 95),
      social: rng.range(45, 85),
      sante: age > 65 ? rng.range(60, 85) : rng.range(80, 100),
    },
    moral: rng.range(55, 75),
    confiance: clamp(50 + rng.range(-12, 12), 0, 100),
    metier: null,
    metierSouhaite: null,
    famille: [],
    x: 0, z: 0, dir: 0,
    path: null,
    interieur: true,
    batiment: foyer,
    activite: null,
    conversation: null,
    relations: {},
    memoire: [],
    malade: false,
    reposJusqua: 0,
    boost: 0, // humeur temporaire (événements)
    dernierRepas: 0,
    dernierEcoute: -1,
    disputesJour: 0,
    stats: { conversations: 0, disputes: 0, aides: 0 },
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

// Petit portrait textuel de la personnalité.
export function decrire(v) {
  const t = v.traits, f = v.genre === 'F';
  const out = [];
  const pick = (k, lo = 0.3, hi = 0.7) => {
    const l = TRAITS[k];
    if (t[k] <= lo) out.push(l.length === 3 ? (f ? l[1] : l[0]) : f ? l[1] : l[0]);
    else if (t[k] >= hi) out.push(l.length === 3 ? l[2] : f ? l[3] : l[2]);
  };
  for (const k of Object.keys(TRAITS)) pick(k);
  if (!out.length) out.push(f ? 'Pondérée' : 'Pondéré', 'sans excès');
  return out.slice(0, 4).join(', ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

// ---------- Relations ----------

export function relation(v, autreId) {
  let r = v.relations[autreId];
  if (!r) r = v.relations[autreId] = { aff: 0, fam: 5 };
  return r;
}

export function changerAffinite(a, b, delta) {
  const r = relation(a, b.id);
  // l'effet sature près des extrêmes
  const k = delta > 0 ? (100 - r.aff) / 100 : (100 + r.aff) / 100;
  r.aff = clamp(r.aff + delta * (0.4 + 0.6 * k), -100, 100);
}

export function libelleRelation(r, famille) {
  if (famille) return r.aff < -20 ? 'Famille (tendue)' : 'Famille';
  if (r.aff >= 60) return 'Ami proche';
  if (r.aff >= 25) return 'Ami';
  if (r.aff <= -45) return 'Rival';
  if (r.aff <= -15) return 'En froid';
  if (r.fam >= 40) return 'Connaissance';
  return 'Voisin';
}

// ---------- Mémoire simulée ----------
// Chaque souvenir : { t, type, texte, valence (-1..1), importance (0..1), sujet }
// sujet = id d'habitant, 'conseil' (le joueur) ou null (événement collectif).

const MEMOIRE_MAX = 45;

export function memoriser(v, t, souvenir) {
  const s = { t, importance: 0.4, valence: 0, sujet: null, ...souvenir };
  // éviter les doublons trop rapprochés (même type, même sujet, même journée)
  const jour = Math.floor(t / 1440);
  const doublon = v.memoire.find((m) => m.type === s.type && m.sujet === s.sujet && Math.floor(m.t / 1440) === jour && m.texte === s.texte);
  if (doublon) {
    doublon.importance = Math.min(1, doublon.importance + s.importance * 0.3);
    return doublon;
  }
  v.memoire.push(s);
  if (v.memoire.length > MEMOIRE_MAX) {
    // on oublie le souvenir le moins important (les plus anciens à égalité)
    let k = 0;
    for (let i = 1; i < v.memoire.length; i++) if (v.memoire[i].importance < v.memoire[k].importance) k = i;
    v.memoire.splice(k, 1);
  }
  return s;
}

// Les souvenirs s'estompent ; les plus marquants résistent mieux.
export function estomperMemoire(v) {
  for (const m of v.memoire) {
    const resistance = m.importance > 0.75 ? 0.985 : 0.94;
    m.importance *= resistance;
  }
  v.memoire = v.memoire.filter((m) => m.importance > 0.06);
}

// Ce que l'habitant « pense » de quelqu'un, d'après ses souvenirs.
export function souvenirDe(v, sujet) {
  let s = 0;
  for (const m of v.memoire) if (m.sujet === sujet) s += m.valence * m.importance;
  return s;
}

export function souvenirMarquant(v, filtre = () => true) {
  let best = null;
  for (const m of v.memoire) if (filtre(m) && (!best || m.importance > best.importance)) best = m;
  return best;
}

// ---------- Pensée affichée ----------

export function pensee(v, sim) {
  const b = v.besoins;
  if (v.conversation) {
    const c = v.conversation;
    const autre = sim.habitant(c.a === v.id ? c.b : c.a);
    return v.conversation.dispute ? `Je ne laisserai pas ${autre.prenom} avoir le dernier mot.` : `Bon moment avec ${autre.prenom}.`;
  }
  if (v.malade) return 'Je ne me sens pas bien… il faudrait passer au dispensaire.';
  if (b.faim < 25) return sim.res.nourriture < 10 ? "Les réserves sont vides, j'ai le ventre creux." : "J'ai faim, vivement le repas.";
  if (b.energie < 20) return 'Je tombe de fatigue.';
  if (b.social < 25) return "Je me sens seul" + (v.genre === 'F' ? 'e' : '') + ", j'aimerais parler à quelqu'un.";
  const conflit = sim.conflits.find((c) => !c.resolu && (c.a === v.id || c.b === v.id));
  if (conflit) {
    const autre = sim.habitant(conflit.a === v.id ? conflit.b : conflit.a);
    return `Cette histoire avec ${autre.prenom} me reste en travers de la gorge.`;
  }
  if (v.metier !== v.metierSouhaite && v.metierSouhaite && v.age >= 17 && v.age < 65 && v.traits.ardeur > 0.3) {
    if ((v.id * 7 + Math.floor(sim.temps / 600)) % 3 === 0) return `J'aimerais tant devenir ${libelleMetier(v, v.metierSouhaite).toLowerCase()}.`;
  }
  const marquant = souvenirMarquant(v, (m) => m.importance > 0.55 && sim.temps - m.t < 2880);
  if (marquant) return `Je repense encore à ça : ${marquant.texte.charAt(0).toLowerCase()}${marquant.texte.slice(1)}`;
  if (v.moral > 75) return 'La vie est douce sur l\'île.';
  if (v.moral < 35) return 'Rien ne va comme je voudrais en ce moment.';
  if (v.confiance < 30) return "Le conseil ne nous écoute pas vraiment.";
  return v.activite?.raison ? `${v.activite.raison.charAt(0).toUpperCase()}${v.activite.raison.slice(1)}.` : 'Une journée ordinaire.';
}
