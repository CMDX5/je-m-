// Point d'entrée : assemble simulation, scène 3D et interface.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { Simulation } from './sim/simulation.js';
import { Environment } from './render/environment.js';
import { creerTerrain, creerVegetation, saisonnier } from './render/terrain.js';
import { Village } from './render/buildings.js';
import { Habitants3D } from './render/villagers.js';
import { Interface } from './ui/panel.js';
import { Penseur } from './sim/penseur.js';
import { PenseurClaude } from './sim/penseur-claude.js';
import { PenseurGroq } from './sim/penseur-groq.js';
import { demarrerRapports } from './sim/rapport.js';
import { Relais, dureeFrancaise } from './sync.js';
import { dateDuVillage } from './sim/saison.js';
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

// ---------- Relais de nuit : le village a-t-il vécu pendant que la page était fermée ? ----------
const relais = new Relais();
// Mode « regarder » : le village d'un ami, en lecture seule (lien ?regarder=…). Rien n'est écrit chez le visiteur,
// aucune clé n'est demandée, les habitants ne pensent pas ici : on voit la dernière photo du village, rafraîchie.
const jetonRegard = new URLSearchParams(location.search).get('regarder');
const spectateur = !!jetonRegard;
let etatRegard = null, majRegard = 0;
if (spectateur) {
  relais.code = ''; // ce visiteur n'a aucun village sur le serveur : le relais reste inactif
  try {
    const r = await fetch(`api/regarder?t=${encodeURIComponent(jetonRegard)}`);
    if (!r.ok) throw new Error(String(r.status));
    majRegard = Number(r.headers.get('x-maj')) || 0;
    etatRegard = await r.text();
    document.body.classList.add('spectateur');
  } catch {
    document.getElementById('chargement').textContent = 'Ce lien ne montre aucun village (il a peut-être été coupé).';
    throw new Error('lien de lecture invalide');
  }
}
let enRechargement = false; // pendant un rechargement voulu, on n'écrase pas la sauvegarde qu'on vient de poser
let absence = null; // { de, deces, naissances, decisions } : l'état de la page avant que le village n'avance sans elle
try { absence = JSON.parse(sessionStorage.getItem('ile-vivante:absence') || 'null'); sessionStorage.removeItem('ile-vivante:absence'); } catch { absence = null; }
const veutNouvellePartie = new URLSearchParams(location.search).has('graine') || !!lireStockage(CLE_A_CHARGER);
if (relais.actif && !veutNouvellePartie && !spectateur) {
  const dist = await relais.prendre();
  if (!dist.bloque && dist.existe && dist.etat) {
    let tempsLocal = -1, stats0 = null;
    const local = lireStockage(CLE_AUTO);
    if (local) { try { const j = JSON.parse(local); tempsLocal = j.temps; stats0 = j.stats; } catch { /* sauvegarde locale illisible */ } }
    const memePartie = !relais.partie || !dist.idPartie || relais.partie === dist.idPartie;
    if (dist.temps > tempsLocal + 0.5 && (memePartie || tempsLocal < 0)) {
      absence = { de: tempsLocal, deces: stats0?.deces || 0, naissances: stats0?.naissances || 0, decisions: stats0?.decisions || 0 };
      ecrireStockage(CLE_AUTO, dist.etat);
      relais.adopterPartie(dist.idPartie);
    }
  }
}

// ---------- Simulation ----------
let sim;
const aCharger = spectateur ? null : lireStockage(CLE_A_CHARGER);
if (spectateur) sim = Simulation.charger(etatRegard);
else if (aCharger) {
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
if (veutNouvellePartie && !spectateur) relais.nouvellePartie(); // une autre partie : elle remplacera celle du serveur
function sauverAuto() {
  if (spectateur || enRechargement || !sim.habitants.some((v) => v.nbDecisions > 0)) return;
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
const terrain = creerTerrain(scene, sim.batiments);
creerVegetation(scene, sim.nav);
env.brancher(terrain, saisonnier);
const village = new Village(scene, sim);
const habitants3d = new Habitants3D(scene, sim);
// Afficher les pensées au-dessus des têtes (regard du « dieu » qui observe) ; les paroles, elles, s'affichent toujours.
{
  const b = document.querySelector('#voir-pensees');
  let voir = true;
  try { voir = localStorage.getItem('ile-vivante:pensees') !== 'non'; } catch { /* stockage indisponible */ }
  const appliquer = () => { habitants3d.voirPensees = voir; b?.classList.toggle('actif', voir); if (b) b.title = voir ? 'Pensées visibles au-dessus des têtes (toucher pour masquer)' : 'Pensées masquées (toucher pour les voir)'; };
  appliquer();
  b?.addEventListener('click', () => {
    voir = !voir;
    try { localStorage.setItem('ile-vivante:pensees', voir ? 'oui' : 'non'); } catch { /* */ }
    appliquer();
    // un retour clair : les bulles ne se voient que pour ceux qui sont dehors
    const dehors = sim.habitants.filter((v) => !v.interieur).length;
    ui.toast(voir ? `Pensées affichées au-dessus des têtes.${dehors ? '' : ' Tout le monde est à l’intérieur pour l’instant : rien à voir tout de suite.'}` : 'Pensées masquées : seules les paroles s’affichent.', 'conseil');
  });
}

// Le village ne vit que dans cette page : ce bouton demande au téléphone de garder l'écran allumé (branché, la nuit)
{
  const b = document.querySelector('#veille-ecran');
  if (b && 'wakeLock' in navigator) {
    b.hidden = false;
    let verrou = null, voulu = false;
    const prendre = async () => {
      try {
        verrou = await navigator.wakeLock.request('screen');
        verrou.addEventListener('release', () => { verrou = null; });
        return true;
      } catch { verrou = null; return false; }
    };
    b.addEventListener('click', async () => {
      if (!voulu) {
        if (await prendre()) { voulu = true; ui.toast('Écran maintenu allumé : le village continue de vivre tant que cette page reste ouverte. Branchez votre téléphone.', 'conseil'); }
        else ui.toast('Ce navigateur refuse de garder l’écran allumé.', 'mal');
      } else {
        voulu = false;
        try { await verrou?.release(); } catch { /* déjà relâché */ }
        verrou = null;
        ui.toast('L’écran peut de nouveau s’éteindre : le village s’arrêtera avec lui.', 'conseil');
      }
      b.classList.toggle('actif', voulu);
    });
    // le navigateur relâche le verrou quand la page est cachée : on le reprend au retour
    document.addEventListener('visibilitychange', () => { if (voulu && document.visibilityState === 'visible' && !verrou) prendre(); });
  }
}

sim.on('construction', ({ cle, batiment }) => {
  if (batiment) village.ajouterBatiment(batiment);
  if (cle === 'jetee') village.renforcerJetee();
  if (cle === 'ecole') village.agrandirEcole();
});

// ---------- Contrôle du temps ----------
let vitesse = 0; // pause tant que l'intro est affichée
let vitesseAvantPause = 4;
function changerVitesse(v) {
  if (spectateur) return;
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
const surClaude = !spectateur && typeof window.claude?.use === 'function';
const configServeur = surClaude || spectateur ? null : await fetch('api/config').then((r) => r.json()).catch(() => null);
const surGroq = spectateur || configServeur?.mode === 'groq';
const SEUIL_ATTENTE = surClaude ? 5 : surGroq ? 10 : 12;
const penseur = surClaude ? new PenseurClaude(sim) : surGroq ? new PenseurGroq(sim, spectateur ? { cles: {} } : {}) : new Penseur(sim);
ui.penseur = penseur;
if (spectateur) ui.spectateur = `photo du village prise ${new Date(majRegard).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, rafraîchie toute seule.`;
else penseur.verifier();

// En ligne (Vercel) : rapport régulier pour que Claude surveille la partie
if (surGroq && !spectateur) demarrerRapports(sim, penseur);

// ---------- Relais de nuit : départ, retour, reprise de main ----------
const clesDuJoueur = () => (penseur.cles ? { groq: penseur.cles.groq || '', gemini: penseur.cles.gemini || '' } : null);
const ecranVeille = document.getElementById('veille-plein');
let heuresVeille = 10;
let departMs = 0;
let auRelais = false; // la page a confié le village au relais : elle ne le fait plus vivre

function annoncerAbsence() {
  if (!absence || absence.de < 0) return;
  const min = sim.temps - absence.de;
  if (min < 5) return;
  const an = min / 2880, dn = Math.max(0, sim.stats.naissances - absence.naissances), dd = Math.max(0, sim.stats.deces - absence.deces), dec = Math.max(0, sim.stats.decisions - absence.decisions);
  const texte = `Pendant votre absence, le village a vécu ${dureeFrancaise(min)} (${an.toFixed(1).replace('.', ',')} an${an >= 2 ? 's' : ''} du village) : ${dec} décisions des habitants, ${dn} naissance${dn > 1 ? 's' : ''}, ${dd} décès. Nous sommes en ${dateDuVillage(sim.temps).texte}.`;
  sim.log(texte, 'conseil');
  ui.toast(texte, 'conseil');
}

// Le relais a peut-être fait vivre le village : si oui, on recharge la page avec ce village-là.
async function reprendreLaMain() {
  const d = await relais.prendre();
  if (d.bloque) { ui.toast('Une autre page tient déjà le village : fermez-la, puis rechargez celle-ci.', 'mal'); return false; }
  if (d.existe && d.etat && d.temps > sim.temps + 0.5) {
    try { sessionStorage.setItem('ile-vivante:absence', JSON.stringify({ de: sim.temps, deces: sim.stats.deces, naissances: sim.stats.naissances, decisions: sim.stats.decisions })); } catch { /* tant pis pour le résumé */ }
    enRechargement = true;
    ecrireStockage(CLE_AUTO, d.etat);
    relais.adopterPartie(d.idPartie);
    location.reload();
    return true;
  }
  auRelais = false;
  if (ecranVeille) ecranVeille.hidden = true;
  return true;
}

document.addEventListener('visibilitychange', () => {
  if (!relais.actif || relais.bloque) return;
  if (document.visibilityState === 'hidden') {
    departMs = Date.now();
    if (!auRelais && sim.habitants.some((v) => v.nbDecisions > 0)) relais.deposer(sim, { liberer: true, cles: clesDuJoueur(), heures: heuresVeille, keepalive: true });
    auRelais = relais.veille; // le relais peut prendre le village : au retour, on le reprend
  } else if (departMs && Date.now() - departMs > 3000) {
    departMs = 0;
    reprendreLaMain();
  }
});
// la page ouverte garde la main et sauvegarde le village sur le serveur toutes les 30 minutes (au cas où le téléphone la ferme),
// toutes les 10 minutes quand un lien de lecture seule est partagé (pour que les spectateurs voient un village récent)
let tourDepot = 0;
setInterval(() => {
  tourDepot++;
  if (!relais.actif || relais.bloque || auRelais || document.visibilityState !== 'visible' || !sim.habitants.some((v) => v.nbDecisions > 0)) return;
  if (!relais.statut?.partage && tourDepot % 3) return;
  relais.deposer(sim, { liberer: false, cles: clesDuJoueur(), heures: heuresVeille });
}, 10 * 60 * 1000);

Object.assign(ui.actions, {
  relais: {
    // activer : enregistrer le code et confier les clés au serveur (stockage privé du projet)
    async activer(code, heures = 10) {
      const cles = clesDuJoueur();
      if (!cles || (!cles.groq && !cles.gemini)) return { ok: false, message: 'Ajoutez d’abord une clé Groq ou Gemini : le relais en a besoin pour faire penser les habitants.' };
      relais.definirCode(code);
      const d = await relais.prendre({ force: true });
      if (d.statut === 403) { relais.definirCode(''); return { ok: false, message: 'Code du village incorrect. Si vous en avez déjà créé un, utilisez le même.' }; }
      if (d.statut !== 200) { relais.definirCode(''); return { ok: false, message: 'Le stockage du village ne répond pas pour le moment. Réessayez dans un instant.' }; }
      relais.definirVeille(true);
      heuresVeille = heures;
      if (!relais.partie) relais.nouvellePartie();
      const r = await relais.deposer(sim, { liberer: false, cles, heures });
      if (r.status !== 200) { relais.definirVeille(false); return { ok: false, message: 'Impossible d’enregistrer le village sur le serveur. Réessayez.' }; }
      await relais.rafraichir(0);
      return { ok: true, message: `Relais activé : quand vous quitterez cette page, le village continuera jusqu’à ${heures} h.` };
    },
    // partir maintenant : le village passe au relais, cette page s'arrête
    async partir() {
      if (!relais.actif || !relais.veille) return { ok: false, message: 'Activez d’abord le relais.' };
      const r = await relais.deposer(sim, { liberer: true, cles: clesDuJoueur(), heures: heuresVeille });
      if (r.status !== 200) return { ok: false, message: 'Impossible de confier le village au serveur. Réessayez.' };
      auRelais = true;
      changerVitesse(0);
      if (ecranVeille) ecranVeille.hidden = false;
      return { ok: true, message: 'Le village continue sans vous.' };
    },
    async eteindre() {
      const r = await relais.reglages({ veille: false, effacerCles: true });
      relais.definirVeille(false);
      return r.status === 200 ? { ok: true, message: 'Relais éteint, vos clés sont effacées du serveur.' } : { ok: false, message: 'Le serveur ne répond pas : vos clés y restent jusqu’au prochain essai.' };
    },
    // lien de lecture seule : les amis regardent le village sans clé (api/regarder)
    async partage(oui) {
      if (!relais.actif) return { ok: false, message: 'Activez d’abord le relais : le village doit être enregistré sur le serveur.' };
      const r = await relais.reglages({ partage: oui });
      if (r.status !== 200) return { ok: false, message: 'Le serveur ne répond pas. Réessayez.' };
      if (oui) await relais.deposer(sim, { liberer: false, cles: clesDuJoueur(), heures: heuresVeille });
      return { ok: true, message: oui ? 'Lien créé. Copiez-le et envoyez-le.' : 'Lien coupé : plus personne ne peut regarder.' };
    },
    async copierLien() {
      const j = relais.statut?.partage;
      if (!j) return { ok: false, message: 'Aucun lien à copier.' };
      const lien = `${location.origin}${location.pathname}?regarder=${j}`;
      try { await navigator.clipboard.writeText(lien); return { ok: true, message: 'Lien copié.' }; } catch { return { ok: false, message: 'Copie impossible : touchez le lien et copiez-le à la main.' }; }
    },
    reprendre: reprendreLaMain,
  },
});
document.getElementById('reprendre-main')?.addEventListener('click', async () => { await reprendreLaMain(); if (!enRechargement) changerVitesse(vitesseAvantPause || 4); });
if (relais.bloque) ui.toast('Le village est tenu par une autre page : celle-ci ne se synchronise pas avec le relais.', 'mal');
annoncerAbsence();
ui.relais = relais;

window.__ile = { sim, ui, camera, controls, penseur, select: (id) => ui.actions.selectionner(id, true) , habitants3d };

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

// ---------- Regarder : la photo du village se rafraîchit quand son propriétaire en dépose une plus récente ----------
async function rafraichirRegard() {
  try {
    const r = await fetch(`api/regarder?t=${encodeURIComponent(jetonRegard)}`);
    if (r.status === 404) { ui.toast('Le lien a été coupé : ce village n’est plus partagé.', 'mal'); return; }
    if (r.ok && Number(r.headers.get('x-maj')) > majRegard) location.reload();
  } catch { /* hors ligne : on réessaie au prochain tour */ }
}

// ---------- Intro ----------
const intro = document.getElementById('intro');
document.getElementById('commencer').addEventListener('click', () => {
  intro.remove();
  changerVitesse(4);
});
if (reprise) ui.toast(`Partie reprise : ${sim.horodatage()}.`, 'bien');
if (spectateur) { intro.remove(); setInterval(rafraichirRegard, 3 * 60 * 1000); }
else if (aCharger || reprise || params.has('direct')) { intro.remove(); changerVitesse(params.has('capture') ? 0 : 4); }
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
  if (!spectateur) penseur.tick();

  const E = sim.etatSaison;
  const meteo = { tempete: sim.meteo.tempete > sim.temps, intensitePluie: E.intensitePluie, chaleur: E.chaleur, seche: E.seche, verdure: E.verdure };
  env.update(sim.heure(), tAnim, meteo, camera);
  village.update(tAnim, env.nuit, sim);
  habitants3d.update(dt, tAnim, camera, selection);
  habitants3d.majTextes(camera, selection);
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
