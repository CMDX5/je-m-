// Moteur de « Palestine — Île Vivante ».
//
// Principe : on ne programme que les LOIS DU MONDE (monde.js) et un ESPRIT capable
// d'apprendre (esprit.js). Les routines, les métiers, les amitiés, les rancunes,
// les vols, les disputes et les questions portées à l'assemblée émergent
// de ce que les habitants vivent, observent et se racontent.
// Indépendant du rendu : tourne aussi dans Node (tests).

import { RNG, clamp } from './rng.js';
import { PRENOMS_H, PRENOMS_F, NOMS_FAMILLE, PROJETS, THEMES, DEMANDES } from './data.js';
import {
  creerHabitant, nomComplet, libelleMetier, relation, changerAffinite, memoriser, estomperMemoire,
} from './villager.js';
import {
  ACTIONS, TRAVAUX, BESOINS, tranche, valeur, observer, transmettre, heriter, metierEmergent,
  debuterEpisode, conclureEpisode, bienEtre, securite, predire, attente,
} from './esprit.js';
import { creerMonde, regenerer, produire, recuperation, risqueMaladie, lumiere, pressionCircadienne, minutesJusquAube } from './monde.js';
import { NavGrid } from './navigation.js';
import { buildLayout, makeBuilding, ZONES, randomPointInZone, FREE_HOUSE_SPOTS, PLAZA } from '../world/layout.js';

const MIN_JOUR = 1440;
const VITESSE_MARCHE = 1.45;
const du = (x) => (2 * (100 - clamp(x, 0, 100))) / 100;
const PUBLIC = new Set(['pierre', 'bois', 'artisanat', 'commercer', 'soigner', 'enseigner', 'construire']);

const SUJETS = [
  'la pêche', 'les olives', 'le temps qu’il fait', 'les enfants', 'la réserve commune', 'le conseil',
  'un vieux souvenir', 'la mer', 'une recette de maqlouba', 'les nouvelles du port', 'la récolte',
];

export class Simulation {
  constructor({ seed = 2026 } = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.temps = 6 * 60;
    this.listeners = {};
    this.journal = [];
    this.conflits = [];
    this.nextConflitId = 1;
    this.res = { nourriture: 60, huile: 20, pierre: 55, bois: 40, pieces: 140, remedes: 18 };
    this.monde = creerMonde();
    this.foyers = {};
    this.politique = { contribution: false, rota: false, surveillance: false, reparation: false, anciens: false };
    this.normes = {}; // interdictions décidées en assemblée : action -> fin
    this.bonus = { jetee: false, puits: false, ecole: false, reposMer: false };
    this.projet = null;
    this.assemblee = null;
    this.historiqueAssemblees = [];
    this.plaintes = {};
    this.meteo = { tempete: 0, secheresse: 0, bonnePeche: 0 };
    this.navire = 0;
    this.fete = null;
    this.historique = [];
    this.premieresFois = {};
    this.stats = this.nouvellesStats();
    this.bilan = { produit: {}, consomme: {} };
    this.derniereHeure = Math.floor(this.temps / 60);
    this.enPrehistoire = false;
    this.joursPrehistoire = 0;
    this.cacheMembres = null;
  }

  nouvellesStats() {
    return {
      routine: Array.from({ length: 24 }, () => ({})),
      transmissions: 0, vols: 0, volsPris: 0, excuses: 0, disputes: 0, aides: 0, dons: 0,
      confrontations: 0, decouvertes: [], conversations: 0, normesEnfreintes: 0,
    };
  }

  // ---------- Utilitaires ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }
  log(texte, type = 'info', sujets = []) {
    const e = { t: this.temps, texte, type, sujets };
    if (this.enPrehistoire) e.prehistoire = true;
    this.journal.push(e);
    if (this.journal.length > 500) this.journal.shift();
    if (!this.enPrehistoire) this.emit('journal', e);
  }
  get jour() { return Math.floor(this.temps / MIN_JOUR) + 1; }
  heure(t = this.temps) { return (((t % MIN_JOUR) + MIN_JOUR) % MIN_JOUR) / 60; }
  horodatage(t = this.temps) {
    const h = Math.floor(this.heure(t)), m = Math.floor(((t % 60) + 60) % 60);
    return `Jour ${Math.floor(t / MIN_JOUR) + 1}, ${h}h${String(m).padStart(2, '0')}`;
  }
  habitant(id) { return this.habitants[id]; }
  batiment(id) { return this.batimentsParId[id]; }
  membresFoyer(f) {
    if (!this.cacheMembres) {
      this.cacheMembres = {};
      for (const v of this.habitants) this.cacheMembres[v.foyer] = (this.cacheMembres[v.foyer] || 0) + 1;
    }
    return this.cacheMembres[f] || 1;
  }
  categorie(v) {
    if (v.age < 6) return 'enfant';
    if (v.age < 17) return 'eleve';
    if (v.age >= 64) return 'ancien';
    return 'adulte';
  }
  ajouter(r, q) {
    this.res[r] = Math.max(0, (this.res[r] || 0) + q);
    if (q > 0) this.bilan.produit[r] = (this.bilan.produit[r] || 0) + q;
    else this.bilan.consomme[r] = (this.bilan.consomme[r] || 0) - q;
  }
  plainte(theme, v, poids = 1) {
    const p = (this.plaintes[theme] ||= { n: 0, porteurs: {} });
    p.n += poids;
    p.porteurs[v.id] = (p.porteurs[v.id] || 0) + poids;
  }

  // ---------- Création ----------
  // `prehistoire` : nombre de jours que les habitants vivent seuls avant l'arrivée du joueur.
  init({ prehistoire = 10 } = {}) {
    this.batiments = buildLayout();
    this.batimentsParId = Object.fromEntries(this.batiments.map((b) => [b.id, b]));
    this.nav = new NavGrid(this.batiments);
    this.genererPopulation();
    this.tisserRelations();
    for (const v of this.habitants) {
      const b = this.batiment(v.foyer);
      v.x = b.door.x; v.z = b.door.z;
      this.majMetier(v);
    }
    this.joursPrehistoire = prehistoire;
    if (prehistoire > 0) {
      // les habitants vivent leurs premiers jours sans conseil : ils apprennent à vivre sur l'île
      this.enPrehistoire = true;
      this.update(prehistoire * MIN_JOUR);
      this.enPrehistoire = false;
    }
    this.arrivee = this.temps;
    this.log(`Le conseil arrive sur l'île. Depuis ${prehistoire} jours, les cinquante habitants apprennent seuls à y vivre.`, 'conseil');
    return this;
  }

  genererPopulation() {
    const rng = this.rng;
    const maisons = this.batiments.filter((b) => b.type === 'maison');
    const tailles = rng.shuffle([5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3]);
    const modeles = {
      3: [['couple', 'enfant'], ['couple', 'jeune'], ['ancien', 'adulte', 'enfant']],
      4: [['couple', 'enfant', 'enfant'], ['couple', 'jeune', 'enfant'], ['couple', 'enfant', 'ancien'], ['couple', 'jeune', 'jeune']],
      5: [['couple', 'jeune', 'enfant', 'ancien']],
    };
    const pris = new Set();
    const prenom = (g) => {
      const pool = g === 'F' ? PRENOMS_F : PRENOMS_H;
      for (let k = 0; k < 60; k++) { const p = rng.pick(pool); if (!pris.has(p)) { pris.add(p); return p; } }
      return rng.pick(pool);
    };
    this.habitants = [];
    let id = 0;
    const familles = rng.shuffle([...NOMS_FAMILLE]);
    maisons.forEach((m, i) => {
      const nom = familles[i % familles.length];
      m.famille = nom;
      m.nom = `Maison ${nom}`;
      const membres = [];
      const ajouter = (genre, age) => {
        const v = creerHabitant({ id: id++, prenom: prenom(genre), nom, genre, age, foyer: m.id, rng });
        this.habitants.push(v);
        membres.push(v);
      };
      for (const role of rng.pick(modeles[tailles[i]])) {
        if (role === 'couple') { const a = rng.int(26, 56); ajouter('H', a); ajouter('F', clamp(a + rng.int(-6, 3), 22, 60)); }
        else if (role === 'adulte') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(30, 50));
        else if (role === 'jeune') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(17, 25));
        else if (role === 'enfant') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(3, 15));
        else if (role === 'ancien') ajouter(rng.chance(0.55) ? 'F' : 'H', rng.int(64, 82));
      }
      for (const v of membres) v.famille = membres.filter((o) => o !== v).map((o) => o.id);
      // chaque foyer commence avec quelques jours de provisions
      this.foyers[m.id] = { nourriture: membres.length * 10 };
    });
  }

  // Seul point de départ : l'attachement familial et la familiarité de voisinage.
  // Aucune amitié ni rancune n'est écrite d'avance.
  tisserRelations() {
    const rng = this.rng;
    for (const v of this.habitants) {
      for (const o of this.habitants) {
        if (o === v) continue;
        const r = relation(v, o.id);
        if (v.famille.includes(o.id)) { r.aff = rng.range(45, 75); r.fam = rng.range(85, 100); }
        else {
          const bv = this.batiment(v.foyer), bo = this.batiment(o.foyer);
          r.fam = Math.hypot(bv.x - bo.x, bv.z - bo.z) < 22 ? rng.range(15, 40) : rng.range(0, 12);
          r.aff = 0;
        }
      }
    }
  }

  // ---------- Boucle ----------
  update(dtMinutes) {
    let restant = dtMinutes;
    while (restant > 1e-6) {
      const dt = Math.min(1, restant);
      this.step(dt);
      restant -= dt;
    }
  }

  step(dt) {
    const avant = this.temps;
    this.temps += dt;
    const h = Math.floor(this.temps / 60);
    if (h !== this.derniereHeure) {
      this.derniereHeure = h;
      this.cacheMembres = null;
      this.horaire();
      if (Math.floor(this.temps / MIN_JOUR) !== Math.floor(avant / MIN_JOUR)) this.quotidien();
    }
    regenerer(this.monde, dt, this.bonus);
    const calculMoral = Math.floor(this.temps / 10) !== Math.floor(avant / 10);
    for (const v of this.habitants) {
      this.majHabitant(v, dt);
      if (calculMoral) v.moral = bienEtre(this, v);
    }
  }

  majHabitant(v, dt) {
    this.majBesoins(v, dt);
    if (v.conversation) {
      if (this.temps >= v.conversation.fin && !v.conversation.fini) this.conclureConversation(v.conversation);
      return;
    }
    if (v.path && v.path.length) { this.marcher(v, dt); return; }
    const a = v.activite;
    if (!a || this.temps >= a.fin || this.urgenceCorporelle(v, a)) {
      if (a) this.terminerActivite(v, a);
      this.decider(v);
      return;
    }
    this.agir(v, a, dt);
  }

  // Le corps : faim, fatigue, solitude, santé, inquiétude, estime de soi s'usent avec le temps.
  majBesoins(v, dt) {
    const b = v.besoins;
    const a = v.activite;
    const dort = a?.action === 'dormir' && v.interieur;
    b.faim = clamp(b.faim - 0.06 * dt, 0, 100);
    if (dort) b.energie = clamp(b.energie + recuperation(this.heure()) * dt, 0, 100);
    else b.energie = clamp(b.energie - 0.045 * dt * (v.age > 64 ? 1.15 : 1) * pressionCircadienne(this.heure()), 0, 100);
    if (v.conversation) b.social = clamp(b.social + 0.5 * dt, 0, 100);
    else if (!dort) b.social = clamp(b.social - 0.03 * (0.5 + v.traits.sociabilite) * dt, 0, 100);
    if (v.malade) b.sante = clamp(b.sante - 0.02 * dt, 0, 100);
    else if (b.faim < 10 || b.energie < 5) b.sante = clamp(b.sante - 0.03 * dt, 0, 100);
    else b.sante = clamp(b.sante + 0.006 * dt, 0, 100);
    b.serenite = clamp(b.serenite - 0.01 * dt - (v.malade ? 0.01 * dt : 0), 0, 100);
    b.estime = clamp(b.estime - 0.008 * dt, 0, 100);
  }

  // Le corps peut forcer la main : on s'effondre de fatigue, la faim tenaille.
  urgenceCorporelle(v, a) {
    if (a.action !== 'dormir' && v.besoins.energie < 3) return true;
    if (!a.action?.startsWith('manger') && v.besoins.faim < 4 && this.temps - v.dernierRepas > 120 && this.rng.chance(0.05)) return true;
    return false;
  }

  majMetier(v) {
    const cat = this.categorie(v);
    const m = cat === 'enfant' ? null : metierEmergent(v);
    const nouveau = m || (cat === 'adulte' ? 'sans' : cat);
    if (v.metier && v.metier !== nouveau && m && !this.enPrehistoire) {
      this.log(`On commence à considérer ${nomComplet(v)} comme ${v.genre === 'F' ? 'une' : 'un'} ${libelleMetier(v, nouveau).toLowerCase()}.`, 'info', [v.id]);
    }
    v.metier = nouveau;
  }

  // ---------- Décider (rien n'est imposé : chaque option est évaluée par l'expérience) ----------
  eligible(v, a) {
    const d = ACTIONS[a];
    if (d.age && v.age < d.age) return false;
    if (d.ageMax && v.age > d.ageMax) return false;
    if (a === 'construire') return !!(this.projet && !this.projet.enAttente);
    if (a === 'fete') return !!(this.fete && this.temps >= this.fete.debut && this.temps < this.fete.fin);
    if (v.age < 6 && !['dormir', 'manger', 'rester', 'jouer', 'place', 'visiter'].includes(a)) return false;
    return true;
  }

  dureeAttendue(v, a) {
    if (a === 'dormir') {
      const h = this.heure();
      if (lumiere(h) < 0.2) return clamp(minutesJusquAube(h), 45, 600); // la nuit, on dort jusqu'au jour
      return clamp((100 - v.besoins.energie) / recuperation(h), 30, 240); // une sieste
    }
    const d = ACTIONS[a].duree || [90, 180];
    return (d[0] + d[1]) / 2;
  }

  posDe(o) {
    return o.interieur && o.batiment ? this.batiment(o.batiment)?.door ?? o : o;
  }

  candidats(v) {
    const out = [];
    for (const a of Object.keys(ACTIONS)) {
      if (ACTIONS[a].social || !this.eligible(v, a)) continue;
      const duree = this.dureeAttendue(v, a);
      let bonus = 0;
      // une interdiction décidée en assemblée pèse selon le respect qu'on a pour le conseil
      if (this.normes[a] && this.temps < this.normes[a]) bonus -= (v.confiance / 100) * 10 + 2;
      if (a === 'donner' && this.politique.contribution) bonus += ((v.confiance - 40) / 60) * 5;
      if (v.reposJusqua > this.temps && ACTIONS[a].travail) bonus -= 4;
      bonus -= this.distance(v, this.lieuApprox(v, a)) / 60; // marcher coûte
      out.push({ a, duree, val: valeur(this, v, a, duree / 60, { bonus }) });
    }
    // Rendre visite à quelqu'un qu'on apprécie
    if (this.eligible(v, 'visiter')) {
      const proches = Object.entries(v.relations).filter(([, r]) => r.aff > 8).sort((x, y) => y[1].aff - x[1].aff).slice(0, 4);
      for (const [id, r] of proches) {
        const o = this.habitant(Number(id));
        if (o.activite?.action === 'dormir') continue;
        const p = this.posDe(o);
        out.push({ a: 'visiter', cible: o.id, duree: 45, val: valeur(this, v, 'visiter', 0.75, { bonus: r.aff / 25 + r.fam / 60 - Math.hypot(p.x - v.x, p.z - v.z) / 50 }) });
      }
    }
    // Venir en aide à quelqu'un qu'on sait en difficulté (vu, ou de sa famille)
    if (this.eligible(v, 'aider') && (this.foyers[v.foyer]?.nourriture ?? 0) >= 2) {
      for (const [id, t] of Object.entries(v.esprit.detresses || {})) {
        if (this.temps - t > 600) continue;
        const o = this.habitant(Number(id));
        if (!(o.malade || o.besoins.faim < 30 || o.moral < 30)) continue;
        const r = relation(v, o.id);
        const p = this.posDe(o);
        out.push({ a: 'aider', cible: o.id, duree: 30, val: valeur(this, v, 'aider', 0.5, { bonus: v.traits.generosite * 8 * (1 + r.aff / 100) - Math.hypot(p.x - v.x, p.z - v.z) / 50 }) });
      }
    }
    // Aller demander des comptes à quelqu'un qui nous a fait du tort
    if (this.eligible(v, 'confronter')) {
      for (const [id, g] of Object.entries(v.esprit.griefs)) {
        if (g < 0.15) continue;
        const o = this.habitant(Number(id));
        const p = this.posDe(o);
        out.push({ a: 'confronter', cible: o.id, duree: 15, val: valeur(this, v, 'confronter', 0.25, { bonus: g * (3 + 9 * v.traits.temperament) - Math.hypot(p.x - v.x, p.z - v.z) / 50 - (1 - v.traits.temperament) * 2 }) });
      }
    }
    // Garde-manger vide et faim forte : l'idée de se servir chez un voisin peut venir
    if (this.eligible(v, 'chaparder') && (this.foyers[v.foyer]?.nourriture ?? 0) < 0.6 && v.besoins.faim < 40) {
      let cible = null, max = 1;
      for (const b of this.batiments) {
        if (b.type !== 'maison' || b.id === v.foyer) continue;
        const s = this.foyers[b.id]?.nourriture ?? 0;
        if (s > max && Math.hypot(b.door.x - v.x, b.door.z - v.z) < 60) { max = s; cible = b.id; }
      }
      if (cible) out.push({ a: 'chaparder', cibleMaison: cible, duree: 12, val: valeur(this, v, 'chaparder', 0.2, { bonus: (40 - v.besoins.faim) / 6 - v.traits.generosite * 5 - (this.politique.surveillance ? 2 : 0) }) });
    }
    return out;
  }

  decider(v) {
    observer(this, v);
    this.percevoirDetresses(v);
    // loi du corps : à bout de forces, on s'endort, qu'on le veuille ou non
    if (v.besoins.energie < 3) { this.commencer(v, { a: 'dormir', duree: this.dureeAttendue(v, 'dormir') }); return; }
    const cands = this.candidats(v);
    // choix « doux » : le plus souvent ce qui semble le mieux, parfois autre chose
    const tau = 1 + 3 * v.traits.curiosite;
    const max = Math.max(...cands.map((c) => c.val));
    let tot = 0;
    for (const c of cands) { c.p = Math.exp((c.val - max) / tau); tot += c.p; }
    let x = this.rng.next() * tot;
    let choix = cands[0];
    for (const c of cands) { x -= c.p; if (x <= 0) { choix = c; break; } }
    this.commencer(v, choix);
  }

  percevoirDetresses(v) {
    const e = v.esprit;
    e.detresses ||= {};
    for (const id of v.famille) {
      const o = this.habitant(id);
      if (o.malade || o.besoins.faim < 30) e.detresses[id] = this.temps;
    }
    if (v.interieur) return;
    for (const o of this.habitants) {
      if (o === v || o.interieur || Math.hypot(o.x - v.x, o.z - v.z) > 15) continue;
      if (o.malade || o.moral < 30) e.detresses[o.id] = this.temps;
    }
  }

  distance(v, lieu) { return lieu ? Math.hypot(lieu.x - v.x, lieu.z - v.z) : 0; }

  // Position approximative d'un lieu (sans tirage aléatoire), pour estimer la marche.
  lieuApprox(v, a) {
    const d = ACTIONS[a];
    if (d.lieu === 'maison') return this.batiment(v.foyer).door;
    if (d.lieu === 'chantier') return this.projet?.site || null;
    if (this.batimentsParId[d.lieu]) return this.batiment(d.lieu).door;
    return ZONES[d.lieu] || null;
  }

  lieuPour(v, a) {
    const d = ACTIONS[a];
    const maison = this.batiment(v.foyer);
    if (d.lieu === 'maison') return { x: maison.door.x, z: maison.door.z, interieur: true, bat: maison.id, nomLieu: 'la maison' };
    if (d.lieu === 'chantier') {
      const p = this.projet?.site;
      return p ? { x: p.x + this.rng.range(-4, 4), z: p.z + this.rng.range(-4, 4), zone: 'chantier', nomLieu: 'le chantier' } : null;
    }
    if (this.batimentsParId[d.lieu]) {
      const b = this.batiment(d.lieu);
      return { x: b.door.x, z: b.door.z, interieur: !!d.interieur, bat: b.id, nomLieu: { ecole: "l'école", mosquee: 'la mosquée', dispensaire: 'le dispensaire', atelier: "l'atelier" }[b.id] || b.nom };
    }
    const z = ZONES[d.lieu];
    if (z) return { ...randomPointInZone(z, this.rng), zone: d.lieu, nomLieu: z.nom };
    return null;
  }

  commencer(v, c) {
    const d = ACTIONS[c.a];
    let lieu;
    if (d.social && c.cible != null) {
      const o = this.habitant(c.cible);
      const p = this.posDe(o);
      lieu = { x: p.x + this.rng.range(-1, 1), z: p.z + this.rng.range(-1, 1), nomLieu: `auprès de ${o.prenom}` };
    } else if (c.a === 'chaparder') {
      const b = this.batiment(c.cibleMaison);
      lieu = { x: b.door.x, z: b.door.z, nomLieu: `près de la ${b.nom}` };
    } else lieu = this.lieuPour(v, c.a);
    if (!lieu) lieu = { x: v.x, z: v.z, nomLieu: 'ici' };
    const etat = c.cible != null ? `${d.etat} (${this.habitant(c.cible).prenom})` : d.etat;
    v.activite = {
      type: d.rendu, action: c.a, etat, debut: this.temps,
      duree: c.duree * this.rng.range(0.8, 1.2), cible: c.cible, cibleMaison: c.cibleMaison,
      fin: this.temps + 600, // recalculé à l'arrivée : le trajet ne compte pas dans la durée
      ...lieu,
    };
    debuterEpisode(this, v, c.a, { cible: c.cible });
    this.allerVers(v, lieu.x, lieu.z);
  }

  allerVers(v, x, z) {
    if (v.interieur) {
      const b = this.batiment(v.batiment);
      if (b) { v.x = b.door.x; v.z = b.door.z; }
      v.interieur = false;
      v.batiment = null;
    }
    if (Math.hypot(x - v.x, z - v.z) < 0.8) { v.path = null; this.arriver(v); return; }
    const p = this.nav.findPath(v.x, v.z, x, z);
    v.path = p && p.length ? p : [{ x, z }];
  }

  marcher(v, dt) {
    let pas = VITESSE_MARCHE * dt * (v.age > 66 ? 0.75 : v.age < 9 ? 0.9 : 1) * (v.besoins.energie < 20 ? 0.8 : 1);
    while (pas > 0 && v.path.length) {
      const p = v.path[0];
      const dx = p.x - v.x, dz = p.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d <= pas) { v.x = p.x; v.z = p.z; pas -= d; v.path.shift(); }
      else { v.x += (dx / d) * pas; v.z += (dz / d) * pas; v.dir = Math.atan2(dx, dz); pas = 0; }
    }
    if (!v.path.length) { v.path = null; this.arriver(v); }
  }

  arriver(v) {
    const a = v.activite;
    if (!a) return;
    a.arrive = this.temps;
    a.fin = this.temps + a.duree;
    if (a.interieur) { v.interieur = true; v.batiment = a.bat; }
    switch (a.action) {
      case 'pecher': this.arriveeJetee(v, a); break;
      case 'donner': this.donner(v); a.fin = this.temps + 10; break;
      case 'aider': this.aider(v, this.habitant(a.cible)); break;
      case 'visiter': {
        const o = this.habitant(a.cible);
        if (o && !o.conversation && Math.hypot(o.x - v.x, o.z - v.z) < 6 && o.activite?.action !== 'dormir') this.commencerConversation(v, o, 'visite');
        break;
      }
      case 'confronter': {
        const o = this.habitant(a.cible);
        if (o && !o.conversation && Math.hypot(o.x - v.x, o.z - v.z) < 6) this.confrontation(v, o);
        else a.fin = this.temps + 5;
        break;
      }
      case 'chaparder': this.chaparder(v, a.cibleMaison); break;
      case 'manger_reserve': v.esprit.reserveVue = this.res.nourriture; break;
    }
  }

  // ---------- Agir : les lois du monde s'appliquent à ce que l'on fait ----------
  agir(v, a, dt) {
    const b = v.besoins, t = v.traits;
    const presents = (filtre) => {
      let n = 0;
      for (const o of this.habitants) if (o !== v && filtre(o)) n++;
      return n;
    };
    switch (a.action) {
      case 'manger':
      case 'manger_reserve':
        if (!a.mange && this.temps - a.arrive > 8) this.repas(v, a);
        break;
      case 'apprendre': {
        const prof = presents((o) => o.activite?.action === 'enseigner' && o.interieur && o.batiment === 'ecole');
        const camarades = presents((o) => o.activite?.action === 'apprendre' && o.interieur);
        b.estime = clamp(b.estime + (prof ? 0.03 : 0.005) * dt, 0, 100);
        b.serenite = clamp(b.serenite + 0.01 * t.curiosite * dt, 0, 100);
        b.social = clamp(b.social + Math.min(3, camarades) * 0.04 * dt, 0, 100);
        b.energie = clamp(b.energie - 0.01 * dt, 0, 100);
        break;
      }
      case 'prier': {
        const fideles = presents((o) => o.activite?.action === 'prier' && o.interieur);
        b.serenite = clamp(b.serenite + (0.02 + 0.13 * t.piete) * dt, 0, 100);
        b.social = clamp(b.social + Math.min(3, fideles) * 0.03 * dt, 0, 100);
        break;
      }
      case 'plage': b.serenite = clamp(b.serenite + (0.03 + 0.08 * t.curiosite) * dt, 0, 100); break;
      case 'source': b.serenite = clamp(b.serenite + (0.04 + 0.05 * t.piete) * dt, 0, 100); break;
      case 'belvedere': b.serenite = clamp(b.serenite + (0.04 + 0.12 * t.curiosite) * dt, 0, 100); b.energie = clamp(b.energie - 0.01 * dt, 0, 100); break;
      case 'port': b.serenite = clamp(b.serenite + 0.015 * dt, 0, 100); break;
      case 'jouer': {
        const copains = presents((o) => o.activite?.action === 'jouer' && !o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < 10);
        b.social = clamp(b.social + (copains ? 0.15 : 0.01) * dt, 0, 100);
        b.serenite = clamp(b.serenite + 0.02 * dt, 0, 100);
        b.energie = clamp(b.energie - 0.02 * dt, 0, 100);
        break;
      }
      case 'rester': {
        const famille = v.famille.filter((id) => { const o = this.habitant(id); return o.interieur && o.batiment === v.foyer; }).length;
        b.energie = clamp(b.energie + 0.035 * dt, 0, 100);
        b.serenite = clamp(b.serenite + 0.015 * dt, 0, 100);
        b.social = clamp(b.social + Math.min(2, famille) * 0.06 * dt, 0, 100);
        break;
      }
      case 'fete':
        b.social = clamp(b.social + 0.25 * dt, 0, 100);
        b.serenite = clamp(b.serenite + 0.08 * dt, 0, 100);
        b.estime = clamp(b.estime + 0.02 * dt, 0, 100);
        break;
      case 'se_soigner':
        b.sante = clamp(b.sante + 0.01 * dt, 0, 100);
        break;
    }
    if (ACTIONS[a.action]?.travail) this.travailler(v, a, dt);

    // rencontres : dehors, quand on n'est pas pressé
    if (!v.interieur && !['dormir', 'chaparder', 'confronter'].includes(a.action)) {
      const p = 0.02 * (0.3 + du(b.social)) * (0.5 + t.sociabilite) * (ACTIONS[a.action]?.travail ? 0.3 : 1) * dt;
      if (this.rng.chance(p)) this.chercherInterlocuteur(v);
    }
  }

  travailler(v, a, dt) {
    if (a.action === 'pecher' && a.bloque) return;
    const e = v.esprit;
    const comp = e.competence[a.action] || 0;
    const meteo = { tempete: this.meteo.tempete > this.temps, secheresse: this.meteo.secheresse > this.temps, bonnePeche: this.meteo.bonnePeche > this.temps };
    const r = produire(a.action, this.monde, this.heure(), meteo, comp, dt);
    if (this.bonus.reposMer && a.action === 'pecher') r.nourriture = (r.nourriture || 0) * 0.3;
    const b = v.besoins;
    b.energie = clamp(b.energie - (r.fatigue || 0) * 0.03 * dt, 0, 100);
    if (r.danger && this.rng.chance(r.danger)) {
      b.sante = clamp(b.sante - 25, 0, 100);
      b.serenite = clamp(b.serenite - 20, 0, 100);
      memoriser(v, this.temps, { type: 'danger', texte: 'J’ai failli me noyer en pêchant dans la tempête.', valence: -0.9, importance: 0.9 });
      this.log(`${nomComplet(v)} a été blessé${v.genre === 'F' ? 'e' : ''} en mer pendant la tempête.`, 'mal', [v.id]);
      a.fin = this.temps;
    }
    let utile = false;
    if (r.nourriture) {
      this.foyers[v.foyer].nourriture += r.nourriture;
      if (e.episode) e.episode.apport = (e.episode.apport || 0) + r.nourriture;
      this.bilan.produit.nourriture = (this.bilan.produit.nourriture || 0) + r.nourriture;
      utile = r.nourriture > 0.001;
    }
    for (const k of ['huile', 'pierre', 'bois', 'pieces', 'remedes']) if (r[k]) { this.ajouter(k, r[k]); utile = true; }
    if (r.chantier && this.projet && !this.projet.enAttente) {
      this.projet.progres += r.chantier;
      utile = true;
      if (this.projet.progres >= this.projet.travail) this.terminerProjet();
    }
    // faire quelque chose d'utile, surtout pour tous, nourrit l'estime de soi
    if (utile) b.estime = clamp(b.estime + (0.015 + (PUBLIC.has(a.action) ? 0.025 : 0)) * dt * (0.5 + comp), 0, 100);
    if (a.action === 'enseigner') {
      const eleves = this.habitants.filter((o) => o.activite?.action === 'apprendre' && o.interieur).length;
      b.estime = clamp(b.estime + Math.min(1, eleves / 4) * 0.06 * dt, 0, 100);
      b.social = clamp(b.social + Math.min(1, eleves / 4) * 0.05 * dt, 0, 100);
    }
    if (a.action === 'commercer') {
      const clients = this.habitants.filter((o) => o !== v && !o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < 12).length;
      this.ajouter('pieces', Math.min(4, clients) * 0.004 * dt);
      b.social = clamp(b.social + Math.min(4, clients) * 0.02 * dt, 0, 100);
    }
    if (a.action === 'soigner') this.soignerPatients(v);
    e.competence[a.action] = clamp(comp + 0.0006 * dt * (1 - comp), 0, 1);
    e.travailRecent[a.action] = (e.travailRecent[a.action] || 0) + dt / 60;
    if (a.action === 'pecher' && this.monde.poisson < 0.35) this.plainte('mer', v, dt / 120);
    if (a.action === 'bois' && this.monde.foret < 0.35) this.plainte('foret', v, dt / 120);
    if (this.normes[a.action] && this.temps < this.normes[a.action] && !a.infraction) {
      a.infraction = true;
      this.stats.normesEnfreintes++;
      for (const o of this.habitants) {
        if (o === v || o.interieur || Math.hypot(o.x - v.x, o.z - v.z) > 20) continue;
        changerAffinite(o, v, -4 * (0.5 + o.traits.patience));
        memoriser(o, this.temps, { type: 'norme', texte: `J'ai vu ${v.prenom} ${DEMANDES[a.action] || a.action} malgré la décision de l'assemblée.`, valence: -0.5, importance: 0.5, sujet: v.id, resume: `${v.prenom} ne respecte pas la décision de l'assemblée` });
      }
    }
  }

  arriveeJetee(v, a) {
    const places = this.monde.placesJetee + (this.bonus.jetee ? 2 : 0) - (this.normes.moinsBarques > this.temps ? 2 : 0);
    const occupants = this.habitants.filter((o) => o !== v && o.activite?.action === 'pecher' && o.activite.arrive && !o.path && !o.activite.bloque);
    const e = v.esprit;
    if (occupants.length < places) { e.pechesJetee = (e.pechesJetee || 0) + 1; return; }
    if (this.politique.rota) {
      const plusServi = occupants.sort((x, y) => (y.esprit.pechesJetee || 0) - (x.esprit.pechesJetee || 0))[0];
      if ((plusServi.esprit.pechesJetee || 0) > (e.pechesJetee || 0)) {
        plusServi.activite.fin = this.temps;
        memoriser(plusServi, this.temps, { type: 'rota', texte: `J'ai cédé ma barque à ${v.prenom}, c'était son tour.`, valence: 0.1, importance: 0.3, sujet: v.id });
        e.pechesJetee = (e.pechesJetee || 0) + 1;
        return;
      }
    }
    a.bloque = true;
    a.fin = this.temps + 3;
    e.bloquesJetee++;
    v.besoins.serenite = clamp(v.besoins.serenite - 5, 0, 100);
    if (!this.politique.rota) {
      for (const o of occupants) {
        e.griefs[o.id] = clamp((e.griefs[o.id] || 0) + 0.05 * (0.5 + v.traits.temperament), 0, 1);
        (e.griefMotif ||= {})[o.id] = 'la place sur la jetée';
        changerAffinite(v, o, -1.5);
      }
    }
    this.plainte('jetee', v);
    if (e.bloquesJetee % 3 === 1) memoriser(v, this.temps, { type: 'jetee', texte: `Toutes les barques étaient déjà prises quand je suis arrivé${v.genre === 'F' ? 'e' : ''} à la jetée.`, valence: -0.4, importance: 0.4 });
  }

  repas(v, a) {
    a.mange = true;
    v.dernierRepas = this.temps;
    const portion = v.age < 12 ? 0.6 : 1;
    const reserve = a.action === 'manger_reserve';
    const stock = reserve ? this.res.nourriture : this.foyers[v.foyer].nourriture;
    if (stock >= portion) {
      if (reserve) { this.ajouter('nourriture', -portion); v.stats.prisReserve = (v.stats.prisReserve || 0) + portion; this.jugerPreleveur(v); }
      else {
        this.foyers[v.foyer].nourriture -= portion;
        if (v.esprit.episode) v.esprit.episode.consomme = (v.esprit.episode.consomme || 0) + portion;
      }
      v.besoins.faim = clamp(v.besoins.faim + 36, 0, 100);
      // manger ensemble réchauffe
      let convives = 0;
      for (const o of this.habitants) {
        if (o === v || o.activite?.action !== a.action) continue;
        if (reserve ? Math.hypot(o.x - v.x, o.z - v.z) < 10 : o.batiment === v.batiment && o.interieur) convives++;
      }
      v.besoins.social = clamp(v.besoins.social + Math.min(3, convives) * 4, 0, 100);
    } else {
      v.esprit.faimsSansRepas++;
      v.besoins.serenite = clamp(v.besoins.serenite - 6, 0, 100);
      if (v.besoins.faim < 40) {
        this.plainte('faim', v);
        memoriser(v, this.temps, {
          type: 'faim', texte: reserve ? 'La réserve commune était vide quand j’avais faim.' : "Il n'y avait plus rien à manger à la maison.",
          valence: -0.6, importance: 0.55, sujet: reserve ? 'conseil' : null, resume: reserve ? 'la réserve commune est vide' : `la famille ${v.nom} n'a plus de quoi manger`,
        });
      }
    }
    if (reserve) v.esprit.reserveVue = this.res.nourriture;
  }

  // Ceux qui voient quelqu'un se servir sans jamais apporter se font une opinion.
  jugerPreleveur(v) {
    const pris = v.stats.prisReserve || 0, donne = v.stats.dons || 0;
    if (pris < donne * 2 + 4) return;
    for (const o of this.habitants) {
      if (o === v || o.interieur || Math.hypot(o.x - v.x, o.z - v.z) > 14) continue;
      changerAffinite(o, v, -1.2 * (1 - o.traits.generosite));
    }
  }

  donner(v) {
    const stock = this.foyers[v.foyer].nourriture;
    const membres = this.membresFoyer(v.foyer);
    const part = 0.25 + 0.5 * v.traits.generosite + (this.politique.contribution ? 0.15 : 0);
    const q = Math.max(0, stock - membres * 3) * part;
    if (q < 0.5) { v.besoins.estime = clamp(v.besoins.estime + 1, 0, 100); return; }
    this.foyers[v.foyer].nourriture -= q;
    this.ajouter('nourriture', q);
    v.stats.dons += q;
    this.stats.dons += q;
    v.besoins.estime = clamp(v.besoins.estime + Math.min(14, q * 1.5), 0, 100);
    for (const o of this.habitants) {
      if (o === v || o.interieur || Math.hypot(o.x - v.x, o.z - v.z) > 16) continue;
      changerAffinite(o, v, 3);
    }
    if (q >= 6) {
      memoriser(v, this.temps, { type: 'don', texte: `J'ai apporté ${Math.round(q)} rations à la réserve commune.`, valence: 0.5, importance: 0.4, resume: `${v.prenom} a beaucoup donné à la réserve commune`, sujet: v.id });
      this.log(`${nomComplet(v)} apporte ${Math.round(q)} rations à la réserve commune.`, 'bien', [v.id]);
    }
  }

  aider(v, o) {
    if (!o || Math.hypot(o.x - v.x, o.z - v.z) > 8) return;
    const e = v.genre === 'F' ? 'e' : '';
    // l'aide ne vaut que par la détresse réelle de l'autre (et s'use si elle se répète)
    const recente = this.temps - (o.derniereAide || -1e9) < 720;
    const detresse = clamp((o.malade ? 0.5 : 0) + Math.max(0, 45 - o.besoins.faim) / 45 + Math.max(0, 40 - o.moral) / 40, 0, 1) * (recente ? 0.2 : 1);
    if (detresse < 0.05) { v.besoins.estime = clamp(v.besoins.estime - 1, 0, 100); return; }
    o.derniereAide = this.temps;
    if (this.foyers[v.foyer].nourriture >= 2 && o.besoins.faim < 45) {
      this.foyers[v.foyer].nourriture -= 2;
      this.foyers[o.foyer].nourriture += 2;
      o.besoins.faim = clamp(o.besoins.faim + 20, 0, 100);
    }
    if (o.malade) o.besoins.sante = clamp(o.besoins.sante + 6, 0, 100);
    o.besoins.social = clamp(o.besoins.social + 15 * detresse, 0, 100);
    o.besoins.serenite = clamp(o.besoins.serenite + 10 * detresse, 0, 100);
    v.besoins.estime = clamp(v.besoins.estime + (6 + 6 * v.traits.generosite) * detresse, 0, 100);
    v.besoins.serenite = clamp(v.besoins.serenite + 5 * v.traits.generosite * detresse, 0, 100);
    changerAffinite(o, v, 12 * detresse);
    changerAffinite(v, o, 3 * detresse);
    if (o.esprit.griefs[v.id]) o.esprit.griefs[v.id] *= 1 - 0.5 * detresse;
    v.stats.aides++;
    this.stats.aides++;
    if (detresse < 0.3) return;
    memoriser(o, this.temps, { type: 'aide', texte: `${v.prenom} est venu${e} m'aider quand j'en avais besoin.`, valence: 0.85, importance: 0.4 + 0.3 * detresse, sujet: v.id, resume: `${v.prenom} a aidé ${o.prenom} dans un moment difficile` });
    memoriser(v, this.temps, { type: 'aide', texte: `J'ai aidé ${o.prenom}.`, valence: 0.5, importance: 0.4, sujet: o.id });
    this.log(`${nomComplet(v)} est allé${e} aider ${nomComplet(o)}.`, 'bien', [v.id, o.id]);
  }

  chaparder(v, maisonId) {
    const stock = this.foyers[maisonId]?.nourriture ?? 0;
    const q = Math.min(2.5, stock);
    const victimes = this.habitants.filter((o) => o.foyer === maisonId);
    if (q < 0.3) return;
    this.foyers[maisonId].nourriture -= q;
    this.foyers[v.foyer].nourriture += q;
    v.stats.vols++;
    this.stats.vols++;
    this.monde.vols++;
    v.besoins.serenite = clamp(v.besoins.serenite - 14 * v.traits.generosite, 0, 100); // la culpabilité
    const torts = (v.esprit.torts ||= {});
    for (const o of victimes) torts[o.id] = (torts[o.id] || 0) + q / 2;
    const rayon = this.politique.surveillance ? 18 : 10;
    const temoins = this.habitants.filter((o) => o !== v && ((o.interieur && o.batiment === maisonId) || (!o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < rayon)));
    const famille = victimes[0]?.nom || '';
    if (!temoins.length) {
      for (const o of victimes) {
        memoriser(o, this.temps, { type: 'vol', texte: 'Des vivres ont disparu de la maison.', valence: -0.5, importance: 0.5 });
        o.besoins.serenite = clamp(o.besoins.serenite - 4, 0, 100);
        this.plainte('vol', o, 0.5);
      }
      memoriser(v, this.temps, { type: 'vol', texte: `J'ai pris de la nourriture chez les ${famille}. Personne ne m'a vu${v.genre === 'F' ? 'e' : ''}.`, valence: -0.3, importance: 0.6 });
      return;
    }
    // pris sur le fait
    this.stats.volsPris++;
    v.besoins.estime = clamp(v.besoins.estime - 25, 0, 100);
    memoriser(v, this.temps, { type: 'vol', texte: `On m'a vu${v.genre === 'F' ? 'e' : ''} prendre des vivres chez les ${famille}. J'ai honte.`, valence: -0.8, importance: 0.85 });
    for (const o of new Set([...victimes, ...temoins])) {
      const victime = o.foyer === maisonId;
      if (victime) {
        o.esprit.griefs[v.id] = clamp((o.esprit.griefs[v.id] || 0) + 0.5, 0, 1);
        (o.esprit.griefMotif ||= {})[v.id] = 'des vivres volés chez nous';
        this.plainte('vol', o);
      }
      changerAffinite(o, v, victime ? -22 : -10);
      memoriser(o, this.temps, {
        type: 'vol', texte: victime ? `${v.prenom} ${v.nom} a volé des vivres chez nous.` : `J'ai vu ${v.prenom} voler chez les ${famille}.`,
        valence: -0.8, importance: victime ? 0.85 : 0.6, sujet: v.id, resume: `${v.prenom} a volé des vivres chez les ${famille}`,
      });
    }
    if (this.politique.reparation) {
      const rendu = Math.min(this.foyers[v.foyer].nourriture, q * 2);
      this.foyers[v.foyer].nourriture -= rendu;
      this.foyers[maisonId].nourriture += rendu;
    }
    const chef = victimes.filter((o) => o.age >= 17).sort((x, y) => y.age - x.age)[0];
    if (chef) this.ouvrirConflit(v, chef, 'des vivres volés', 'vol');
    this.log(`${nomComplet(v)} a été surpris${v.genre === 'F' ? 'e' : ''} en train de prendre des vivres chez les ${famille}.`, 'mal', [v.id]);
  }

  soignerPatients(soignant) {
    for (const p of this.habitants) {
      if (p === soignant || p.activite?.action !== 'se_soigner' || !p.interieur || p.batiment !== 'dispensaire') continue;
      if (p.malade && this.res.remedes >= 1) {
        this.ajouter('remedes', -1);
        p.malade = false;
        p.besoins.sante = clamp(p.besoins.sante + 30, 0, 100);
        changerAffinite(p, soignant, 12);
        soignant.besoins.estime = clamp(soignant.besoins.estime + 10, 0, 100);
        memoriser(p, this.temps, { type: 'soin', texte: `${soignant.prenom} m'a soigné${p.genre === 'F' ? 'e' : ''}.`, valence: 0.8, importance: 0.65, sujet: soignant.id, resume: `${soignant.prenom} a soigné ${p.prenom}` });
        this.log(`${nomComplet(soignant)} a soigné ${nomComplet(p)}.`, 'bien', [p.id, soignant.id]);
      } else if (!p.malade) p.besoins.sante = clamp(p.besoins.sante + 0.5, 0, 100);
    }
  }

  terminerActivite(v) {
    const r = conclureEpisode(this, v);
    if (!r) return;
    if ((v.esprit.essais[r.a] || 0) === 1 && !['dormir', 'manger', 'rester'].includes(r.a)) {
      memoriser(v, this.temps, {
        type: 'decouverte', texte: `J'ai essayé pour la première fois : ${ACTIONS[r.a].etat.toLowerCase()}. ${r.ressenti > 2 ? "Ça m'a fait du bien." : r.ressenti < -2 ? 'Pas pour moi.' : 'Rien de spécial.'}`,
        valence: clamp(r.ressenti / 10, -1, 1), importance: 0.35,
      });
    }
    if (!this.premieresFois[r.a]) {
      this.premieresFois[r.a] = { id: v.id, t: this.temps };
      this.stats.decouvertes.push({ a: r.a, id: v.id, t: this.temps });
    }
    if (ACTIONS[r.a].travail && Math.abs(r.ressenti) > 8) {
      memoriser(v, this.temps, { type: 'experience', texte: `${ACTIONS[r.a].etat} ${r.ressenti > 0 ? 'm’a vraiment réussi' : 'ne m’a rien apporté'}.`, valence: clamp(r.ressenti / 15, -1, 1), importance: 0.4 });
    }
  }

  // ---------- Rencontres ----------
  chercherInterlocuteur(v) {
    const rng = this.rng;
    let total = 0;
    const cands = [];
    for (const o of this.habitants) {
      if (o === v || o.interieur || o.conversation || o.path) continue;
      if (Math.hypot(o.x - v.x, o.z - v.z) > 7) continue;
      if (['dormir', 'chaparder'].includes(o.activite?.action)) continue;
      const r = relation(v, o.id);
      const w = Math.max(0.05, 1 + r.aff / 40 + r.fam / 50);
      cands.push([o, w]);
      total += w;
    }
    if (!cands.length) return;
    let x = rng.next() * total, o = cands[0][0];
    for (const [c, w] of cands) { x -= w; if (x <= 0) { o = c; break; } }
    // l'autre accepte-t-il ? (selon son propre besoin et ce qu'il attend de nous)
    const ro = relation(o, v.id);
    if (rng.next() > 0.25 + 0.4 * du(o.besoins.social) + ro.aff / 200) return;
    // une rancune forte peut transformer la rencontre en règlement de comptes
    const g = v.esprit.griefs[o.id] || 0;
    // … selon ce que les précédents règlements de comptes lui ont appris
    if (g > 0.3 && rng.chance(g * v.traits.temperament * (attente(this, v, 'confronter', 0.25) > 0 ? 1 : 0.15))) { this.confrontation(v, o); return; }
    this.commencerConversation(v, o, 'rencontre');
  }

  commencerConversation(v, o, origine) {
    const conv = {
      a: v.id, b: o.id, debut: this.temps, fin: this.temps + this.rng.range(10, 30),
      sujet: this.rng.pick(SUJETS), dispute: false, fini: false, lieu: v.activite?.nomLieu || 'dehors', origine,
    };
    v.conversation = o.conversation = conv;
    v.dir = Math.atan2(o.x - v.x, o.z - v.z);
    o.dir = Math.atan2(v.x - o.x, v.z - o.z);
  }

  // Issue d'une conversation : chacun ressent la compagnie de l'autre selon son humeur
  // réelle, ce qu'il lui reproche et ce qu'ils partagent. L'opinion se construit ainsi.
  conclureConversation(c) {
    const rng = this.rng;
    c.fini = true;
    const a = this.habitant(c.a), b = this.habitant(c.b);
    a.conversation = b.conversation = null;
    if (c.dispute || c.excuse) return;
    this.stats.conversations++;
    a.stats.conversations++; b.stats.conversations++;
    const ressenti = (x, y) => {
      const humeurAutre = (y.besoins.serenite - 50) / 100 + (y.moral - 50) / 150;
      const proche = 0.3 * (1 - Math.abs(x.traits.sociabilite - y.traits.sociabilite)) + 0.2 * (1 - Math.abs(x.traits.piete - y.traits.piete)) - 0.25;
      return humeurAutre + proche - 1.2 * (x.esprit.griefs[y.id] || 0) - 0.6 * (y.esprit.griefs[x.id] || 0) * y.traits.temperament + rng.range(-0.35, 0.35);
    };
    for (const [x, y] of [[a, b], [b, a]]) {
      const val = ressenti(x, y);
      const r = relation(x, y.id);
      r.fam = clamp(r.fam + 3, 0, 100);
      const alpha = r.fam < 30 ? 0.25 : 0.1;
      r.aff = clamp(r.aff + alpha * (100 * val - r.aff) + val * 3, -100, 100);
      x.besoins.serenite = clamp(x.besoins.serenite + 4 * val, 0, 100);
      if (Math.abs(val) > 0.45) {
        memoriser(x, this.temps, {
          type: 'conversation', texte: val > 0 ? `Belle discussion avec ${y.prenom} sur ${c.sujet}.` : `Discussion pénible avec ${y.prenom}.`,
          valence: clamp(val, -1, 1) * 0.6, importance: 0.25 + Math.abs(val) * 0.2, sujet: y.id,
        });
      }
    }
    if (Math.min(relation(a, b.id).aff, relation(b, a.id).aff) > -10) {
      // on se raconte ce qu'on a appris…
      if (rng.chance(0.4) && transmettre(this, a, b)) this.stats.transmissions++;
      if (rng.chance(0.4) && transmettre(this, b, a)) this.stats.transmissions++;
      // … et ce qu'on a vu ou entendu des autres
      if (rng.chance(0.35)) this.commerage(rng.chance(0.5) ? a : b, rng.chance(0.5) ? b : a);
    }
  }

  commerage(orateur, auditeur) {
    if (orateur === auditeur) return;
    const cands = orateur.memoire.filter((m) => m.resume && m.importance > 0.3 && m.sujet !== auditeur.id && m.sujet !== null);
    if (!cands.length) return;
    const m = cands.sort((x, y) => y.importance - x.importance)[0];
    const credit = clamp(0.4 + relation(auditeur, orateur.id).aff / 150, 0.1, 1);
    memoriser(auditeur, this.temps, {
      type: 'rumeur', texte: `${orateur.prenom} m'a raconté que ${m.resume}.`,
      valence: m.valence * 0.7 * credit, importance: m.importance * 0.55 * credit, sujet: m.sujet, resume: m.resume,
    });
    if (m.sujet === 'conseil') auditeur.confiance = clamp(auditeur.confiance + m.valence * m.importance * 5 * credit, 0, 100);
    else if (typeof m.sujet === 'number' && m.sujet !== auditeur.id) changerAffinite(auditeur, this.habitant(m.sujet), m.valence * m.importance * 8 * credit);
  }

  // Demander des comptes : l'autre s'excuse… ou nie, et la dispute éclate.
  confrontation(a, b) {
    const rng = this.rng;
    this.stats.confrontations++;
    const motif = a.esprit.griefMotif?.[b.id] || 'un vieux différend';
    const coupable = (b.esprit.torts?.[a.id] || 0) > 0.2;
    const pExcuse = (coupable ? 0.3 + 0.5 * b.traits.generosite : 0.08) * (1 - 0.6 * b.traits.temperament) + Math.max(0, relation(b, a.id).aff) / 250;
    if (rng.chance(pExcuse)) {
      a.esprit.griefs[b.id] = (a.esprit.griefs[b.id] || 0) * 0.3;
      if (b.esprit.torts) b.esprit.torts[a.id] = (b.esprit.torts[a.id] || 0) * 0.4;
      changerAffinite(a, b, 10); changerAffinite(b, a, 6);
      a.besoins.serenite = clamp(a.besoins.serenite + 8, 0, 100);
      b.besoins.estime = clamp(b.besoins.estime - 4, 0, 100);
      b.stats.excuses++;
      this.stats.excuses++;
      memoriser(a, this.temps, { type: 'excuse', texte: `${b.prenom} s'est excusé${b.genre === 'F' ? 'e' : ''} pour ${motif}.`, valence: 0.6, importance: 0.6, sujet: b.id, resume: `${b.prenom} s'est excusé auprès de ${a.prenom}` });
      memoriser(b, this.temps, { type: 'excuse', texte: `J'ai présenté mes excuses à ${a.prenom}.`, valence: 0.2, importance: 0.45, sujet: a.id });
      this.log(`${nomComplet(a)} demande des comptes à ${nomComplet(b)} (${motif}) — ${b.prenom} s'excuse.`, 'bien', [a.id, b.id]);
      const conv = { a: a.id, b: b.id, debut: this.temps, fin: this.temps + 6, dispute: false, excuse: true, fini: false, sujet: motif };
      a.conversation = b.conversation = conv;
      return;
    }
    // la dispute éclate
    a.stats.disputes++; b.stats.disputes++;
    this.stats.disputes++;
    const conv = { a: a.id, b: b.id, debut: this.temps, fin: this.temps + 10, dispute: true, fini: false, sujet: motif };
    a.conversation = b.conversation = conv;
    for (const [x, y] of [[a, b], [b, a]]) {
      x.besoins.serenite = clamp(x.besoins.serenite - 12, 0, 100);
      changerAffinite(x, y, -rng.range(10, 18));
    }
    b.esprit.griefs[a.id] = clamp((b.esprit.griefs[a.id] || 0) + (coupable ? 0.15 : 0.35), 0, 1);
    (b.esprit.griefMotif ||= {})[a.id] = coupable ? 'une scène en public' : "m'avoir accusé à tort";
    a.esprit.griefs[b.id] = clamp((a.esprit.griefs[b.id] || 0) + 0.1, 0, 1);
    memoriser(a, this.temps, { type: 'dispute', texte: `Dispute avec ${b.prenom} à propos de ${motif}. ${b.genre === 'F' ? 'Elle' : 'Il'} n'a rien voulu reconnaître.`, valence: -0.8, importance: 0.75, sujet: b.id, resume: `${a.prenom} et ${b.prenom} se sont disputés (${motif})` });
    memoriser(b, this.temps, { type: 'dispute', texte: coupable ? `${a.prenom} m'a fait une scène à propos de ${motif}.` : `${a.prenom} m'a accusé${b.genre === 'F' ? 'e' : ''} à tort (${motif}).`, valence: -0.8, importance: 0.75, sujet: a.id, resume: `${a.prenom} et ${b.prenom} se sont disputés (${motif})` });
    for (const o of this.habitants) {
      if (o === a || o === b || o.interieur || Math.hypot(o.x - a.x, o.z - a.z) > 12) continue;
      memoriser(o, this.temps, { type: 'temoin', texte: `J'ai vu ${a.prenom} et ${b.prenom} se disputer.`, valence: -0.2, importance: 0.35, sujet: a.id, resume: `${a.prenom} et ${b.prenom} se sont disputés` });
    }
    this.plainte('disputes', a);
    this.plainte('disputes', b);
    this.ouvrirConflit(a, b, motif, 'dispute');
    this.log(`Dispute entre ${nomComplet(a)} et ${nomComplet(b)} à propos de ${motif}.`, 'mal', [a.id, b.id]);
  }

  ouvrirConflit(a, b, motif, type) {
    const existe = this.conflits.find((k) => !k.resolu && ((k.a === a.id && k.b === b.id) || (k.a === b.id && k.b === a.id)));
    if (existe) { existe.motif = motif; return existe; }
    const c = { id: this.nextConflitId++, a: a.id, b: b.id, motif, type, t: this.temps, gravite: 1, resolu: false, lieu: a.activite?.nomLieu };
    this.conflits.push(c);
    if (!this.enPrehistoire) this.emit('conflit', c);
    return c;
  }

  // La gravité n'est pas un compteur : c'est la rancune réelle des deux parties.
  majConflits() {
    for (const c of this.conflits) {
      if (c.resolu) continue;
      const a = this.habitant(c.a), b = this.habitant(c.b);
      const g = Math.max(a.esprit.griefs[b.id] || 0, b.esprit.griefs[a.id] || 0);
      c.gravite = g > 0.65 ? 3 : g > 0.35 ? 2 : 1;
      if (g < 0.08) {
        c.resolu = true;
        c.issue = 'spontane';
        this.log(`${a.prenom} et ${b.prenom} ont fini par tourner la page d'eux-mêmes.`, 'bien', [a.id, b.id]);
      }
    }
  }

  // ---------- Rythmes ----------
  horaire() {
    const h = Math.round(this.heure()) % 24;
    if (h === 6) this.meteoDuJour();
    if (this.navire && this.temps >= this.navire) { this.navire = 0; this.log('Le navire marchand a repris la mer.', 'evenement'); this.emit('navire', false); }
    if (this.assemblee && this.temps > this.assemblee.expire) this.assembleeSansDecision();
    if (h === 18 && !this.assemblee && !this.enPrehistoire) this.peutConvoquer();
    if (this.projet?.enAttente && this.peutPayer(PROJETS[this.projet.cle].cout)) this.demarrerProjet();
    if (this.fete && this.temps > this.fete.fin) this.fete = null;
    if (this.bonus.reposMer && this.temps > (this.normes.pecher || 0)) this.bonus.reposMer = false;
    if (h === 22) this.soiree();
    // ce que fait réellement le village à chaque heure
    const r = this.stats.routine[h];
    for (const v of this.habitants) { const k = v.activite?.type || 'rien'; r[k] = (r[k] || 0) + 1; }
    this.majConflits();
    this.emit('heure', h);
  }

  // Le soir : chacun fait le point. Quelques-uns réfléchissent vraiment (Claude, si disponible).
  soiree() {
    const intenses = [];
    for (const v of this.habitants) {
      if (v.age < 12) continue;
      const jour = v.memoire.filter((m) => this.temps - m.t < MIN_JOUR).reduce((s, m) => s + Math.abs(m.valence) * m.importance, 0);
      intenses.push([v, jour]);
      this.planifier(v);
    }
    intenses.sort((x, y) => y[1] - x[1]);
    const ids = intenses.slice(0, 3).filter(([, s]) => s > 0.5).map(([v]) => v.id);
    if (ids.length) {
      if (this.listeners.reflexion?.length && !this.enPrehistoire) this.emit('reflexion', ids);
      else for (const id of ids) this.appliquerReflexion(id, this.reflexionLocale(this.habitant(id)), 'locale');
    }
    // en famille, les enfants héritent un peu de ce que savent les parents
    for (const v of this.habitants) {
      if (v.age >= 17) continue;
      for (const pid of v.famille) { const p = this.habitant(pid); if (p.age >= 20 && p.interieur && v.interieur) heriter(v, p); }
    }
  }

  // Prévoir le lendemain matin d'après sa propre expérience : ainsi naissent les habitudes.
  planifier(v) {
    const tbMatin = tranche(8);
    let best = null, bs = 0;
    for (const a of TRAVAUX) {
      if (!this.eligible(v, a)) continue;
      const p = predire(v.esprit, a, tbMatin);
      if (!p || p.n < 2) continue;
      const g = BESOINS.reduce((s, k) => s + p.d[k], 0) + p.ds * 1.5;
      if (g > bs) { bs = g; best = a; }
    }
    if (best && (!v.intention || v.intention.source === 'habitude' || this.temps > v.intention.jusqua)) {
      v.intention = { action: best, jusqua: this.temps + 16 * 60, raison: 'ce qui me réussit le mieux le matin', source: 'habitude' };
    }
  }

  // Réflexion sans modèle de langage : un résumé honnête de ses propres souvenirs.
  reflexionLocale(v) {
    const jour = v.memoire.filter((m) => this.temps - m.t < MIN_JOUR).sort((a, b) => Math.abs(b.valence) * b.importance - Math.abs(a.valence) * a.importance);
    const m = jour[0];
    const grief = Object.entries(v.esprit.griefs).sort((x, y) => y[1] - x[1])[0];
    const intention = grief && grief[1] > 0.4 ? { action: 'confronter', cible: this.habitant(Number(grief[0])).prenom, raison: 'je dois lui parler' } : null;
    return {
      pensee: m ? `Aujourd'hui, ce qui me reste : ${m.texte.charAt(0).toLowerCase()}${m.texte.slice(1)}` : 'Une journée sans histoire.',
      croyances: [],
      intention,
    };
  }

  appliquerReflexion(id, data, source) {
    const v = this.habitant(id);
    if (!v || !data || !data.pensee) return;
    v.reflexion = { texte: data.pensee, t: this.temps, source };
    memoriser(v, this.temps, { type: 'reflexion', texte: `En y repensant : ${data.pensee}`, valence: 0, importance: 0.5 });
    const parNom = (nom) => {
      if (!nom) return null;
      if (/conseil/i.test(nom)) return 'conseil';
      const n = nom.toLowerCase();
      return this.habitants.find((o) => n.includes(o.prenom.toLowerCase()))?.id ?? null;
    };
    for (const c of data.croyances || []) {
      const sujet = parNom(c.sujet);
      if (sujet === null || sujet === v.id) continue;
      const val = clamp(Number(c.valence) || 0, -1, 1);
      memoriser(v, this.temps, { type: 'conviction', texte: c.texte, valence: val, importance: 0.6, sujet });
      if (sujet === 'conseil') v.confiance = clamp(v.confiance + val * 4, 0, 100);
      else changerAffinite(v, this.habitant(sujet), val * 6);
    }
    const it = data.intention;
    if (it && ACTIONS[it.action]) {
      const cible = parNom(it.cible);
      v.intention = { action: it.action, cible: typeof cible === 'number' ? cible : null, jusqua: this.temps + 20 * 60, raison: it.raison || '', source };
      if (it.action === 'confronter' && typeof cible === 'number') v.esprit.griefs[cible] = Math.max(v.esprit.griefs[cible] || 0, 0.2);
    }
    if (!this.enPrehistoire && source === 'Claude') this.log(`${nomComplet(v)} a réfléchi à sa journée : « ${data.pensee} »`, 'info', [v.id]);
  }

  quotidien() {
    const rng = this.rng;
    const totalFoyers = this.nourritureFoyers();
    this.historique.push({ jour: this.jour - 1, moral: this.moyenne('moral'), confiance: this.moyenne('confiance'), nourriture: Math.round(this.res.nourriture + totalFoyers), reserve: Math.round(this.res.nourriture), poisson: this.monde.poisson, foret: this.monde.foret, disputes: this.stats.disputes, vols: this.stats.vols, aides: this.stats.aides, transmissions: this.stats.transmissions });
    if (this.historique.length > 80) this.historique.shift();
    const prod = Math.round(this.bilan.produit.nourriture || 0);
    this.log(`Bilan du jour ${this.jour - 1} : ${prod} rations produites, ${Math.round(totalFoyers)} dans les foyers, ${Math.round(this.res.nourriture)} à la réserve. Moral ${Math.round(this.moyenne('moral'))}, confiance ${Math.round(this.moyenne('confiance'))}.`, 'conseil');
    this.bilan = { produit: {}, consomme: {} };
    for (const k of Object.keys(this.plaintes)) {
      this.plaintes[k].n *= 0.7;
      for (const id of Object.keys(this.plaintes[k].porteurs)) this.plaintes[k].porteurs[id] *= 0.7;
    }
    for (const r of this.stats.routine) for (const k of Object.keys(r)) r[k] *= 0.85;

    for (const v of this.habitants) {
      estomperMemoire(v);
      const e = v.esprit;
      // les rancunes s'effacent… lentement chez les colériques
      const oubli = 0.88 + 0.1 * v.traits.temperament;
      for (const id of Object.keys(e.griefs)) { e.griefs[id] *= oubli; if (e.griefs[id] < 0.03) delete e.griefs[id]; }
      for (const id of Object.keys(e.torts || {})) e.torts[id] *= 0.9;
      for (const a of Object.keys(e.travailRecent)) e.travailRecent[a] *= 0.7;
      e.pechesJetee = 0;
      v.confiance += (50 - v.confiance) * 0.01;
      this.majMetier(v);
      if (!v.malade && rng.chance(risqueMaladie(v, this.bonus))) {
        v.malade = true;
        v.besoins.sante = Math.min(v.besoins.sante, 55);
        memoriser(v, this.temps, { type: 'maladie', texte: `Je suis tombé${v.genre === 'F' ? 'e' : ''} malade.`, valence: -0.5, importance: 0.5, resume: `${v.prenom} est malade`, sujet: v.id });
        this.log(`${nomComplet(v)} est tombé${v.genre === 'F' ? 'e' : ''} malade.`, 'mal', [v.id]);
      }
      if (rng.chance(1 / 365)) v.age++;
    }
    this.conflits = this.conflits.filter((c) => !c.resolu || this.temps - c.t < 6 * MIN_JOUR);
    this.emit('jour', this.jour);
  }

  meteoDuJour() {
    const rng = this.rng;
    if (rng.chance(0.08)) {
      this.meteo.tempete = this.temps + rng.range(6, 14) * 60;
      this.log('Une tempête se lève sur la Méditerranée.', 'evenement');
      this.emit('meteo', 'tempete');
    } else if (rng.chance(0.07)) {
      this.meteo.secheresse = this.temps + MIN_JOUR * 2;
      this.log('Vague de chaleur : les champs souffrent.', 'evenement');
    } else if (rng.chance(0.1)) {
      this.meteo.bonnePeche = this.temps + 12 * 60;
      this.log('Les bancs de sardines s’approchent des côtes.', 'evenement');
    }
    if (!this.navire && !this.enPrehistoire && rng.chance(this.temps - (this.arrivee ?? 0) < MIN_JOUR ? 1 : 0.18)) {
      this.navire = this.temps + 11 * 60;
      this.log('Un navire marchand accoste au port jusqu’au soir. Le conseil peut commercer.', 'evenement');
      this.emit('navire', true);
    }
  }

  // ---------- Assemblée : convoquée quand les habitants ont quelque chose à dire ----------
  adultes() { return this.habitants.filter((v) => v.age >= 17); }

  peutConvoquer() {
    let theme = null, max = 0;
    for (const [k, p] of Object.entries(this.plaintes)) {
      if (this.temps - (this.themesRecents?.[k] ?? -1e9) < 3 * MIN_JOUR) continue; // on laisse sa chance à la dernière décision
      const porteurs = Object.values(p.porteurs).filter((x) => x > 0.5).length;
      if (p.n >= 6 && porteurs >= 3 && p.n > max) { max = p.n; theme = k; }
    }
    if (!theme) return;
    const p = this.plaintes[theme];
    const porteurId = Number(Object.entries(p.porteurs).sort((x, y) => y[1] - x[1])[0][0]);
    const nb = Object.values(p.porteurs).filter((x) => x > 0.5).length;
    delete this.plaintes[theme];
    const T = THEMES[theme];
    const prefs = {};
    const votes = Object.fromEntries(T.options.map((o) => [o.id, 0]));
    for (const v of this.adultes()) {
      let best = null, bs = -Infinity;
      for (const o of T.options) {
        const s = this.evaluerOption(v, theme, o.id) + this.rng.range(-0.08, 0.08);
        if (s > bs) { bs = s; best = o.id; }
      }
      prefs[v.id] = best;
      votes[best]++;
    }
    const porteur = this.habitant(porteurId);
    this.assemblee = {
      theme, porteur: porteurId, prefs, votes, t: this.temps, expire: this.temps + MIN_JOUR,
      prop: { id: theme, titre: T.titre, contexte: `Question portée par ${nomComplet(porteur)}, au nom de ${nb} habitants qui l'ont vécu.`, options: T.options },
    };
    this.log(`${nomComplet(porteur)} réunit l'assemblée : « ${T.titre} »`, 'conseil', [porteurId]);
    this.emit('assemblee', this.assemblee);
  }

  // Chacun juge une option à partir de ce qu'il a lui-même vécu.
  evaluerOption(v, theme, opt) {
    const t = v.traits, e = v.esprit;
    const sec = securite(this, v) / 100;
    const bloque = Math.min(1, e.bloquesJetee / 4);
    const pecheur = Math.min(1, (e.travailRecent.pecher || 0) / 6);
    const bucheron = Math.min(1, (e.travailRecent.bois || 0) / 6);
    const victime = v.memoire.some((m) => m.type === 'vol' && m.valence < 0 && m.sujet !== null) ? 1 : 0;
    const voleur = v.stats.vols > 0 ? 1 : 0;
    const disputes = Math.min(1, v.stats.disputes / 2);
    const s = {
      faim: { contribution: 0.3 * t.generosite + 0.3 * t.patience + 0.2 * sec, distribuer: 0.9 * (1 - sec) + 0.2 * Math.min(1, e.faimsSansRepas / 3), chacun: 0.7 * sec + 0.3 * (1 - t.generosite) - 0.4 * (1 - sec) },
      jetee: { rota: 0.7 * bloque + 0.2 * t.generosite, agrandir: 0.5 * bloque + 0.3 * t.patience, statu: 0.6 * pecheur * (1 - bloque) + 0.2 * t.temperament },
      mer: { repos: 0.4 * t.patience + 0.4 * (1 - this.monde.poisson) - 0.3 * pecheur * (1 - sec), moins: 0.3 * t.patience + 0.25, continuer: 0.5 * (1 - sec) + 0.4 * pecheur * (1 - t.patience) },
      foret: { repos: 0.5 * t.patience + 0.4 * (1 - this.monde.foret), continuer: 0.5 * bucheron + 0.3 * (1 - t.patience) },
      vol: { reparation: 0.7 * victime + 0.3 * t.temperament - 0.8 * voleur, entraide: 0.6 * (1 - sec) + 0.4 * t.generosite, surveillance: 0.4 * victime + 0.3 * t.patience },
      disputes: { anciens: 0.3 + 0.3 * t.patience + 0.2 * disputes, fete: 0.2 + 0.5 * t.sociabilite, rien: 0.2 + 0.4 * (1 - t.sociabilite) + 0.2 * t.temperament },
    };
    return s[theme]?.[opt] ?? 0;
  }

  assembleeSansDecision() {
    for (const v of this.adultes()) {
      v.confiance = clamp(v.confiance - 3, 0, 100);
      memoriser(v, this.temps, { type: 'assemblee', texte: `Le conseil n'a rien décidé sur : « ${this.assemblee.prop.titre} »`, valence: -0.4, importance: 0.4, sujet: 'conseil', resume: 'le conseil a laissé une question sans réponse' });
    }
    this.log("L'assemblée s'est dispersée sans décision du conseil.", 'mal');
    this.assemblee = null;
    this.emit('assemblee', null);
  }

  deciderAssemblee(optionId) {
    const as = this.assemblee;
    if (!as) return;
    const opt = as.prop.options.find((o) => o.id === optionId);
    const majorite = Object.entries(as.votes).sort((a, b) => b[1] - a[1])[0][0];
    const T = this.temps;
    switch (`${as.theme}:${optionId}`) {
      case 'faim:contribution': this.politique.contribution = true; break;
      case 'faim:distribuer': this.distribuerReserve(0.8, false); break;
      case 'jetee:rota': this.politique.rota = true; break;
      case 'jetee:agrandir': this.lancerProjet('jetee', true); break;
      case 'mer:repos': this.normes.pecher = T + 2 * MIN_JOUR; this.bonus.reposMer = true; break;
      case 'mer:moins': this.normes.moinsBarques = T + 3 * MIN_JOUR; break;
      case 'foret:repos': this.normes.bois = T + 3 * MIN_JOUR; break;
      case 'vol:reparation': this.politique.reparation = true; break;
      case 'vol:entraide': this.distribuerReserve(0.5, true); break;
      case 'vol:surveillance': this.politique.surveillance = true; break;
      case 'disputes:anciens': this.politique.anciens = true; break;
      case 'disputes:fete': {
        this.ajouter('nourriture', -Math.min(30, this.res.nourriture));
        const debut = T - (T % MIN_JOUR) + (this.heure() < 18 ? 18 * 60 : MIN_JOUR + 18 * 60);
        this.fete = { debut, fin: debut + 4 * 60 };
        this.log(`La fête aura lieu ${this.heure() < 18 ? 'ce soir' : 'demain soir'} sur la place. Viendra qui voudra.`, 'bien');
        break;
      }
    }
    for (const v of this.adultes()) {
      if (as.prefs[v.id] === optionId) {
        v.confiance = clamp(v.confiance + 4 + (optionId === majorite ? 1 : 0), 0, 100);
        memoriser(v, T, { type: 'assemblee', texte: `Le conseil a suivi mon avis : « ${opt.label} ».`, valence: 0.5, importance: 0.4, sujet: 'conseil', resume: 'le conseil a écouté le village' });
      } else {
        const fort = v.traits.temperament > 0.6 ? 2 : 0;
        v.confiance = clamp(v.confiance - 3 - fort - (optionId !== majorite ? 2 : 0), 0, 100);
        memoriser(v, T, { type: 'assemblee', texte: `Le conseil a choisi « ${opt.label} » contre mon avis.`, valence: -0.5, importance: 0.45 + fort * 0.1, sujet: 'conseil', resume: `le conseil a ignoré une partie du village${optionId !== majorite ? ', contre la majorité' : ''}` });
      }
    }
    (this.themesRecents ||= {})[as.theme] = T;
    this.historiqueAssemblees.push({ t: T, titre: as.prop.titre, choix: opt.label, majorite: optionId === majorite, votes: { ...as.votes }, porteur: as.porteur });
    this.log(`Décision du conseil : « ${opt.label} »${optionId === majorite ? ' — avec la majorité.' : ' — contre la majorité.'}`, 'conseil');
    this.assemblee = null;
    this.emit('assemblee', null);
  }

  distribuerReserve(part = 0.6, priorite = false) {
    const total = this.res.nourriture * part;
    if (total < 1) return { ok: false, raison: 'La réserve commune est presque vide.' };
    const maisons = this.batiments.filter((b) => b.type === 'maison');
    const besoin = maisons.map((b) => {
      const m = this.membresFoyer(b.id);
      const sec = Math.min(1, (this.foyers[b.id]?.nourriture ?? 0) / (m * 5));
      return [b.id, priorite ? m * (1 - sec) : m];
    });
    const somme = besoin.reduce((s, [, w]) => s + w, 0) || 1;
    this.ajouter('nourriture', -total);
    for (const [id, w] of besoin) {
      const q = (total * w) / somme;
      this.foyers[id].nourriture += q;
      for (const v of this.habitants) {
        if (v.foyer !== id || v.age < 12) continue;
        v.confiance = clamp(v.confiance + Math.min(6, (q / (this.membresFoyer(id) * 2)) * 4), 0, 100);
        if (q > 2) memoriser(v, this.temps, { type: 'aide_conseil', texte: `Le conseil a fait porter ${Math.round(q)} rations à notre maison.`, valence: 0.6, importance: 0.45, sujet: 'conseil', resume: 'le conseil a partagé la réserve entre les familles' });
      }
    }
    this.log(`Le conseil distribue ${Math.round(total)} rations de la réserve aux familles.`, 'conseil');
    return { ok: true, message: `${Math.round(total)} rations distribuées.` };
  }

  // ---------- Chantiers ----------
  peutPayer(cout) { return Object.entries(cout).every(([r, q]) => this.res[r] >= q); }

  siteProjet(cle) {
    if (cle === 'puits') return { x: 13, z: 24 };
    if (cle === 'jetee') return { x: 2, z: 61 };
    if (cle === 'ecole') return { ...this.batiment('ecole').door };
    const spot = FREE_HOUSE_SPOTS.find(([x, z]) => !this.batiments.some((b) => Math.hypot(b.x - x, b.z - z) < 5));
    return spot ? { x: spot[0], z: spot[1] } : null;
  }

  lancerProjet(cle, parAssemblee = false) {
    if (this.projet) return { ok: false, raison: 'Un chantier est déjà en cours.' };
    if (this.bonus[cle] && cle !== 'maison') return { ok: false, raison: 'Déjà construit.' };
    const site = this.siteProjet(cle);
    if (!site) return { ok: false, raison: 'Plus de terrain disponible.' };
    const def = PROJETS[cle];
    this.projet = { cle, nom: def.nom, progres: 0, travail: def.travail, site, enAttente: true, parAssemblee };
    this.log(`Le conseil ouvre le chantier « ${def.nom} ». Y travaillera qui voudra.`, 'conseil');
    if (this.peutPayer(def.cout)) this.demarrerProjet();
    else this.log(`Chantier « ${def.nom} » en attente de matériaux.`, 'info');
    this.emit('projet', this.projet);
    return { ok: true };
  }

  demarrerProjet() {
    const def = PROJETS[this.projet.cle];
    for (const [r, q] of Object.entries(def.cout)) this.ajouter(r, -q);
    this.projet.enAttente = false;
    this.log(`Le chantier « ${def.nom} » peut commencer.`, 'bien');
    this.emit('projet', this.projet);
  }

  terminerProjet() {
    const p = this.projet;
    this.projet = null;
    let bat = null;
    const batisseurs = this.habitants.filter((v) => (v.esprit.travailRecent.construire || 0) > 1);
    if (p.cle === 'maison') {
      const n = this.batiments.filter((b) => b.type === 'maison').length + 1;
      bat = makeBuilding(`maison-${n}`, 'maison', 'Nouvelle maison', p.site.x, p.site.z, 8, 7, Math.atan2(PLAZA.x - p.site.x, PLAZA.z - p.site.z), { etages: 1 });
      const foyers = {};
      for (const v of this.habitants) (foyers[v.foyer] ||= []).push(v);
      const plein = Object.values(foyers).sort((a, b) => b.length - a.length)[0];
      const partants = plein.filter((v) => v.age >= 17 && v.age < 35).slice(0, 2);
      if (!partants.length) partants.push(...plein.filter((v) => v.age >= 17).slice(-1));
      bat.famille = partants[0]?.nom;
      bat.nom = `Nouvelle maison ${partants[0]?.nom || ''}`.trim();
      const ancien = partants[0]?.foyer;
      this.foyers[bat.id] = { nourriture: 0 };
      if (ancien) { const q = this.foyers[ancien].nourriture / 3; this.foyers[ancien].nourriture -= q; this.foyers[bat.id].nourriture += q; }
      for (const v of partants) {
        v.foyer = bat.id;
        memoriser(v, this.temps, { type: 'maison', texte: 'J’ai emménagé dans la nouvelle maison.', valence: 0.9, importance: 0.85, sujet: 'conseil', resume: `${v.prenom} a reçu un nouveau logement` });
        v.confiance = clamp(v.confiance + 8, 0, 100);
      }
      this.cacheMembres = null;
    } else if (p.cle === 'puits') {
      bat = makeBuilding('puits', 'puits', 'Puits communal', p.site.x, p.site.z, 3, 3, 0);
    }
    this.bonus[p.cle] = true;
    if (bat) {
      bat.ajoute = true;
      this.batiments.push(bat);
      this.batimentsParId[bat.id] = bat;
      this.nav.blockBuilding(bat);
    }
    for (const v of batisseurs) {
      v.besoins.estime = clamp(v.besoins.estime + 15, 0, 100);
      memoriser(v, this.temps, { type: 'chantier', texte: `J'ai participé au chantier « ${p.nom} ».`, valence: 0.7, importance: 0.6, resume: `${v.prenom} a bâti « ${p.nom} »`, sujet: v.id });
    }
    this.log(`Chantier terminé : ${p.nom}, grâce à ${batisseurs.length} volontaire${batisseurs.length > 1 ? 's' : ''}. ${PROJETS[p.cle].effet}.`, 'bien');
    this.emit('construction', { cle: p.cle, batiment: bat });
    this.emit('projet', null);
  }

  // ---------- Actions du conseil (le joueur) ----------
  demanderTravail(id, action) {
    const v = this.habitant(id);
    if (!v) return;
    v.demande = action || null;
    if (!action) return;
    memoriser(v, this.temps, { type: 'demande', texte: `Le conseil m'a demandé de ${DEMANDES[action]}.`, valence: 0, importance: 0.4, sujet: 'conseil' });
    const avis = v.confiance >= 55 ? `${v.prenom} a confiance : la demande pèsera.` : v.confiance < 40 ? `${v.prenom} se méfie du conseil : la demande risque de le braquer.` : `${v.prenom} verra bien.`;
    this.log(`Le conseil demande à ${nomComplet(v)} de ${DEMANDES[action]}. ${avis}`, 'conseil', [v.id]);
  }

  aiderHabitant(id, type) {
    const v = this.habitant(id);
    if (!v) return { ok: false, raison: 'Habitant introuvable.' };
    if (type === 'nourriture') {
      if (this.res.nourriture < 4) return { ok: false, raison: 'La réserve commune est vide.' };
      this.ajouter('nourriture', -4);
      this.foyers[v.foyer].nourriture += 4;
      const besoin = 1 - securite(this, v) / 100;
      v.confiance = clamp(v.confiance + 2 + 6 * besoin, 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Le conseil nous a fait porter des vivres.', valence: 0.3 + 0.5 * besoin, importance: 0.3 + 0.4 * besoin, sujet: 'conseil', resume: `le conseil a aidé la famille ${v.nom}` });
    } else if (type === 'remedes') {
      if (this.res.remedes < 1) return { ok: false, raison: 'Plus de remèdes en réserve.' };
      this.ajouter('remedes', -1);
      const malade = v.malade;
      v.malade = false;
      v.besoins.sante = clamp(v.besoins.sante + 35, 0, 100);
      v.confiance = clamp(v.confiance + (malade ? 8 : 1), 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: malade ? 'Le conseil m’a fait soigner quand j’étais malade.' : 'Le conseil m’a apporté des remèdes.', valence: malade ? 0.8 : 0.2, importance: malade ? 0.8 : 0.3, sujet: 'conseil', resume: `le conseil a fait soigner ${v.prenom}` });
    } else if (type === 'repos') {
      if (v.reposJusqua > this.temps) return { ok: false, raison: `${v.prenom} est déjà au repos.` };
      v.reposJusqua = this.temps + MIN_JOUR;
      v.besoins.energie = clamp(v.besoins.energie + 15, 0, 100);
      v.besoins.serenite = clamp(v.besoins.serenite + 10, 0, 100);
      v.confiance = clamp(v.confiance + 3, 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Le conseil m’a accordé une journée de repos.', valence: 0.5, importance: 0.4, sujet: 'conseil' });
    } else if (type === 'ecouter') {
      const deja = v.dernierEcoute === this.jour;
      v.dernierEcoute = this.jour;
      v.besoins.social = clamp(v.besoins.social + (deja ? 4 : 15), 0, 100);
      v.besoins.estime = clamp(v.besoins.estime + (deja ? 1 : 8), 0, 100);
      if (deja) return { ok: true, message: `${v.prenom} vous a déjà parlé aujourd'hui.` };
      v.confiance = clamp(v.confiance + 4, 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Le conseil a pris le temps de m’écouter.', valence: 0.5, importance: 0.45, sujet: 'conseil', resume: `le conseil a écouté ${v.prenom}` });
    }
    this.log(`Le conseil vient en aide à ${nomComplet(v)}.`, 'conseil', [v.id]);
    return { ok: true, message: `${v.prenom} s'en souviendra.` };
  }

  // Le joueur parle à un habitant ; la réponse vient de Claude ou, à défaut, de son état.
  recevoirParole(id, message, reponse, source) {
    const v = this.habitant(id);
    const ressenti = clamp(Number(reponse.ressenti) || 0, -1, 1);
    v.besoins.social = clamp(v.besoins.social + 8, 0, 100);
    v.besoins.estime = clamp(v.besoins.estime + 3 + 4 * ressenti, 0, 100);
    v.confiance = clamp(v.confiance + ressenti * 5, 0, 100);
    memoriser(v, this.temps, { type: 'parole', texte: `Le conseil m'a dit : « ${message.slice(0, 140)} »`, valence: ressenti, importance: 0.55, sujet: 'conseil', resume: `le conseil est venu parler à ${v.prenom}` });
    if (reponse.intention && ACTIONS[reponse.intention.action]) this.appliquerReflexion(id, { pensee: reponse.texte, croyances: [], intention: reponse.intention }, source);
    (v.dialogue ||= []).push({ t: this.temps, de: 'conseil', texte: message }, { t: this.temps, de: v.prenom, texte: reponse.texte, source });
    if (v.dialogue.length > 20) v.dialogue.splice(0, v.dialogue.length - 20);
  }

  reponseLocale(v) {
    const c = v.confiance, b = v.besoins;
    const soucis = [];
    if (b.faim < 35 || (this.foyers[v.foyer]?.nourriture ?? 0) < 2) soucis.push('on manque de nourriture chez nous');
    if (v.malade) soucis.push('je suis malade');
    const g = Object.entries(v.esprit.griefs).sort((x, y) => y[1] - x[1])[0];
    if (g && g[1] > 0.3) soucis.push(`j'ai un différend avec ${this.habitant(Number(g[0])).prenom}`);
    const ton = c > 60 ? 'Merci de venir me voir.' : c < 35 ? 'Le conseil se souvient de nous quand ça l’arrange…' : 'Je vous écoute.';
    return { texte: `${ton} ${soucis.length ? `En ce moment, ${soucis.join(', ')}.` : 'Tout va à peu près bien pour moi.'}`, ressenti: c > 60 ? 0.3 : c < 35 ? -0.1 : 0.1 };
  }

  resoudreConflit(cid, option) {
    const c = this.conflits.find((k) => k.id === cid);
    if (!c || c.resolu) return { ok: false };
    const a = this.habitant(c.a), b = this.habitant(c.b);
    const mem = (v, texte, valence, importance, resume) => memoriser(v, this.temps, { type: 'conflit', texte, valence, importance, sujet: 'conseil', resume });
    let resultat;
    if (option === 'mediation') {
      const chance = 0.25 + (a.confiance + b.confiance) / 400 + 0.2 * ((a.traits.patience + b.traits.patience) / 2) + (this.politique.anciens ? 0.15 : 0) - 0.1 * (c.gravite - 1);
      if (!this.rng.chance(chance)) {
        for (const x of [a, b]) { x.confiance = clamp(x.confiance - 2, 0, 100); mem(x, 'La médiation du conseil n’a rien réglé.', -0.3, 0.45, 'la médiation du conseil a échoué'); }
        this.log(`La médiation entre ${a.prenom} et ${b.prenom} a échoué.`, 'mal', [a.id, b.id]);
        return { ok: true, reussi: false, message: 'La médiation a échoué. Les rancunes sont toujours là.' };
      }
      for (const [x, y] of [[a, b], [b, a]]) {
        x.esprit.griefs[y.id] = (x.esprit.griefs[y.id] || 0) * 0.1;
        changerAffinite(x, y, 20);
        x.confiance = clamp(x.confiance + 5, 0, 100);
        mem(x, `Grâce au conseil, je me suis réconcilié${x.genre === 'F' ? 'e' : ''} avec ${y.prenom}.`, 0.8, 0.7, `le conseil a réconcilié ${a.prenom} et ${b.prenom}`);
      }
      resultat = `Médiation réussie : ${a.prenom} et ${b.prenom} se réconcilient.`;
    } else if (option === 'a' || option === 'b') {
      const [g, p] = option === 'a' ? [a, b] : [b, a];
      g.confiance = clamp(g.confiance + 8, 0, 100);
      p.confiance = clamp(p.confiance - 12 - p.traits.temperament * 6, 0, 100);
      g.esprit.griefs[p.id] = (g.esprit.griefs[p.id] || 0) * 0.3;
      p.esprit.griefs[g.id] = clamp((p.esprit.griefs[g.id] || 0) + 0.2, 0, 1);
      g.besoins.estime = clamp(g.besoins.estime + 8, 0, 100);
      p.besoins.estime = clamp(p.besoins.estime - 10, 0, 100);
      mem(g, `Le conseil m'a donné raison face à ${p.prenom}.`, 0.7, 0.65, `le conseil a donné raison à ${g.prenom} contre ${p.prenom}`);
      mem(p, `Le conseil m'a donné tort face à ${g.prenom}. C'est injuste.`, -0.85, 0.85, `le conseil a donné tort à ${p.prenom}`);
      resultat = `Le conseil donne raison à ${g.prenom}.`;
    } else if (option === 'compensation') {
      if (this.res.pieces < 15) return { ok: false, raison: 'Il faut 15 pièces.' };
      this.ajouter('pieces', -15);
      for (const [x, y] of [[a, b], [b, a]]) {
        x.esprit.griefs[y.id] = (x.esprit.griefs[y.id] || 0) * 0.4;
        x.confiance = clamp(x.confiance + 3, 0, 100);
        mem(x, 'Le conseil a payé pour apaiser notre différend.', 0.3, 0.45, `le conseil a dédommagé ${a.prenom} et ${b.prenom}`);
      }
      resultat = 'Le conseil dédommage les deux parties.';
    } else {
      for (const x of [a, b]) { x.confiance = clamp(x.confiance - 4, 0, 100); mem(x, 'Le conseil a ignoré notre différend.', -0.5, 0.5, 'le conseil a ignoré un différend'); }
      resultat = `Le conseil laisse ${a.prenom} et ${b.prenom} régler leurs affaires.`;
    }
    c.resolu = true;
    c.issue = option;
    this.log(resultat, 'conseil', [a.id, b.id]);
    this.emit('conflit', c);
    return { ok: true, reussi: true, message: resultat };
  }

  commercer(operation) {
    if (!this.navire) return { ok: false, raison: 'Aucun navire au port.' };
    const ops = {
      vendreHuile: { donne: { huile: 10 }, recoit: { pieces: 32 }, texte: '10 jarres d’huile vendues pour 32 pièces' },
      acheterBois: { donne: { pieces: 25 }, recoit: { bois: 12 }, texte: '12 bois achetés pour 25 pièces' },
      acheterPierre: { donne: { pieces: 20 }, recoit: { pierre: 12 }, texte: '12 pierres achetées pour 20 pièces' },
      acheterRemedes: { donne: { pieces: 30 }, recoit: { remedes: 8 }, texte: '8 remèdes achetés pour 30 pièces' },
      acheterNourriture: { donne: { pieces: 30 }, recoit: { nourriture: 45 }, texte: '45 rations achetées pour 30 pièces' },
    };
    const op = ops[operation];
    if (!op) return { ok: false };
    if (!this.peutPayer(op.donne)) return { ok: false, raison: 'Ressources insuffisantes.' };
    for (const [r, q] of Object.entries(op.donne)) this.ajouter(r, -q);
    for (const [r, q] of Object.entries(op.recoit)) this.ajouter(r, q);
    this.log(`Commerce au port : ${op.texte}.`, 'conseil');
    return { ok: true, message: op.texte };
  }

  // ---------- Statistiques ----------
  moyenne(cle) { return this.habitants.reduce((s, v) => s + v[cle], 0) / this.habitants.length; }
  repartitionMetiers() {
    const r = {};
    for (const v of this.habitants) r[v.metier] = (r[v.metier] || 0) + 1;
    return r;
  }
  nourritureFoyers() { return Object.values(this.foyers).reduce((s, f) => s + f.nourriture, 0); }

  // ---------- Sauvegarde ----------
  serialiser() {
    const assemblee = this.assemblee ? { ...this.assemblee, prop: undefined } : null;
    return JSON.stringify({
      version: 2, seed: this.seed, rng: this.rng.state, temps: this.temps, joursPrehistoire: this.joursPrehistoire, arrivee: this.arrivee,
      journal: this.journal.slice(-200), conflits: this.conflits, nextConflitId: this.nextConflitId, res: this.res,
      monde: this.monde, foyers: this.foyers, politique: this.politique, normes: this.normes, bonus: this.bonus,
      projet: this.projet, assemblee, historiqueAssemblees: this.historiqueAssemblees, plaintes: this.plaintes,
      meteo: this.meteo, navire: this.navire, fete: this.fete, historique: this.historique, premieresFois: this.premieresFois,
      stats: this.stats, bilan: this.bilan, habitants: this.habitants, themesRecents: this.themesRecents,
      batimentsAjoutes: this.batiments.filter((b) => b.ajoute), noms: this.batiments.map((b) => [b.id, b.nom, b.famille]),
    }, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x));
  }

  static charger(json) {
    const d = JSON.parse(json);
    if (d.version !== 2) throw new Error('Sauvegarde d’une ancienne version');
    const sim = new Simulation({ seed: d.seed });
    sim.batiments = buildLayout();
    for (const b of d.batimentsAjoutes || []) sim.batiments.push(b);
    sim.batimentsParId = Object.fromEntries(sim.batiments.map((b) => [b.id, b]));
    for (const [id, nom, famille] of d.noms || []) if (sim.batimentsParId[id]) Object.assign(sim.batimentsParId[id], { nom, famille });
    sim.nav = new NavGrid(sim.batiments);
    for (const k of ['temps', 'arrivee', 'joursPrehistoire', 'journal', 'conflits', 'nextConflitId', 'res', 'monde', 'foyers', 'politique', 'normes', 'bonus', 'projet', 'historiqueAssemblees', 'plaintes', 'meteo', 'navire', 'fete', 'historique', 'premieresFois', 'stats', 'bilan', 'habitants', 'themesRecents']) {
      if (d[k] !== undefined) sim[k] = d[k];
    }
    sim.rng.state = d.rng;
    sim.derniereHeure = Math.floor(sim.temps / 60);
    if (d.assemblee) {
      const T = THEMES[d.assemblee.theme];
      sim.assemblee = T ? { ...d.assemblee, prop: { id: d.assemblee.theme, titre: T.titre, contexte: '', options: T.options } } : null;
    }
    const convs = new Map();
    for (const v of sim.habitants) {
      if (!v.conversation) continue;
      const key = `${v.conversation.a}-${v.conversation.b}-${v.conversation.debut}`;
      if (!convs.has(key)) convs.set(key, v.conversation);
      v.conversation = convs.get(key);
    }
    return sim;
  }
}
