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

// ---------- Textes dans le monde : paroles, pensées, prénoms, bâtiments occupés ----------
function decouper(ctx, texte, largeur, maxLignes) {
  const mots = String(texte).split(/\s+/);
  const lignes = [];
  let l = '';
  for (const m of mots) {
    const essai = l ? `${l} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && l) { lignes.push(l); l = m; } else l = essai;
    if (lignes.length === maxLignes) break;
  }
  if (lignes.length < maxLignes && l) lignes.push(l);
  const toutes = lignes.join(' ').length < String(texte).length - 1;
  if (toutes && lignes.length) lignes[lignes.length - 1] = lignes[lignes.length - 1].replace(/\s*\S*$/, '') + '…';
  return lignes;
}

function arrondi(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}

// style : 'parole' (bulle blanche), 'colere', 'pensee' (nuage, italique), 'nom', 'badge'
function spriteTexte(texte, style) {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  const pensee = style === 'pensee', petit = style === 'nom' || style === 'badge';
  const taillePolice = petit ? 30 : 30;
  const police = `${pensee ? 'italic ' : ''}${petit ? '600 ' : ''}${taillePolice}px system-ui, -apple-system, sans-serif`;
  x.font = police;
  const largeurMax = petit ? 620 : 400;
  const lignes = petit ? [texte] : decouper(x, texte, largeurMax, 3);
  const W = Math.min(largeurMax, Math.max(...lignes.map((l) => x.measureText(l).width))) + 36;
  const H = lignes.length * (taillePolice + 8) + 22;
  const queue = petit ? 0 : 18;
  c.width = Math.ceil(W) + 8; c.height = Math.ceil(H + queue) + 8;
  x.font = police;
  const fond = { parole: 'rgba(255,255,255,0.96)', colere: 'rgba(255,236,232,0.97)', pensee: 'rgba(214,224,240,0.93)', nom: 'rgba(20,22,28,0.72)', badge: 'rgba(28,26,22,0.86)' }[style];
  const encre = { parole: '#1d1d22', colere: '#8a1d12', pensee: '#2a3346', nom: '#ffffff', badge: '#f1d58a' }[style];
  x.fillStyle = fond;
  arrondi(x, 4, 4, W, H, petit ? H / 2 : 18);
  x.fill();
  if (style === 'colere') { x.strokeStyle = '#d0402f'; x.lineWidth = 4; x.stroke(); }
  if (queue) {
    if (pensee) {
      for (const [cx, cy, r] of [[W * 0.42, H + 10, 7], [W * 0.36, H + 20, 4]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    } else {
      x.beginPath(); x.moveTo(W * 0.42, H + 2); x.lineTo(W * 0.38, H + queue + 2); x.lineTo(W * 0.52, H + 2); x.fill();
    }
  }
  x.fillStyle = encre;
  x.textBaseline = 'top';
  lignes.forEach((l, i) => x.fillText(l, 22, 14 + i * (taillePolice + 8)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const echelle = style === 'badge' ? 0.02 : style === 'nom' ? 0.011 : 0.0072;
  sp.scale.set(c.width * echelle, c.height * echelle, 1);
  sp.userData.base = sp.scale.clone();
  sp.center.set(0.5, 0);
  sp.renderOrder = 20;
  return sp;
}
function jeter(sp) {
  if (!sp) return;
  sp.parent?.remove(sp);
  sp.material.map?.dispose();
  sp.material.dispose();
}

const DUREE_PAROLE = 6, DUREE_PENSEE = 5, MAX_BULLES = 12;
const ACTIVITE_BATIMENT = { mosquee: 'Mosquée', ecole: 'École', dispensaire: 'Dispensaire', atelier: 'Atelier', entrepot: 'Entrepôt' };

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
    // ce qu'ils disent et pensent apparaît au-dessus de leur tête, quelques secondes
    this.textes = []; // { id, sp, fin, type }
    this.voirPensees = true;
    this.voirNoms = true;
    this.badges = {}; // bâtiment → { sp, texte }
    sim.on('parole', (p) => this.montrer(p.id, p.texte, /col[eè]re|furieu|énerv/i.test(p.ton || '') ? 'colere' : 'parole', DUREE_PAROLE));
    sim.on('pensee', (p) => { if (this.voirPensees || p.id === this.selection) this.montrer(p.id, p.texte, 'pensee', DUREE_PENSEE); });

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
    const echelle = taille * (0.95 + rnd(5) * 0.1);
    g.scale.setScalar(echelle);

    const bulle = new THREE.Sprite(this.bulles.parle);
    bulle.scale.set(0.9, 0.9, 1);
    bulle.position.y = 2.55 / taille;
    bulle.visible = false;
    bulle.renderOrder = 10;
    g.add(bulle);

    g.traverse((o) => { if (o.isMesh) { o.userData.habitant = v.id; this.cliquables.push(o); } });
    g.position.set(v.x, solY(v.x, v.z), v.z);
    this.scene.add(g);
    this.figures[v.id] = { g, jambes, bras, bulle, habit, echarpe, taille, echelle, phase: rnd(6) * 6, px: v.x, pz: v.z, metier: v.metier, F };
  }

  montrer(id, texte, type, duree) {
    const v = this.sim.habitant(id);
    if (!v || !texte) return;
    // une seule bulle de chaque sorte par habitant ; la plus récente remplace l'ancienne
    for (const b of this.textes.filter((b) => b.id === id && (b.type === 'pensee') === (type === 'pensee'))) { jeter(b.sp); b.fin = 0; }
    this.textes = this.textes.filter((b) => b.fin > 0);
    const sp = spriteTexte(texte, type);
    sp.visible = false;
    this.scene.add(sp);
    this.textes.push({ id, sp, type, fin: performance.now() / 1000 + duree, debut: performance.now() / 1000 });
    while (this.textes.length > MAX_BULLES) jeter(this.textes.shift().sp);
  }

  // Entrer / sortir d'un bâtiment : on le voit passer la porte au lieu de disparaître d'un coup.
  transition(v, f, maintenant) {
    if (f.dedans === undefined) { f.dedans = v.interieur; return; }
    if (v.interieur === f.dedans) return;
    const b = this.sim.batiment(v.interieur ? v.batiment : f.dernierBat);
    const porte = b?.door || { x: v.x, z: v.z };
    const fond = b ? { x: porte.x + (b.x - porte.x) * 0.25, z: porte.z + (b.z - porte.z) * 0.25 } : porte;
    f.anim = v.interieur ? { type: 'entre', t0: maintenant, de: { x: f.px, z: f.pz }, vers: fond } : { type: 'sort', t0: maintenant, de: fond, vers: porte };
    if (v.interieur) f.dernierBat = v.batiment;
    f.dedans = v.interieur;
  }

  badge(b, texte, y) {
    let e = this.badges[b.id];
    if (!texte) { if (e) { jeter(e.sp); delete this.badges[b.id]; } return; }
    if (!e || e.texte !== texte) {
      if (e) jeter(e.sp);
      const sp = spriteTexte(texte, 'badge');
      sp.position.set(b.x, y, b.z);
      this.scene.add(sp);
      e = this.badges[b.id] = { sp, texte };
    }
    return e;
  }

  update(dtReel, t, camera = null, selection = null) {
    const sim = this.sim;
    this.selection = selection;
    const maintenant = performance.now() / 1000;
    const cam = camera?.position;
    for (const v of sim.habitants) {
      const f = this.figures[v.id];
      if (!f) continue;
      this.transition(v, f, maintenant);
      if (v.interieur && !f.anim) { f.g.visible = false; if (f.nom) f.nom.visible = false; continue; }
      f.g.visible = true;
      if (f.anim) {
        const duree = f.anim.type === 'entre' ? 1.1 : 0.8;
        const k = Math.min(1, (maintenant - f.anim.t0) / duree);
        const x = f.anim.de.x + (f.anim.vers.x - f.anim.de.x) * k, z = f.anim.de.z + (f.anim.vers.z - f.anim.de.z) * k;
        f.g.position.set(x, solY(x, z), z);
        f.g.rotation.y = Math.atan2(f.anim.vers.x - f.anim.de.x, f.anim.vers.z - f.anim.de.z);
        const e = f.anim.type === 'entre' ? 1 - Math.max(0, k - 0.55) / 0.45 : Math.min(1, 0.25 + k);
        f.g.scale.setScalar(f.echelle * Math.max(0.01, e));
        f.phase += dtReel * 9;
        const s = Math.sin(f.phase) * 0.6;
        f.jambes[0].rotation.x = s; f.jambes[1].rotation.x = -s; f.bras[0].rotation.x = -s * 0.8; f.bras[1].rotation.x = s * 0.8;
        if (k >= 1) {
          if (f.anim.type === 'sort') { f.px = f.anim.vers.x; f.pz = f.anim.vers.z; }
          f.anim = null;
          f.g.scale.setScalar(f.echelle);
          if (v.interieur) f.g.visible = false;
        }
        continue;
      }
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
      } else if (['manger', 'boire'].includes(v.activite?.action) && !v.path) {
        f.phase += dtReel * 3;
        f.bras[1].rotation.x = -1.9 + Math.max(0, Math.sin(f.phase)) * 0.5; // la main va à la bouche
        f.bras[0].rotation.x = 0;
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
      // endormi dehors (épuisé, ou à la belle étoile) : allongé au sol
      const allonge = v.activite?.action === 'dormir' && !v.path;
      f.g.rotation.z = allonge ? Math.PI / 2 : 0;
      if (allonge) f.g.position.y += 0.25 * f.echelle;
      // prénom au-dessus de la tête quand on regarde de près
      const dCam = cam ? cam.distanceTo(f.g.position) : 999;
      const voirNom = this.voirNoms && (dCam < 32 || v.id === selection);
      if (voirNom && !f.nom) { f.nom = spriteTexte(v.prenom, 'nom'); f.nom.scale.multiplyScalar(0.7); this.scene.add(f.nom); }
      if (f.nom) {
        f.nom.visible = voirNom;
        if (voirNom) f.nom.position.set(f.g.position.x, f.g.position.y + 2.05 * f.echelle + (allonge ? -1.4 : 0), f.g.position.z);
      }
      // bulle
      let b = null;
      if (v.conversation) b = v.conversation.dispute ? 'dispute' : 'parle';
      else if (type === 'aider' && !v.path) b = 'aide';
      else if (type === 'fete') b = 'fete';
      else if (v.statut === 'reflechit') b = 'pense';
      else if (v.malade) b = 'malade';
      // la vraie phrase est affichée : l'icône « … » ou « ? » devient inutile
      if ((b === 'parle' || b === 'pense') && this.textes.some((x) => x.id === v.id && x.fin > 0 && x.sp.visible)) b = null;
      f.bulle.visible = !!b;
      if (b) {
        f.bulle.material = this.bulles[b];
        f.bulle.position.y = 2.5 / f.taille + Math.sin(t * 3 + v.id) * 0.05;
      }
    }
  }

  majTextes(camera, selection) {
    const sim = this.sim;
    const maintenant = performance.now() / 1000;
    const cam = camera?.position;
    for (const b of this.textes) {
      const v = sim.habitant(b.id);
      const f = this.figures[b.id];
      if (maintenant > b.fin || !v || !f) { jeter(b.sp); b.fin = 0; continue; }
      const visible = !v.interieur && f.g.visible && (!cam || cam.distanceTo(f.g.position) < 110);
      b.sp.visible = visible && (b.type !== 'pensee' || this.voirPensees || b.id === selection);
      if (!b.sp.visible) continue;
      // parole au-dessus de la pensée si les deux sont là
      const autre = this.textes.some((o) => o !== b && o.id === b.id && o.fin > 0 && o.type !== 'pensee');
      const haut = 2.35 * f.echelle + (b.type === 'pensee' && autre ? 1.3 : 0) + (f.nom?.visible ? 0.45 : 0);
      // de loin, la bulle grossit un peu pour rester lisible sur un téléphone
      const d = cam ? cam.distanceTo(f.g.position) : 20;
      b.sp.scale.copy(b.sp.userData.base).multiplyScalar(Math.min(2.6, Math.max(1, d / 22)));
      b.sp.position.set(f.g.position.x, f.g.position.y + haut, f.g.position.z);
      const reste = b.fin - maintenant, age = maintenant - b.debut;
      b.sp.material.opacity = Math.min(1, reste / 0.6, age / 0.25);
    }
    this.textes = this.textes.filter((b) => b.fin > 0);
    if (camera) this.eviterChevauchements(camera);

    // qui est à l'intérieur des bâtiments publics ; les maisons ne s'affichent que pour l'habitant sélectionné
    const dedans = {};
    for (const v of sim.habitants) if (v.interieur && v.batiment) (dedans[v.batiment] ||= []).push(v);
    const choisi = selection != null ? sim.habitant(selection) : null;
    for (const b of sim.batiments) {
      const gens = dedans[b.id] || [];
      const maison = b.type === 'maison';
      let texte = '';
      if (maison) {
        // sa maison, et la maison où il se trouve s'il est chez quelqu'un
        if (choisi && (b.id === choisi.foyer || b.id === choisi.batiment)) {
          const noms = gens.slice(0, 4).map((v) => v.prenom).join(', ') + (gens.length > 4 ? ` +${gens.length - 4}` : '');
          texte = `${b.nom || 'Maison'}${noms ? ` · ${noms}` : ''}`;
        }
      } else if (gens.length) {
        const noms = gens.slice(0, 3).map((v) => v.prenom).join(', ') + (gens.length > 3 ? ` +${gens.length - 3}` : '');
        texte = `${ACTIVITE_BATIMENT[b.type] || b.nom} · ${noms}`;
      }
      const e = this.badge(b, texte, solY(b.x, b.z) + (b.type === 'mosquee' ? 10 : maison ? 6 : 7.5));
      // taille à l'écran à peu près constante : ni énorme de près, ni illisible de loin
      if (e && cam) e.sp.scale.copy(e.sp.userData.base).multiplyScalar(Math.min(2.2, Math.max(0.3, cam.distanceTo(e.sp.position) / 45)));
    }
  }

  // Deux voisins qui parlent en même temps : on monte une bulle au-dessus de l'autre au lieu de les superposer.
  eviterChevauchements(camera) {
    const v3 = new THREE.Vector3();
    const ecran = (pos) => { v3.copy(pos).project(camera); return { x: v3.x, y: v3.y }; };
    const places = [];
    const visibles = this.textes.filter((b) => b.sp.visible).sort((a, b) => camera.position.distanceTo(a.sp.position) - camera.position.distanceTo(b.sp.position));
    for (const b of visibles) {
      for (let essai = 0; essai < 6; essai++) {
        const bas = ecran(b.sp.position);
        const haut = ecran(v3.set(b.sp.position.x, b.sp.position.y + b.sp.scale.y, b.sp.position.z));
        const h = Math.abs(haut.y - bas.y), w = (h * (b.sp.scale.x / b.sp.scale.y)) / (camera.aspect || 1); // coordonnées écran normalisées
        const r = { x0: bas.x - w / 2, x1: bas.x + w / 2, y0: bas.y, y1: bas.y + h };
        const gene = places.find((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
        if (!gene) { places.push(r); break; }
        b.sp.position.y += b.sp.scale.y * 1.05;
        if (essai === 5) places.push(r);
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
