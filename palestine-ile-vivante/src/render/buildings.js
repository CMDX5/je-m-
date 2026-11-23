// Architecture du village : maisons en pierre, mosquée, école, dispensaire,
// marché, port, carrière, chantiers. Formes simples mais lisibles.

import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { ZONES, PLAZA } from '../world/layout.js';
import { RNG } from '../sim/rng.js';

const pierre = [0xdccbaa, 0xd2bf99, 0xe4d7bc, 0xcdb48c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
const pierreSombre = new THREE.MeshStandardMaterial({ color: 0xb8a37f, roughness: 0.95 });
const blanc = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.85 });
const bois = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
const boisClair = new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.9 });
const portes = [0x2f5d8a, 0x3f7a6a, 0x7a3b2e, 0x2e6f8f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
const vert = new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.7 });
const fer = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 });
export const fenetreMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: 0xffb45a, emissiveIntensity: 0, roughness: 0.4 });
const domeMat = new THREE.MeshStandardMaterial({ color: 0xc9a54a, roughness: 0.45, metalness: 0.35 });
const tuiles = new THREE.MeshStandardMaterial({ color: 0xb4573a, roughness: 0.85 });
const eauMat = new THREE.MeshStandardMaterial({ color: 0x3a8fb0, roughness: 0.1, metalness: 0.2 });
const bougainvillier = new THREE.MeshStandardMaterial({ color: 0xc2336e, roughness: 0.9, flatShading: true });
const feuillage = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9, flatShading: true });
const toile = [0xc0392b, 0xe0b030, 0x2f6f8f, 0x3f8a4a, 0xe07a30, 0x8e44ad].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function parapet(g, w, d, y, mat, h = 0.6) {
  const t = 0.3;
  g.add(box(w, h, t, mat, 0, y + h / 2, d / 2 - t / 2));
  g.add(box(w, h, t, mat, 0, y + h / 2, -d / 2 + t / 2));
  g.add(box(t, h, d, mat, w / 2 - t / 2, y + h / 2, 0));
  g.add(box(t, h, d, mat, -w / 2 + t / 2, y + h / 2, 0));
}

function fenetres(g, w, d, y, nFace = 2, cotes = true) {
  for (let i = 0; i < nFace; i++) {
    const x = -w / 2 + ((i + 1) * w) / (nFace + 1);
    if (Math.abs(x) < 0.9) continue;
    g.add(box(0.8, 1.0, 0.12, fenetreMat, x, y, d / 2 + 0.02));
  }
  if (cotes) {
    g.add(box(0.12, 1.0, 0.8, fenetreMat, w / 2 + 0.02, y, 0));
    g.add(box(0.12, 1.0, 0.8, fenetreMat, -w / 2 - 0.02, y, 0));
  }
}

function placer(g, b) {
  g.position.set(b.x, b.y, b.z);
  g.rotation.y = b.rot;
  g.userData.batiment = b.id;
  return g;
}

export function creerMaison(b, rng) {
  const g = new THREE.Group();
  const mat = pierre[rng.int(0, pierre.length - 1)];
  const H = 3.4 * (b.etages || 1);
  const fond = 3;
  g.add(box(b.w, H + fond, b.d, mat, 0, (H - fond) / 2, 0));
  parapet(g, b.w, b.d, H, mat);
  // porte en arc (porte + linteau)
  g.add(box(1.3, 2.2, 0.15, portes[rng.int(0, portes.length - 1)], 0, 1.1, b.d / 2 + 0.05));
  g.add(cyl(0.65, 0.65, 0.16, 10, pierreSombre, 0, 2.2, b.d / 2 + 0.05).rotateX(Math.PI / 2));
  fenetres(g, b.w, b.d, 2.0);
  if ((b.etages || 1) > 1) fenetres(g, b.w, b.d, 5.4, 3);
  // petite pièce sur le toit ou réservoir d'eau
  if (rng.chance(0.5)) g.add(box(2.6, 2.2, 2.4, mat, -b.w / 4, H + 1.1, -b.d / 4));
  else g.add(cyl(0.6, 0.6, 1.1, 10, fer, b.w / 4, H + 0.55, -b.d / 4));
  // bougainvillier près de l'entrée
  if (rng.chance(0.65)) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), bougainvillier);
    s.position.set(b.w / 2 - 0.6, 1.2, b.d / 2 + 0.5);
    s.scale.set(1, 1.5, 0.8);
    s.castShadow = true;
    g.add(s);
  }
  // escalier extérieur
  if (rng.chance(0.4)) for (let i = 0; i < 5; i++) g.add(box(1, 0.6, 0.8, mat, b.w / 2 + 0.5, 0.3 + i * 0.66, -b.d / 2 + 0.6 + i * 0.75));
  return placer(g, b);
}

function creerMosquee(b) {
  const g = new THREE.Group();
  const H = 5.5;
  g.add(box(b.w, H + 3, b.d, pierre[2], 0, (H - 3) / 2, 0));
  parapet(g, b.w, b.d, H, pierre[2], 0.5);
  g.add(cyl(3.2, 3.4, 1.6, 20, pierre[2], 0, H + 0.8, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.y = H + 1.6;
  dome.castShadow = true;
  g.add(dome);
  g.add(cyl(0.08, 0.08, 1.2, 6, domeMat, 0, H + 5.4, 0));
  // minaret
  const mx = b.w / 2 - 1.2, mz = -b.d / 2 + 1.2;
  g.add(cyl(1.0, 1.15, 16, 10, pierre[2], mx, 5, mz));
  g.add(cyl(1.5, 1.2, 0.5, 12, pierreSombre, mx, 11.5, mz));
  g.add(cyl(0.85, 0.85, 3, 10, pierre[2], mx, 14.5, mz));
  const pt = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  pt.position.set(mx, 16, mz);
  g.add(pt);
  g.add(cyl(0.05, 0.05, 1.0, 5, domeMat, mx, 17.3, mz));
  // portail en arc et fenêtres hautes
  g.add(box(2.4, 3.4, 0.2, portes[1], 0, 1.7, b.d / 2 + 0.05));
  g.add(cyl(1.2, 1.2, 0.22, 14, pierreSombre, 0, 3.4, b.d / 2 + 0.06).rotateX(Math.PI / 2));
  for (const x of [-4, -2.2, 2.2, 4]) g.add(box(0.7, 1.6, 0.12, fenetreMat, x, 3.6, b.d / 2 + 0.02));
  // cour avec muret
  g.add(box(b.w, 1.1, 0.4, pierreSombre, 0, 0.3, b.d / 2 + 5));
  return placer(g, b);
}

function creerEcole(b) {
  const g = new THREE.Group();
  const H = 4;
  g.add(box(b.w, H + 3, b.d, pierre[0], 0, (H - 3) / 2, 0));
  // toit de tuiles à deux pans
  // prisme triangulaire (toit à deux pans), faîtage le long de la façade
  const r = (b.d + 1) / Math.sqrt(3);
  const pg = new THREE.CylinderGeometry(r, r, b.w + 0.8, 3, 1);
  pg.rotateZ(Math.PI / 2);
  pg.rotateX(-Math.PI / 2);
  pg.scale(1, 0.55, 1);
  const toit = new THREE.Mesh(pg, tuiles);
  toit.position.y = H + r * 0.55 * 0.5 + 0.05;
  toit.castShadow = true;
  g.add(toit);
  g.add(box(1.6, 2.4, 0.15, portes[0], 0, 1.2, b.d / 2 + 0.05));
  fenetres(g, b.w, b.d, 2.2, 6);
  // préau et petit jardin
  g.add(box(6, 0.2, 3, boisClair, -b.w / 2 + 3, 2.8, b.d / 2 + 1.6));
  for (const x of [-b.w / 2 + 0.3, -b.w / 2 + 5.7]) g.add(cyl(0.1, 0.1, 2.8, 6, bois, x, 1.4, b.d / 2 + 3));
  g.userData.annexe = (gg) => {
    gg.add(box(7, H + 3, b.d - 2, pierre[3], b.w / 2 + 3.4, (H - 3) / 2, -1));
    parapet(gg, 7, b.d - 2, H, pierre[3]);
  };
  return placer(g, b);
}

function creerDispensaire(b) {
  const g = new THREE.Group();
  const H = 3.8;
  g.add(box(b.w, H + 3, b.d, blanc, 0, (H - 3) / 2, 0));
  parapet(g, b.w, b.d, H, blanc);
  g.add(box(b.w + 0.04, 0.5, b.d + 0.04, vert, 0, H - 0.6, 0));
  g.add(box(1.6, 2.4, 0.15, portes[3], 0, 1.2, b.d / 2 + 0.05));
  // enseigne : croix verte
  g.add(box(1.4, 0.45, 0.12, vert, 0, H + 1.4, b.d / 2 - 0.1));
  g.add(box(0.45, 1.4, 0.12, vert, 0, H + 1.4, b.d / 2 - 0.1));
  g.add(box(0.2, 1.4, 0.2, fer, 0, H + 0.6, b.d / 2 - 0.1));
  fenetres(g, b.w, b.d, 2.0, 4);
  return placer(g, b);
}

function creerAtelier(b) {
  const g = new THREE.Group();
  g.add(box(b.w, 3.2 + 3, b.d, pierre[1], 0, (3.2 - 3) / 2, 0));
  parapet(g, b.w, b.d, 3.2, pierre[1], 0.4);
  const auvent = box(b.w, 0.12, 2.4, toile[1], 0, 2.6, b.d / 2 + 1.1);
  auvent.rotation.x = 0.18;
  g.add(auvent);
  g.add(box(2.2, 2.2, 0.15, portes[2], 0, 1.1, b.d / 2 + 0.05));
  const terre = new THREE.MeshStandardMaterial({ color: 0xb5643a, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.35 + (i % 3) * 0.08, 10, 8), terre);
    j.scale.y = 1.4;
    j.position.set(-b.w / 2 + 0.8 + i * 0.6, 0.45, b.d / 2 + 1.6 + (i % 2) * 0.5);
    j.castShadow = true;
    g.add(j);
  }
  return placer(g, b);
}

function creerEntrepot(b) {
  const g = new THREE.Group();
  g.add(box(b.w, 4 + 3, b.d, boisClair, 0, (4 - 3) / 2, 0));
  const toit = box(b.w + 0.6, 0.25, b.d + 0.6, tuiles, 0, 4.1, 0);
  g.add(toit);
  g.add(box(3, 3, 0.15, bois, 0, 1.5, b.d / 2 + 0.05));
  for (let i = 0; i < 5; i++) g.add(box(1, 1, 1, bois, -b.w / 2 - 1 + (i % 2) * 0.2, 0.5 + Math.floor(i / 2) * 1.0, -2 + (i % 3) * 1.1));
  return placer(g, b);
}

export function creerPuits(b) {
  const g = new THREE.Group();
  g.add(cyl(1.3, 1.4, 1.1, 14, pierre[3], 0, 0.55, 0));
  g.add(cyl(1.0, 1.0, 0.1, 14, eauMat, 0, 0.9, 0));
  g.add(box(0.2, 2.6, 0.2, bois, -1.1, 1.8, 0));
  g.add(box(0.2, 2.6, 0.2, bois, 1.1, 1.8, 0));
  g.add(box(2.6, 0.2, 0.2, bois, 0, 3.1, 0));
  g.add(cyl(0.25, 0.22, 0.4, 8, bois, 0, 2.3, 0));
  return placer(g, b);
}

function creerMarche(scene, rng) {
  const g = new THREE.Group();
  const y = heightAt(PLAZA.x, PLAZA.z);
  g.position.set(PLAZA.x, 0, PLAZA.z);
  // fontaine centrale
  g.add(cyl(2.2, 2.4, 0.8, 8, pierre[3], 0, y + 0.4, 0));
  g.add(cyl(1.9, 1.9, 0.1, 8, eauMat, 0, y + 0.75, 0));
  g.add(cyl(0.3, 0.4, 1.8, 8, pierre[3], 0, y + 1.2, 0));
  g.add(cyl(0.8, 0.3, 0.3, 8, pierre[3], 0, y + 2.1, 0));
  // étals
  const fruits = [0xe25b2a, 0x7fae3a, 0xe8c23a, 0x8a2a4a, 0xf0e6c0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const etals = [[-7, -5], [-7, 0], [-7, 5], [7, -5], [7, 0], [7, 5]];
  etals.forEach(([x, z], i) => {
    const e = new THREE.Group();
    const hy = heightAt(PLAZA.x + x, PLAZA.z + z);
    e.position.set(x, hy, z);
    e.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const [px, pz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) e.add(cyl(0.06, 0.06, 2.5, 5, bois, px, 1.25, pz));
    const t = box(3.2, 0.06, 2.4, toile[i % toile.length], 0, 2.5, 0);
    t.rotation.x = 0.12;
    e.add(t);
    e.add(box(2.8, 0.15, 1.2, boisClair, 0, 0.9, 0.3));
    for (let k = 0; k < 10; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), fruits[(i + k) % fruits.length]);
      f.position.set(-1.1 + (k % 5) * 0.5, 1.07, 0.05 + Math.floor(k / 5) * 0.45);
      e.add(f);
    }
    g.add(e);
  });
  // bancs et lampadaires
  for (const [x, z, r] of [[-3.5, 6.5, 0], [3.5, 6.5, 0], [-3.5, -6.5, 0], [3.5, -6.5, 0]]) {
    const hy = heightAt(PLAZA.x + x, PLAZA.z + z);
    const banc = box(2.2, 0.15, 0.6, boisClair, x, hy + 0.5, z);
    banc.rotation.y = r;
    g.add(banc);
    g.add(box(0.15, 0.5, 0.5, pierreSombre, x - 0.9, hy + 0.25, z), box(0.15, 0.5, 0.5, pierreSombre, x + 0.9, hy + 0.25, z));
  }
  scene.add(g);
  return g;
}

function creerPort(scene, rng) {
  const g = new THREE.Group();
  const J = ZONES.jetee;
  const L = Math.hypot(J.x2 - J.x, J.z2 - J.z) + 4;
  const jetee = new THREE.Group();
  jetee.position.set((J.x + J.x2) / 2, 0, (J.z + J.z2) / 2 - 2);
  jetee.add(box(3.2, 0.3, L, boisClair, 0, 0.9, 0));
  for (let z = -L / 2 + 1; z < L / 2; z += 3) {
    jetee.add(cyl(0.18, 0.18, 4, 6, bois, -1.5, -0.8, z));
    jetee.add(cyl(0.18, 0.18, 4, 6, bois, 1.5, -0.8, z));
  }
  g.add(jetee);
  // quai de pierre
  g.add(box(16, 1.5, 4, pierreSombre, -2, 0.4, 61));
  // bateaux de pêche
  const coques = [0x2f6f8f, 0xf1ede4, 0x3f8a4a, 0xc0392b, 0xe0b030];
  const bateaux = [];
  [[-1.5, 70, 0.1], [-1.8, 76, -0.15], [7.5, 72, 0.2], [7.8, 79, -0.1], [-6, 66, 0.6]].forEach(([x, z, r], i) => {
    const b = new THREE.Group();
    const coque = box(1.6, 0.8, 4.6, new THREE.MeshStandardMaterial({ color: coques[i], roughness: 0.6 }), 0, 0.2, 0);
    b.add(coque);
    const proue = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4), coque.material);
    proue.rotation.x = Math.PI / 2;
    proue.rotation.y = Math.PI / 4;
    proue.scale.set(1.4, 1, 0.55);
    proue.position.set(0, 0.2, 2.9);
    b.add(proue);
    b.add(box(1.4, 0.1, 4.2, boisClair, 0, 0.62, 0));
    b.add(cyl(0.06, 0.06, 3, 5, bois, 0, 2.1, 0.6));
    b.position.set(x, 0, z);
    b.rotation.y = r;
    b.userData.phase = rng.range(0, 6);
    g.add(b);
    bateaux.push(b);
  });
  scene.add(g);
  return { groupe: g, bateaux, jetee };
}

function creerNavireMarchand() {
  const g = new THREE.Group();
  const coque = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 });
  g.add(box(4, 1.8, 14, coque, 0, 0.5, 0));
  const proue = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 4), coque);
  proue.rotation.x = Math.PI / 2; proue.rotation.y = Math.PI / 4; proue.scale.set(1.4, 1, 0.65);
  proue.position.set(0, 0.5, 9);
  g.add(proue);
  g.add(box(3.6, 0.15, 13, boisClair, 0, 1.45, 0));
  const voile = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.9, side: THREE.DoubleSide });
  for (const z of [-3, 3]) {
    g.add(cyl(0.12, 0.15, 10, 6, bois, 0, 6.4, z));
    const v = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), voile);
    v.position.set(0, 7, z + 0.2);
    v.castShadow = true;
    g.add(v);
  }
  for (let i = 0; i < 4; i++) g.add(box(1, 1, 1, bois, -0.8 + (i % 2) * 1.4, 2, -5 + i * 1.2));
  g.position.set(9, 0, 88);
  g.rotation.y = -0.15;
  g.visible = false;
  return g;
}

function creerCarriere(scene, rng) {
  const g = new THREE.Group();
  const C = ZONES.carriere;
  const roc = new THREE.MeshStandardMaterial({ color: 0xcbbfa8, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const x = C.x + rng.range(-7, 7), z = C.z + rng.range(-8, -3);
    const s = rng.range(1.5, 3.5);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), roc);
    r.position.set(x, heightAt(x, z) + s * 0.3, z);
    r.castShadow = true;
    g.add(r);
  }
  for (let i = 0; i < 8; i++) {
    const x = C.x + 3 + (i % 4) * 1.1, z = C.z + 3 + Math.floor(i / 4) * 1.1;
    g.add(box(1, 0.7, 1, pierre[1], x, heightAt(x, z) + 0.35, z));
  }
  scene.add(g);
}

// Chantier : échafaudage + volume qui monte avec l'avancement.
export class Chantier {
  constructor(scene) {
    this.scene = scene;
    this.g = null;
  }
  maj(projet) {
    if (!projet) {
      if (this.g) { this.scene.remove(this.g); this.g = null; }
      return;
    }
    if (!this.g || this.g.userData.cle !== projet.cle) {
      if (this.g) this.scene.remove(this.g);
      const g = new THREE.Group();
      g.userData.cle = projet.cle;
      const { x, z } = projet.site;
      const y = heightAt(x, z);
      g.position.set(x, y, z);
      const w = projet.cle === 'puits' ? 3 : 7;
      this.vol = box(w, 1, w * 0.85, pierre[0], 0, 0, 0);
      g.add(this.vol);
      const ech = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 1, 4, w * 0.85 + 1, 2, 2, 2)), new THREE.LineBasicMaterial({ color: 0x6b4a2e }));
      ech.position.y = 2;
      g.add(ech);
      for (let i = 0; i < 6; i++) g.add(box(0.8, 0.6, 0.8, pierre[1], w / 2 + 1.5, 0.3 + Math.floor(i / 3) * 0.6, -1 + (i % 3) * 0.9));
      g.add(box(3, 0.2, 0.3, bois, -w / 2 - 1.6, 0.2, 0), box(3, 0.2, 0.3, bois, -w / 2 - 1.6, 0.4, 0.4));
      this.scene.add(g);
      this.g = g;
      this.hauteur = projet.cle === 'puits' ? 1.2 : 3.4;
    }
    const t = projet.enAttente ? 0.02 : Math.min(1, projet.progres / projet.travail);
    const h = Math.max(0.1, t * this.hauteur);
    this.vol.scale.y = h;
    this.vol.position.y = h / 2;
  }
}

export class Village {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.rng = new RNG(99);
    this.groupes = {};
    for (const b of sim.batiments) this.ajouterBatiment(b);
    this.marche = creerMarche(scene, this.rng);
    this.port = creerPort(scene, this.rng);
    this.navire = creerNavireMarchand();
    scene.add(this.navire);
    creerCarriere(scene, this.rng);
    this.chantier = new Chantier(scene);
    this.lampes = this.creerLampes();
    if (sim.bonus.jetee) this.renforcerJetee();
    if (sim.bonus.ecole) this.agrandirEcole();
  }

  ajouterBatiment(b) {
    let g;
    switch (b.type) {
      case 'maison': g = creerMaison(b, this.rng); break;
      case 'mosquee': g = creerMosquee(b); break;
      case 'ecole': g = creerEcole(b); break;
      case 'dispensaire': g = creerDispensaire(b); break;
      case 'atelier': g = creerAtelier(b); break;
      case 'entrepot': g = creerEntrepot(b); break;
      case 'puits': g = creerPuits(b); break;
      default: return;
    }
    this.scene.add(g);
    this.groupes[b.id] = g;
    return g;
  }

  renforcerJetee() {
    const g = new THREE.Group();
    for (let z = 64; z < 90; z += 2.2) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), pierreSombre);
      r.position.set(-3.2 + Math.sin(z) * 0.3, 0.1, z);
      r.castShadow = true;
      g.add(r);
    }
    this.port.jetee.children[0].scale.x = 1.4;
    this.scene.add(g);
  }

  agrandirEcole() {
    const g = this.groupes.ecole;
    if (g && g.userData.annexe && !g.userData.agrandie) {
      g.userData.annexe(g);
      g.userData.agrandie = true;
    }
  }

  creerLampes() {
    const lampes = [];
    const pts = [[PLAZA.x - 9, PLAZA.z - 7], [PLAZA.x + 9, PLAZA.z + 7], [PLAZA.x - 9, PLAZA.z + 7], [PLAZA.x + 9, PLAZA.z - 7], [3, 60], [-12, 2], [20, 3]];
    const ampoule = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffc070, emissiveIntensity: 0 });
    this.ampoule = ampoule;
    pts.forEach(([x, z], i) => {
      const y = heightAt(x, z);
      this.scene.add(cyl(0.08, 0.1, 3.4, 6, fer, x, y + 1.7, z));
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ampoule);
      a.position.set(x, y + 3.5, z);
      this.scene.add(a);
      if (i < 3) {
        const l = new THREE.PointLight(0xffb060, 0, 26, 1.6);
        l.position.set(x, y + 3.6, z);
        this.scene.add(l);
        lampes.push(l);
      }
    });
    return lampes;
  }

  update(t, nuit, sim) {
    for (const b of this.port.bateaux) {
      b.position.y = Math.sin(t * 1.3 + b.userData.phase) * 0.12;
      b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.05;
    }
    this.navire.visible = !!sim.navire;
    if (this.navire.visible) this.navire.position.y = Math.sin(t * 0.8) * 0.15;
    fenetreMat.emissiveIntensity = nuit * 1.4;
    this.ampoule.emissiveIntensity = nuit * 2.5;
    for (const l of this.lampes) l.intensity = nuit * 40;
    this.chantier.maj(sim.projet);
  }
}
