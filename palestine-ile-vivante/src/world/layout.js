// Plan du village : bâtiments, zones de travail et lieux de vie.
// Données pures partagées entre simulation et rendu.

import { heightAt } from './heightmap.js';

export const PLAZA = { x: 4, z: 12, w: 20, d: 15 };

// Emplacements des maisons d'origine (14 foyers) + terrains constructibles.
const HOUSE_SPOTS = [
  [-22, 14], [-27, 28], [-12, 33], [2, 35], [16, 37], [-35, 3], [-30, -14],
  [-4, -21], [11, -22], [40, -13], [-41, 19], [-14, 49], [18, 49], [-39, 36],
];
export const FREE_HOUSE_SPOTS = [[33, 43], [-47, -4], [30, -30], [-26, 46]];

function facing(x, z, tx, tz) {
  // angle de rotation (autour de Y) pour que la façade (+z local) regarde la cible
  return Math.atan2(tx - x, tz - z);
}

function doorOf(b) {
  const dist = b.d / 2 + 1.6;
  return { x: b.x + Math.sin(b.rot) * dist, z: b.z + Math.cos(b.rot) * dist };
}

export function makeBuilding(id, type, nom, x, z, w, d, rot, extra = {}) {
  const b = { id, type, nom, x, z, w, d, rot, ...extra };
  b.door = doorOf(b);
  b.y = groundUnder(b);
  return b;
}

// Hauteur de pose : moyenne des coins (les fondations comblent le reste).
export function groundUnder(b) {
  let s = 0;
  const pts = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [i, j] of pts) s += heightAt(b.x + (i * b.w) / 2, b.z + (j * b.d) / 2);
  return Math.max(0.6, s / pts.length);
}

export function buildLayout() {
  const buildings = [];
  HOUSE_SPOTS.forEach(([x, z], i) => {
    const rot = facing(x, z, PLAZA.x, PLAZA.z);
    buildings.push(
      makeBuilding(`maison-${i + 1}`, 'maison', `Maison ${i + 1}`, x, z, 8, 7, rot, {
        etages: i % 4 === 0 ? 2 : 1,
      })
    );
  });

  buildings.push(makeBuilding('mosquee', 'mosquee', 'Mosquée', -16, -4, 13, 13, facing(-16, -4, PLAZA.x, PLAZA.z)));
  buildings.push(makeBuilding('ecole', 'ecole', 'École', 27, -4, 16, 10, facing(27, -4, PLAZA.x, PLAZA.z)));
  buildings.push(makeBuilding('dispensaire', 'dispensaire', 'Dispensaire', 27, 25, 12, 9, facing(27, 25, PLAZA.x, PLAZA.z)));
  buildings.push(makeBuilding('atelier', 'atelier', 'Atelier des artisans', -12, 21, 9, 6, facing(-12, 21, PLAZA.x, PLAZA.z)));
  buildings.push(makeBuilding('entrepot', 'entrepot', 'Entrepôt du port', -9, 57, 11, 7, 0));

  return buildings;
}

// Zones : lieux où l'on travaille ou se retrouve, avec un rayon pour
// disperser les habitants de façon crédible.
export const ZONES = {
  marche: { nom: 'le marché', x: PLAZA.x, z: PLAZA.z, r: 7 },
  champs: { nom: 'les champs', x: 60, z: 10, w: 26, d: 34, rect: true },
  oliveraie: { nom: "l'oliveraie", x: -34, z: -36, r: 15 },
  carriere: { nom: 'la carrière', x: 14, z: -60, r: 6 },
  foret: { nom: 'la pinède', x: 52, z: -44, r: 12 },
  port: { nom: 'le port', x: 1, z: 60, r: 5 },
  jetee: { nom: 'la jetée', x: 3, z: 64, x2: 3, z2: 86 },
  plage: { nom: 'la plage', x: -60, z: 6, r: 6 },
  source: { nom: 'la source', x: -12, z: -52, r: 4 },
  belvedere: { nom: 'le belvédère', x: -48, z: -62, r: 4 },
  cour_mosquee: { nom: 'la cour de la mosquée', x: -9, z: 2, r: 3 },
  cour_ecole: { nom: "la cour de l'école", x: 20, z: 3, r: 4 },
};

export const SOCIAL_SPOTS = ['marche', 'port', 'cour_mosquee', 'plage', 'source', 'marche', 'marche'];

export function randomPointInZone(zone, rng) {
  if (zone.rect) {
    return { x: zone.x + rng.range(-zone.w / 2 + 1, zone.w / 2 - 1), z: zone.z + rng.range(-zone.d / 2 + 1, zone.d / 2 - 1) };
  }
  if (zone.x2 !== undefined) {
    const t = rng.range(0.15, 1);
    return { x: zone.x + (zone.x2 - zone.x) * t + rng.range(-0.6, 0.6), z: zone.z + (zone.z2 - zone.z) * t };
  }
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(rng.next()) * zone.r;
  return { x: zone.x + Math.cos(a) * r, z: zone.z + Math.sin(a) * r };
}
