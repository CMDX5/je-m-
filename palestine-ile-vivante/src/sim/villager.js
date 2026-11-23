// Habitant : identité, tempérament inné, besoins, relations, mémoire.
// Le tempérament ne dicte aucun comportement : il règle la façon d'apprendre
// (curiosité = goût d'essayer, patience = mémoire longue, etc.).

import { clamp } from './rng.js';
import { METIERS } from './data.js';
import { nouvelEsprit, croyances } from './esprit.js';

export const TRAITS = {
  sociabilite: ['Réservé', 'Réservée', 'Sociable'],
  ardeur: ['Nonchalant', 'Nonchalante', 'Travailleur', 'Travailleuse'],
  generosite: ['Économe', 'Économe', 'Généreux', 'Généreuse'],
  temperament: ['Calme', 'Calme', 'Colérique', 'Colérique'],
  patience: ['Impatient', 'Impatiente', 'Patient', 'Patiente'],
  curiosite: ['Casanier', 'Casanière', 'Curieux', 'Curieuse'],
  piete: ['Discret sur la foi', 'Discrète sur la foi', 'Pieux', 'Pieuse'],
};

// Ce que chaque trait règle vraiment dans l'esprit simulé.
export const TRAIT_LABELS = {
  sociabilite: 'Sociabilité (besoin des autres, imitation)',
  ardeur: "Ardeur (besoin d'être utile)",
  generosite: 'Empathie (souffre de la souffrance des autres)',
  temperament: 'Tempérament (rancune, emportement)',
  patience: 'Patience (prévoyance, mémoire longue)',
  curiosite: "Curiosité (goût d'essayer l'inconnu)",
  piete: 'Spiritualité (besoin de sérénité)',
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
      serenite: rng.range(50, 80),
      estime: rng.range(40, 70),
    },
    moral: 60,
    confiance: 50, // envers le conseil : se construit uniquement par ce qu'il vit
    metier: null, // reconnu d'après ce qu'il fait réellement
    demande: null, // ce que le conseil lui a demandé de faire
    intention: null, // formée en réfléchissant (le soir, ou avec Claude)
    reflexion: null,
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
    dernierRepas: 0,
    dernierEcoute: -1,
    esprit: nouvelEsprit(),
    stats: { conversations: 0, disputes: 0, aides: 0, dons: 0, vols: 0, excuses: 0 },
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

export function decrire(v) {
  const t = v.traits, f = v.genre === 'F';
  const out = [];
  for (const k of Object.keys(TRAITS)) {
    const l = TRAITS[k];
    if (t[k] <= 0.3) out.push(f ? l[1] : l[0]);
    else if (t[k] >= 0.7) out.push(l.length === 3 ? l[2] : f ? l[3] : l[2]);
  }
  if (!out.length) out.push(f ? 'Pondérée' : 'Pondéré', 'sans excès');
  return out.slice(0, 4).join(', ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

// ---------- Relations ----------
// aff = ce que l'on attend d'une personne, appris au fil des rencontres (-100..100)
// fam = familiarité (0..100)

export function relation(v, autreId) {
  let r = v.relations[autreId];
  if (!r) r = v.relations[autreId] = { aff: 0, fam: 0 };
  return r;
}

export function changerAffinite(a, b, delta) {
  const r = relation(a, b.id);
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

// ---------- Mémoire épisodique ----------
const MEMOIRE_MAX = 50;

export function memoriser(v, t, souvenir) {
  const s = { t, importance: 0.4, valence: 0, sujet: null, ...souvenir };
  const jour = Math.floor(t / 1440);
  const doublon = v.memoire.find((m) => m.type === s.type && m.sujet === s.sujet && Math.floor(m.t / 1440) === jour && m.texte === s.texte);
  if (doublon) {
    doublon.importance = Math.min(1, doublon.importance + s.importance * 0.3);
    return doublon;
  }
  v.memoire.push(s);
  if (v.memoire.length > MEMOIRE_MAX) {
    let k = 0;
    for (let i = 1; i < v.memoire.length; i++) if (v.memoire[i].importance < v.memoire[k].importance) k = i;
    v.memoire.splice(k, 1);
  }
  return s;
}

export function estomperMemoire(v) {
  const longue = 0.9 + 0.08 * v.traits.patience;
  for (const m of v.memoire) m.importance *= m.importance > 0.75 ? 0.985 : longue;
  v.memoire = v.memoire.filter((m) => m.importance > 0.06);
}

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

// ---------- Pensée du moment (d'après son état réel et son vécu) ----------
export function pensee(v, sim) {
  const b = v.besoins;
  if (v.reflexion && sim.temps - v.reflexion.t < 1440) return v.reflexion.texte;
  if (v.conversation) {
    const c = v.conversation;
    const autre = sim.habitant(c.a === v.id ? c.b : c.a);
    return c.dispute ? `Je ne laisserai pas ${autre.prenom} avoir le dernier mot.` : `Bon moment avec ${autre.prenom}.`;
  }
  if (v.malade) return 'Je ne me sens pas bien…';
  if (b.faim < 25) return (sim.foyers[v.foyer]?.nourriture ?? 0) < 1 ? "Il n'y a plus rien à la maison, j'ai le ventre creux." : "J'ai faim.";
  if (b.energie < 20) return 'Je tombe de fatigue.';
  const griefs = Object.entries(v.esprit.griefs).sort((a, c) => c[1] - a[1]);
  if (griefs.length && griefs[0][1] > 0.35) {
    const o = sim.habitant(Number(griefs[0][0]));
    return `Je n'ai pas digéré ce que ${o.prenom} m'a fait (${v.esprit.griefMotif?.[o.id] || 'un tort'}).`;
  }
  if (b.social < 25) return `Je me sens seul${v.genre === 'F' ? 'e' : ''}.`;
  const marquant = souvenirMarquant(v, (m) => m.importance > 0.55 && sim.temps - m.t < 2880);
  if (marquant) return `Je repense à ça : ${marquant.texte.charAt(0).toLowerCase()}${marquant.texte.slice(1)}`;
  const c = croyances(sim, v, 1)[0];
  if (c && c.effet > 0) return `J'ai appris que ${c.texte}.`;
  if (v.esprit.appris < 5) return 'Je cherche encore comment m’y prendre ici.';
  return v.moral > 70 ? 'La vie est douce sur l’île.' : v.moral < 40 ? 'Rien ne va comme je voudrais.' : 'Une journée ordinaire.';
}
