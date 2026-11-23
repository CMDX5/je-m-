// Représentation 3D des habitants : silhouettes stylisées, animation de marche,
// bulles d'état (discussion, dispute, entraide, maladie) et anneau de sélection.

import * as THREE from 'three';
import { heightAt } from '../world/heightmap.js';
import { METIERS } from '../sim/data.js';

// hauteur du sol, y compris le plancher de la jetée
export function solY(x, z) {
  const h = heightAt(x, z);
  return Math.abs(x - 3) < 2.2 && z > 59 && z < 90 ? Math.max(h, 1.05) : Math.max(h, 0);
}

const PEAUX = [0xc89a74, 0xb98660, 0xd8ad86, 0xa8754f, 0xe0b894];
const TISSUS_F = [0x7a2f4a, 0x2f4a7a, 0x4a6a3a, 0x6a4a7a, 0x9a5a2a, 0x2a5a5a];
const VOILES = [0xf1ede4, 0x3a3a5a, 0x8a3a4a, 0x5a7a9a, 0xd8c8a0, 0x2a4a3a];

const geo = {
  corps: new THREE.CylinderGeometry(0.24, 0.34, 0.95, 8),
  robe: new THREE.CylinderGeometry(0.22, 0.42, 1.25, 8),
  tete: new THREE.SphereGeometry(0.19, 12, 10),
  voile: new THREE.SphereGeometry(0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  calotte: new THREE.CylinderGeometry(0.17, 0.19, 0.12, 10),
  keffieh: new THREE.SphereGeometry(0.225, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  jambe: new THREE.BoxGeometry(0.13, 0.62, 0.15),
  bras: new THREE.BoxGeometry(0.1, 0.6, 0.12),
};

function bulleTexture(symbole, fond, encre) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = fond;
  x.beginPath();
  x.arc(32, 28, 22, 0, Math.PI * 2);
  x.moveTo(24, 46); x.lineTo(32, 60); x.lineTo(38, 46);
  x.fill();
  x.fillStyle = encre;
  x.font = 'bold 30px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(symbole, 32, 29);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Habitants3D {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.figures = [];
    this.cliquables = [];
    this.bulles = {
      parle: new THREE.SpriteMaterial({ map: bulleTexture('…', '#ffffff', '#333'), depthTest: false }),
      dispute: new THREE.SpriteMaterial({ map: bulleTexture('!', '#e0483a', '#fff'), depthTest: false }),
      aide: new THREE.SpriteMaterial({ map: bulleTexture('♥', '#3f9a5a', '#fff'), depthTest: false }),
      malade: new THREE.SpriteMaterial({ map: bulleTexture('+', '#f0f0f0', '#2f8a4a'), depthTest: false }),
      fete: new THREE.SpriteMaterial({ map: bulleTexture('♪', '#e0b030', '#fff'), depthTest: false }),
      pense: new THREE.SpriteMaterial({ map: bulleTexture('?', '#cfd8e8', '#334'), depthTest: false }),
    };
    for (const v of sim.habitants) this.ajouter(v);

    this.anneau = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffd34a, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    this.anneau.rotation.x = -Math.PI / 2;
    this.anneau.visible = false;
    scene.add(this.anneau);
    this.survol = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false }));
    this.survol.rotation.x = -Math.PI / 2;
    this.survol.visible = false;
    scene.add(this.survol);
  }

  ajouter(v) {
    const rnd = (n) => (v.id * 7919 + n * 104729) % 1000 / 1000;
    const g = new THREE.Group();
    const F = v.genre === 'F';
    const peau = new THREE.MeshStandardMaterial({ color: PEAUX[v.id % PEAUX.length], roughness: 0.8 });
    const couleurMetier = METIERS[v.metier]?.couleur ?? 0x888888;
    const habit = new THREE.MeshStandardMaterial({ color: F ? TISSUS_F[v.id % TISSUS_F.length] : couleurMetier, roughness: 0.85 });
    const pantalon = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.9 });

    const corps = new THREE.Mesh(F ? geo.robe : geo.corps, habit);
    corps.position.y = F ? 0.95 : 1.05;
    corps.castShadow = true;
    g.add(corps);
    // ceinture / écharpe à la couleur du métier (lisibilité des rôles)
    const echarpe = new THREE.Mesh(new THREE.TorusGeometry(F ? 0.27 : 0.29, 0.05, 6, 14), new THREE.MeshStandardMaterial({ color: couleurMetier, roughness: 0.7 }));
    echarpe.rotation.x = Math.PI / 2;
    echarpe.position.y = F ? 1.1 : 0.95;
    g.add(echarpe);

    const tete = new THREE.Mesh(geo.tete, peau);
    tete.position.y = 1.72;
    tete.castShadow = true;
    g.add(tete);
    if (F && v.age >= 12 && rnd(1) < 0.8) {
      const voile = new THREE.Mesh(geo.voile, new THREE.MeshStandardMaterial({ color: VOILES[(v.id * 3) % VOILES.length], roughness: 0.9 }));
      voile.position.y = 1.68;
      voile.rotation.x = -0.25;
      g.add(voile);
    } else if (!F && v.age >= 30 && rnd(2) < 0.45) {
      const k = new THREE.Mesh(geo.keffieh, new THREE.MeshStandardMaterial({ color: rnd(3) < 0.5 ? 0xf1ede4 : 0xe8e0d0, roughness: 0.9 }));
      k.position.y = 1.74;
      k.scale.set(1, 0.8, 1.1);
      g.add(k);
    } else if (!F && rnd(4) < 0.3) {
      const c = new THREE.Mesh(geo.calotte, new THREE.MeshStandardMaterial({ color: 0xf1ede4 }));
      c.position.y = 1.88;
      g.add(c);
    } else {
      const cheveux = new THREE.Mesh(geo.keffieh, new THREE.MeshStandardMaterial({ color: v.age > 60 ? 0xbfbab0 : 0x2a201a, roughness: 1 }));
      cheveux.position.y = 1.75;
      cheveux.scale.set(0.9, 0.55, 0.9);
      g.add(cheveux);
    }

    const jambes = [];
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(geo.jambe, F ? habit : pantalon);
      j.geometry = geo.jambe;
      j.position.set(0.11 * s, 0.32, 0);
      j.castShadow = true;
      if (!F) g.add(j);
      jambes.push(j);
    }
    const bras = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.33 * s, 1.42, 0);
      const b = new THREE.Mesh(geo.bras, habit);
      b.position.y = -0.28;
      b.castShadow = true;
      pivot.add(b);
      g.add(pivot);
      bras.push(pivot);
    }
    // échelle selon l'âge
    const taille = v.age < 6 ? 0.55 : v.age < 12 ? 0.7 : v.age < 16 ? 0.85 : v.age > 70 ? 0.94 : 1;
    g.scale.setScalar(taille * (0.95 + rnd(5) * 0.1));

    const bulle = new THREE.Sprite(this.bulles.parle);
    bulle.scale.set(0.9, 0.9, 1);
    bulle.position.y = 2.55 / taille;
    bulle.visible = false;
    bulle.renderOrder = 10;
    g.add(bulle);

    g.traverse((o) => { if (o.isMesh) { o.userData.habitant = v.id; this.cliquables.push(o); } });
    g.position.set(v.x, solY(v.x, v.z), v.z);
    this.scene.add(g);
    this.figures[v.id] = { g, jambes, bras, bulle, habit, echarpe, taille, phase: rnd(6) * 6, px: v.x, pz: v.z, metier: v.metier, F };
  }

  update(dtReel, t) {
    const sim = this.sim;
    for (const v of sim.habitants) {
      const f = this.figures[v.id];
      if (!f) continue;
      f.g.visible = !v.interieur;
      if (!f.g.visible) continue;
      // couleur du métier si changement
      if (f.metier !== v.metier) {
        f.metier = v.metier;
        const c = METIERS[v.metier]?.couleur ?? 0x888888;
        f.echarpe.material.color.setHex(c);
        if (!f.F) f.habit.color.setHex(c);
      }
      // interpolation douce vers la position simulée
      const dx = v.x - f.px, dz = v.z - f.pz;
      const d = Math.hypot(dx, dz);
      const k = d > 12 ? 1 : Math.min(1, dtReel * 10);
      f.px += dx * k;
      f.pz += dz * k;
      const marche = !!v.path && !v.conversation;
      const y = solY(f.px, f.pz);
      f.g.position.set(f.px, y, f.pz);
      // orientation
      let cible = v.dir;
      const diff = Math.atan2(Math.sin(cible - f.g.rotation.y), Math.cos(cible - f.g.rotation.y));
      f.g.rotation.y += diff * Math.min(1, dtReel * 8);
      // animation
      const type = v.activite?.type;
      if (marche) {
        f.phase += dtReel * 9 * Math.min(2.2, Math.max(0.6, sim.vitesseAffichage || 1));
        const s = Math.sin(f.phase) * 0.6;
        f.jambes[0].rotation.x = s; f.jambes[1].rotation.x = -s;
        f.bras[0].rotation.x = -s * 0.8; f.bras[1].rotation.x = s * 0.8;
        f.g.position.y += Math.abs(Math.cos(f.phase)) * 0.06;
      } else if (type === 'travailler' && !v.conversation) {
        f.phase += dtReel * 4;
        const s = Math.sin(f.phase);
        f.bras[0].rotation.x = -0.6 + s * 0.6;
        f.bras[1].rotation.x = -0.6 - s * 0.5;
        f.jambes[0].rotation.x = f.jambes[1].rotation.x = 0;
      } else if (v.conversation) {
        f.phase += dtReel * (v.conversation.dispute ? 9 : 3);
        f.bras[0].rotation.x = -0.3 + Math.sin(f.phase) * (v.conversation.dispute ? 0.7 : 0.25);
        f.bras[1].rotation.x = 0;
        f.jambes[0].rotation.x = f.jambes[1].rotation.x = 0;
      } else if (type === 'fete') {
        f.phase += dtReel * 6;
        f.bras[0].rotation.z = -1.2 + Math.sin(f.phase) * 0.3;
        f.bras[1].rotation.z = 1.2 - Math.sin(f.phase) * 0.3;
        f.g.position.y += Math.abs(Math.sin(f.phase)) * 0.15;
      } else {
        f.bras[0].rotation.set(0, 0, 0);
        f.bras[1].rotation.set(0, 0, 0);
        f.jambes[0].rotation.x = f.jambes[1].rotation.x = 0;
      }
      if (type !== 'fete') { f.bras[0].rotation.z = 0; f.bras[1].rotation.z = 0; }
      // bulle
      let b = null;
      if (v.conversation) b = v.conversation.dispute ? 'dispute' : 'parle';
      else if (type === 'aider' && !v.path) b = 'aide';
      else if (type === 'fete') b = 'fete';
      else if (v.statut === 'reflechit') b = 'pense';
      else if (v.malade) b = 'malade';
      f.bulle.visible = !!b;
      if (b) {
        f.bulle.material = this.bulles[b];
        f.bulle.position.y = 2.5 / f.taille + Math.sin(t * 3 + v.id) * 0.05;
      }
    }
  }

  positionDe(id) {
    const f = this.figures[id];
    return f ? f.g.position : null;
  }

  majAnneaux(selectionId, survolId) {
    const place = (ring, id) => {
      const v = id != null ? this.sim.habitant(id) : null;
      const f = id != null ? this.figures[id] : null;
      ring.visible = !!(v && f && !v.interieur);
      if (ring.visible) ring.position.set(f.g.position.x, f.g.position.y + 0.06, f.g.position.z);
    };
    place(this.anneau, selectionId);
    place(this.survol, survolId !== selectionId ? survolId : null);
  }
}
