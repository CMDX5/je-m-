// LOIS DU MONDE — la seule chose « programmée ».
// Ici on décrit la physique de l'île : la lumière, la mer, la forêt, les champs,
// ce que produit une heure d'effort, la place limitée sur la jetée, la maladie.
// Aucune règle ne dit à un habitant quoi faire ni quand le faire.

import { clamp } from './rng.js';

// Lumière du jour (0 la nuit, 1 en plein jour). Travailler dehors dans le noir ne rapporte rien.
export function lumiere(h) {
  if (h < 5.5 || h > 20.5) return 0;
  if (h < 7) return (h - 5.5) / 1.5;
  if (h > 19) return (20.5 - h) / 1.5;
  return 1;
}

// Chaleur de midi : l'effort physique en plein soleil fatigue davantage.
export function chaleur(h) {
  return h > 11.5 && h < 15.5 ? 1 : 0;
}

export function creerMonde() {
  return {
    poisson: 1, // stock de poisson près des côtes (0..1) — se reconstitue lentement
    foret: 1, // densité de la pinède (0..1)
    fertilite: 1, // fertilité des champs (0..1)
    olives: 1, // olives disponibles sur les arbres (0..1)
    placesJetee: 4, // nombre de barques/places de pêche
    vols: 0,
  };
}

// Régénération naturelle, par minute de jeu.
export function regenerer(m, dt, bonus) {
  m.poisson = clamp(m.poisson + dt * 0.00012 * m.poisson * (1.15 - m.poisson) * (bonus.reposMer ? 4 : 1) + dt * 0.000004, 0.02, 1);
  m.foret = clamp(m.foret + dt * 0.00004 * (1.05 - m.foret), 0.02, 1);
  m.fertilite = clamp(m.fertilite + dt * 0.00005 * (1 - m.fertilite), 0.1, 1);
  m.olives = clamp(m.olives + dt * 0.00006 * (1 - m.olives), 0, 1);
}

// Ce que rapporte une minute d'effort, selon le lieu, l'heure, la météo,
// l'état de la nature et la compétence acquise par la pratique.
// Renvoie { nourriture?, huile?, pierre?, bois?, pieces?, remedes?, fatigue }
export function produire(action, m, h, meteo, competence, dt) {
  const L = lumiere(h);
  const c = 0.6 + 0.8 * competence; // un débutant produit moins qu'un habitué
  const k = (dt / 60) * c;
  switch (action) {
    case 'cultiver': {
      const r = 4.5 * L * m.fertilite * (meteo.secheresse ? 0.5 : 1) * k;
      m.fertilite = clamp(m.fertilite - r * 0.0005, 0.1, 1);
      return { nourriture: r, fatigue: 1.3 + chaleur(h) };
    }
    case 'pecher': {
      if (meteo.tempete) return { nourriture: 0, fatigue: 1.6, danger: 0.004 * dt };
      // le poisson se pêche mieux à l'aube et au crépuscule
      const aube = h < 9 || h > 17 ? 1.35 : 1;
      const r = 5.5 * L * m.poisson * aube * (meteo.bonnePeche ? 1.7 : 1) * k;
      m.poisson = clamp(m.poisson - r * 0.0007, 0.02, 1);
      return { nourriture: r, fatigue: 1.2 };
    }
    case 'olives': {
      const r = 2.0 * L * m.olives * k;
      m.olives = clamp(m.olives - r * 0.002, 0, 1);
      return { nourriture: r * 0.8, huile: r * 0.5, fatigue: 1.1 };
    }
    case 'pierre':
      return { pierre: 1.0 * L * k, fatigue: 1.7 + chaleur(h) };
    case 'bois': {
      const r = 1.0 * L * m.foret * k;
      m.foret = clamp(m.foret - r * 0.0018, 0.02, 1);
      return { bois: r, fatigue: 1.5 };
    }
    case 'artisanat':
      return { pieces: 0.9 * k, fatigue: 0.8 };
    case 'commercer':
      return { pieces: 0.6 * k, fatigue: 0.6 };
    case 'soigner':
      return { remedes: 0.25 * k, fatigue: 0.8 };
    case 'enseigner':
      return { fatigue: 0.9 };
    case 'construire':
      return { chantier: 1.2 * k, fatigue: 1.6 + chaleur(h) };
    default:
      return { fatigue: 0 };
  }
}

// Le sommeil répare mieux dans l'obscurité et la fraîcheur.
export function recuperation(h) {
  return lumiere(h) > 0.5 ? 0.075 : 0.15;
}

// Probabilité quotidienne de tomber malade : la faim, l'épuisement et l'eau
// non potable affaiblissent le corps.
export function risqueMaladie(v, bonus) {
  const b = v.besoins;
  return 0.006 + (b.faim < 25 ? 0.03 : 0) + (b.energie < 20 ? 0.02 : 0) + (v.age > 65 ? 0.01 : 0) + (bonus.puits ? -0.003 : 0.004);
}

// Horloge interne : dans l'obscurité, rester éveillé épuise ; le sommeil de nuit dure jusqu'à l'aube.
export function pressionCircadienne(h) {
  return lumiere(h) < 0.2 ? 1.9 : 1;
}
export function minutesJusquAube(h) {
  return ((6 - h + 24) % 24) * 60;
}
