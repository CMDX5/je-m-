// Terrain de l'île : maillage coloré (sable, garrigue, roche, chemins, champs)
// et végétation méditerranéenne instanciée (oliviers, pins, cyprès, figuiers de Barbarie).

import * as THREE from 'three';
import { heightAt, fbm, WORLD } from '../world/heightmap.js';
import { ZONES, PLAZA } from '../world/layout.js';
import { RNG } from '../sim/rng.js';

const COL = {
  sable: new THREE.Color(0xe3cf9f),
  sableMouille: new THREE.Color(0xb9a57a),
  fond: new THREE.Color(0x6fb7b0),
  herbe: new THREE.Color(0x9aa35a),
  herbeSeche: new THREE.Color(0xc2b072),
  garrigue: new THREE.Color(0x7c8a4a),
  roche: new THREE.Color(0xa89c8a),
  chemin: new THREE.Color(0xc9ad80),
  place: new THREE.Color(0xd8c7a6),
  terreLabour: new THREE.Color(0x8a6a45),
  culture: new THREE.Color(0x6f8f3a),
};

function distSeg(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

export function cheminsDuVillage(batiments) {
  const P = [PLAZA.x, PLAZA.z];
  const segs = [];
  const route = (pts) => { for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]); };
  route([P, [2, 34], [1, 50], [1, 62], [3, 66]]); // vers le port
  route([P, [26, 6], [46, 8], [56, 10]]); // vers les champs
  route([P, [-10, -6], [-24, -24], [-34, -34]]); // vers l'oliveraie
  route([[-10, -6], [-12, -30], [-12, -50]]); // vers la source
  route([[-12, -30], [2, -44], [13, -58]]); // carrière
  route([[26, 6], [40, -24], [51, -42]]); // pinède
  route([[-24, -24], [-40, -50], [-47, -61]]); // belvédère
  route([P, [-30, 8], [-58, 6]]); // plage
  for (const b of batiments) if (b.door) segs.push([[b.door.x, b.door.z], nearestOnNetwork(b.door, segs, P)]);
  return segs;
}

function nearestOnNetwork(door, segs, P) {
  let best = P, bd = Infinity;
  for (const [a, b] of segs) {
    for (let t = 0; t <= 1; t += 0.1) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const d = Math.hypot(x - door.x, z - door.z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
  }
  return best;
}

export function creerTerrain(scene, batiments) {
  const size = WORLD.half * 2;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const segs = cheminsDuVillage(batiments);
  const champs = ZONES.champs;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x / 9, z / 9, 21, 3);
    // pente approximative
    const slope = Math.abs(heightAt(x + 1, z) - h) + Math.abs(heightAt(x, z + 1) - h);
    if (h < -0.4) c.copy(COL.fond).lerp(COL.sableMouille, Math.max(0, Math.min(1, (h + 4) / 4)) * 0.6);
    else if (h < 1.1) c.copy(COL.sable).lerp(COL.sableMouille, h < 0.25 ? 0.5 : 0);
    else {
      c.copy(COL.herbeSeche).lerp(COL.herbe, n);
      if (h > 7) c.lerp(COL.garrigue, Math.min(1, (h - 7) / 5));
      if (slope > 1.3 || h > 13) c.lerp(COL.roche, Math.min(1, (slope - 1.0) * 0.8 + Math.max(0, h - 13) * 0.2));
      if (h < 1.8) c.lerp(COL.sable, (1.8 - h) / 0.7);
    }
    // place du village
    if (Math.abs(x - PLAZA.x) < PLAZA.w / 2 && Math.abs(z - PLAZA.z) < PLAZA.d / 2) c.copy(COL.place).multiplyScalar(0.95 + n * 0.1);
    // champs : sillons
    if (Math.abs(x - champs.x) < champs.w / 2 && Math.abs(z - champs.z) < champs.d / 2) {
      const sillon = Math.sin(x * 2.2) > 0;
      c.copy(sillon ? COL.culture : COL.terreLabour).lerp(COL.herbeSeche, n * 0.25);
      if (z > champs.z + 4) c.lerp(new THREE.Color(0xc9b25a), 0.55); // blé mûr
    }
    // chemins
    if (h > 0.5) {
      let dmin = Infinity;
      for (const [a, b] of segs) {
        const d = distSeg(x, z, a, b);
        if (d < dmin) dmin = d;
      }
      if (dmin < 2.2) c.lerp(COL.chemin, (1 - dmin / 2.2) * 0.85);
    }
    // oliveraie : terre plus claire
    const dO = Math.hypot(x - ZONES.oliveraie.x, z - ZONES.oliveraie.z);
    if (dO < ZONES.oliveraie.r + 3) c.lerp(new THREE.Color(0xb7a27a), 0.35 * (1 - dO / (ZONES.oliveraie.r + 3)));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

// ---------- Végétation ----------

// Matières végétales qui verdissent après la pluie et jaunissent à la saison sèche (voir Environment.appliquerSaison)
export const saisonnier = [];
const verte = (opts) => { const m = new THREE.MeshStandardMaterial(opts); saisonnier.push({ mat: m, base: m.color.clone() }); return m; };

function instancer(scene, geo, mat, matrices, { ombre = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.castShadow = ombre;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

export function creerVegetation(scene, nav) {
  const rng = new RNG(4242);
  const libre = (x, z, marge = 2) => {
    if (heightAt(x, z) < 1.4) return false;
    for (const [dx, dz] of [[0, 0], [marge, 0], [-marge, 0], [0, marge], [0, -marge]]) if (!nav.walkable(x + dx, z + dz)) return false;
    if (Math.abs(x - PLAZA.x) < PLAZA.w / 2 + 2 && Math.abs(z - PLAZA.z) < PLAZA.d / 2 + 2) return false;
    const ch = ZONES.champs;
    if (Math.abs(x - ch.x) < ch.w / 2 + 1 && Math.abs(z - ch.z) < ch.d / 2 + 1) return false;
    return true;
  };
  const prochePlace = (x, z) => Math.hypot(x - PLAZA.x, z - PLAZA.z);

  // Oliviers : l'oliveraie en rangées + oliviers épars
  const olives = [];
  const O = ZONES.oliveraie;
  for (let gx = -O.r - 4; gx <= O.r + 4; gx += 5) {
    for (let gz = -O.r - 4; gz <= O.r + 4; gz += 5) {
      const x = O.x + gx + rng.range(-1, 1), z = O.z + gz + rng.range(-1, 1);
      if (Math.hypot(gx, gz) > O.r + 4 || !libre(x, z, 1)) continue;
      olives.push([x, z, rng.range(0.85, 1.35)]);
    }
  }
  for (let k = 0; k < 900 && olives.length < 160; k++) {
    const x = rng.range(-80, 90), z = rng.range(-80, 70);
    if (!libre(x, z) || prochePlace(x, z) < 14 || heightAt(x, z) > 11) continue;
    olives.push([x, z, rng.range(0.7, 1.2)]);
  }
  const mxs = [], mxc = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [x, z, k] of olives) {
    const y = heightAt(x, z);
    q.setFromAxisAngle(up, rng.range(0, 6.28));
    mxs.push(m4.compose(p.set(x, y + 0.9 * k, z), q, s.set(k, k, k)).clone());
    mxc.push(m4.compose(p.set(x, y + 2.3 * k, z), q, s.set(k * rng.range(0.9, 1.2), k * rng.range(0.7, 0.9), k * rng.range(0.9, 1.2))).clone());
  }
  const tronc = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1 });
  instancer(scene, new THREE.CylinderGeometry(0.22, 0.38, 1.8, 6), tronc, mxs);
  const feuillageOlive = verte({ color: 0x8a9a6a, roughness: 0.9, flatShading: true });
  const geoCouronne = new THREE.IcosahedronGeometry(1.7, 1);
  instancer(scene, geoCouronne, feuillageOlive, mxc);

  // Pins d'Alep (pinède et collines)
  const pins = [];
  for (let k = 0; k < 1400 && pins.length < 150; k++) {
    const nearForest = rng.chance(0.6);
    const x = nearForest ? ZONES.foret.x + rng.range(-22, 22) : rng.range(-70, 80);
    const z = nearForest ? ZONES.foret.z + rng.range(-20, 20) : rng.range(-85, -25);
    if (!libre(x, z) || Math.hypot(x - ZONES.carriere.x, z - ZONES.carriere.z) < 9) continue;
    pins.push([x, z, rng.range(0.8, 1.4)]);
  }
  const pt = [], pc = [];
  for (const [x, z, k] of pins) {
    const y = heightAt(x, z);
    q.setFromAxisAngle(up, rng.range(0, 6.28));
    pt.push(m4.compose(p.set(x, y + 2.2 * k, z), q, s.set(k, k, k)).clone());
    pc.push(m4.compose(p.set(x, y + 4.9 * k, z), q, s.set(k * 1.2, k * 0.75, k * 1.2)).clone());
  }
  instancer(scene, new THREE.CylinderGeometry(0.2, 0.32, 4.4, 5), tronc, pt);
  instancer(scene, new THREE.DodecahedronGeometry(2.2, 0), verte({ color: 0x4f6b3a, roughness: 0.95, flatShading: true }), pc);

  // Cyprès autour de la mosquée et le long des chemins
  const cypres = [[-25, -12], [-25, -6], [-25, 0], [-7, -13], [-3, -13], [34, -12], [38, 18], [-20, 40], [12, 56], [-4, 58], [20, 60]];
  for (let k = 0; k < 18; k++) cypres.push([rng.range(-50, 50), rng.range(-30, 55)]);
  const cy = cypres.filter(([x, z]) => libre(x, z, 1) && prochePlace(x, z) > 12).map(([x, z]) => {
    const k = rng.range(0.85, 1.25);
    return m4.compose(p.set(x, heightAt(x, z) + 3.2 * k, z), q.identity(), s.set(k, k, k)).clone();
  });
  instancer(scene, new THREE.ConeGeometry(0.9, 7.5, 7), new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 }), cy);

  // Figuiers de Barbarie (sabra) en haies
  const sabra = [];
  for (let k = 0; k < 600 && sabra.length < 160; k++) {
    const x = rng.range(-70, 80), z = rng.range(-60, 60);
    if (!libre(x, z, 1.5) || prochePlace(x, z) < 16) continue;
    for (let j = 0; j < 4; j++) {
      const xx = x + rng.range(-1.2, 1.2), zz = z + rng.range(-1.2, 1.2);
      q.setFromEuler(new THREE.Euler(rng.range(-0.4, 0.4), rng.range(0, 6.28), rng.range(-0.4, 0.4)));
      sabra.push(m4.compose(p.set(xx, heightAt(xx, zz) + rng.range(0.4, 1.3), zz), q, s.set(0.55, 0.75, 0.16)).clone());
    }
  }
  instancer(scene, new THREE.SphereGeometry(1, 7, 5), verte({ color: 0x6f8a45, roughness: 0.8, flatShading: true }), sabra);

  // Rochers
  const roc = [];
  for (let k = 0; k < 900 && roc.length < 130; k++) {
    const x = rng.range(-90, 95), z = rng.range(-95, 75);
    const h = heightAt(x, z);
    if (h < 0.4 || !nav.walkable(x, z) || prochePlace(x, z) < 20) continue;
    if (h < 6 && rng.chance(0.75)) continue;
    const k2 = rng.range(0.5, 2.2);
    q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
    roc.push(m4.compose(p.set(x, h + 0.2 * k2, z), q, s.set(k2, k2 * rng.range(0.5, 0.9), k2)).clone());
  }
  instancer(scene, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xb0a594, roughness: 1, flatShading: true }), roc);

  // Cultures dans les champs (petits plants en rangées)
  const ch = ZONES.champs;
  const plants = [];
  for (let x = ch.x - ch.w / 2 + 1; x < ch.x + ch.w / 2 - 1; x += Math.PI / 2.2) {
    for (let z = ch.z - ch.d / 2 + 1; z < ch.z + 3; z += 1.3) {
      if (Math.sin(x * 2.2) <= 0) continue;
      plants.push(m4.compose(p.set(x + 0.3, heightAt(x, z) + 0.25, z), q.identity(), s.set(0.5, 0.5, 0.5)).clone());
    }
  }
  instancer(scene, new THREE.IcosahedronGeometry(0.7, 0), verte({ color: 0x5f8a34, flatShading: true }), plants, { ombre: false });
}
