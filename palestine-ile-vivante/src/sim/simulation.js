// Moteur de simulation de « Palestine — Île Vivante ».
// Indépendant du rendu : peut tourner dans Node pour les tests.

import { RNG, clamp } from './rng.js';
import {
  PRENOMS_H, PRENOMS_F, NOMS_FAMILLE, METIERS, METIERS_ADULTES, affiniteMetier,
  MOTIFS_DISPUTE, PROPOSITIONS, PROJETS,
} from './data.js';
import {
  creerHabitant, nomComplet, libelleMetier, relation, changerAffinite, memoriser,
  estomperMemoire, souvenirDe,
} from './villager.js';
import { NavGrid } from './navigation.js';
import { buildLayout, makeBuilding, ZONES, SOCIAL_SPOTS, randomPointInZone, FREE_HOUSE_SPOTS, PLAZA } from '../world/layout.js';

const MIN_JOUR = 1440;
const VITESSE_MARCHE = 1.45; // unités par minute de jeu

const SUJETS_CONVERSATION = [
  'la pêche du jour', 'la cueillette des olives', 'le temps qu’il fait', 'les enfants', 'les prix au marché',
  'la dernière décision du conseil', 'un vieux souvenir de jeunesse', 'la mer', 'une recette de maqlouba', 'le prochain mariage',
  'les nouvelles du port', 'la qualité de l’huile cette année',
];

const PLAGES_TRAVAIL = {
  normal: [[7, 12], [13, 17]],
  long: [[6.5, 12], [13, 18.5]],
  repos: [[7.5, 12], [14, 16.5]],
};
const PRIERES = [[5.3, 5.9], [12.6, 13.0], [16.0, 16.4], [18.6, 19.0], [20.2, 20.6]];

const RATIONS = {
  genereuse: { cout: 1.3, gain: 42, moral: 4 },
  normale: { cout: 1, gain: 35, moral: 0 },
  stricte: { cout: 0.7, gain: 26, moral: -6 },
};

export class Simulation {
  constructor({ seed = 2026 } = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.temps = 6 * 60; // jour 1, 6h00
    this.listeners = {};
    this.journal = [];
    this.conflits = [];
    this.nextConflitId = 1;
    this.res = { nourriture: 380, huile: 30, pierre: 55, bois: 40, pieces: 140, remedes: 18 };
    this.politique = { rythme: 'normal', rations: 'normale', elevesAuxChamps: false };
    this.bonus = { jetee: false, puits: false, ecole: false };
    this.projet = null;
    this.assemblee = null;
    this.historiqueAssemblees = [];
    this.propositionIndex = 0;
    this.meteo = { tempete: 0, secheresse: 0, bonnePeche: 0 };
    this.navire = 0; // fin de l'escale du navire marchand (0 = absent)
    this.fete = null;
    this.bilan = this.nouveauBilan();
    this.historique = [];
    this.derniereHeure = Math.floor(this.temps / 60);
  }

  // ---------- Événements pour l'interface ----------
  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type, data) {
    for (const fn of this.listeners[type] || []) fn(data);
  }
  log(texte, type = 'info', sujets = []) {
    const e = { t: this.temps, texte, type, sujets };
    this.journal.push(e);
    if (this.journal.length > 400) this.journal.shift();
    this.emit('journal', e);
  }

  get jour() {
    return Math.floor(this.temps / MIN_JOUR) + 1;
  }
  heure(t = this.temps) {
    return (t % MIN_JOUR) / 60;
  }
  horodatage(t = this.temps) {
    const h = Math.floor((t % MIN_JOUR) / 60), m = Math.floor(t % 60);
    return `Jour ${Math.floor(t / MIN_JOUR) + 1}, ${h}h${String(m).padStart(2, '0')}`;
  }
  habitant(id) {
    return this.habitants[id];
  }
  batiment(id) {
    return this.batimentsParId[id];
  }

  // ---------- Création du monde ----------
  init() {
    this.batiments = buildLayout();
    this.batimentsParId = Object.fromEntries(this.batiments.map((b) => [b.id, b]));
    this.nav = new NavGrid(this.batiments);
    this.genererPopulation();
    this.attribuerMetiersInitiaux();
    this.tisserRelations();
    for (const v of this.habitants) {
      const b = this.batiment(v.foyer);
      v.x = b.door.x;
      v.z = b.door.z;
    }
    this.log('Bienvenue sur l’île. Cinquante habitants comptent sur les décisions du conseil.', 'conseil');
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
    const usedPrenoms = new Set();
    const prenom = (g) => {
      const pool = g === 'F' ? PRENOMS_F : PRENOMS_H;
      for (let k = 0; k < 50; k++) {
        const p = rng.pick(pool);
        if (!usedPrenoms.has(p)) {
          usedPrenoms.add(p);
          return p;
        }
      }
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
        return v;
      };
      const modele = rng.pick(modeles[tailles[i]]);
      for (const role of modele) {
        if (role === 'couple') {
          const age = rng.int(26, 56);
          ajouter('H', age);
          ajouter('F', clamp(age + rng.int(-6, 3), 22, 60));
        } else if (role === 'adulte') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(30, 50));
        else if (role === 'jeune') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(17, 25));
        else if (role === 'enfant') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(3, 15));
        else if (role === 'ancien') ajouter(rng.chance(0.55) ? 'F' : 'H', rng.int(64, 82));
      }
      for (const v of membres) v.famille = membres.filter((o) => o !== v).map((o) => o.id);
    });
  }

  categorie(v) {
    if (v.age < 6) return 'enfant';
    if (v.age < 17) return 'eleve';
    if (v.age >= 64) return 'ancien';
    return 'adulte';
  }

  attribuerMetiersInitiaux() {
    const rng = this.rng;
    const adultes = [];
    for (const v of this.habitants) {
      const cat = this.categorie(v);
      if (cat !== 'adulte') {
        v.metier = cat;
        v.metierSouhaite = cat;
        continue;
      }
      // métier rêvé : meilleure affinité, avec une part de hasard
      let best = null, bs = -1;
      for (const m of METIERS_ADULTES) {
        if (m === 'imam' && v.genre === 'F') continue;
        const s = affiniteMetier(m, v.traits) + rng.range(0, 0.35);
        if (s > bs) { bs = s; best = m; }
      }
      v.metierSouhaite = best;
      adultes.push(v);
    }
    // besoins du village, proportionnels au nombre d'adultes
    const poids = { agriculteur: 9, pecheur: 5, oleiculteur: 5, marchand: 3, batisseur: 3, charpentier: 2, soignant: 2, enseignant: 2, artisan: 3, imam: 1 };
    const total = Object.values(poids).reduce((a, b) => a + b, 0);
    const quotas = {};
    let restant = adultes.length;
    for (const [m, p] of Object.entries(poids)) {
      quotas[m] = Math.max(1, Math.round((p / total) * adultes.length));
    }
    let somme = Object.values(quotas).reduce((a, b) => a + b, 0);
    while (somme > restant) { quotas.agriculteur--; somme--; }
    while (somme < restant) { quotas.agriculteur++; somme++; }

    // l'imam : l'homme le plus pieux de plus de 35 ans
    const imam = adultes.filter((v) => v.genre === 'H' && v.age > 35).sort((a, b) => b.traits.piete - a.traits.piete)[0];
    if (imam) { imam.metier = 'imam'; quotas.imam--; imam.metierSouhaite = 'imam'; }

    // attribution gloutonne : chacun obtient si possible son métier rêvé
    const libres = rng.shuffle(adultes.filter((v) => !v.metier));
    for (const v of libres) {
      if (quotas[v.metierSouhaite] > 0) { v.metier = v.metierSouhaite; quotas[v.metier]--; }
    }
    for (const v of libres) {
      if (v.metier) continue;
      let best = null, bs = -1;
      for (const [m, q] of Object.entries(quotas)) {
        if (q <= 0 || m === 'imam') continue;
        const s = affiniteMetier(m, v.traits);
        if (s > bs) { bs = s; best = m; }
      }
      v.metier = best || 'agriculteur';
      if (best) quotas[best]--;
    }
  }

  tisserRelations() {
    const rng = this.rng;
    for (const v of this.habitants) {
      for (const o of this.habitants) {
        if (o === v) continue;
        const r = relation(v, o.id);
        if (v.famille.includes(o.id)) {
          r.aff = rng.range(50, 85);
          r.fam = rng.range(85, 100);
        } else {
          const bv = this.batiment(v.foyer), bo = this.batiment(o.foyer);
          const voisins = Math.hypot(bv.x - bo.x, bv.z - bo.z) < 22;
          r.fam = voisins ? rng.range(30, 60) : rng.range(8, 35);
          r.aff = rng.range(-8, voisins ? 28 : 18);
        }
      }
    }
    // symétrie approximative
    for (const v of this.habitants) {
      for (const o of this.habitants) {
        if (o.id <= v.id) continue;
        const a = relation(v, o.id), b = relation(o, v.id);
        const m = (a.aff + b.aff) / 2, f = (a.fam + b.fam) / 2;
        a.aff = m + rng.range(-5, 5); b.aff = m + rng.range(-5, 5);
        a.fam = b.fam = f;
      }
    }
    // quelques vieilles rancunes et amitiés d'enfance
    const adultes = this.habitants.filter((v) => v.age >= 17);
    for (let k = 0; k < 4; k++) {
      const a = rng.pick(adultes), b = rng.pick(adultes);
      if (a === b || a.famille.includes(b.id)) continue;
      const motif = rng.pick(MOTIFS_DISPUTE.commun);
      for (const [x, y] of [[a, b], [b, a]]) {
        relation(x, y.id).aff = rng.range(-50, -30);
        memoriser(x, -MIN_JOUR * rng.int(30, 400), {
          type: 'rancune', texte: `Je n'ai jamais pardonné à ${y.prenom} ${y.nom} pour ${motif}.`,
          valence: -0.8, importance: 0.85, sujet: y.id, resume: `${x.prenom} et ${y.prenom} sont brouillés depuis longtemps`,
        });
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = rng.pick(adultes), b = rng.pick(adultes);
      if (a === b || a.famille.includes(b.id)) continue;
      for (const [x, y] of [[a, b], [b, a]]) {
        relation(x, y.id).aff = rng.range(55, 80);
        relation(x, y.id).fam = rng.range(70, 90);
        memoriser(x, -MIN_JOUR * rng.int(300, 3000), {
          type: 'amitie', texte: `${y.prenom} est mon ami${y.genre === 'F' ? 'e' : ''} d'enfance.`,
          valence: 0.8, importance: 0.9, sujet: y.id,
        });
      }
    }
  }

  // ---------- Boucle principale ----------
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
      this.horaire();
      if (Math.floor(this.temps / MIN_JOUR) !== Math.floor(avant / MIN_JOUR)) this.quotidien();
    }
    for (const v of this.habitants) this.majHabitant(v, dt);
  }

  majHabitant(v, dt) {
    this.majBesoins(v, dt);
    if (v.conversation) {
      const c = v.conversation;
      if (this.temps >= c.fin && !c.fini) this.conclureConversation(c);
      return;
    }
    if (v.path && v.path.length) {
      this.marcher(v, dt);
      return;
    }
    const a = v.activite;
    if (!a || this.temps >= a.fin || this.doitInterrompre(v, a)) {
      if (a) this.terminerActivite(v, a);
      this.decider(v);
      return;
    }
    this.agir(v, a, dt);
  }

  majBesoins(v, dt) {
    const b = v.besoins;
    const dort = v.activite?.type === 'dormir' && !v.path;
    const travaille = v.activite?.type === 'travailler' && !v.path;
    b.faim = clamp(b.faim - 0.058 * dt, 0, 100);
    if (dort) b.energie = clamp(b.energie + 0.14 * dt, 0, 100);
    else b.energie = clamp(b.energie - (travaille ? 0.075 : 0.052) * dt * (v.age > 64 ? 1.15 : 1), 0, 100);
    if (v.conversation) b.social = clamp(b.social + 0.55 * dt, 0, 100);
    else if (!dort) b.social = clamp(b.social - 0.034 * dt * (0.6 + v.traits.sociabilite * 0.8), 0, 100);
    if (v.malade) b.sante = clamp(b.sante - 0.02 * dt, 0, 100);
    else if (b.faim < 12 || b.energie < 8) b.sante = clamp(b.sante - 0.025 * dt, 0, 100);
    else b.sante = clamp(b.sante + 0.008 * dt, 0, 100);

    const cible = this.moralCible(v);
    v.moral += (cible - v.moral) * 0.004 * dt;
    v.boost *= Math.pow(0.9993, dt);
  }

  moralCible(v) {
    const b = v.besoins;
    let m = 0.22 * b.faim + 0.16 * b.energie + 0.2 * b.social + 0.2 * b.sante + 3;
    if (v.age >= 17 && v.age < 64 && v.metierSouhaite && v.metier !== v.metierSouhaite) m -= 7;
    else if (v.metier === v.metierSouhaite && v.age >= 17) m += 4;
    // famille et amis
    let fam = 0;
    for (const id of v.famille) fam += relation(v, id).aff;
    if (v.famille.length) m += (fam / v.famille.length) / 12;
    for (const c of this.conflits) if (!c.resolu && (c.a === v.id || c.b === v.id)) m -= 5 * c.gravite;
    m += RATIONS[this.politique.rations].moral;
    if (this.politique.rythme === 'long' && v.age >= 17) m -= 4;
    if (this.politique.rythme === 'repos') m += 3;
    if (this.bonus.puits) m += 2;
    if (this.meteo.tempete > this.temps) m -= 4;
    const maison = this.batiment(v.foyer);
    const occupants = this.habitants.filter((o) => o.foyer === v.foyer).length;
    if (occupants > 4 && maison) m -= (occupants - 4) * 3;
    m += v.boost;
    return clamp(m, 0, 100);
  }

  // ---------- Décisions individuelles (IA par utilité) ----------
  enHeuresDeTravail(v, h) {
    if (v.reposJusqua > this.temps) return false;
    const cat = this.categorie(v);
    if (v.metier === 'enfant') return false;
    if (v.metier === 'eleve') {
      if (h >= 8 && h < 13) return true;
      return this.politique.elevesAuxChamps && v.age >= 12 && h >= 14 && h < 17;
    }
    const plages = cat === 'ancien' ? [[8, 11.5]] : PLAGES_TRAVAIL[this.politique.rythme];
    if (v.metier === 'imam') return false; // l'imam suit les prières
    return plages.some(([a, b]) => h >= a && h < b);
  }
  finPlage(v, h) {
    if (v.metier === 'eleve') {
      if (h < 13) return 13;
      return 17;
    }
    const plages = this.categorie(v) === 'ancien' ? [[8, 11.5]] : PLAGES_TRAVAIL[this.politique.rythme];
    for (const [a, b] of plages) if (h >= a && h < b) return b;
    return h + 1;
  }

  decider(v) {
    const rng = this.rng;
    const h = this.heure();
    const b = v.besoins, t = v.traits;
    const cands = [];
    const add = (type, score, raison, extra = {}) => cands.push({ type, score: score + rng.range(0, 9), raison, ...extra });
    const nuit = h >= 21.75 + (v.age < 12 ? -1.5 : 0) || h < 5.75 + (t.ardeur < 0.4 ? 0.6 : 0);
    const tempete = this.meteo.tempete > this.temps;

    add('dormir', (nuit ? 100 : 0) + Math.max(0, 30 - b.energie) * 2.5, nuit ? 'il est tard, la maison dort' : 'je suis épuisé' + (v.genre === 'F' ? 'e' : ''));

    const repas = Math.abs(h - 7) < 0.75 || Math.abs(h - 12.5) < 0.75 || Math.abs(h - 19.5) < 1;
    const depuisRepas = this.temps - v.dernierRepas;
    if (depuisRepas > 150) add('manger', (100 - b.faim) * 1.05 + (repas ? 48 : 0), repas ? "c'est l'heure du repas" : "j'ai faim");

    if (v.malade || b.sante < 45) add('soigner', 88 + (45 - b.sante), 'je veux me faire soigner au dispensaire');

    if (this.enHeuresDeTravail(v, h)) {
      const score = 72 + 25 * t.ardeur - Math.max(0, 30 - b.energie);
      add(v.metier === 'eleve' && h < 13 ? 'ecole' : 'travailler', score, v.metier === 'eleve' && h < 13 ? "c'est l'heure de l'école" : 'la journée de travail');
    }

    if (!nuit) {
      const soir = h >= 17 && h < 21.5;
      const soc = (100 - b.social) * 0.5 * (0.6 + t.sociabilite) + (soir ? 30 : 6);
      add('socialiser', tempete ? soc * 0.2 : soc, 'envie de voir du monde');
      if (v.metier === 'enfant' || (v.metier === 'eleve' && !this.enHeuresDeTravail(v, h))) add('jouer', tempete ? 10 : 48, 'jouer avec les autres enfants');
      add('flaner', tempete ? 0 : t.curiosite * 32 + (v.moral < 40 ? 16 : 0) - 6, 'besoin de prendre l’air');
      add('rester', 16 + (h >= 19.5 ? 22 : 0) + (tempete ? 40 : 0), tempete ? "à l'abri de la tempête" : 'un moment en famille');
    }

    const priere = PRIERES.some(([a, bb]) => h >= a && h < bb);
    if (priere && (t.piete > 0.5 || v.metier === 'imam') && v.age >= 10) {
      add('prier', v.metier === 'imam' ? 140 : t.piete * 75, "c'est l'heure de la prière");
    }
    if (v.metier === 'imam' && !nuit && !priere) add('travailler', 34, 'veiller sur la mosquée');

    // Initiative d'entraide : rendre visite à un proche en difficulté
    if (!nuit && t.generosite > 0.55 && v.age >= 14 && rng.chance(0.25)) {
      let cible = null, best = 0;
      for (const o of this.habitants) {
        if (o === v) continue;
        const r = v.relations[o.id];
        if (!r || r.aff < 30) continue;
        const detresse = (o.malade ? 60 : 0) + Math.max(0, 30 - o.besoins.faim) + Math.max(0, 35 - o.moral);
        if (detresse > best) { best = detresse; cible = o; }
      }
      if (cible && best > 25) add('aider', 40 + t.generosite * 30, `aider ${cible.prenom}`, { cible: cible.id });
    }

    if (this.fete && this.temps >= this.fete.debut && this.temps < this.fete.fin) add('fete', 130, 'la fête sur la place !');

    cands.sort((a, bb) => bb.score - a.score);
    this.commencer(v, cands[0]);
  }

  doitInterrompre(v, a) {
    if (a.type !== 'dormir' && v.besoins.energie < 6) return true;
    if (a.type !== 'manger' && a.type !== 'dormir' && v.besoins.faim < 8 && this.temps - v.dernierRepas > 150) return true;
    if (this.fete && a.type !== 'fete' && a.type !== 'dormir' && this.temps >= this.fete.debut && this.temps < this.fete.fin) return this.rng.chance(0.02);
    return false;
  }

  lieuTravail(v) {
    const m = METIERS[v.metier];
    if (this.projet && !this.projet.enAttente && (v.metier === 'batisseur' || v.metier === 'charpentier')) {
      const p = this.projet.site;
      return { x: p.x + this.rng.range(-4, 4), z: p.z + this.rng.range(-4, 4), zone: 'chantier', nomLieu: 'le chantier' };
    }
    if (v.metier === 'eleve') {
      const pt = randomPointInZone(ZONES.champs, this.rng);
      return { ...pt, zone: 'champs', nomLieu: 'les champs' };
    }
    const lieu = m.lieu;
    if (this.batimentsParId[lieu]) {
      const bt = this.batiment(lieu);
      return { x: bt.door.x, z: bt.door.z, interieur: true, bat: bt.id, nomLieu: bt.nom.toLowerCase().startsWith('l') ? bt.nom : `le ${bt.nom.toLowerCase()}` };
    }
    let zoneKey = lieu;
    if (v.metier === 'pecheur' && this.meteo.tempete > this.temps) zoneKey = 'port';
    const z = ZONES[zoneKey];
    const pt = randomPointInZone(z, this.rng);
    return { ...pt, zone: zoneKey, nomLieu: z.nom };
  }

  commencer(v, c) {
    const rng = this.rng;
    const h = this.heure();
    const maison = this.batiment(v.foyer);
    const a = { type: c.type, raison: c.raison, debut: this.temps, fin: this.temps + 60, cible: c.cible };
    const chez = () => Object.assign(a, { x: maison.door.x, z: maison.door.z, interieur: true, bat: maison.id, nomLieu: 'la maison' });
    switch (c.type) {
      case 'dormir': {
        chez();
        const reveil = 6 * 60 + rng.range(-25, 30) - (v.traits.ardeur - 0.5) * 40;
        const t0 = this.temps % MIN_JOUR;
        a.fin = h >= 20 ? this.temps - t0 + MIN_JOUR + reveil : h < 6 ? this.temps - t0 + reveil : this.temps + 100;
        if (a.fin <= this.temps) a.fin = this.temps + 60;
        a.etat = 'Dort';
        break;
      }
      case 'manger': {
        const auMarche = h > 11.5 && h < 14 && ['marchand', 'pecheur', 'batisseur', 'artisan'].includes(v.metier) && rng.chance(0.6);
        if (auMarche) {
          const pt = randomPointInZone(ZONES.marche, rng);
          Object.assign(a, pt, { nomLieu: 'le marché', zone: 'marche' });
        } else chez();
        a.fin = this.temps + rng.range(30, 45);
        a.etat = auMarche ? 'Mange au marché' : 'Prend son repas';
        break;
      }
      case 'soigner': {
        const d = this.batiment('dispensaire');
        Object.assign(a, { x: d.door.x, z: d.door.z, interieur: true, bat: d.id, nomLieu: 'le dispensaire' });
        a.fin = this.temps + 60;
        a.etat = 'Au dispensaire';
        break;
      }
      case 'travailler': {
        Object.assign(a, this.lieuTravail(v));
        a.fin = this.temps + Math.max(20, (this.finPlage(v, h) - h) * 60);
        if (v.metier === 'imam') a.fin = this.temps + 50;
        a.prochainDeplacement = this.temps + rng.range(35, 80);
        a.etat = a.zone === 'chantier' ? 'Travaille sur le chantier' : v.metier === 'eleve' ? 'Aide aux champs' : METIERS[v.metier].action.replace(/^./, (x) => x.toUpperCase());
        break;
      }
      case 'ecole': {
        const e = this.batiment('ecole');
        Object.assign(a, { x: e.door.x, z: e.door.z, interieur: true, bat: e.id, nomLieu: "l'école" });
        a.fin = this.temps + (13 - h) * 60;
        a.etat = 'En classe';
        break;
      }
      case 'socialiser': {
        let spot = rng.pick(SOCIAL_SPOTS);
        if (v.metier === 'pecheur' && rng.chance(0.5)) spot = 'port';
        if (v.traits.piete > 0.7 && rng.chance(0.4)) spot = 'cour_mosquee';
        if (this.categorie(v) === 'ancien' && rng.chance(0.6)) spot = 'marche';
        // rejoindre un ami déjà dehors
        const amis = this.habitants.filter((o) => o !== v && !o.interieur && !o.path && (v.relations[o.id]?.aff ?? 0) > 30 && o.activite?.type === 'socialiser');
        if (amis.length && rng.chance(0.55)) {
          const ami = rng.pick(amis);
          Object.assign(a, { x: ami.x + rng.range(-1.5, 1.5), z: ami.z + rng.range(-1.5, 1.5), nomLieu: ami.activite.nomLieu, zone: ami.activite.zone });
          a.raison = `retrouver ${ami.prenom}`;
        } else {
          Object.assign(a, randomPointInZone(ZONES[spot], rng), { nomLieu: ZONES[spot].nom, zone: spot });
        }
        a.fin = this.temps + rng.range(40, 100);
        a.etat = 'Flâne et discute';
        break;
      }
      case 'jouer': {
        const zone = rng.chance(0.5) ? ZONES.cour_ecole : { x: maison.door.x, z: maison.door.z, r: 4 };
        Object.assign(a, randomPointInZone(zone, rng), { nomLieu: zone.nom || 'devant la maison', zone: 'jeu' });
        a.fin = this.temps + rng.range(40, 80);
        a.etat = 'Joue dehors';
        break;
      }
      case 'flaner': {
        const spot = rng.pick(['plage', 'source', 'belvedere', 'oliveraie', 'plage']);
        Object.assign(a, randomPointInZone(ZONES[spot], rng), { nomLieu: ZONES[spot].nom, zone: spot });
        a.fin = this.temps + rng.range(50, 110);
        a.etat = `Se promène vers ${ZONES[spot].nom}`;
        break;
      }
      case 'rester': {
        chez();
        a.fin = this.temps + rng.range(40, 90);
        a.etat = 'À la maison';
        break;
      }
      case 'prier': {
        const m = this.batiment('mosquee');
        Object.assign(a, { x: m.door.x, z: m.door.z, interieur: true, bat: m.id, nomLieu: 'la mosquée' });
        a.fin = this.temps + (v.metier === 'imam' ? 40 : 25);
        a.etat = 'Prie à la mosquée';
        break;
      }
      case 'aider': {
        const o = this.habitant(c.cible);
        Object.assign(a, { x: o.x + rng.range(-1, 1), z: o.z + rng.range(-1, 1), nomLieu: `chez ${o.prenom}` });
        a.fin = this.temps + 30;
        a.etat = `Rend visite à ${o.prenom}`;
        break;
      }
      case 'fete': {
        Object.assign(a, randomPointInZone(ZONES.marche, rng), { nomLieu: 'la place', zone: 'marche' });
        a.fin = Math.min(this.fete.fin, this.temps + 90);
        a.etat = 'Fait la fête sur la place';
        break;
      }
    }
    v.activite = a;
    this.allerVers(v, a.x, a.z);
  }

  allerVers(v, x, z) {
    if (v.interieur) {
      // sortir par la porte
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
      if (d <= pas) {
        v.x = p.x; v.z = p.z; pas -= d;
        v.path.shift();
      } else {
        v.x += (dx / d) * pas;
        v.z += (dz / d) * pas;
        v.dir = Math.atan2(dx, dz);
        pas = 0;
      }
    }
    if (!v.path.length) { v.path = null; this.arriver(v); }
  }

  arriver(v) {
    const a = v.activite;
    if (!a) return;
    a.arrive = this.temps;
    if (a.interieur) { v.interieur = true; v.batiment = a.bat; }
    if (a.type === 'aider') this.aideSpontanee(v, this.habitant(a.cible));
    if (a.type === 'soigner') a.fin = Math.max(a.fin, this.temps + 45);
  }

  agir(v, a, dt) {
    const rng = this.rng;
    if (a.type === 'travailler') this.produire(v, a, dt);
    if (a.type === 'manger' && !a.mange && this.temps - a.arrive > 10) this.repas(v, a);
    if (a.type === 'prier' && v.metier !== 'imam') v.boost = Math.min(v.boost + 0.02 * dt * v.traits.piete, 8);
    if (a.type === 'ecole') v.boost = Math.min(v.boost + 0.004 * dt, 5);
    if (a.type === 'fete') { v.besoins.social = clamp(v.besoins.social + 0.15 * dt, 0, 100); v.boost = Math.min(v.boost + 0.03 * dt, 12); }

    // déplacements pendant le travail en extérieur (vie dans les champs, sur la jetée…)
    if (a.type === 'travailler' && !a.interieur && a.prochainDeplacement && this.temps > a.prochainDeplacement) {
      const lieu = this.lieuTravail(v);
      if (!lieu.interieur) {
        a.x = lieu.x; a.z = lieu.z;
        a.prochainDeplacement = this.temps + rng.range(35, 80);
        this.allerVers(v, a.x, a.z);
        return;
      }
    }

    // rencontres
    if (!a.interieur) {
      const sociable = ['socialiser', 'flaner', 'fete', 'jouer', 'manger'].includes(a.type);
      const p = (sociable ? 0.035 : a.type === 'travailler' ? 0.006 : 0) * (0.5 + v.traits.sociabilite) * (1.3 - v.besoins.social / 100) * dt;
      if (p > 0 && rng.chance(p)) this.chercherInterlocuteur(v, sociable);
    }
  }

  terminerActivite(v, a) {
    if (a.type === 'soigner') this.soigner(v);
    if (a.type === 'manger' && !a.mange && a.arrive) this.repas(v, a);
  }

  // ---------- Économie ----------
  produire(v, a, dt) {
    const m = METIERS[v.metier];
    const eff = (0.55 + 0.45 * (v.besoins.energie / 100)) * (0.75 + 0.5 * v.traits.ardeur) * (0.7 + 0.6 * (v.moral / 100));
    const k = (eff * dt) / 60;
    if (a.zone === 'chantier' && this.projet && !this.projet.enAttente) {
      this.projet.progres += k * 1.2;
      if (this.projet.progres >= this.projet.travail) this.terminerProjet();
      return;
    }
    if (v.metier === 'eleve') {
      this.ajouter('nourriture', 0.8 * k);
      return;
    }
    if (v.metier === 'pecheur') {
      if (this.meteo.tempete > this.temps) return;
      let f = this.bonus.jetee ? 1.3 : 1;
      if (this.meteo.bonnePeche > this.temps) f *= 1.8;
      this.ajouter('nourriture', m.prod.nourriture * f * k);
      return;
    }
    if (v.metier === 'agriculteur') {
      const f = this.meteo.secheresse > this.temps ? (this.bonus.puits ? 0.85 : 0.5) : 1;
      this.ajouter('nourriture', m.prod.nourriture * f * k);
      return;
    }
    if (v.metier === 'marchand') {
      if (this.res.huile > 0.2) {
        this.res.huile -= 0.18 * k;
        this.ajouter('pieces', 1.1 * k);
      } else this.ajouter('pieces', 0.35 * k);
      return;
    }
    if (v.metier === 'enseignant') {
      for (const e of this.habitants) if (e.activite?.type === 'ecole' && e.interieur) e.boost = Math.min(e.boost + 0.01 * dt, 6);
      return;
    }
    if (v.metier === 'soignant') {
      this.ajouter('remedes', m.prod.remedes * k);
      return;
    }
    for (const [r, q] of Object.entries(m.prod)) this.ajouter(r, q * k);
  }

  ajouter(r, q) {
    this.res[r] = Math.max(0, (this.res[r] || 0) + q);
    if (q > 0) this.bilan.produit[r] = (this.bilan.produit[r] || 0) + q;
    else this.bilan.consomme[r] = (this.bilan.consomme[r] || 0) - q;
  }

  repas(v, a) {
    a.mange = true;
    const r = RATIONS[this.politique.rations];
    const cout = (v.age < 12 ? 0.6 : 1) * r.cout;
    v.dernierRepas = this.temps;
    if (this.res.nourriture >= cout) {
      this.ajouter('nourriture', -cout);
      v.besoins.faim = clamp(v.besoins.faim + r.gain, 0, 100);
    } else {
      v.besoins.faim = clamp(v.besoins.faim + 6, 0, 100);
      v.boost -= 4;
      memoriser(v, this.temps, {
        type: 'faim', texte: "Il n'y avait presque rien à manger ce jour-là.",
        valence: -0.6, importance: 0.55, sujet: 'conseil', resume: 'les familles manquent de nourriture',
      });
    }
  }

  soigner(v) {
    const soignant = this.habitants.find((o) => o.metier === 'soignant' && o.interieur && o.batiment === 'dispensaire');
    if (v.malade) {
      if (this.res.remedes >= 1 && (soignant || this.rng.chance(0.3))) {
        this.ajouter('remedes', -1);
        v.malade = false;
        v.besoins.sante = clamp(v.besoins.sante + 30, 0, 100);
        if (soignant) {
          changerAffinite(v, soignant, 10);
          memoriser(v, this.temps, { type: 'soin', texte: `${soignant.prenom} m'a soigné${v.genre === 'F' ? 'e' : ''} au dispensaire.`, valence: 0.7, importance: 0.6, sujet: soignant.id });
        }
        this.log(`${nomComplet(v)} est guéri${v.genre === 'F' ? 'e' : ''}${soignant ? ` grâce à ${soignant.prenom}` : ''}.`, 'bien', [v.id]);
      } else if (this.res.remedes < 1) {
        memoriser(v, this.temps, { type: 'soin', texte: "Le dispensaire n'avait plus de remèdes pour moi.", valence: -0.6, importance: 0.6, sujet: 'conseil', resume: 'le dispensaire manque de remèdes' });
      }
    } else {
      v.besoins.sante = clamp(v.besoins.sante + 15, 0, 100);
    }
  }

  // ---------- Vie sociale ----------
  chercherInterlocuteur(v, loisir) {
    const rng = this.rng;
    let total = 0;
    const cands = [];
    for (const o of this.habitants) {
      if (o === v || o.interieur || o.conversation || o.path) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d > 7) continue;
      if (!loisir && o.activite?.type !== 'travailler') continue;
      if (o.activite?.type === 'dormir') continue;
      const r = relation(v, o.id);
      let w = 1 + r.fam / 30 + Math.max(0, r.aff) / 22 + souvenirDe(v, o.id) * 2;
      if (r.aff < -25) w = 0.25 + 0.6 * v.traits.temperament;
      w = Math.max(0.05, w);
      cands.push([o, w]);
      total += w;
    }
    if (!cands.length) return;
    let x = rng.next() * total;
    let o = cands[0][0];
    for (const [c, w] of cands) { x -= w; if (x <= 0) { o = c; break; } }
    const conv = {
      a: v.id, b: o.id, debut: this.temps,
      fin: this.temps + (loisir ? rng.range(14, 35) : rng.range(5, 10)),
      sujet: rng.pick(SUJETS_CONVERSATION), dispute: false, fini: false, lieu: v.activite?.nomLieu || 'dehors',
    };
    v.conversation = o.conversation = conv;
    v.dir = Math.atan2(o.x - v.x, o.z - v.z);
    o.dir = Math.atan2(v.x - o.x, v.z - o.z);
  }

  conclureConversation(c) {
    const rng = this.rng;
    c.fini = true;
    const a = this.habitant(c.a), b = this.habitant(c.b);
    a.conversation = b.conversation = null;
    if (c.dispute) return;
    const ta = a.traits, tb = b.traits;
    const ra = relation(a, b.id), rb = relation(b, a.id);
    const compat = 1 - Math.abs(ta.sociabilite - tb.sociabilite) * 0.5 - Math.abs(ta.piete - tb.piete) * 0.3 - Math.abs(ta.curiosite - tb.curiosite) * 0.2;
    const souv = (souvenirDe(a, b.id) + souvenirDe(b, a.id)) / 2;
    const colere = (ta.temperament + tb.temperament) / 2;
    const q = 0.35 * compat + 0.35 * ((ra.aff + rb.aff) / 200) + 0.15 * ((a.moral + b.moral) / 200) + 0.15 * clamp(souv, -1, 1)
      + rng.range(-0.45, 0.45) - 0.24 * colere * (ra.aff < 0 ? 1.6 : 1) + 0.05;
    a.stats.conversations++; b.stats.conversations++;
    ra.fam = clamp(ra.fam + 2.5, 0, 100);
    rb.fam = clamp(rb.fam + 2.5, 0, 100);

    const dejaEnConflit = this.conflits.some((k) => !k.resolu && ((k.a === a.id && k.b === b.id) || (k.a === b.id && k.b === a.id)));
    const adultes = a.age >= 14 && b.age >= 14;
    const moralBas = (a.moral + b.moral) / 2 < 60;
    if (q < -0.05 && adultes && !dejaEnConflit && (colere > 0.45 || ra.aff < -10 || moralBas) && a.disputesJour === 0 && b.disputesJour === 0) {
      this.dispute(a, b);
      return;
    }
    if (q > 0.12) {
      const gain = 2 + q * 6;
      changerAffinite(a, b, gain);
      changerAffinite(b, a, gain);
      a.boost = Math.min(a.boost + 0.5, 6);
      b.boost = Math.min(b.boost + 0.5, 6);
      if (q > 0.45 || ra.fam < 30) {
        for (const [x, y] of [[a, b], [b, a]]) {
          memoriser(x, this.temps, {
            type: 'conversation', texte: `Belle discussion avec ${y.prenom} sur ${c.sujet}, à ${c.lieu}.`,
            valence: 0.4, importance: 0.25 + q * 0.2, sujet: y.id,
          });
        }
      }
      // bouche-à-oreille : on partage un souvenir marquant
      if (rng.chance(0.35)) this.commerage(rng.chance(0.5) ? a : b, rng.chance(0.5) ? b : a);
    } else if (q < -0.05) {
      changerAffinite(a, b, -2);
      changerAffinite(b, a, -2);
    }
  }

  commerage(orateur, auditeur) {
    if (orateur === auditeur) return;
    const candidats = orateur.memoire.filter((m) => m.resume && m.importance > 0.3 && m.sujet !== auditeur.id && m.sujet !== null);
    if (!candidats.length) return;
    const m = candidats.sort((x, y) => y.importance - x.importance)[0];
    const s = memoriser(auditeur, this.temps, {
      type: 'rumeur', texte: `${orateur.prenom} m'a raconté que ${m.resume}.`,
      valence: m.valence * 0.7, importance: m.importance * 0.55, sujet: m.sujet, resume: m.resume,
    });
    if (m.sujet === 'conseil') auditeur.confiance = clamp(auditeur.confiance + m.valence * m.importance * 4, 0, 100);
    else if (typeof m.sujet === 'number' && m.sujet !== auditeur.id) changerAffinite(auditeur, this.habitant(m.sujet), m.valence * m.importance * 7);
    return s;
  }

  dispute(a, b) {
    const rng = this.rng;
    const motifs = [...(MOTIFS_DISPUTE[a.metier] || []), ...(MOTIFS_DISPUTE[b.metier] || []), ...MOTIFS_DISPUTE.commun];
    const motif = rng.pick(motifs);
    a.disputesJour++; b.disputesJour++;
    a.stats.disputes++; b.stats.disputes++;
    const conv = { a: a.id, b: b.id, debut: this.temps, fin: this.temps + 10, dispute: true, fini: false, sujet: motif, lieu: a.activite?.nomLieu };
    a.conversation = b.conversation = conv;
    changerAffinite(a, b, -rng.range(12, 22));
    changerAffinite(b, a, -rng.range(12, 22));
    a.boost -= 6; b.boost -= 6;
    for (const [x, y] of [[a, b], [b, a]]) {
      memoriser(x, this.temps, {
        type: 'dispute', texte: `Je me suis disputé${x.genre === 'F' ? 'e' : ''} avec ${y.prenom} à propos de ${motif}.`,
        valence: -0.8, importance: 0.75, sujet: y.id, resume: `${x.prenom} et ${y.prenom} se sont disputés à propos de ${motif}`,
      });
    }
    const conflit = { id: this.nextConflitId++, a: a.id, b: b.id, motif, t: this.temps, gravite: 1, resolu: false, lieu: conv.lieu };
    this.conflits.push(conflit);
    this.log(`Dispute entre ${nomComplet(a)} et ${nomComplet(b)} à propos de ${motif}.`, 'mal', [a.id, b.id]);
    this.emit('conflit', conflit);
  }

  aideSpontanee(v, o) {
    if (!o) return;
    v.stats.aides++;
    if (o.malade) o.besoins.sante = clamp(o.besoins.sante + 8, 0, 100);
    if (o.besoins.faim < 35 && this.res.nourriture >= 1) { this.ajouter('nourriture', -1); o.besoins.faim = clamp(o.besoins.faim + 25, 0, 100); }
    o.besoins.social = clamp(o.besoins.social + 20, 0, 100);
    o.boost = Math.min(o.boost + 5, 12);
    changerAffinite(o, v, 9);
    changerAffinite(v, o, 4);
    memoriser(o, this.temps, {
      type: 'aide', texte: `${v.prenom} est venu${v.genre === 'F' ? 'e' : ''} me soutenir quand j'en avais besoin.`,
      valence: 0.85, importance: 0.7, sujet: v.id, resume: `${v.prenom} a aidé ${o.prenom} dans un moment difficile`,
    });
    memoriser(v, this.temps, { type: 'aide', texte: `J'ai rendu visite à ${o.prenom} pour l'aider.`, valence: 0.5, importance: 0.4, sujet: o.id });
    this.log(`${nomComplet(v)} est allé${v.genre === 'F' ? 'e' : ''} aider ${nomComplet(o)}.`, 'bien', [v.id, o.id]);
  }

  // ---------- Rythme horaire et quotidien ----------
  horaire() {
    const h = Math.round(this.heure());
    if (h === 6) this.meteoDuJour();
    if (this.navire && this.temps >= this.navire) {
      this.navire = 0;
      this.log('Le navire marchand a repris la mer.', 'evenement');
      this.emit('navire', false);
    }
    if (this.assemblee && this.temps > this.assemblee.expire) {
      for (const v of this.adultes()) {
        v.confiance = clamp(v.confiance - 3, 0, 100);
        memoriser(v, this.temps, { type: 'assemblee', texte: `Le conseil n'a pas tranché la question : « ${this.assemblee.prop.titre} »`, valence: -0.4, importance: 0.4, sujet: 'conseil', resume: "le conseil a laissé une question sans réponse" });
      }
      this.log("L'assemblée s'est dispersée sans décision du conseil.", 'mal');
      this.assemblee = null;
      this.emit('assemblee', null);
    }
    if (h === 18 && !this.assemblee && (this.jour === 1 || this.jour % 2 === 1)) this.convoquerAssemblee();
    if (this.projet?.enAttente && this.peutPayer(PROJETS[this.projet.cle].cout)) this.demarrerProjet();
    if (this.fete && this.temps > this.fete.fin) {
      this.fete = null;
    }
    this.emit('heure', h);
  }

  quotidien() {
    const rng = this.rng;
    // bilan de la veille
    const b = this.bilan;
    this.historique.push({ jour: this.jour - 1, moral: this.moyenne('moral'), confiance: this.moyenne('confiance'), nourriture: Math.round(this.res.nourriture), produit: b.produit, consomme: b.consomme });
    if (this.historique.length > 60) this.historique.shift();
    const prod = Math.round(b.produit.nourriture || 0), cons = Math.round(b.consomme.nourriture || 0);
    this.log(`Bilan du jour ${this.jour - 1} : nourriture +${prod} / −${cons}, moral moyen ${Math.round(this.moyenne('moral'))}, confiance ${Math.round(this.moyenne('confiance'))}.`, 'conseil');
    this.bilan = this.nouveauBilan();

    for (const v of this.habitants) {
      estomperMemoire(v);
      v.disputesJour = 0;
      v.confiance += (50 - v.confiance) * 0.02;
      // maladie
      const risque = 0.012 + (v.besoins.sante < 50 ? 0.03 : 0) + (v.age > 65 ? 0.015 : 0) - (this.bonus.puits ? 0.006 : 0);
      if (!v.malade && rng.chance(risque)) {
        v.malade = true;
        v.besoins.sante = Math.min(v.besoins.sante, 55);
        memoriser(v, this.temps, { type: 'maladie', texte: 'Je suis tombé' + (v.genre === 'F' ? 'e' : '') + ' malade.', valence: -0.5, importance: 0.5, resume: `${v.prenom} est malade` , sujet: v.id });
        this.log(`${nomComplet(v)} est tombé${v.genre === 'F' ? 'e' : ''} malade.`, 'mal', [v.id]);
        for (const id of v.famille) this.habitant(id).boost -= 3;
      }
      // anniversaires
      if (rng.chance(1 / 365)) v.age++;
    }
    // conflits non résolus : ils s'enveniment
    for (const c of this.conflits) {
      if (c.resolu) continue;
      const age = this.temps - c.t;
      if (age > MIN_JOUR && c.gravite < 3) {
        c.gravite++;
        const a = this.habitant(c.a), b = this.habitant(c.b);
        changerAffinite(a, b, -6);
        changerAffinite(b, a, -6);
        if (c.gravite === 3) {
          // les familles prennent parti
          for (const fa of a.famille) changerAffinite(this.habitant(fa), b, -8);
          for (const fb of b.famille) changerAffinite(this.habitant(fb), a, -8);
          this.log(`Le conflit entre ${a.prenom} et ${b.prenom} s'envenime : les familles ${a.nom} et ${b.nom} prennent parti.`, 'mal', [a.id, b.id]);
        }
      }
    }
    this.conflits = this.conflits.filter((c) => !c.resolu || this.temps - c.t < 5 * MIN_JOUR);
    this.emit('jour', this.jour);
  }

  meteoDuJour() {
    const rng = this.rng;
    if (rng.chance(0.08)) {
      this.meteo.tempete = this.temps + rng.range(6, 14) * 60;
      this.log('Une tempête se lève sur la Méditerranée : les bateaux restent au port.', 'evenement');
      for (const v of this.habitants) memoriser(v, this.temps, { type: 'evenement', texte: `La tempête du jour ${this.jour}.`, valence: -0.3, importance: 0.35 });
      this.emit('meteo', 'tempete');
    } else if (rng.chance(0.07)) {
      this.meteo.secheresse = this.temps + MIN_JOUR * 2;
      this.log(`Vague de chaleur : les champs souffrent${this.bonus.puits ? ', heureusement le puits aide à irriguer' : ''}.`, 'evenement');
      this.emit('meteo', 'chaleur');
    } else if (rng.chance(0.1)) {
      this.meteo.bonnePeche = this.temps + 12 * 60;
      this.log('Les bancs de sardines sont proches des côtes : journée de pêche exceptionnelle.', 'bien');
    }
    if (!this.navire && rng.chance(this.jour === 2 ? 1 : 0.18)) {
      this.navire = this.temps + 11 * 60;
      this.log('Un navire marchand accoste au port jusqu’au soir. Le conseil peut commercer.', 'evenement');
      this.emit('navire', true);
    }
  }

  // ---------- Assemblée du village ----------
  adultes() {
    return this.habitants.filter((v) => v.age >= 17);
  }

  convoquerAssemblee() {
    const prop = PROPOSITIONS[this.propositionIndex % PROPOSITIONS.length];
    this.propositionIndex++;
    const prefs = {};
    const votes = Object.fromEntries(prop.options.map((o) => [o.id, 0]));
    for (const v of this.adultes()) {
      let best = null, bs = -Infinity;
      for (const o of prop.options) {
        const s = o.attrait(v.traits) + this.rng.range(-0.12, 0.12);
        if (s > bs) { bs = s; best = o.id; }
      }
      prefs[v.id] = best;
      votes[best]++;
    }
    this.assemblee = { propId: prop.id, prop, prefs, votes, t: this.temps, expire: this.temps + MIN_JOUR };
    this.log(`Assemblée du village : « ${prop.titre} »`, 'conseil');
    this.emit('assemblee', this.assemblee);
  }

  deciderAssemblee(optionId) {
    const as = this.assemblee;
    if (!as) return;
    const prop = as.prop;
    const opt = prop.options.find((o) => o.id === optionId);
    const majorite = Object.entries(as.votes).sort((a, b) => b[1] - a[1])[0][0];
    const e = opt.effets;
    if (e.nourriture) this.ajouter('nourriture', e.nourriture);
    if (e.convertir) {
      const huile = Math.floor(this.res.huile * 0.7);
      this.ajouter('huile', -huile);
      this.ajouter('pieces', huile * e.convertir.pieces);
    }
    if (e.partHuile) {
      const part = Math.floor(this.res.huile * e.partHuile);
      this.ajouter('huile', -part);
    }
    if (e.politique) Object.assign(this.politique, e.politique);
    if (e.projet) this.lancerProjet(e.projet, true);
    if (e.fete) {
      const debut = this.temps - (this.temps % MIN_JOUR) + (this.heure() < 18 ? 18 * 60 : MIN_JOUR + 18 * 60);
      this.fete = { debut, fin: debut + 4 * 60 };
      this.log(`La fête aura lieu ${this.heure() < 18 ? 'ce soir' : 'demain soir'} sur la place.`, 'bien');
    }
    for (const v of this.adultes()) {
      if (e.moral) v.boost += e.moral;
      if (e.social) v.besoins.social = clamp(v.besoins.social + e.social * 0.3, 0, 100);
      const accord = as.prefs[v.id] === optionId;
      if (accord) {
        v.confiance = clamp(v.confiance + 4 + (optionId === majorite ? 1 : 0), 0, 100);
        memoriser(v, this.temps, {
          type: 'assemblee', texte: `Le conseil a suivi mon avis : « ${opt.label} ».`, valence: 0.5, importance: 0.4, sujet: 'conseil',
          resume: `le conseil a écouté le village sur ${prop.titre.toLowerCase().replace(/ \?$/, '')}`,
        });
      } else {
        const fort = v.traits.temperament > 0.6 ? 2 : 0;
        v.confiance = clamp(v.confiance - 3 - fort - (optionId !== majorite ? 2 : 0), 0, 100);
        memoriser(v, this.temps, {
          type: 'assemblee', texte: `Le conseil a choisi « ${opt.label} » contre mon avis.`, valence: -0.5, importance: 0.45 + fort * 0.1, sujet: 'conseil',
          resume: `le conseil a ignoré une partie du village${optionId !== majorite ? ', contre la majorité' : ''}`,
        });
      }
    }
    if (e.moral) for (const v of this.habitants) if (v.age < 17) v.boost += e.moral * 0.5;
    this.historiqueAssemblees.push({ t: this.temps, titre: prop.titre, choix: opt.label, majorite: optionId === majorite, votes: { ...as.votes } });
    this.log(`Décision du conseil : « ${opt.label} »${optionId === majorite ? ' — conforme à la majorité.' : ' — contre l’avis de la majorité.'}`, 'conseil');
    this.assemblee = null;
    this.emit('assemblee', null);
  }

  // ---------- Chantiers ----------
  peutPayer(cout) {
    return Object.entries(cout).every(([r, q]) => this.res[r] >= q);
  }

  siteProjet(cle) {
    if (cle === 'puits') return { x: 13, z: 24 };
    if (cle === 'jetee') return { x: 2, z: 61 };
    if (cle === 'ecole') return { ...this.batiment('ecole').door };
    const spot = FREE_HOUSE_SPOTS.find(([x, z]) => !this.batiments.some((b) => Math.hypot(b.x - x, b.z - z) < 5));
    return spot ? { x: spot[0], z: spot[1] } : null;
  }

  lancerProjet(cle, parAssemblee = false) {
    if (this.projet) return { ok: false, raison: 'Un chantier est déjà en cours.' };
    if (this.bonus[cle]) return { ok: false, raison: 'Déjà construit.' };
    const site = this.siteProjet(cle);
    if (!site) return { ok: false, raison: 'Plus de terrain disponible.' };
    const def = PROJETS[cle];
    this.projet = { cle, nom: def.nom, progres: 0, travail: def.travail, site, enAttente: true, parAssemblee };
    if (this.peutPayer(def.cout)) this.demarrerProjet();
    else this.log(`Chantier « ${def.nom} » en attente de matériaux.`, 'info');
    if (!parAssemblee) {
      // décision sans consulter le village : les impatients s'en accommodent, d'autres moins
      for (const v of this.adultes()) if (v.traits.patience < 0.35) v.confiance = clamp(v.confiance - 1, 0, 100);
    }
    this.emit('projet', this.projet);
    return { ok: true };
  }

  demarrerProjet() {
    const def = PROJETS[this.projet.cle];
    for (const [r, q] of Object.entries(def.cout)) this.ajouter(r, -q);
    this.projet.enAttente = false;
    this.log(`Le chantier « ${def.nom} » commence.`, 'bien');
    this.emit('projet', this.projet);
  }

  terminerProjet() {
    const p = this.projet;
    this.projet = null;
    let bat = null;
    if (p.cle === 'maison') {
      const n = this.batiments.filter((b) => b.type === 'maison').length + 1;
      const rot = Math.atan2(PLAZA.x - p.site.x, PLAZA.z - p.site.z);
      bat = makeBuilding(`maison-${n}`, 'maison', `Nouvelle maison`, p.site.x, p.site.z, 8, 7, rot, { etages: 1 });
      // la famille la plus à l'étroit y installe ses jeunes adultes
      const foyers = {};
      for (const v of this.habitants) (foyers[v.foyer] ||= []).push(v);
      const plein = Object.values(foyers).sort((a, b) => b.length - a.length)[0];
      const partants = plein.filter((v) => v.age >= 17 && v.age < 35).slice(0, 2);
      if (!partants.length) partants.push(...plein.filter((v) => v.age >= 17).slice(-1));
      bat.famille = partants[0]?.nom;
      bat.nom = `Nouvelle maison ${partants[0]?.nom || ''}`.trim();
      for (const v of partants) {
        v.foyer = bat.id;
        v.boost += 10;
        memoriser(v, this.temps, { type: 'maison', texte: 'J’ai emménagé dans la nouvelle maison construite par le village.', valence: 0.9, importance: 0.85, sujet: 'conseil', resume: `${v.prenom} a reçu un nouveau logement grâce au conseil` });
        v.confiance = clamp(v.confiance + 8, 0, 100);
      }
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
    for (const v of this.habitants) {
      v.boost += 4;
      memoriser(v, this.temps, { type: 'chantier', texte: `Le chantier « ${p.nom} » est terminé.`, valence: 0.5, importance: 0.45, sujet: 'conseil', resume: `le village a achevé le chantier « ${p.nom} »` });
    }
    this.log(`Chantier terminé : ${p.nom} ! ${PROJETS[p.cle].effet}.`, 'bien');
    this.emit('construction', { cle: p.cle, batiment: bat });
    this.emit('projet', null);
  }

  // ---------- Actions du joueur (le conseil) ----------
  assignerMetier(id, metier) {
    const v = this.habitant(id);
    if (!v || v.metier === metier) return;
    const ancien = v.metier;
    v.metier = metier;
    const lib = libelleMetier(v);
    if (metier === v.metierSouhaite) {
      v.boost += 10;
      v.confiance = clamp(v.confiance + 8, 0, 100);
      memoriser(v, this.temps, { type: 'metier', texte: `Le conseil m'a confié le métier dont je rêvais : ${lib.toLowerCase()}.`, valence: 0.9, importance: 0.8, sujet: 'conseil', resume: `le conseil a permis à ${v.prenom} de devenir ${lib.toLowerCase()}` });
    } else if (ancien === v.metierSouhaite) {
      v.boost -= 10;
      v.confiance = clamp(v.confiance - 10, 0, 100);
      memoriser(v, this.temps, { type: 'metier', texte: `Le conseil m'a retiré le métier que j'aimais pour faire ${lib.toLowerCase()}.`, valence: -0.85, importance: 0.8, sujet: 'conseil', resume: `le conseil a retiré son métier à ${v.prenom}` });
    } else {
      v.confiance = clamp(v.confiance - 1, 0, 100);
      memoriser(v, this.temps, { type: 'metier', texte: `Le conseil m'a demandé de devenir ${lib.toLowerCase()}.`, valence: -0.1, importance: 0.4, sujet: 'conseil' });
    }
    // interrompre l'activité en cours pour rejoindre le nouveau lieu
    if (v.activite?.type === 'travailler') v.activite.fin = this.temps;
    this.log(`${nomComplet(v)} devient ${lib.toLowerCase()}.`, 'conseil', [v.id]);
  }

  aiderHabitant(id, type) {
    const v = this.habitant(id);
    if (!v) return { ok: false, raison: 'Habitant introuvable.' };
    if (type === 'nourriture') {
      if (this.res.nourriture < 3) return { ok: false, raison: 'Pas assez de nourriture en réserve.' };
      this.ajouter('nourriture', -3);
      v.besoins.faim = clamp(v.besoins.faim + 40, 0, 100);
      v.boost += 4;
      v.confiance = clamp(v.confiance + 3, 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Le conseil m’a fait porter un panier de nourriture.', valence: 0.7, importance: 0.55, sujet: 'conseil', resume: `le conseil a aidé ${v.prenom} à se nourrir` });
    } else if (type === 'remedes') {
      if (this.res.remedes < 1) return { ok: false, raison: 'Plus de remèdes en réserve.' };
      this.ajouter('remedes', -1);
      const etaitMalade = v.malade;
      v.malade = false;
      v.besoins.sante = clamp(v.besoins.sante + 35, 0, 100);
      v.confiance = clamp(v.confiance + (etaitMalade ? 7 : 2), 0, 100);
      memoriser(v, this.temps, { type: 'aide_conseil', texte: etaitMalade ? 'Le conseil m’a fait soigner quand j’étais malade.' : 'Le conseil m’a apporté des remèdes.', valence: 0.8, importance: etaitMalade ? 0.8 : 0.4, sujet: 'conseil', resume: `le conseil a fait soigner ${v.prenom}` });
      for (const fid of v.famille) {
        const f = this.habitant(fid);
        f.confiance = clamp(f.confiance + 2, 0, 100);
        if (etaitMalade) memoriser(f, this.temps, { type: 'aide_conseil', texte: `Le conseil a fait soigner ${v.prenom}.`, valence: 0.6, importance: 0.45, sujet: 'conseil' });
      }
    } else if (type === 'repos') {
      if (v.reposJusqua > this.temps) return { ok: false, raison: `${v.prenom} est déjà en repos.` };
      v.reposJusqua = this.temps + MIN_JOUR;
      v.boost += 6;
      v.besoins.energie = clamp(v.besoins.energie + 15, 0, 100);
      v.confiance = clamp(v.confiance + 3, 0, 100);
      if (v.activite?.type === 'travailler') v.activite.fin = this.temps;
      memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Le conseil m’a accordé une journée de repos.', valence: 0.6, importance: 0.45, sujet: 'conseil', resume: `le conseil a accordé du repos à ${v.prenom}` });
      // les plus ardents au travail du foyer trouvent cela injuste
      for (const fid of v.famille) {
        const f = this.habitant(fid);
        if (f.traits.ardeur > 0.75 && f.age >= 17) changerAffinite(f, v, -2);
      }
    } else if (type === 'ecouter') {
      const jour = this.jour;
      const deja = v.dernierEcoute === jour;
      v.dernierEcoute = jour;
      v.besoins.social = clamp(v.besoins.social + (deja ? 5 : 18), 0, 100);
      v.boost += deja ? 0.5 : 4;
      v.confiance = clamp(v.confiance + (deja ? 0 : 4), 0, 100);
      if (!deja) memoriser(v, this.temps, { type: 'aide_conseil', texte: 'Un membre du conseil a pris le temps de m’écouter.', valence: 0.55, importance: 0.45, sujet: 'conseil', resume: `le conseil a pris le temps d'écouter ${v.prenom}` });
      if (deja) return { ok: true, message: `${v.prenom} vous a déjà parlé aujourd'hui.` };
    }
    this.log(`Le conseil vient en aide à ${nomComplet(v)} (${{ nourriture: 'nourriture', remedes: 'soins', repos: 'jour de repos', ecouter: 'écoute' }[type]}).`, 'conseil', [v.id]);
    return { ok: true, message: `${v.prenom} s'en souviendra.` };
  }

  resoudreConflit(cid, option) {
    const c = this.conflits.find((k) => k.id === cid);
    if (!c || c.resolu) return { ok: false };
    const a = this.habitant(c.a), b = this.habitant(c.b);
    const rng = this.rng;
    const mem = (v, texte, valence, importance, resume) => memoriser(v, this.temps, { type: 'conflit', texte, valence, importance, sujet: 'conseil', resume });
    let resultat = '';
    if (option === 'mediation') {
      const chance = 0.35 + (a.confiance + b.confiance) / 400 + ((a.traits.patience + b.traits.patience) / 2) * 0.25 - 0.08 * (c.gravite - 1);
      if (rng.chance(chance)) {
        changerAffinite(a, b, 25); changerAffinite(b, a, 25);
        for (const [x, y] of [[a, b], [b, a]]) {
          x.confiance = clamp(x.confiance + 6, 0, 100);
          x.boost += 5;
          mem(x, `Grâce à la médiation du conseil, je me suis réconcilié${x.genre === 'F' ? 'e' : ''} avec ${y.prenom}.`, 0.8, 0.75, `le conseil a réconcilié ${a.prenom} et ${b.prenom}`);
          memoriser(x, this.temps, { type: 'reconciliation', texte: `Réconciliation avec ${y.prenom}.`, valence: 0.6, importance: 0.6, sujet: y.id });
        }
        resultat = `Médiation réussie : ${a.prenom} et ${b.prenom} se sont réconciliés.`;
      } else {
        for (const x of [a, b]) {
          x.confiance = clamp(x.confiance - 2, 0, 100);
          mem(x, 'La médiation du conseil n’a rien réglé.', -0.3, 0.45, 'la médiation du conseil a échoué');
        }
        c.gravite = Math.max(1, c.gravite - 1);
        c.t = this.temps;
        this.log(`La médiation entre ${a.prenom} et ${b.prenom} a échoué. Le conflit persiste mais s'apaise un peu.`, 'mal', [a.id, b.id]);
        this.emit('conflit', c);
        return { ok: true, reussi: false, message: 'La médiation a échoué. Vous pouvez réessayer ou trancher.' };
      }
    } else if (option === 'a' || option === 'b') {
      const [gagnant, perdant] = option === 'a' ? [a, b] : [b, a];
      gagnant.confiance = clamp(gagnant.confiance + 9, 0, 100);
      perdant.confiance = clamp(perdant.confiance - 12 - perdant.traits.temperament * 6, 0, 100);
      gagnant.boost += 5; perdant.boost -= 7;
      changerAffinite(perdant, gagnant, -8);
      mem(gagnant, `Le conseil m'a donné raison face à ${perdant.prenom}.`, 0.7, 0.65, `le conseil a donné raison à ${gagnant.prenom} contre ${perdant.prenom}`);
      mem(perdant, `Le conseil m'a donné tort face à ${gagnant.prenom}. C'est injuste.`, -0.85, 0.85, `le conseil a donné tort à ${perdant.prenom}`);
      for (const fid of perdant.famille) {
        const f = this.habitant(fid);
        f.confiance = clamp(f.confiance - 4, 0, 100);
        changerAffinite(f, gagnant, -4);
      }
      for (const fid of gagnant.famille) this.habitant(fid).confiance = clamp(this.habitant(fid).confiance + 2, 0, 100);
      resultat = `Le conseil donne raison à ${gagnant.prenom}. ${perdant.prenom} le vit mal.`;
    } else if (option === 'compensation') {
      if (this.res.pieces < 15) return { ok: false, raison: 'Il faut 15 pièces pour dédommager.' };
      this.ajouter('pieces', -15);
      changerAffinite(a, b, 10); changerAffinite(b, a, 10);
      for (const x of [a, b]) {
        x.confiance = clamp(x.confiance + 3, 0, 100);
        mem(x, 'Le conseil a payé un dédommagement pour apaiser notre différend.', 0.4, 0.5, `le conseil a dédommagé ${a.prenom} et ${b.prenom}`);
      }
      resultat = `Le conseil dédommage les deux parties (15 pièces). La tension retombe.`;
    } else {
      // ignorer
      for (const x of [a, b]) {
        x.confiance = clamp(x.confiance - 4, 0, 100);
        mem(x, 'Le conseil a ignoré notre différend.', -0.5, 0.5, `le conseil a ignoré le différend entre ${a.prenom} et ${b.prenom}`);
      }
      resultat = `Le conseil choisit de ne pas intervenir entre ${a.prenom} et ${b.prenom}.`;
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
      acheterPierre: { donne: { pieces: 20 }, recoit: { pierre: 12 }, texte: '12 pierres taillées achetées pour 20 pièces' },
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

  definirRations(val) {
    if (!RATIONS[val] || this.politique.rations === val) return;
    this.politique.rations = val;
    for (const v of this.adultes()) {
      const aime = val === 'genereuse' ? v.traits.generosite > 0.5 : val === 'stricte' ? v.traits.patience > 0.6 : true;
      if (!aime) v.confiance = clamp(v.confiance - 1.5, 0, 100);
    }
    this.log(`Le conseil fixe des portions ${val === 'genereuse' ? 'généreuses' : val === 'stricte' ? 'strictes' : 'normales'}.`, 'conseil');
  }

  // ---------- Statistiques ----------
  nouveauBilan() {
    return { produit: {}, consomme: {} };
  }
  moyenne(cle) {
    return this.habitants.reduce((s, v) => s + v[cle], 0) / this.habitants.length;
  }
  repartitionMetiers() {
    const r = {};
    for (const v of this.habitants) r[v.metier] = (r[v.metier] || 0) + 1;
    return r;
  }

  // ---------- Sauvegarde ----------
  serialiser() {
    const assemblee = this.assemblee ? { ...this.assemblee, prop: undefined } : null;
    return JSON.stringify({
      version: 1, seed: this.seed, rng: this.rng.state, temps: this.temps, journal: this.journal.slice(-150),
      conflits: this.conflits, nextConflitId: this.nextConflitId, res: this.res, politique: this.politique, bonus: this.bonus,
      projet: this.projet, assemblee, historiqueAssemblees: this.historiqueAssemblees, propositionIndex: this.propositionIndex,
      meteo: this.meteo, navire: this.navire, fete: this.fete, bilan: this.bilan, historique: this.historique,
      habitants: this.habitants, batimentsAjoutes: this.batiments.filter((b) => b.ajoute),
      noms: this.batiments.map((b) => [b.id, b.nom, b.famille]),
    });
  }

  static charger(json) {
    const d = JSON.parse(json);
    const sim = new Simulation({ seed: d.seed });
    sim.batiments = buildLayout();
    for (const b of d.batimentsAjoutes || []) sim.batiments.push(b);
    sim.batimentsParId = Object.fromEntries(sim.batiments.map((b) => [b.id, b]));
    for (const [id, nom, famille] of d.noms || []) if (sim.batimentsParId[id]) Object.assign(sim.batimentsParId[id], { nom, famille });
    sim.nav = new NavGrid(sim.batiments);
    for (const k of ['temps', 'journal', 'conflits', 'nextConflitId', 'res', 'politique', 'bonus', 'projet', 'historiqueAssemblees', 'propositionIndex', 'meteo', 'navire', 'fete', 'bilan', 'historique', 'habitants']) {
      if (d[k] !== undefined) sim[k] = d[k];
    }
    sim.rng.state = d.rng;
    sim.derniereHeure = Math.floor(sim.temps / 60);
    if (d.assemblee) {
      const prop = PROPOSITIONS.find((p) => p.id === d.assemblee.propId);
      sim.assemblee = prop ? { ...d.assemblee, prop } : null;
    }
    // les conversations partagées doivent référencer le même objet
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
