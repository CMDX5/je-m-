// LOIS DU MONDE — la seule chose « programmée » dans le comportement du village.
// On décrit ici la physique de l'île : la lumière, la mer, la forêt, les champs, ce que
// rapporte une heure d'effort, le sommeil, la maladie. Rien ici ne dit à un habitant
// quoi faire, quoi ressentir ni quoi penser.

import { clamp } from './rng.js';

// Lumière du jour (0 la nuit, 1 en plein jour). Travailler dehors dans le noir ne rapporte rien.
export function lumiere(h) {
  if (h < 5.5 || h > 20.5) return 0;
  if (h < 7) return (h - 5.5) / 1.5;
  if (h > 19) return (20.5 - h) / 1.5;
  return 1;
}

export function chaleur(h) {
  return h > 11.5 && h < 15.5 ? 1 : 0;
}

export function creerMonde() {
  return { poisson: 1, foret: 1, fertilite: 1, olives: 1, placesJetee: 4 };
}

// Régénération naturelle, par minute de jeu.
export function regenerer(m, dt) {
  m.poisson = clamp(m.poisson + dt * 0.00012 * m.poisson * (1.15 - m.poisson) + dt * 0.000004, 0.02, 1);
  m.foret = clamp(m.foret + dt * 0.00004 * (1.05 - m.foret), 0.02, 1);
  m.fertilite = clamp(m.fertilite + dt * 0.00005 * (1 - m.fertilite), 0.1, 1);
  m.olives = clamp(m.olives + dt * 0.00006 * (1 - m.olives), 0, 1);
}

// Ce que rapporte une minute d'effort à un lieu de travail.
// `rendement` (0..1) : forme du travailleur (fatigue, faim, soif, maladie) — « ils travaillent
// moins bien lorsqu'ils sont épuisés ». `comp` : savoir-faire acquis par la pratique.
export function produire(lieu, m, h, meteo, comp, dt, rendement = 1) {
  const L = lumiere(h);
  const k = (dt / 60) * (0.6 + 0.8 * comp) * rendement;
  switch (lieu) {
    case 'champs': {
      const r = 4.5 * L * m.fertilite * (meteo.secheresse ? 0.5 : 1) * k;
      m.fertilite = clamp(m.fertilite - r * 0.0005, 0.1, 1);
      return { nourriture: r, fatigue: 1.3 + chaleur(h) };
    }
    case 'jetee': {
      if (meteo.tempete) return { fatigue: 1.6, danger: 0.004 * dt };
      const aube = h < 9 || h > 17 ? 1.35 : 1;
      const r = 5.5 * L * m.poisson * aube * (meteo.bonnePeche ? 1.7 : 1) * k;
      m.poisson = clamp(m.poisson - r * 0.0007, 0.02, 1);
      return { nourriture: r, fatigue: 1.2 };
    }
    case 'oliveraie': {
      const r = 2.0 * L * m.olives * k;
      m.olives = clamp(m.olives - r * 0.002, 0, 1);
      return { nourriture: r * 0.8, huile: r * 0.5, fatigue: 1.1 };
    }
    case 'carriere': return { pierre: 1.0 * L * k, fatigue: 1.7 + chaleur(h) };
    case 'pinede': {
      const r = 1.0 * L * m.foret * k;
      m.foret = clamp(m.foret - r * 0.0018, 0.02, 1);
      return { bois: r, fatigue: 1.5 };
    }
    case 'atelier': return { pieces: 0.9 * k, fatigue: 0.8 };
    case 'marche': return { pieces: 0.6 * k, fatigue: 0.6 };
    case 'dispensaire': return { remedes: 0.25 * k, fatigue: 0.8 };
    case 'ecole': return { fatigue: 0.9 };
    case 'chantier': return { chantier: 1.2 * k, fatigue: 1.6 + chaleur(h) };
    default: return { fatigue: 0.3 };
  }
}

// Le sommeil répare mieux dans l'obscurité, et mieux dans une maison où l'on a la place.
export function recuperation(h, confort = 1) {
  return (lumiere(h) > 0.5 ? 0.075 : 0.15) * confort;
}

// Dans l'obscurité, rester éveillé épuise plus vite.
export function pressionCircadienne(h) {
  return lumiere(h) < 0.2 ? 1.9 : 1;
}

// Probabilité quotidienne de tomber malade : faim, soif, épuisement, âge et eau non potable.
export function risqueMaladie(v, bonus) {
  const b = v.besoins;
  return 0.005 + (b.faim < 25 ? 0.03 : 0) + (b.soif < 25 ? 0.03 : 0) + (b.energie < 20 ? 0.02 : 0) + (v.age > 65 ? 0.01 : 0) + (bonus.puits ? -0.003 : 0.003);
}

// Confort d'un foyer : le nombre de couchages face au nombre d'occupants.
export function confortFoyer(occupants, couchages) {
  if (occupants <= couchages) return 1;
  return clamp(1 - 0.18 * (occupants - couchages), 0.4, 1);
}
