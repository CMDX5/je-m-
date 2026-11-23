// Point d'entrée : assemble simulation, scène 3D et interface.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { Simulation } from './sim/simulation.js';
import { Environment } from './render/environment.js';
import { creerTerrain, creerVegetation } from './render/terrain.js';
import { Village } from './render/buildings.js';
import { Habitants3D } from './render/villagers.js';
import { Interface } from './ui/panel.js';
import { Penseur } from './sim/penseur.js';
import { PenseurClaude } from './sim/penseur-claude.js';
import { PenseurGroq } from './sim/penseur-groq.js';
import { nomComplet, libelleMetier } from './sim/villager.js';
import { PLAZA } from './world/layout.js';
import { heightAt } from './world/heightmap.js';

const CLE_SAUVEGARDE = 'ile-vivante:sauvegarde';
const CLE_A_CHARGER = 'ile-vivante:a-charger';
const CLE_AUTO = 'ile-vivante:auto'; // sauvegarde automatique

function lireStockage(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrireStockage(cle, val) {
  try { val === null ? localStorage.removeItem(cle) : localStorage.setItem(cle, val); return true; } catch { return false; }
}

// laisser le message de chargement s'afficher avant le calcul des premiers jours
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

// ---------- Simulation ----------
let sim;
const aCharger = lireStockage(CLE_A_CHARGER);
if (aCharger) {
  ecrireStockage(CLE_A_CHARGER, null);
  try { sim = Simulation.charger(lireStockage(CLE_SAUVEGARDE)); } catch (e) { console.warn('Sauvegarde illisible', e); }
}
const params = new URLSearchParams(location.search);
// reprise automatique de la dernière partie (sauf si une nouvelle île est demandée)
let reprise = false;
if (!sim && !params.has('graine') && lireStockage(CLE_AUTO)) {
  try { sim = Simulation.charger(lireStockage(CLE_AUTO)); reprise = true; } catch (e) { console.warn('Sauvegarde automatique illisible', e); }
}
if (!sim) sim = new Simulation({ seed: Number(params.get('graine')) || 2026 }).init();
if (params.has('graine')) {
  // l'adresse redevient normale : un rechargement reprendra cette nouvelle partie
  try { const u = new URL(location.href); u.searchParams.delete('graine'); history.replaceState(null, '', u); } catch { /* adresse figée */ }
}
function sauverAuto() {
  if (!sim.habitants.some((v) => v.nbDecisions > 0)) return;
  ecrireStockage(CLE_AUTO, sim.serialiser());
}
setInterval(sauverAuto, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sauverAuto(); });
window.addEventListener('pagehide', sauverAuto);

// ---------- Rendu ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2000);
camera.position.set(PLAZA.x + 55, 70, PLAZA.z + 95);
const controls = new OrbitControls(camera, canvas);
controls.target.set(PLAZA.x, 2, PLAZA.z + 10);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.38;
controls.minDistance = 8;
controls.maxDistance = 320;
controls.screenSpacePanning = false;

const env = new Environment(scene, renderer);
creerTerrain(scene, sim.batiments);
creerVegetation(scene, sim.nav);
const village = new Village(scene, sim);
const habitants3d = new Habitants3D(scene, sim);

sim.on('construction', ({ cle, batiment }) => {
  if (batiment) village.ajouterBatiment(batiment);
  if (cle === 'jetee') village.renforcerJetee();
  if (cle === 'ecole') village.agrandirEcole();
});

// ---------- Contrôle du temps ----------
let vitesse = 0; // pause tant que l'intro est affichée
let vitesseAvantPause = 4;
function changerVitesse(v) {
  if (v === 0 && vitesse !== 0) vitesseAvantPause = vitesse;
  vitesse = v;
}

// ---------- Sélection et caméra ----------
let selection = null;
let suivi = null;
let survol = null;
const cibleCamera = new THREE.Vector3();
let transition = 0;

function regarder(x, z) {
  cibleCamera.set(x, heightAt(x, z) + 1, z);
  transition = 1;
}

const ui = new Interface(sim, {
  selectionner: (id, centrer = false) => {
    selection = id;
    if (id == null) suivi = null;
    ui.selectionner(id);
    if (id != null && centrer) {
      const v = sim.habitant(id);
      regarder(v.x, v.z);
    }
  },
  suivre: (id) => {
    suivi = suivi === id ? null : id;
    ui.toast(suivi != null ? `Caméra : suit ${sim.habitant(id).prenom}. Double-clic ailleurs ou Échap pour arrêter.` : 'Suivi arrêté.');
  },
  vitesse: changerVitesse,
  voir: (site) => site && regarder(site.x, site.z),
  sauvegarder: () => {
    const ok = ecrireStockage(CLE_SAUVEGARDE, sim.serialiser());
    ui.toast(ok ? `Partie sauvegardée (${sim.horodatage()}).` : 'Sauvegarde impossible dans ce navigateur.', ok ? 'bien' : 'mal');
  },
  charger: () => {
    if (!lireStockage(CLE_SAUVEGARDE)) return ui.toast('Aucune sauvegarde trouvée.', 'mal');
    ecrireStockage(CLE_A_CHARGER, '1');
    location.reload();
  },
  recommencer: () => {
    // confirmation par un second toucher (les fenêtres de confirmation sont bloquées sur claude.ai)
    if (!window.__confirmeNouvelle || Date.now() - window.__confirmeNouvelle > 5000) {
      window.__confirmeNouvelle = Date.now();
      return ui.toast('Touchez encore « Nouvelle île » pour confirmer : la partie en cours sera remplacée.', 'mal');
    }
    ecrireStockage(CLE_AUTO, null);
    const url = new URL(location.href);
    url.searchParams.set('graine', String(Math.floor(Math.random() * 1e6)));
    location.href = url.toString();
  },
});
// ---------- Pensée des habitants (modèle de langage) ----------
// Sur claude.ai (téléphone compris), les habitants pensent avec Claude, sur le compte du joueur ;
// ailleurs, avec le serveur local (Ollama…).
// En ligne (Vercel), avec le modèle gratuit de Groq, en continu.
const surClaude = typeof window.claude?.use === 'function';
const configServeur = surClaude ? null : await fetch('api/config').then((r) => r.json()).catch(() => null);
const surGroq = configServeur?.mode === 'groq';
const SEUIL_ATTENTE = surClaude ? 5 : surGroq ? 10 : 12;
const penseur = surClaude ? new PenseurClaude(sim) : surGroq ? new PenseurGroq(sim) : new Penseur(sim);
ui.penseur = penseur;
penseur.verifier();

window.__ile = { sim, ui, camera, controls, penseur, select: (id) => ui.actions.selectionner(id, true) };

const raycaster = new THREE.Raycaster();
const souris = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(souris, camera);
  const visibles = habitants3d.cliquables.filter((m) => m.parent && (m.parent.visible && (m.parent.parent?.visible ?? true)));
  const hit = raycaster.intersectObjects(visibles, false)[0];
  return hit ? hit.object.userData.habitant : null;
}
let downPos = null;
canvas.addEventListener('pointerdown', (e) => (downPos = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5) return;
  const id = pick(e);
  if (id != null) ui.actions.selectionner(id);
});
canvas.addEventListener('dblclick', (e) => {
  const id = pick(e);
  if (id != null) { ui.actions.selectionner(id); suivi = id; ui.toast(`Caméra : suit ${sim.habitant(id).prenom}.`); }
  else suivi = null;
});
const infobulle = document.getElementById('infobulle');
canvas.addEventListener('pointermove', (e) => {
  survol = pick(e);
  canvas.style.cursor = survol != null ? 'pointer' : '';
  if (survol != null) {
    const v = sim.habitant(survol);
    infobulle.hidden = false;
    infobulle.style.left = e.clientX + 'px';
    infobulle.style.top = e.clientY + 'px';
    infobulle.textContent = `${nomComplet(v)} — ${libelleMetier(v)}`;
  } else infobulle.hidden = true;
});
canvas.addEventListener('pointerleave', () => { survol = null; infobulle.hidden = true; });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    changerVitesse(vitesse === 0 ? vitesseAvantPause : 0);
  } else if (e.key === 'Escape') {
    if (suivi != null) suivi = null;
    else ui.actions.selectionner(null);
  } else if (['1', '2', '3', '4'].includes(e.key)) changerVitesse([1, 4, 15, 60][Number(e.key) - 1]);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Intro ----------
const intro = document.getElementById('intro');
document.getElementById('commencer').addEventListener('click', () => {
  intro.remove();
  changerVitesse(4);
});
if (reprise) ui.toast(`Partie reprise : ${sim.horodatage()}.`, 'bien');
if (aCharger || reprise || params.has('direct')) { intro.remove(); changerVitesse(params.has('capture') ? 0 : 4); }
document.getElementById('chargement').classList.add('fini');

// ---------- Boucle ----------
const etiquette = document.getElementById('etiquette');
const horloge = new THREE.Clock();
let tAnim = 0;
const tmp = new THREE.Vector3();

function boucle() {
  const dt = Math.min(0.1, horloge.getDelta());
  tAnim += dt;
  // le temps s'arrête tant que trop d'habitants n'ont pas fini de réfléchir
  const enPause = vitesse > 0 && sim.nbAttente() > SEUIL_ATTENTE;
  if (vitesse > 0 && !enPause) sim.update(dt * vitesse);
  sim.vitesseAffichage = enPause ? 0 : vitesse;
  penseur.tick();

  const meteo = sim.meteo.tempete > sim.temps ? 'tempete' : null;
  env.update(sim.heure(), tAnim, meteo);
  village.update(tAnim, env.nuit, sim);
  habitants3d.update(dt, tAnim);
  habitants3d.majAnneaux(selection, survol);

  // caméra : transition douce ou suivi
  if (suivi != null) {
    const p = habitants3d.positionDe(suivi);
    const v = sim.habitant(suivi);
    if (p) {
      const cible = v.interieur ? tmp.set(v.x, heightAt(v.x, v.z) + 1, v.z) : tmp.copy(p).setY(p.y + 1);
      const delta = cible.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
      controls.target.add(delta);
      camera.position.add(delta);
    }
  } else if (transition > 0) {
    const delta = cibleCamera.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 5));
    controls.target.add(delta);
    camera.position.add(delta);
    if (delta.lengthSq() < 0.0004) transition = 0;
  }
  controls.update();

  // étiquette du nom au-dessus de l'habitant sélectionné
  if (selection != null) {
    const v = sim.habitant(selection);
    const p = habitants3d.positionDe(selection);
    if (p && !v.interieur) {
      tmp.copy(p).setY(p.y + 2.9).project(camera);
      if (tmp.z < 1) {
        etiquette.hidden = false;
        etiquette.style.left = ((tmp.x + 1) / 2) * window.innerWidth + 'px';
        etiquette.style.top = ((1 - tmp.y) / 2) * window.innerHeight + 'px';
        etiquette.textContent = v.prenom;
      } else etiquette.hidden = true;
    } else {
      etiquette.hidden = false;
      const b = sim.batiment(v.batiment);
      tmp.set(v.x, heightAt(v.x, v.z) + 5, v.z).project(camera);
      etiquette.style.left = ((tmp.x + 1) / 2) * window.innerWidth + 'px';
      etiquette.style.top = ((1 - tmp.y) / 2) * window.innerHeight + 'px';
      etiquette.textContent = `${v.prenom} · ${b ? b.nom : 'à l’intérieur'}`;
    }
  } else etiquette.hidden = true;

  ui.tick(performance.now(), vitesse, enPause);
  renderer.render(scene, camera);
  requestAnimationFrame(boucle);
}
boucle();
