// Moteur de « Palestine — Île Vivante ».
//
// Ce moteur ne pense pas : il fait respecter les LOIS DU MONDE (corps, ressources, argent,
// logement, distances, nuit, météo) et exécute les gestes que les habitants choisissent.
// Chaque habitant pense avec un modèle de langage (voir penseur.js) : pensées, paroles,
// décisions, souvenirs et opinions sont les siens. Aucune routine, aucun caractère,
// aucune réaction n'est écrit ici.
//
// Fonctionnement : quand un habitant a besoin de décider, il passe en statut 'attend'.
// Le pilote (navigateur ou test) lit `demandes()`, obtient une décision et appelle
// `appliquer(id, decision)`. Le moteur reste utilisable sans modèle : les habitants attendent.

import { RNG, clamp } from './rng.js';
import { PRENOMS_H, PRENOMS_F, NOMS_FAMILLE, METIERS, METIERS_ADULTES, PROJETS, LIEUX, NOMS_OBJETS, sansAccent } from './data.js';
import { creerHabitant, nomComplet, libelleMetier, noter, retenir } from './villager.js';
import { ACTIONS } from './prompts.js';
import { construirePrompt } from './perception.js';
import { saison } from './saison.js';
import { depuis } from './vie.js';
import { ANNEE_MIN, MOIS_MIN, GROSSESSE_MOIS, AGE_NOURRISSON, AGE_ADULTE, AGE_FECOND_MAX, DELAI_PRENOM_MIN, VALIDITE_SOUHAIT_MIN, risqueDecesHoraire, causeDeces, ageEnAns } from './vie.js';
import { creerMonde, regenerer, produire, recuperation, risqueMaladie, pressionCircadienne, confortFoyer, lumiere } from './monde.js';
import { NavGrid } from './navigation.js';
import { buildLayout, makeBuilding, ZONES, randomPointInZone, FREE_HOUSE_SPOTS, PLAZA } from '../world/layout.js';

const MIN_JOUR = 1440;
const CAPACITE_MARCHE = 600; // rations que l'entrepôt du marché peut garder
const VITESSE_MARCHE = 1.45;
const RENDU = {
  dormir: 'dormir', manger: 'manger', boire: 'manger', travailler: 'travailler', aller: 'flaner', parler: 'socialiser',
  donner: 'aider', demander: 'socialiser', prendre: 'socialiser', acheter: 'socialiser', se_soigner: 'soigner', prier: 'prier', se_reposer: 'rester',
  flaner: 'flaner', etudier: 'ecole', jouer: 'jouer', puiser_eau: 'travailler', emmenager: 'rester', rien: 'rester', avoir_un_enfant: 'socialiser',
};
const ETAT = {
  dormir: 'Dort', manger: 'Mange', boire: 'Boit', travailler: 'Travaille', aller: 'Se rend quelque part', parler: 'Parle à quelqu’un',
  donner: 'Donne quelque chose', demander: 'Demande quelque chose', prendre: 'Prend quelque chose', acheter: 'Achète au marché', se_soigner: 'Se fait soigner', prier: 'Prie',
  se_reposer: 'Se repose', flaner: 'Se promène', etudier: "Étudie à l'école", jouer: 'Joue', puiser_eau: "Puise de l'eau", emmenager: "S'installe", rien: 'Attend', avoir_un_enfant: 'Parle à quelqu’un',
};
const TON = { chaleureux: 'd’un ton chaleureux', tendu: 'd’un ton tendu', colere: 'avec colère', triste: 'd’un ton triste', joyeux: 'd’un ton joyeux' };
// Les mots de l'habitant pour un objet (« une ration », « du pain », « médicaments »…) → l'objet du monde.
function nomObjet(mot) {
  // « du pain », « des remèdes », « une ration », « de l'eau » : on enlève l'article avant de reconnaître l'objet
  const t = sansAccent(String(mot ?? '')).replace(/[’]/g, "'").replace(/^(?:\d+\s+|(?:de la|de l'|une|un|les|des|du|de|le|la|d'|l')(?:\s+|(?<=')))+/, '').trim();
  if (!t || t === 'rien') return null;
  if (/^(nourriture|ration|repas|pain|poisson|olive|vivre|aliment|manger|legume|fruit|farine|ble)/.test(t) || /ration/.test(t)) return 'nourriture';
  if (/^(remede|medic|soin|plante|potion)/.test(t)) return 'remedes';
  if (/^(eau|cruche|jarre d.eau|boisson)/.test(t)) return 'eau';
  if (/^(piece|argent|sou|monnaie|pieces)/.test(t)) return 'pieces';
  if (/^(huile)/.test(t)) return 'huile';
  return null;
}

// Tri d'AFFICHAGE pour le journal (ne change rien à ce que vit ou pense l'habitant) :
// on y met les pensées et paroles qui parlent des autres, de soi, de ce qu'on ressent ou qu'on se demande,
// et on laisse dans l'onglet Paroles les phrases de simple routine (« j'ai soif, je vais boire »).
const MOTS_INTIMES = /(je (me )?(sens|demande|crois|pense que|regrette|crains|souviens|voudrais|reve|doute|comprends|sais pas|ne sais)|j'(aime|ai peur|espere|ai honte|en ai assez|ai l'impression|aurais)|pourquoi|peur|honte|fier|fiere|triste|heureu|colere|seul|seule|injust|confiance|merite|mensonge|menti|pardon|manque|souvenir|vie|avenir|famille|enfants?|mere|pere|mari|femme|ami|aime|coeur|dieu|priere|conseil|reve|espoir|inquiet|inquiete|jaloux|jalouse|rancune|merci)/;
function penseePersonnelle(texte, habitants, v, ton = '') {
  const t = sansAccent(String(texte || '')).replace(/’/g, "'");
  if (t.length < 25) return false;
  if (ton && !['calme', 'neutre', ''].includes(sansAccent(ton))) return true;
  if (t.includes('?') || t.length > 160) return true;
  if (habitants.some((o) => o !== v && t.includes(sansAccent(o.prenom).toLowerCase()))) return true;
  return MOTS_INTIMES.test(t);
}

// le ton choisi par l'habitant, rendu en français ; un ton inconnu est repris tel quel
const commentDit = (ton) => (!ton || ton === 'calme' ? '' : ` ${TON[sansAccent(ton)] || `d’un ton ${ton}`}`);
// un prénom donné par un parent : des lettres, 2 à 16 caractères, une majuscule
function nettoyerPrenom(brut) {
  const t = String(brut ?? '').trim().split(/\s+/)[0] || '';
  if (!/^[\p{L}][\p{L}'’-]{1,15}$/u.test(t)) return '';
  return t.charAt(0).toLocaleUpperCase('fr') + t.slice(1);
}
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export class Simulation {
  constructor({ seed = 2026 } = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.temps = 6 * 60;
    this.listeners = {};
    this.journal = [];
    this.flux = []; // paroles et pensées, pour l'interface
    this.tous = []; // tous les habitants, vivants ou non, rangés par numéro
    this.defunts = [];
    this.souhaits = []; // « j'aimerais un enfant avec toi », en attente d'une réponse
    this.naissancesEnAttente = []; // enfants nés qui attendent un prénom de leurs parents
    this.interieur = []; // vie intérieure : ce que chacun retient, pense des autres, dit de lui-même, comprend
    this.requetes = [];
    this.nextRequete = 1;
    this.res = { nourriture: 150, huile: 20, pierre: 55, bois: 40, pieces: 800, remedes: 18 };
    this.prix = 1;
    this.prixRemede = 5;
    this.salaire = 1;
    this.dettes = [];
    this.monde = creerMonde();
    this.foyers = {};
    this.bonus = { jetee: false, puits: false, ecole: false, halle: false, fontaine: false };
    this.projet = null;
    this.meteo = { tempete: 0, secheresse: 0, bonnePeche: 0 };
    this.etatSaison = saison(this.temps); // pluie, beau temps, chaleur, saison sèche : fonction du temps
    this.saisonNom = this.etatSaison.nom;
    this.navire = 0;
    this.historique = [];
    this.stats = { paroles: 0, dons: 0, prises: 0, disputes: 0, requetes: 0, decisions: 0, achats: 0, demandes: 0, salaires: 0, salairesVeille: 0, naissances: 0, deces: 0 };
    this.derniereHeure = Math.floor(this.temps / 60);
    this.cacheRoster = null;
    this.cacheMembres = null;
    this.vitesseAffichage = 1;
  }

  // ---------- Utilitaires ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }
  log(texte, type = 'info', sujets = []) {
    const e = { t: this.temps, texte, type, sujets };
    this.journal.push(e);
    if (this.journal.length > 500) this.journal.shift();
    this.emit('journal', e);
  }
  get jour() { return Math.floor(this.temps / MIN_JOUR) + 1; }
  heure(t = this.temps) { return (((t % MIN_JOUR) + MIN_JOUR) % MIN_JOUR) / 60; }
  horodatage(t = this.temps) {
    const h = Math.floor(this.heure(t)), m = Math.floor(((t % 60) + 60) % 60);
    return `Jour ${Math.floor(t / MIN_JOUR) + 1}, ${h}h${String(m).padStart(2, '0')}`;
  }
  habitant(id) { return this.tous[id]; }
  vivant(id) { const v = this.tous[id]; return v && !v.mort ? v : undefined; }
  get annee() { return Math.floor(this.temps / ANNEE_MIN) + 1; }
  batiment(id) { return this.batimentsParId[id]; }
  meteoTexte() {
    const E = this.etatSaison;
    const parts = [{
      pluie: 'Il pleut.',
      beau: 'Beau temps : le ciel est dégagé, l’air est doux et la terre est verte.',
      chaleur: E.chaleur > 0.8 ? 'Il fait très chaud et la terre est sèche.' : 'Il fait chaud et la terre sèche.',
      seche: 'C’est la saison sèche : la terre est craquelée et la chaleur pèse.',
    }[E.nom]];
    if (E.nom === 'chaleur' || E.nom === 'seche') parts.push(`La pluie est tombée pour la dernière fois ${depuis(this.temps - E.depuisPluie, this.temps)}.`);
    if (this.meteo.tempete > this.temps) parts.push('Une tempête secoue la mer.');
    else if (this.meteo.secheresse > this.temps) parts.push('Vague de chaleur, les champs souffrent.');
    else if (this.meteo.bonnePeche > this.temps) parts.push('Des bancs de sardines longent la côte.');
    return parts.join(' ');
  }
  occupants(f) {
    if (!this.cacheMembres) {
      this.cacheMembres = {};
      for (const v of this.habitants) this.cacheMembres[v.foyer] = (this.cacheMembres[v.foyer] || 0) + 1;
    }
    return this.cacheMembres[f] || 0;
  }
  couchages(f) { return (this.batiment(f)?.etages || 1) > 1 ? 6 : 4; }
  maisonsLibres() { return this.batiments.filter((b) => b.type === 'maison' && this.occupants(b.id) === 0); }
  roster() {
    if (!this.cacheRoster) {
      const par = {};
      for (const v of this.habitants) (par[v.foyer] ||= []).push(v);
      this.cacheRoster = Object.values(par).map((g) => `${g[0].nom} (${g.map((v) => v.prenom).join(', ')})`).join(' ; ');
    }
    return this.cacheRoster;
  }
  categorie(v) {
    if (v.age < 6) return 'enfant';
    if (v.age < 17) return 'eleve';
    if (v.age >= 64) return 'ancien';
    return 'adulte';
  }

  // ---------- Création ----------
  init() {
    this.batiments = buildLayout();
    this.batimentsParId = Object.fromEntries(this.batiments.map((b) => [b.id, b]));
    this.nav = new NavGrid(this.batiments);
    this.genererPopulation();
    this.attribuerMetiers();
    for (const v of this.habitants) {
      const b = this.batiment(v.foyer);
      v.x = b.door.x; v.z = b.door.z;
    }
    this.log('Le conseil arrive sur l’île. Les habitants vont devoir se prononcer, chacun avec ses propres pensées.', 'conseil');
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
    this.tous = [];
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
      let couple = null;
      const enfantDuCouple = (v) => { if (couple && v.age <= couple[1].age - 16) v.parents = [couple[0].id, couple[1].id]; };
      for (const role of rng.pick(modeles[tailles[i]])) {
        if (role === 'couple') { const a = rng.int(26, 56); const h = ajouter('H', a); const f = ajouter('F', clamp(a + rng.int(-6, 3), 22, 60)); h.conjoint = f.id; f.conjoint = h.id; couple = [h, f]; }
        else if (role === 'adulte') ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(30, 50));
        else if (role === 'jeune') enfantDuCouple(ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(17, 25)));
        else if (role === 'enfant') enfantDuCouple(ajouter(rng.chance(0.5) ? 'F' : 'H', rng.int(3, 15)));
        else if (role === 'ancien') ajouter(rng.chance(0.55) ? 'F' : 'H', rng.int(64, 82));
      }
      for (const v of membres) v.famille = membres.filter((o) => o !== v).map((o) => o.id);
      this.foyers[m.id] = { nourriture: membres.length * 5, eau: membres.length * 4, pertes: [] };
    });
    // chacun est né il y a `age` années du village (une année = 2 jours), à une date de l'année qui lui est propre
    for (const v of this.habitants) v.naissance = this.temps - (v.age + rng.range(0, 0.99)) * ANNEE_MIN;
    this.tous = [...this.habitants];
  }

  // Les métiers sont confiés au départ (c'est autorisé : ce n'est pas de la pensée).
  attribuerMetiers() {
    const ordre = ['agriculteur', 'pecheur', 'agriculteur', 'pecheur', 'oleiculteur', 'agriculteur', 'pecheur', 'artisan', 'marchand', 'batisseur',
      'soignant', 'enseignant', 'charpentier', 'agriculteur', 'pecheur', 'oleiculteur', 'marchand', 'batisseur', 'artisan', 'soignant', 'charpentier', 'oleiculteur'];
    const adultes = this.rng.shuffle(this.habitants.filter((v) => this.categorie(v) === 'adulte'));
    const imam = adultes.filter((v) => v.genre === 'H' && v.age > 35).sort((a, b) => b.age - a.age)[0];
    let k = 0;
    for (const v of adultes) v.metier = v === imam ? 'imam' : ordre[k++ % ordre.length];
    for (const v of this.habitants) if (!v.metier) v.metier = this.categorie(v);
  }


  // ---------- Cycle de vie (lois du monde) ----------
  // Chaque heure de jeu : les années passent, les corps vieillissent, certains s'éteignent, les grossesses avancent.
  cycleDeVie() {
    const t = this.temps;
    for (const v of [...this.habitants]) {
      const age = ageEnAns(v, t);
      if (age > v.age) { v.age = age; this.anniversaire(v); }
      if (v.nourrisson && v.age >= AGE_NOURRISSON) this.grandir(v);
    }
    for (const v of [...this.habitants]) {
      if (v.mort) continue;
      if ((v.agonie || 0) >= 120 || this.rng.chance(risqueDecesHoraire(v))) this.mourir(v, causeDeces(v));
    }
    // une maladie guérit en général d'elle-même au bout d'un jour ou deux (le dispensaire et les remèdes l'accélèrent)
    for (const v of this.habitants) {
      if (v.malade && v.besoins.sante > 15 && this.rng.chance(0.04)) {
        v.malade = false;
        noter(v, this.temps, 'Ta fièvre est tombée : tu n\'es plus malade.');
      }
    }
    for (const m of [...this.habitants]) if (m.enceinte && !m.enceinte.accouche && t >= m.enceinte.terme) this.accoucher(m);
    this.souhaits = this.souhaits.filter((x) => t - x.t < VALIDITE_SOUHAIT_MIN);
    for (const n of [...this.naissancesEnAttente]) if (t - n.t >= DELAI_PRENOM_MIN) this.creerNouveauNe(n, this.prenomLibre(n.sexe), true);
  }

  anniversaire(v) {
    noter(v, this.temps, `Tu as maintenant ${v.age} an${v.age > 1 ? 's' : ''}.`);
    if (v.metier === 'enfant' && v.age >= 6 && v.age < AGE_ADULTE) { v.metier = 'eleve'; this.log(`${nomComplet(v)} entre à l'école.`, 'info', [v.id]); }
    else if ((v.metier === 'enfant' || v.metier === 'eleve') && v.age >= AGE_ADULTE) {
      v.metier = 'sansmetier';
      noter(v, this.temps, 'Tu es adulte : le conseil peut te confier un métier.');
      this.log(`${nomComplet(v)} devient adulte et n'a pas encore de métier.`, 'info', [v.id]);
    }
  }

  // Un fait important arrive : l'habitant s'arrête et décide à nouveau, en priorité.
  alerter(o) {
    if (!o || o.mort || o.nourrisson) return;
    if (o.statut === 'agit') { o.path = null; if (o.conversation) this.quitterConversation(o); this.attendre(o); }
    else if (o.statut === 'reflechit') o.reparler = true;
    o.priorite = true;
  }

  mourir(v, cause) {
    if (v.mort) return;
    const F = v.genre === 'F';
    v.mort = { t: this.temps, cause, jour: this.jour };
    if (v.conversation) this.quitterConversation(v);
    v.path = null; v.activite = null; v.conversation = null; v.statut = 'agit'; v.priorite = false;
    this.habitants = this.habitants.filter((o) => o !== v);
    this.defunts.push(v);
    this.cacheMembres = null; this.cacheRoster = null;
    this.stats.deces++;
    // ce qu'il laisse : l'argent à un proche (sinon à la caisse), les provisions à la maison ; ses dettes s'éteignent
    const proches = v.famille.map((id) => this.habitant(id)).filter((o) => o && !o.mort);
    const heritier = proches.find((o) => o.id === v.conjoint) || proches.find((o) => o.foyer === v.foyer && o.age >= AGE_ADULTE) || proches[0];
    const argent = Math.round(v.poche.pieces);
    if (argent > 0) { if (heritier) heritier.poche.pieces += argent; else this.res.pieces += argent; }
    const foyer = this.foyers[v.foyer];
    if (foyer) { foyer.nourriture += v.poche.nourriture; foyer.eau += v.poche.eau; }
    v.poche = { nourriture: 0, eau: 0, pieces: 0, huile: 0, remedes: 0 };
    this.dettes = this.dettes.filter((d) => d.de !== v.id && d.a !== v.id);
    for (const r of this.requetes) if (r.de === v.id && !r.repondue) { r.repondue = true; r.reponse = null; }
    for (const o of this.habitants) if (o.conjoint === v.id) o.conjoint = null;
    for (const x of this.souhaits) if (x.de === v.id || x.a === v.id) x.t = -1e9;
    if (v.enceinte && !v.enceinte.accouche) {
      const pere = this.habitant(v.enceinte.pere);
      if (pere && !pere.mort) noter(pere, this.temps, `${v.prenom} est morte alors qu'elle attendait votre enfant.`);
    }
    v.enceinte = null;
    // ceux qui l'apprennent : tout le village, et en priorité les proches et ceux qui étaient là
    const phrase = `${nomComplet(v)}, ${v.age} an${v.age > 1 ? 's' : ''}, est mort${F ? 'e' : ''} ${cause}.`;
    for (const o of this.habitants) {
      if (o.nourrisson) continue;
      const lien = v.famille.includes(o.id);
      const present = v.interieur ? (o.interieur && o.batiment === v.batiment) : (!o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < 10);
      noter(o, this.temps, `${phrase}${lien ? ` ${F ? 'Elle' : 'Il'} faisait partie de ta famille.` : ''}${present ? ' Tu étais là.' : ''}`);
      if (lien || present) this.alerter(o);
    }
    this.log(phrase, 'mal', [v.id]);
    this.emit('deces', v);
  }

  grandir(v) {
    v.nourrisson = false;
    v.statut = 'attend'; v.priorite = true; v.depuis = this.temps;
    v.interieur = true; v.batiment = v.foyer;
    this.log(`${nomComplet(v)} a ${AGE_NOURRISSON} ans.`, 'info', [v.id]);
  }

  // Un nourrisson ne décide pas : la maison le nourrit, comme une loi du monde. S'il n'y a plus rien, son corps faiblit.
  majNourrisson(v, dt) {
    const b = v.besoins, f = this.foyers[v.foyer];
    const besoin = 0.00035 * dt;
    b.energie = 90;
    if (f && f.nourriture >= besoin && f.eau >= besoin) {
      f.nourriture -= besoin; f.eau -= besoin;
      b.faim = Math.min(85, b.faim + 0.5 * dt); b.soif = Math.min(85, b.soif + 0.5 * dt);
    } else {
      b.faim = clamp(b.faim - 0.06 * dt, 0, 100); b.soif = clamp(b.soif - 0.1 * dt, 0, 100);
      if ((b.faim < 40 || b.soif < 40) && this.temps - (v.derniereAlerte || -1e9) > MOIS_MIN) {
        v.derniereAlerte = this.temps;
        for (const id of v.parents) {
          const p = this.habitant(id);
          if (p && !p.mort) { noter(p, this.temps, `${v.prenom}, ton enfant, a faim et soif, et il n'y a plus de provisions dans la maison.`); this.alerter(p); }
        }
      }
    }
    if (b.faim < 8 || b.soif < 8) b.sante = clamp(b.sante - 0.03 * dt, 0, 100);
    else if (b.faim > 30 && b.soif > 30) b.sante = clamp(b.sante + 0.01 * dt, 0, 100);
    v.agonie = b.sante <= 0.5 ? (v.agonie || 0) + dt : (b.sante > 5 ? 0 : (v.agonie || 0));
  }

  // ----- avoir un enfant : la loi du monde fixe qui le peut ; le désir, le choix de la personne et le prénom sont aux habitants -----
  apparentes(a, b) {
    if (a.parents.includes(b.id) || b.parents.includes(a.id)) return true;
    if (a.parents.some((p) => b.parents.includes(p))) return true;
    return a.foyer === b.foyer && a.conjoint !== b.id && b.conjoint !== a.id;
  }

  verifierProjetEnfant(v, o) {
    if (!o || o === v) return 'personne de ce nom';
    if (v.age < AGE_ADULTE || o.age < AGE_ADULTE) return `il faut avoir ${AGE_ADULTE} ans passés, tous les deux`;
    if (v.genre === o.genre) return 'il faut un homme et une femme';
    const f = v.genre === 'F' ? v : o;
    if (f.age > AGE_FECOND_MAX) return `${f.prenom} n'est plus en âge d'attendre un enfant`;
    if (f.enceinte) return `${f.prenom} attend déjà un enfant`;
    if (this.temps - (f.dernierAccouchement ?? -1e9) < 3 * MOIS_MIN) return `${f.prenom} vient d'accoucher`;
    if (this.apparentes(v, o)) return 'vous êtes de la même famille';
    return null;
  }

  souhaiterEnfant(v, o) {
    const raison = this.verifierProjetEnfant(v, o);
    if (raison) { noter(v, this.temps, `Ce que tu voulais n'était pas possible : ${raison}.`); return; }
    const reciproque = this.souhaits.find((x) => x.de === o.id && x.a === v.id);
    if (reciproque) { this.souhaits = this.souhaits.filter((x) => x !== reciproque); this.concevoir(v, o); return; }
    this.souhaits = this.souhaits.filter((x) => !(x.de === v.id && x.a === o.id));
    this.souhaits.push({ de: v.id, a: o.id, t: this.temps });
    noter(v, this.temps, `Tu as dit à ${o.prenom} que tu voudrais un enfant avec ${o.genre === 'F' ? 'elle' : 'lui'}. ${o.genre === 'F' ? 'Elle' : 'Il'} doit le vouloir aussi.`);
    noter(o, this.temps, `${v.prenom} te dit qu'${v.genre === 'F' ? 'elle' : 'il'} voudrait avoir un enfant avec toi.`);
    this.alerter(o);
  }

  concevoir(a, b) {
    const mere = a.genre === 'F' ? a : b, pere = mere === a ? b : a;
    mere.enceinte = { pere: pere.id, debut: this.temps, terme: this.temps + GROSSESSE_MOIS * MOIS_MIN };
    noter(mere, this.temps, `Vous voulez un enfant, ${pere.prenom} et toi : tu l'attends.`);
    noter(pere, this.temps, `Vous voulez un enfant, ${mere.prenom} et toi : elle l'attend.`);
    this.log(`${nomComplet(mere)} attend un enfant.`, 'info', [mere.id, pere.id]);
    this.emit('grossesse', mere);
  }

  accoucher(m) {
    m.enceinte.accouche = true;
    const pere = this.habitant(m.enceinte.pere);
    const sexe = this.rng.chance(0.5) ? 'F' : 'H';
    this.naissancesEnAttente.push({ mere: m.id, pere: m.enceinte.pere, t: this.temps, sexe });
    const enfant = sexe === 'F' ? 'une fille' : 'un garçon';
    const lui = sexe === 'F' ? 'Elle' : 'Il';
    noter(m, this.temps, `Tu as accouché : c'est ${enfant}. ${lui} n'a pas encore de prénom.`);
    this.alerter(m);
    if (pere && !pere.mort) { noter(pere, this.temps, `${m.prenom} a accouché de votre enfant : c'est ${enfant}. ${lui} n'a pas encore de prénom.`); this.alerter(pere); }
    this.log(`${nomComplet(m)} a accouché.`, 'info', [m.id]);
  }

  nommerEnfant(v, brut) {
    const n = this.naissancesEnAttente.find((x) => x.mere === v.id || x.pere === v.id);
    if (!n) return;
    const prenom = nettoyerPrenom(brut);
    if (!prenom) { noter(v, this.temps, 'Ce prénom est impossible à donner : il faut des lettres, de 2 à 16.'); v.reparler = true; return; }
    const pris = this.tous.find((o) => o && sansAccent(o.prenom) === sansAccent(prenom));
    if (pris) { noter(v, this.temps, `Ce prénom est déjà porté par ${nomComplet(pris)}${pris.mort ? ' (mort)' : ''}.`); v.reparler = true; return; }
    this.creerNouveauNe(n, prenom, false);
  }

  prenomLibre(sexe) {
    const pool = sexe === 'F' ? PRENOMS_F : PRENOMS_H;
    const pris = new Set(this.tous.map((o) => sansAccent(o.prenom)));
    for (let k = 0; k < 80; k++) { const p = this.rng.pick(pool); if (!pris.has(sansAccent(p))) return p; }
    return `${pool[0]}${this.tous.length}`;
  }

  creerNouveauNe(n, prenom, parLeVillage = false) {
    this.naissancesEnAttente = this.naissancesEnAttente.filter((x) => x !== n);
    const m = this.habitant(n.mere), p = this.habitant(n.pere);
    const foyerId = (m && !m.mort ? m.foyer : p && !p.mort ? p.foyer : m?.foyer);
    const v = creerHabitant({ id: this.tous.length, prenom, nom: (p || m).nom, genre: n.sexe, age: 0, foyer: foyerId, rng: this.rng });
    v.naissance = this.temps;
    v.nourrisson = true; v.statut = 'agit'; v.metier = 'enfant'; v.parents = [n.mere, n.pere];
    v.besoins = { faim: 80, soif: 80, energie: 90, sante: 95, securite: 75 };
    v.poche = { nourriture: 0, eau: 0, pieces: 0, huile: 0, remedes: 0 };
    const b = this.batiment(foyerId);
    v.x = b.door.x; v.z = b.door.z; v.interieur = true; v.batiment = foyerId;
    // sa famille : ses parents, et ceux qui vivent sous le toit où il naît
    const fam = new Set([n.mere, n.pere]);
    for (const o of this.habitants) if (o.foyer === foyerId) fam.add(o.id);
    v.famille = [...fam].filter((id) => this.habitant(id));
    for (const id of v.famille) { const o = this.habitant(id); if (!o.famille.includes(v.id)) o.famille.push(v.id); }
    this.tous.push(v); this.habitants.push(v);
    this.cacheMembres = null; this.cacheRoster = null;
    if (m) { m.enceinte = null; m.dernierAccouchement = this.temps; }
    this.stats.naissances++;
    const fille = v.genre === 'F';
    const texte = `${nomComplet(v)} est né${fille ? 'e' : ''}${m ? `, ${fille ? 'fille' : 'fils'} de ${m.prenom}${p ? ` et de ${p.prenom}` : ''}` : ''}.`;
    for (const o of this.habitants) {
      if (o.nourrisson) continue;
      noter(o, this.temps, `${texte}${parLeVillage && (o === m || o === p) ? ' Faute de prénom choisi par les parents, le village l\'a appelé ainsi.' : ''}`);
    }
    this.log(texte, 'info', [v.id]);
    this.emit('naissance', v);
    return v;
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
      this.horaire();
      if (Math.floor(this.temps / MIN_JOUR) !== Math.floor(avant / MIN_JOUR)) this.quotidien();
    }
    this.etatSaison = saison(this.temps);
    regenerer(this.monde, dt);
    for (const v of this.habitants) this.majHabitant(v, dt);
  }

  majHabitant(v, dt) {
    if (v.nourrisson) { this.majNourrisson(v, dt); return; }
    this.majBesoins(v, dt);
    if (v.statut !== 'agit') return;
    if (v.conversation) {
      if (this.temps >= v.conversation.fin) this.finirConversation(v.conversation);
      return;
    }
    if (v.path && v.path.length) { this.marcher(v, dt); return; }
    const a = v.activite;
    if (!a) { this.attendre(v); return; }
    if (this.temps >= a.fin) { this.terminer(v, a); return; }
    this.agir(v, a, dt);
  }

  attendre(v, urgence = '') {
    if (v.statut === 'attend' || v.nourrisson || v.mort) return; // un nourrisson ne décide pas, un mort non plus
    v.statut = 'attend';
    v.depuis = this.temps;
    if (urgence) v.urgence = urgence;
  }

  // Le corps : loi du monde, pas un comportement.
  majBesoins(v, dt) {
    const b = v.besoins, a = v.activite;
    const h = this.heure();
    const dort = a?.action === 'dormir' && !v.path?.length && v.statut === 'agit';
    const dehors = !v.interieur;
    b.faim = clamp(b.faim - (dort ? 0.03 : 0.06) * dt, 0, 100);
    // la chaleur de la saison assèche plus vite, surtout dehors et en plein jour
    const chaud = 1 + 0.7 * this.etatSaison.chaleur * (lumiere(h) > 0 ? 1 : 0.3) * (dehors && !this.sousLaHalle(v) ? 1 : 0.35);
    b.soif = clamp(b.soif - (dort ? 0.05 : 0.1) * chaud * dt, 0, 100);
    if (dort) {
      const confort = v.interieur && v.batiment === v.foyer ? confortFoyer(this.occupants(v.foyer), this.couchages(v.foyer)) : 0.5;
      b.energie = clamp(b.energie + recuperation(h, confort) * dt, 0, 100);
    } else if (a?.action === 'se_reposer' && v.interieur) b.energie = clamp(b.energie + 0.03 * dt, 0, 100);
    else b.energie = clamp(b.energie - 0.045 * dt * (v.age > 64 ? 1.15 : 1) * pressionCircadienne(h), 0, 100);
    if (b.faim < 8 || b.soif < 8) b.sante = clamp(b.sante - 0.03 * dt, 0, 100);
    else if (v.malade) b.sante = clamp(b.sante - 0.02 * dt, 0, 100);
    else if (b.faim > 30 && b.soif > 30) b.sante = clamp(b.sante + 0.006 * dt, 0, 100);
    // un corps à bout de santé : s'il y reste assez longtemps, il s'éteint (voir cycleDeVie)
    v.agonie = b.sante <= 0.5 ? (v.agonie || 0) + dt : (b.sante > 5 ? 0 : (v.agonie || 0));
    // sécurité : se reconstruit à l'abri, s'érode dehors dans la tempête ou la nuit, au garde-manger vide
    let cible = v.interieur ? 85 : 65;
    if (dehors && this.meteo.tempete > this.temps) cible -= 25;
    if (dehors && lumiere(h) < 0.2) cible -= 15;
    if ((this.foyers[v.foyer]?.nourriture ?? 0) < 1) cible -= 15;
    if (v.chocJusqua > this.temps) cible -= 25;
    b.securite = clamp(b.securite + (cible - b.securite) * 0.01 * dt, 0, 100);

    // le corps lâche : on s'effondre de fatigue
    if (b.energie <= 0.5 && v.statut === 'agit' && a?.action !== 'dormir') {
      noter(v, this.temps, "Tu t'es effondré de fatigue et tu t'es endormi là où tu étais.");
      v.path = null;
      this.demarrer(v, { action: 'dormir', duree: 240, ici: true });
      return;
    }
    // le corps presse : l'habitant est prévenu (c'est à lui de décider quoi en faire)
    if (v.statut === 'agit') {
      const urg = b.faim < 10 ? 'tu as une faim terrible' : b.soif < 10 ? 'tu as une soif terrible' : b.sante < 20 ? 'tu te sens très mal' : '';
      if (urg && this.temps - (v.derniereUrgence || -1e9) > 120) {
        v.derniereUrgence = this.temps;
        this.attendre(v, urg);
      }
    }
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

  // ---------- Lieux ----------
  resoudreLieu(v, texte) {
    const t = sansAccent(texte).replace(/[’]/g, "'").replace(/^(a |au |aux |chez |la |le |les |l')/, '').replace(/'/g, '').trim();
    if (!t) return null;
    const synonymes = { foret: 'pinede', pinede: 'pinede', jetee: 'jetee', maison: 'maison', ecole: 'ecole', mosquee: 'mosquee', champ: 'champs', marche: 'marche', place: 'marche', plage: 'plage', source: 'source', port: 'port', belvedere: 'belvedere', carriere: 'carriere', oliveraie: 'oliveraie', dispensaire: 'dispensaire', atelier: 'atelier', chantier: 'chantier', champs: 'champs' };
    if (synonymes[t]) return { cle: synonymes[t] };
    if (/^maison-\d+$/.test(t) && this.batiment(t)) return { maison: t };
    const p = this.habitants.find((o) => sansAccent(o.prenom) === t.split(' ')[0]);
    if (p) return { maison: p.foyer, chez: p };
    return null;
  }

  lieuPour(v, res) {
    if (res.maison || res.cle === 'maison') {
      const b = this.batiment(res.maison || v.foyer);
      return { x: b.door.x, z: b.door.z, interieur: true, bat: b.id, nomLieu: res.chez ? `chez ${res.chez.prenom}` : res.maison && res.maison !== v.foyer ? b.nom : 'chez toi', id: b.id };
    }
    const L = LIEUX[res.cle];
    if (!L) return null;
    if (res.cle === 'chantier') {
      const p = this.projet?.site;
      return p && !this.projet.enAttente ? { x: p.x + this.rng.range(-4, 4), z: p.z + this.rng.range(-4, 4), zone: 'chantier', nomLieu: 'le chantier', id: 'chantier' } : null;
    }
    if (L.bat) {
      const b = this.batiment(L.bat);
      return { x: b.door.x, z: b.door.z, interieur: !!L.interieur, bat: b.id, nomLieu: L.nom, id: res.cle };
    }
    if (res.cle === 'source') {
      const f = this.versFontaine(v);
      if (f) return { x: f.x + this.rng.range(-1.5, 1.5), z: f.z + 2.4 + this.rng.range(0, 1), zone: 'source', nomLieu: 'la fontaine du marché', id: 'source' };
    }
    const z = ZONES[L.zone];
    return { ...randomPointInZone(z, this.rng), zone: L.zone, nomLieu: L.nom, id: res.cle };
  }

  posDe(o) {
    return o.interieur && o.batiment ? this.batiment(o.batiment)?.door ?? o : o;
  }

  proche(a, b, r = 8) {
    const pa = this.posDe(a), pb = this.posDe(b);
    return Math.hypot(pa.x - pb.x, pa.z - pb.z) < r;
  }

  entendent(v, rayon = 7) {
    return this.habitants.filter((o) => o !== v && !o.nourrisson && o.activite?.action !== 'dormir' && (v.interieur ? o.interieur && o.batiment === v.batiment : !o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < rayon));
  }

  // ---------- Pensée : demandes et décisions ----------
  demandes() {
    const out = this.habitants.filter((v) => v.statut === 'attend');
    out.sort((a, b) => (b.priorite ? 1 : 0) - (a.priorite ? 1 : 0) || a.depuis - b.depuis);
    return out.map((v) => v.id);
  }
  // Le modèle n'a pas pu faire le bilan : il sera redemandé plus tard.
  bilanManque(id) {
    const v = this.habitant(id);
    if (v) v.bilanDu = true;
  }

  demandesBilan() {
    return this.habitants.filter((v) => v.bilanDu && v.statut !== 'reflechit').map((v) => v.id);
  }
  nbAttente() {
    let n = 0;
    for (const v of this.habitants) if (v.statut !== 'agit') n++;
    return n;
  }
  construirePrompt(id, type = 'decision') { return construirePrompt(this, this.habitant(id), type); }
  marquerEnvoye(id, type = 'decision') {
    const v = this.vivant(id);
    if (!v) return;
    if (type === 'bilan') { v.bilanDu = false; return; }
    v.statut = 'reflechit';
    v.evenementsPris = v.evenements.length;
    v.priorite = false;
  }
  // Le modèle était indisponible (surchargé, en pause) : l'habitant n'a pas encore pensé,
  // il repasse en tête de file pour le prochain modèle, sans perdre son tour.
  remettre(id) {
    const v = this.habitant(id);
    if (!v || v.statut !== 'reflechit') return;
    v.statut = 'attend';
    v.priorite = true;
  }

  // Le modèle n'a pas répondu : l'habitant reste là, sans rien faire de précis.
  echec(id) {
    const v = this.habitant(id);
    if (!v || v.statut !== 'reflechit') return;
    v.echecs++;
    this.demarrer(v, { action: 'rien', duree: Math.min(60, 8 * v.echecs), ici: true });
  }

  appliquer(id, d) {
    const v = this.habitant(id);
    if (v?.mort) return; // il est mort pendant qu'il réfléchissait
    if (!v || !d || typeof d !== 'object') return this.echec(id);
    this.stats.decisions++;
    v.nbDecisions++;
    v.echecs = 0;
    v.evenements.splice(0, v.evenementsPris || 0);
    v.evenementsPris = 0;
    v.urgence = '';
    v.pensee = clip(d.pensee, 1200);
    if (Number.isFinite(Number(d.humeur))) v.humeur = clamp(Math.round(Number(d.humeur)), 0, 100);
    if (v.pensee) {
      this.flux.push({ t: this.temps, id: v.id, type: 'pensee', texte: v.pensee });
      this.emit('pensee', { id: v.id, texte: v.pensee });
      if (penseePersonnelle(v.pensee, this.habitants, v)) this.vivre(v, 'pensee', v.pensee);
    }
    const souvenir = clip(d.souvenir, 600);
    retenir(v, this.temps, souvenir);
    if (souvenir) this.vivre(v, 'souvenir', souvenir);
    const cibleAvis = d.avis_sur ? this.personne(d.avis_sur) : null;
    if (cibleAvis && cibleAvis !== v && (d.avis || d.lien)) {
      const prec = v.avis[cibleAvis.id];
      const texte = d.avis ? clip(d.avis, 500) : prec?.texte || '';
      const lien = d.lien ? clip(d.lien, 80) : prec?.lien || '';
      v.avis[cibleAvis.id] = { t: this.temps, texte, lien };
      if (texte && texte !== prec?.texte) this.vivre(v, 'avis', texte, { sur: cibleAvis.id, avant: prec?.texte });
      if (lien && lien !== prec?.lien) this.vivre(v, 'lien', lien, { sur: cibleAvis.id, avant: prec?.lien });
    }
    if (d.avis_conseil && String(d.avis_conseil).trim()) {
      const texte = clip(d.avis_conseil, 600);
      if (texte !== v.avisConseil?.texte) {
        const avant = v.avisConseil?.texte;
        v.avisConseil = { t: this.temps, texte };
        this.vivre(v, 'conseil', texte, { avant });
      }
    }
    if (d.identite && String(d.identite).trim()) this.changerIdentite(v, clip(d.identite, 600));
    if (d.requete_conseil && String(d.requete_conseil).trim()) {
      this.requetes.push({ id: this.nextRequete++, de: v.id, texte: clip(d.requete_conseil, 800), t: this.temps, repondue: false });
      this.vivre(v, 'requete', this.requetes.at(-1).texte);
      v.stats.requetes++;
      this.stats.requetes++;
      this.emit('requete', this.requetes.at(-1));
    }
    if (this.flux.length > 400) this.flux.splice(0, this.flux.length - 400);
    if (d.prenom_enfant) this.nommerEnfant(v, d.prenom_enfant);
    // une phrase reçue pendant qu'il réfléchissait : il doit y répondre
    const doitRepondre = v.reparler;
    v.reparler = false;
    this.executer(v, d);
    if (doitRepondre && v.statut === 'agit') {
      v.path = null;
      this.attendre(v);
      v.priorite = true;
    }
    if (d.action === 'dormir' && v.souvenirs.length >= 4 && this.temps - v.derniereBilan > 14 * 60) v.bilanDu = true;
  }

  appliquerBilan(id, d) {
    const v = this.habitant(id);
    if (!v || v.mort || !d) return;
    if (d.resume) { v.resume = clip(d.resume, 1500); this.vivre(v, 'bilan', v.resume); }
    if (d.identite) this.changerIdentite(v, clip(d.identite, 600));
    if (typeof d.lecons === 'string' && clip(d.lecons, 1500) !== v.lecons) {
      const avant = v.lecons;
      v.lecons = clip(d.lecons, 1500);
      if (v.lecons) this.vivre(v, 'lecons', v.lecons, { avant });
    }
    // ce qu'il se demande : il peut aussi bien le laisser vide, ou l'effacer
    if (typeof d.questions === 'string' && clip(d.questions, 1500) !== (v.questions || '')) {
      const avant = v.questions || '';
      v.questions = clip(d.questions, 1500);
      if (v.questions) this.vivre(v, 'questions', v.questions, { avant });
    }
    v.souvenirs = v.souvenirs.slice(-12);
    v.derniereBilan = this.temps;
    v.bilanDu = false;
  }

  // Journal de la vie intérieure : seulement ce que l'habitant a lui-même écrit.
  vivre(v, type, texte, extra = {}) {
    if (!texte) return;
    this.interieur.push({ t: this.temps, id: v.id, type, texte, ...extra });
    if (this.interieur.length > 1500) this.interieur.splice(0, this.interieur.length - 1500);
  }

  changerIdentite(v, texte) {
    if (!texte || texte === v.identite) return;
    const avant = v.identite;
    v.identite = texte;
    this.vivre(v, 'identite', texte, { avant });
  }

  personne(txt) {
    const t = sansAccent(txt).split(' ')[0];
    return t ? this.habitants.find((o) => sansAccent(o.prenom) === t) || null : null;
  }

  invalide(v, raison) {
    noter(v, this.temps, `Ce que tu voulais faire n'était pas possible : ${raison}`);
    this.demarrer(v, { action: 'rien', duree: 10, ici: true });
  }

  executer(v, d) {
    const action = ACTIONS.includes(d.action) ? d.action : null;
    if (!action) return this.invalide(v, "cette action n'existe pas");
    const duree = Number.isFinite(Number(d.duree_minutes)) ? Number(d.duree_minutes) : 0;
    const parole = clip(d.parole, 800);
    const ton = clip(d.ton, 24).toLowerCase();
    const objet = nomObjet(d.objet) || (action === 'acheter' ? 'nourriture' : null);
    const qte = clamp(Number(d.quantite) || 1, 0, 200);
    const spec = { action, parole, ton, objet, qte, pret: !!d.pret, dispute: d.dispute === true || d.dispute === 'true' };
    const cible = d.personne ? this.personne(d.personne) : null;
    if (cible?.nourrisson && action !== 'aller') return this.invalide(v, `${cible.prenom} est un nourrisson`);
    if (v.reposJusqua > this.temps && action === 'travailler') noter(v, this.temps, 'Le conseil t’a accordé un jour de repos.');
    if (v.conversation && action !== 'parler') this.quitterConversation(v);

    switch (action) {
      case 'dormir': spec.res = { cle: 'maison' }; spec.duree = clamp(duree || 420, 60, 720); break;
      case 'manger': spec.duree = 20; spec.res = v.poche.nourriture >= 0.5 ? null : { cle: 'maison' }; break;
      case 'boire': spec.duree = 10; spec.res = v.poche.eau >= 0.5 ? null : (v.interieur && v.batiment === v.foyer && (this.foyers[v.foyer]?.eau ?? 0) >= 1 ? null : { cle: 'source' }); break;
      case 'puiser_eau': spec.duree = 10; spec.res = { cle: 'source' }; break;
      case 'se_reposer': spec.duree = clamp(duree || 45, 10, 180); spec.res = { cle: 'maison' }; break;
      case 'se_soigner': spec.duree = clamp(duree || 45, 20, 120); spec.res = { cle: 'dispensaire' }; break;
      case 'prier': spec.duree = clamp(duree || 25, 10, 90); spec.res = { cle: 'mosquee' }; break;
      case 'etudier': spec.duree = clamp(duree || 120, 30, 240); spec.res = { cle: 'ecole' }; break;
      case 'jouer': spec.duree = clamp(duree || 45, 10, 120); spec.res = { cle: 'cour_ecole' }; break;
      case 'rien': spec.duree = clamp(duree || 15, 5, 60); spec.ici = true; break;
      case 'flaner': {
        const r = this.resoudreLieu(v, d.lieu) || { cle: this.rng.pick(['plage', 'belvedere', 'port', 'source']) };
        spec.res = r; spec.duree = clamp(duree || 40, 10, 180); break;
      }
      case 'aller': {
        const r = this.resoudreLieu(v, d.lieu || d.personne);
        if (!r) return this.invalide(v, `lieu inconnu (« ${clip(d.lieu || d.personne, 40)} »)`);
        spec.res = r; spec.duree = clamp(duree || 20, 5, 180); break;
      }
      case 'travailler': {
        let r = d.lieu ? this.resoudreLieu(v, d.lieu) : null;
        if (!r) { const m = METIERS[v.metier]?.lieu; r = m ? { cle: m } : null; }
        if (!r || !LIEUX[r.cle]?.travail) return this.invalide(v, "on ne peut pas travailler à cet endroit");
        if (r.cle === 'chantier' && !(this.projet && !this.projet.enAttente)) return this.invalide(v, "il n'y a pas de chantier ouvert");
        if (v.age < 12) return this.invalide(v, "tu es trop jeune pour travailler");
        spec.res = r; spec.duree = clamp(duree || 120, 20, 300); break;
      }
      case 'parler': {
        if (!cible || cible === v) return this.invalide(v, "personne de ce nom à qui parler");
        if (!parole) return this.invalide(v, "tu n'as rien dit");
        spec.cible = cible; spec.duree = 5;
        // déjà face à face : on parle tout de suite
        if (v.conversation && v.conversation === cible.conversation && this.proche(v, cible, 9)) {
          this.parler(v, cible, parole, ton, spec.dispute);
          this.reprendre(v, spec);
          return;
        }
        spec.res = { maison: cible.interieur ? cible.batiment : null, chez: null, cle: null, suit: cible };
        break;
      }
      case 'demander': {
        if (!cible || cible === v) return this.invalide(v, 'personne de ce nom à qui demander');
        if (!objet || objet === 'huile') return this.invalide(v, 'précise ce que tu demandes (nourriture, eau, pieces, remedes)');
        spec.cible = cible; spec.duree = 5; spec.res = { suit: cible }; break;
      }
      case 'donner': case 'prendre': {
        if (!objet || objet === 'huile') return this.invalide(v, "précise ce que tu veux (nourriture, eau, pieces, remedes)");
        if (action === 'donner' && (!cible || cible === v)) return this.invalide(v, "personne à qui donner");
        if (action === 'prendre' && !cible && !(objet === 'nourriture')) return this.invalide(v, "à qui veux-tu prendre ?");
        spec.cible = cible; spec.duree = 5;
        if (action === 'prendre' && cible && objet !== 'pieces') spec.porte = cible.foyer; // on se glisse jusqu'à la porte de leur maison
        else spec.res = cible ? { suit: cible } : { cle: 'marche' };
        break;
      }
      case 'acheter': {
        if (!['nourriture', 'remedes'].includes(objet)) return this.invalide(v, "on achète des rations (nourriture) ou des remedes");
        spec.duree = 5; spec.res = { cle: 'marche' }; break;
      }
      case 'avoir_un_enfant': {
        const raison = this.verifierProjetEnfant(v, cible);
        if (raison) return this.invalide(v, raison);
        spec.cible = cible; spec.duree = 10; spec.res = { suit: cible }; break;
      }
      case 'emmenager': {
        const r = this.resoudreLieu(v, d.lieu);
        const b = r?.maison && this.batiment(r.maison);
        if (!b || b.type !== 'maison' || this.occupants(b.id) > 0) return this.invalide(v, "cette maison n'est pas libre");
        if (v.age < 17) return this.invalide(v, "tu es trop jeune pour vivre seul");
        spec.res = { maison: b.id }; spec.duree = 5; break;
      }
    }
    if (parole && !['parler', 'donner', 'demander', 'prendre'].includes(action)) this.diffuser(v, parole, ton);
    this.demarrer(v, spec);
  }

  // Reprend l'activité après avoir parlé en face à face.
  reprendre(v, spec) {
    v.statut = 'agit';
    v.activite = { type: 'socialiser', action: 'parler', etat: ETAT.parler, nomLieu: v.activite?.nomLieu || 'ici', debut: this.temps, fin: this.temps + 600, duree: 5, arrive: this.temps, bilan: {} };
  }

  demarrer(v, spec) {
    v.statut = 'agit';
    v.priorite = false;
    const a = {
      type: RENDU[spec.action], action: spec.action, etat: spec.cible && spec.action !== 'parler' ? `${ETAT[spec.action]} (${spec.cible.prenom})` : spec.cible ? `${ETAT[spec.action]} (${spec.cible.prenom})` : ETAT[spec.action],
      debut: this.temps, fin: this.temps + 600, duree: spec.duree || 20,
      cibleId: spec.cible?.id, objet: spec.objet, qte: spec.qte, pret: spec.pret, parole: spec.parole, ton: spec.ton, dispute: spec.dispute,
      bilan: { nourriture: 0, pieces: 0, pierre: 0, bois: 0, huile: 0, remedes: 0, paye: 0, minutes: 0 },
      nomLieu: 'ici',
    };
    let lieu = null;
    if (spec.ici) lieu = { x: v.x, z: v.z, interieur: v.interieur, bat: v.batiment, nomLieu: v.activite?.nomLieu || 'ici' };
    else if (spec.porte) {
      const b = this.batiment(spec.porte);
      lieu = { x: b.door.x, z: b.door.z, interieur: false, nomLieu: `devant ${b.nom}` };
    } else if (spec.res?.suit) {
      const o = spec.res.suit;
      const p = this.posDe(o);
      lieu = { x: p.x + this.rng.range(-1, 1), z: p.z + this.rng.range(-1, 1), interieur: false, nomLieu: o.interieur ? `devant ${this.batiment(o.batiment)?.nom || 'la maison'}` : `près de ${o.prenom}` };
    } else if (spec.res) lieu = this.lieuPour(v, spec.res);
    else lieu = { x: v.x, z: v.z, interieur: v.interieur, bat: v.batiment, nomLieu: v.interieur ? 'chez toi' : 'ici' };
    if (!lieu) return this.invalide(v, "tu ne trouves pas ce lieu");
    a.lieuCle = spec.res?.cle || (spec.res?.maison ? 'maison' : null);
    Object.assign(a, lieu);
    if (!['dormir', 'manger', 'boire', 'rien', 'se_reposer'].includes(spec.action) && lieu.nomLieu && !spec.cible) a.etat = `${ETAT[spec.action]} — ${lieu.nomLieu}`;
    v.activite = a;
    v.path = null;
    if (spec.ici) { a.arrive = this.temps; a.fin = this.temps + a.duree; return; }
    this.allerVers(v, lieu.x, lieu.z);
  }

  allerVers(v, x, z) {
    if (v.interieur) {
      const b = this.batiment(v.batiment);
      if (b) { v.x = b.door.x; v.z = b.door.z; }
      // la porte est le point de sortie ; on ne ressort pas si l'on va dans le même bâtiment
      const a = v.activite;
      if (!(a?.interieur && a.bat === v.batiment)) { v.interieur = false; v.batiment = null; }
    }
    if (Math.hypot(x - v.x, z - v.z) < 0.8) { v.path = null; this.arriver(v); return; }
    const p = this.nav.findPath(v.x, v.z, x, z);
    v.path = p && p.length ? p : [{ x, z }];
  }

  arriver(v) {
    const a = v.activite;
    if (!a) return;
    a.arrive = this.temps;
    a.fin = this.temps + a.duree;
    if (a.interieur) { v.interieur = true; v.batiment = a.bat; }
    // en rentrant chez soi, on pose ce qu'on porte
    if (v.interieur && v.batiment === v.foyer) {
      const f = this.foyers[v.foyer];
      const poseN = v.poche.nourriture, poseE = v.poche.eau;
      if (poseN >= 0.5 || poseE >= 0.5) {
        f.nourriture += poseN; f.eau += poseE; v.poche.nourriture = 0; v.poche.eau = 0;
        noter(v, this.temps, `Tu poses chez toi ce que tu portais${poseN >= 0.5 ? ` : ${Math.round(poseN * 10) / 10} ration(s)` : ''}${poseE >= 0.5 ? `, ${Math.round(poseE)} dose(s) d'eau` : ''}.`);
      }
      if (f.pertes.length) {
        const q = f.pertes.reduce((s, p) => s + p.q, 0);
        noter(v, this.temps, `Tu constates qu'il manque ${Math.round(q * 10) / 10} ration(s) ou dose(s) dans la réserve de ta maison : quelqu'un en a pris.`);
        f.pertes = [];
      }
    }
    switch (a.action) {
      case 'manger': this.repas(v, a); break;
      case 'boire': this.boire(v, a); break;
      case 'puiser_eau': { const q = Math.min(6, 8 - v.poche.eau); v.poche.eau += Math.max(0, q); noter(v, this.temps, `Tu remplis ta cruche à la source (${Math.round(v.poche.eau)} dose(s)).`); break; }
      case 'travailler': this.debutTravail(v, a); break;
      case 'parler': {
        const o = this.vivant(a.cibleId);
        if (o && this.proche(v, o, 10)) this.parler(v, o, a.parole, a.ton, a.dispute);
        else { noter(v, this.temps, `Tu n'as pas trouvé ${o?.prenom || 'cette personne'}.`); a.fin = this.temps; }
        break;
      }
      case 'donner': this.donner(v, a); break;
      case 'demander': {
        const o = this.vivant(a.cibleId);
        if (o && this.proche(v, o, 10)) this.demanderA(v, o, a);
        else { noter(v, this.temps, `Tu n'as pas trouvé ${o?.prenom || 'cette personne'}.`); a.fin = this.temps; }
        break;
      }
      case 'prendre': this.prendre(v, a); break;
      case 'acheter': this.acheter(v, a); break;
      case 'emmenager': this.emmenager(v, a); break;
      case 'avoir_un_enfant': {
        const o = this.vivant(a.cibleId);
        if (o && this.proche(v, o, 10)) this.souhaiterEnfant(v, o);
        else { noter(v, this.temps, `Tu n'as pas trouvé ${o?.prenom || 'cette personne'}.`); a.fin = this.temps; }
        break;
      }
      default: break;
    }
  }

  // Demander quelque chose à quelqu'un : le jeu porte la demande ; c'est l'autre qui décide d'y répondre (donner, refuser, discuter).
  demanderA(v, o, a) {
    const q = Math.round((a.qte || 1) * 10) / 10, obj = NOMS_OBJETS[a.objet] || a.objet;
    this.stats.demandes++;
    noter(v, this.temps, `Tu as demandé ${q} ${obj} à ${o.prenom}.`);
    if (a.parole) this.parler(v, o, a.parole, a.ton, a.dispute);
    else this.alerter(o);
    noter(o, this.temps, `${v.prenom} te demande ${q} ${obj}.`);
    this.vivre(v, 'demande', `${q} ${obj}`, { sur: o.id });
  }

  // ---------- Gestes physiques ----------
  repas(v, a) {
    const portion = v.age < 12 ? 0.6 : 1;
    const f = this.foyers[v.foyer];
    if (v.poche.nourriture >= portion) v.poche.nourriture -= portion;
    else if (v.interieur && v.batiment === v.foyer && f.nourriture >= portion) f.nourriture -= portion;
    else {
      noter(v, this.temps, v.interieur && v.batiment === v.foyer ? "Tu ouvres le garde-manger de ta maison : il n'y a plus rien à manger." : "Tu n'as rien à manger sur toi.");
      a.fin = this.temps;
      return;
    }
    v.besoins.faim = clamp(v.besoins.faim + 36, 0, 100);
    v.dernierRepas = this.temps;
    // un repas partagé : les autres convives le perçoivent
    for (const o of this.habitants) if (o !== v && o.interieur && o.batiment === v.batiment && o.activite?.action === 'manger') noter(o, this.temps, `Tu manges avec ${v.prenom}.`);
  }

  boire(v, a) {
    const f = this.foyers[v.foyer];
    const prSource = Math.hypot(v.x - ZONES.source.x, v.z - ZONES.source.z) < ZONES.source.r + 3 || this.prosDeLaFontaine(v);
    if (v.poche.eau >= 1) v.poche.eau -= 1;
    else if (prSource) { /* l'eau de la source est gratuite */ }
    else if (v.interieur && v.batiment === v.foyer && f.eau >= 1) f.eau -= 1;
    else { noter(v, this.temps, "Tu n'as pas d'eau à boire ici."); a.fin = this.temps; return; }
    v.besoins.soif = clamp(v.besoins.soif + 45, 0, 100);
  }

  debutTravail(v, a) {
    if (a.lieuCle === 'jetee') {
      const places = this.monde.placesJetee + (this.bonus.jetee ? 2 : 0);
      const occ = this.habitants.filter((o) => o !== v && o.activite?.action === 'travailler' && o.activite.lieuCle === 'jetee' && o.activite.arrive && !o.path);
      if (occ.length >= places) {
        noter(v, this.temps, `Toutes les places de pêche sur la jetée sont prises (${occ.map((o) => o.prenom).join(', ')}).`);
        a.fin = this.temps;
      }
    }
  }

  agir(v, a, dt) {
    const b = v.besoins;
    switch (a.action) {
      case 'travailler': this.travailler(v, a, dt); break;
      case 'se_soigner': {
        b.sante = clamp(b.sante + 0.05 * dt, 0, 100);
        if (!a.soigne && this.temps - a.arrive >= 20) {
          a.soigne = true;
          const soignant = this.habitants.find((o) => o !== v && o.activite?.action === 'travailler' && o.activite.lieuCle === 'dispensaire' && o.interieur);
          if (v.malade && this.res.remedes >= 1) {
            this.ajouter('remedes', -1);
            v.malade = false;
            b.sante = clamp(b.sante + 30, 0, 100);
            noter(v, this.temps, `Tu es soigné${v.genre === 'F' ? 'e' : ''}${soignant ? ` par ${soignant.prenom}` : ''} : te voilà guéri${v.genre === 'F' ? 'e' : ''}.`);
            if (soignant) noter(soignant, this.temps, `Tu as soigné ${v.prenom}, qui est guéri${v.genre === 'F' ? 'e' : ''}.`);
          } else if (v.malade) noter(v, this.temps, "Le dispensaire n'a plus de remèdes pour te soigner.");
          else noter(v, this.temps, soignant ? `${soignant.prenom} t'examine : tu n'es pas malade.` : "Tu te reposes au dispensaire : tu n'es pas malade.");
        }
        break;
      }
      case 'prier': case 'jouer': case 'etudier': case 'flaner': case 'se_reposer': case 'aller': case 'rien': break;
      case 'dormir': if (b.energie >= 99 && lumiere(this.heure()) > 0.5 && this.temps - a.arrive > 120) a.fin = this.temps; break;
      default: break;
    }
  }

  rendement(v) {
    const b = v.besoins;
    let r = 0.35 + 0.65 * (b.energie / 100);
    if (b.sante < 40) r *= 0.7;
    if (v.malade) r *= 0.6;
    if (b.faim < 15 || b.soif < 15) r *= 0.7;
    return r;
  }

  travailler(v, a, dt) {
    const comp = v.competence[a.lieuCle] || 0;
    const E = this.etatSaison;
    const meteo = { tempete: this.meteo.tempete > this.temps, secheresse: this.meteo.secheresse > this.temps, bonnePeche: this.meteo.bonnePeche > this.temps, pluie: E.pluie, chaleurSaison: E.chaleur, seche: E.seche };
    const r = produire(a.lieuCle, this.monde, this.heure(), meteo, comp, dt, this.rendement(v));
    const b = v.besoins;
    b.energie = clamp(b.energie - (r.fatigue || 0) * 0.03 * dt, 0, 100);
    if (r.danger && this.rng.chance(r.danger)) {
      b.sante = clamp(b.sante - 25, 0, 100);
      b.securite = clamp(b.securite - 30, 0, 100);
      noter(v, this.temps, 'Une vague t’a jeté contre la jetée : tu es blessé et tu as eu très peur.');
      this.log(`${nomComplet(v)} a été blessé${v.genre === 'F' ? 'e' : ''} en mer pendant la tempête.`, 'mal', [v.id]);
      a.fin = this.temps;
    }
    if (r.nourriture) { this.res.nourriture += r.nourriture; a.bilan.nourriture += r.nourriture; }
    for (const k of ['huile', 'pierre', 'bois', 'remedes']) if (r[k]) { this.ajouter(k, r[k]); a.bilan[k] += r[k]; }
    if (r.pieces) { this.res.pieces += r.pieces; a.bilan.pieces += r.pieces; }
    if (r.chantier && this.projet && !this.projet.enAttente) {
      this.projet.progres += r.chantier;
      if (this.projet.progres >= this.projet.travail) this.terminerProjet();
    }
    v.competence[a.lieuCle] = clamp(comp + 0.0006 * dt * (1 - comp), 0, 1);
    // salaire : le conseil paie à l'heure (si sa caisse le permet)
    a.bilan.minutes += dt;
    const du = (this.salaire * dt) / 60;
    if (this.res.pieces >= du) { this.res.pieces -= du; v.poche.pieces += du; a.bilan.paye += du; this.stats.salaires += du; }
    else v.impaye += du;
  }

  terminer(v, a) {
    const bl = a.bilan;
    if (a.action === 'travailler' && bl.minutes > 5) {
      const prod = [['nourriture', 'ration(s) pour le marché'], ['huile', 'jarre(s) d’huile'], ['pierre', 'pierre(s)'], ['bois', 'bois'], ['remedes', 'remède(s)'], ['pieces', 'pièce(s) pour la caisse du conseil']]
        .filter(([k]) => bl[k] >= 0.5).map(([k, l]) => `${Math.round(bl[k])} ${l}`).join(', ');
      noter(v, this.temps, `Tu as travaillé ${Math.floor(bl.minutes / 60) ? `${Math.floor(bl.minutes / 60)} h ` : ''}${Math.round(bl.minutes % 60)} min à ${a.nomLieu}${prod ? ` : ${prod}` : ''}. Tu as touché ${Math.round(bl.paye * 10) / 10} pièce(s) de salaire.`);
    }
    v.statut = 'attend';
    v.depuis = this.temps;
    if (v.activite) v.activite.fini = true;
  }

  // ---------- Paroles ----------
  diffuser(v, texte, ton, sauf = null) {
    const ents = this.entendent(v);
    this.stats.paroles++;
    v.stats.paroles++;
    this.flux.push({ t: this.temps, id: v.id, type: 'parole', texte, a: null, ton, lieu: v.activite?.nomLieu });
    this.emit('parole', { id: v.id, a: null, texte, ton });
    if (penseePersonnelle(texte, this.habitants, v, ton)) this.vivre(v, 'parole', texte, { ton });
    for (const o of ents) if (o !== sauf) noter(o, this.temps, `${v.prenom} dit${commentDit(ton)} : « ${texte} »`);
  }

  parler(v, cible, texte, ton, dispute = false) {
    if (!texte) { noter(v, this.temps, `Tu es devant ${cible.prenom} mais tu ne dis rien.`); return; }
    let c = v.conversation && v.conversation === cible.conversation ? v.conversation : null;
    if (!c) {
      if (v.conversation) this.quitterConversation(v);
      if (cible.conversation) this.quitterConversation(cible);
      c = { a: v.id, b: cible.id, debut: this.temps, fin: this.temps + 8, dispute: false, tours: 0 };
    }
    c.tours++;
    c.fin = this.temps + clamp(texte.length / 12, 3, 8) + 3;
    const t = sansAccent(ton || '');
    // une dispute : déclarée par l'habitant lui-même, ou reconnue à un ton de colère qu'il a choisi (furieux, énervé, agacé…)
    const conflit = dispute || /^(colere|furieu|enerv|agac|fach|hostil|agress|irrit)/.test(t);
    c.dispute = conflit || (t.startsWith('tendu') && c.dispute);
    v.conversation = cible.conversation = c;
    v.dir = Math.atan2(cible.x - v.x, cible.z - v.z);
    cible.dir = Math.atan2(v.x - cible.x, v.z - cible.z);
    this.stats.paroles++;
    v.stats.paroles++;
    this.flux.push({ t: this.temps, id: v.id, type: 'parole', texte, a: cible.id, ton, lieu: v.activite?.nomLieu });
    this.emit('parole', { id: v.id, a: cible.id, texte, ton });
    if (penseePersonnelle(texte, this.habitants, v, ton)) this.vivre(v, 'parole', texte, { sur: cible.id, ton });
    // la cible entend et doit pouvoir répondre
    const dormait = cible.activite?.action === 'dormir' && cible.statut === 'agit';
    noter(cible, this.temps, `${dormait ? 'Tu es réveillé. ' : ''}${v.prenom} te dit${commentDit(ton)} : « ${texte} »`);
    if (cible.statut === 'reflechit') cible.reparler = true;
    else { cible.path = null; cible.statut = 'attend'; cible.depuis = this.temps; cible.priorite = true; }
    for (const o of this.entendent(v)) if (o !== cible) noter(o, this.temps, `${v.prenom} dit à ${cible.prenom}${commentDit(ton)} : « ${texte} »`);
    if (c.dispute && !c.loggee) {
      c.loggee = true;
      this.stats.disputes++;
      this.log(`${nomComplet(v)} et ${nomComplet(cible)} se disputent (${clip(texte, 80)}).`, 'mal', [v.id, cible.id]);
    }
    if (c.tours >= 12) this.finirConversation(c);
  }

  finirConversation(c) {
    const a = this.habitant(c.a), b = this.habitant(c.b);
    for (const v of [a, b]) {
      if (v.conversation !== c) continue;
      v.conversation = null;
      if (v.statut === 'agit') this.terminer(v, v.activite || { bilan: { minutes: 0 }, action: 'parler' });
    }
  }

  quitterConversation(v) {
    const c = v.conversation;
    if (!c) return;
    const autre = this.habitant(c.a === v.id ? c.b : c.a);
    v.conversation = null;
    if (autre.conversation === c) {
      autre.conversation = null;
      noter(autre, this.temps, `${v.prenom} s'éloigne, la conversation est finie.`);
      if (autre.statut === 'agit') this.terminer(autre, autre.activite || { bilan: { minutes: 0 }, action: 'parler' });
    }
  }

  donner(v, a) {
    const o = this.vivant(a.cibleId);
    if (!o || !this.proche(v, o, 12)) { noter(v, this.temps, `Tu n'as pas trouvé ${o?.prenom || 'la personne'} pour lui donner quelque chose.`); a.fin = this.temps; return; }
    const obj = a.objet, f = this.foyers[v.foyer];
    const chez = v.interieur && v.batiment === v.foyer;
    let dispo = v.poche[obj] || 0;
    if (chez && (obj === 'nourriture' || obj === 'eau')) dispo += f[obj];
    let q = Math.floor(Math.min(a.qte, dispo) * 10 + 1e-9) / 10;
    if (obj === 'pieces') q = Math.floor(Math.min(a.qte, dispo));
    if (q <= 0) { noter(v, this.temps, `Tu n'as pas de ${NOMS_OBJETS[obj]} à donner.`); a.fin = this.temps; return; }
    const dePoche = Math.min(q, v.poche[obj] || 0);
    v.poche[obj] -= dePoche;
    if (q > dePoche) f[obj] -= q - dePoche;
    o.poche[obj] = (o.poche[obj] || 0) + q;
    let motif = a.pret ? ' (un prêt)' : '';
    if (obj === 'pieces') {
      const dette = this.dettes.find((d) => d.de === v.id && d.a === o.id);
      if (dette && !a.pret) { dette.montant -= q; motif = dette.montant <= 0.5 ? ' (tu es quitte)' : ' (un remboursement)'; if (dette.montant <= 0.5) this.dettes.splice(this.dettes.indexOf(dette), 1); }
      else if (a.pret) {
        const d2 = this.dettes.find((d) => d.de === o.id && d.a === v.id);
        if (d2) d2.montant += q; else this.dettes.push({ de: o.id, a: v.id, montant: q });
      }
    }
    v.stats.dons++;
    this.stats.dons++;
    noter(v, this.temps, `Tu as donné ${q} ${NOMS_OBJETS[obj]} à ${o.prenom}${motif}.`);
    noter(o, this.temps, `${v.prenom} t'a donné ${q} ${NOMS_OBJETS[obj]}${motif}.`);
    o.priorite = true;
    if (q >= 4 && obj !== 'eau') this.log(`${nomComplet(v)} donne ${q} ${NOMS_OBJETS[obj]} à ${nomComplet(o)}${motif}.`, 'bien', [v.id, o.id]);
    if (a.parole) this.parler(v, o, a.parole, a.ton, a.dispute);
    else if (o.statut === 'agit') { o.path = null; this.attendre(o); o.priorite = true; }
  }

  prendre(v, a) {
    const q0 = a.qte, obj = a.objet;
    const o = a.cibleId != null ? this.vivant(a.cibleId) : null;
    let pris = 0, source = '';
    if (o) {
      const f = this.foyers[o.foyer];
      const b = this.batiment(o.foyer);
      const prochePorte = Math.hypot(v.x - b.door.x, v.z - b.door.z) < 8;
      if (obj === 'pieces') {
        if (!this.proche(v, o, 5)) { noter(v, this.temps, `Tu n'as pas pu t'approcher de ${o.prenom}.`); a.fin = this.temps; return; }
        pris = Math.floor(Math.min(q0, o.poche.pieces)); o.poche.pieces -= pris; source = `dans la poche de ${o.prenom}`;
      } else if (obj === 'nourriture' || obj === 'eau') {
        if (!prochePorte) { noter(v, this.temps, "Tu n'as pas pu atteindre la maison."); a.fin = this.temps; return; }
        pris = Math.floor(Math.min(q0, f[obj]) * 10 + 1e-9) / 10; f[obj] = Math.max(0, f[obj] - pris); source = `chez les ${o.nom}`;
        if (pris > 0) f.pertes.push({ t: this.temps, q: pris });
      } else { noter(v, this.temps, 'Cela ne se prend pas ainsi.'); a.fin = this.temps; return; }
    } else {
      pris = Math.floor(Math.min(q0, this.res.nourriture) * 10 + 1e-9) / 10; this.res.nourriture = Math.max(0, this.res.nourriture - pris); source = 'dans la réserve du marché';
    }
    if (pris <= 0) { noter(v, this.temps, `Il n'y avait rien à prendre ${source || 'là'}.`); a.fin = this.temps; return; }
    v.poche[obj] += pris;
    v.stats.prises++;
    this.stats.prises++;
    noter(v, this.temps, `Tu as pris ${pris} ${NOMS_OBJETS[obj]} ${source}, sans rien demander.`);
    // qui a vu ?
    const temoins = this.habitants.filter((w) => w !== v && !w.nourrisson && (w === o || (w.interieur ? w.batiment === o?.foyer : Math.hypot(w.x - v.x, w.z - v.z) < 12)) && w.activite?.action !== 'dormir');
    for (const w of temoins) {
      noter(w, this.temps, `${v.prenom} a pris ${pris} ${NOMS_OBJETS[obj]} ${source}${w === o ? ' : à toi' : ''}.`);
      if (w === o || w.foyer === o?.foyer) { w.besoins.securite = clamp(w.besoins.securite - 15, 0, 100); w.chocJusqua = this.temps + 240; }
      if (w.statut === 'agit') { w.path = null; this.attendre(w); w.priorite = true; }
    }
    if (temoins.length) this.log(`${nomComplet(v)} a été vu${v.genre === 'F' ? 'e' : ''} en train de prendre ${pris} ${NOMS_OBJETS[obj]} ${source}.`, 'mal', [v.id]);
    if (a.parole) this.diffuser(v, a.parole, a.ton);
  }

  acheter(v, a) {
    const obj = a.objet;
    const prix = obj === 'nourriture' ? this.prix : this.prixRemede;
    const stock = obj === 'nourriture' ? this.res.nourriture : this.res.remedes;
    let q = Math.floor((Math.min(a.qte, stock, prix > 0 ? v.poche.pieces / prix : a.qte)) * 10 + 1e-9) / 10;
    if (q < 0.5) {
      noter(v, this.temps, stock < 1 ? `Le marché n'a plus de ${NOMS_OBJETS[obj]}.` : `Tu n'as pas assez de pièces (${Math.round(v.poche.pieces)}) : ${NOMS_OBJETS[obj]} à ${prix} pièce(s).`);
      a.fin = this.temps; return;
    }
    const cout = q * prix;
    v.poche.pieces = Math.max(0, v.poche.pieces - cout);
    this.res.pieces += cout;
    if (obj === 'nourriture') this.res.nourriture = Math.max(0, this.res.nourriture - q); else this.res.remedes = Math.max(0, this.res.remedes - q);
    v.poche[obj] += q;
    this.stats.achats++;
    noter(v, this.temps, `Tu as acheté ${q} ${NOMS_OBJETS[obj]} pour ${Math.round(cout * 10) / 10} pièce(s).`);
    if (a.parole) this.diffuser(v, a.parole, a.ton);
  }

  emmenager(v, a) {
    const b = this.batiment(a.bat);
    if (!b || b.type !== 'maison' || this.occupants(b.id) > 0) { noter(v, this.temps, "Cette maison n'est plus libre."); a.fin = this.temps; return; }
    v.foyer = b.id;
    v.famille = [];
    b.nom = `Maison de ${v.prenom}`;
    this.cacheMembres = null; this.cacheRoster = null;
    noter(v, this.temps, `Tu t'installes dans ${b.nom}.`);
    this.log(`${nomComplet(v)} s'installe dans une maison libre.`, 'info', [v.id]);
  }

  // ---------- Rythmes ----------
  tomberMalade(v) {
    v.malade = true;
    v.besoins.sante = Math.min(v.besoins.sante, 55);
    noter(v, this.temps, 'Tu te sens malade : fièvre et faiblesse.');
    this.log(`${nomComplet(v)} est tombé${v.genre === 'F' ? 'e' : ''} malade.`, 'mal', [v.id]);
  }

  // Les saisons : le jeu change la météo et ses effets physiques ; il ne dit rien à personne.
  saisons() {
    const E = this.etatSaison;
    // une vague de chaleur dure deux mois du village au plus (8 h de jeu) et n'existe qu'en saison chaude
    if (this.meteo.secheresse > this.temps && (E.nom === 'pluie' || E.nom === 'beau')) this.meteo.secheresse = 0;
    else if (this.meteo.secheresse > this.temps + 8 * 60) this.meteo.secheresse = this.temps + 8 * 60;
    if (E.nom !== this.saisonNom) {
      this.saisonNom = E.nom;
      this.log({
        pluie: 'La pluie tombe sur l’île.',
        beau: 'La pluie a cessé : le beau temps revient.',
        chaleur: 'La chaleur s’installe sur l’île.',
        seche: 'La saison sèche commence : la terre se craquelle.',
      }[E.nom], 'evenement');
      this.emit('saison', E);
    }
    // le puits communal alimente les maisons, en toute saison : une quinzaine de doses par jour pour quatre personnes
    if (this.bonus.puits) {
      for (const [id, f] of Object.entries(this.foyers)) {
        const occ = Math.max(1, this.occupants(id));
        f.eau = Math.min(occ * 10, f.eau + 0.15 * occ);
      }
    }
    if (E.pluie) {
      // les jarres des maisons se remplissent, la terre boit
      for (const [id, f] of Object.entries(this.foyers)) {
        const occ = Math.max(1, this.occupants(id));
        f.eau = Math.min(occ * 10, f.eau + 0.9 * occ);
      }
      this.monde.fertilite = clamp(this.monde.fertilite + 0.04, 0.1, 1);
      // sous la pluie, on attrape froid
      for (const v of this.habitants) if (!v.malade && !v.nourrisson && !v.interieur && this.rng.chance(0.006)) this.tomberMalade(v);
    }
  }

  // Les rations du marché ne se gardent pas indéfiniment : elles se gâtent, plus vite par forte chaleur,
  // et l'entrepôt a une capacité (le surplus se perd vite). Les vivres des maisons, eux, restent chez leurs habitants.
  denrees() {
    const stock = this.res.nourriture;
    if (stock <= 0) return;
    const perte = Math.min(stock, stock * 0.0015 * (1 + 2 * this.etatSaison.chaleur) + Math.max(0, stock - CAPACITE_MARCHE) * 0.08);
    this.res.nourriture = stock - perte;
    this.pertesJour = (this.pertesJour || 0) + perte;
  }

  // La fontaine du marché, quand elle existe, est un point d'eau gratuit comme la source ; on va au plus proche.
  versFontaine(v) {
    const f = this.bonus.fontaine && this.batimentsParId.fontaine;
    if (!f) return null;
    return Math.hypot(v.x - f.x, v.z - f.z) < Math.hypot(v.x - ZONES.source.x, v.z - ZONES.source.z) ? f : null;
  }

  prosDeLaFontaine(v) {
    const f = this.bonus.fontaine && this.batimentsParId.fontaine;
    return !!f && Math.hypot(v.x - f.x, v.z - f.z) < 4.5;
  }

  // À l'ombre de la halle du marché, la chaleur pèse comme à l'intérieur d'une maison.
  sousLaHalle(v) {
    if (!this.bonus.halle) return false;
    const h = this.batimentsParId.halle;
    return !!h && Math.abs(v.x - h.x) < h.w / 2 + 1 && Math.abs(v.z - h.z) < h.d / 2 + 1;
  }

  // La caisse du conseil, en jours de salaires (d'après ce qui a été versé hier) ; null tant qu'on ne le sait pas.
  joursDeCaisse() {
    const h = this.historique.at(-1);
    if (!h || !(h.salaires > 0)) return null;
    return this.res.pieces / h.salaires;
  }

  horaire() {
    const h = Math.round(this.heure()) % 24;
    this.saisons();
    this.denrees();
    const jours = this.joursDeCaisse();
    if (jours !== null && jours < 1 && !this.caisseAlertee) { this.caisseAlertee = true; this.log('La caisse du conseil ne couvrira pas une journée de salaires.', 'mal'); }
    else if (jours === null || jours >= 2) this.caisseAlertee = false;
    this.cycleDeVie();
    if (h === 6) this.meteoDuJour();
    if (this.navire && this.temps >= this.navire) { this.navire = 0; this.log('Le navire marchand a repris la mer.', 'evenement'); this.emit('navire', false); }
    if (this.projet?.enAttente && this.peutPayer(PROJETS[this.projet.cle].cout)) this.demarrerProjet();
    this.emit('heure', h);
  }

  quotidien() {
    const rng = this.rng;
    this.historique.push({
      jour: this.jour - 1, humeur: this.moyenne('humeur'), confiance: 0,
      nourriture: Math.round(this.res.nourriture + Object.values(this.foyers).reduce((s, f) => s + f.nourriture, 0)), marche: Math.round(this.res.nourriture),
      pieces: Math.round(this.res.pieces), poisson: this.monde.poisson,
      salaires: Math.round(this.stats.salaires - (this.stats.salairesVeille || 0)), // pièces versées en salaires pendant la journée
    });
    this.stats.salairesVeille = this.stats.salaires;
    if (this.pertesJour >= 15) this.log(`Faute de place et à cause de la chaleur, ${Math.round(this.pertesJour)} rations du marché se sont gâtées.`, 'info');
    this.pertesJour = 0;
    if (this.historique.length > 80) this.historique.shift();
    for (const v of this.habitants) {
      v.impaye = 0;
      if (!v.malade && rng.chance(risqueMaladie(v, this.bonus, this.etatSaison.chaleur))) this.tomberMalade(v);
    }
    this.dettes = this.dettes.filter((d) => d.montant > 0.5);
    this.emit('jour', this.jour);
  }

  meteoDuJour() {
    const rng = this.rng;
    if (rng.chance(0.08)) { this.meteo.tempete = this.temps + rng.range(6, 14) * 60; this.log('Une tempête se lève sur la Méditerranée.', 'evenement'); this.emit('meteo', 'tempete'); }
    else if (['chaleur', 'seche'].includes(this.etatSaison.nom) && rng.chance(0.07)) { this.meteo.secheresse = this.temps + 8 * 60; this.log('Vague de chaleur : les champs souffrent.', 'evenement'); }
    else if (rng.chance(0.1)) { this.meteo.bonnePeche = this.temps + 12 * 60; this.log('Les bancs de sardines s’approchent des côtes.', 'evenement'); }
    if (!this.navire && rng.chance(0.18)) {
      this.navire = this.temps + 11 * 60;
      this.log('Un navire marchand accoste au port jusqu’au soir. Le conseil peut commercer.', 'evenement');
      this.emit('navire', true);
    }
  }

  ajouter(r, q) { this.res[r] = Math.max(0, (this.res[r] || 0) + q); }

  // ---------- Chantiers ----------
  peutPayer(cout) { return Object.entries(cout).every(([r, q]) => this.res[r] >= q); }

  siteProjet(cle) {
    if (cle === 'puits') return { x: 13, z: 24 };
    if (cle === 'fontaine') return { x: PLAZA.x - 7, z: PLAZA.z + 5.5 }; // sur la place, à côté de la halle
    if (cle === 'halle') return { x: PLAZA.x, z: PLAZA.z + 5.5 }; // sur la place du marché, entre les étals
    if (cle === 'jetee') return { x: 2, z: 61 };
    if (cle === 'ecole') return { ...this.batiment('ecole').door };
    const spot = FREE_HOUSE_SPOTS.find(([x, z]) => !this.batiments.some((b) => Math.hypot(b.x - x, b.z - z) < 5));
    return spot ? { x: spot[0], z: spot[1] } : null;
  }

  lancerProjet(cle) {
    if (this.projet) return { ok: false, raison: 'Un chantier est déjà en cours.' };
    if (this.bonus[cle] && cle !== 'maison') return { ok: false, raison: 'Déjà construit.' };
    const site = this.siteProjet(cle);
    if (!site) return { ok: false, raison: 'Plus de terrain disponible.' };
    const def = PROJETS[cle];
    this.projet = { cle, nom: def.nom, progres: 0, travail: def.travail, site, enAttente: true };
    this.annoncerEvenement(`Le conseil ouvre le chantier « ${def.nom} ». Ceux qui veulent y travailler le peuvent (lieu : chantier).`);
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
    if (p.cle === 'maison') {
      const n = this.batiments.filter((b) => b.type === 'maison').length + 1;
      bat = makeBuilding(`maison-${n}`, 'maison', 'Nouvelle maison', p.site.x, p.site.z, 8, 7, Math.atan2(PLAZA.x - p.site.x, PLAZA.z - p.site.z), { etages: 1 });
      this.foyers[bat.id] = { nourriture: 0, eau: 0, pertes: [] };
    } else if (p.cle === 'puits') bat = makeBuilding('puits', 'puits', 'Puits communal', p.site.x, p.site.z, 3, 3, 0);
    else if (p.cle === 'halle') bat = makeBuilding('halle', 'halle', 'Halle ombragée', p.site.x, p.site.z, 9, 4, 0);
    else if (p.cle === 'fontaine') bat = makeBuilding('fontaine', 'fontaine', 'Fontaine du marché', p.site.x, p.site.z, 3, 3, 0);
    this.bonus[p.cle] = true;
    if (bat) { bat.ajoute = true; this.batiments.push(bat); this.batimentsParId[bat.id] = bat; this.nav.blockBuilding(bat); }
    this.annoncerEvenement(`Le chantier « ${p.nom} » est terminé : ${PROJETS[p.cle].effet}.`);
    this.log(`Chantier terminé : ${p.nom}. ${PROJETS[p.cle].effet}.`, 'bien');
    this.emit('construction', { cle: p.cle, batiment: bat });
    this.emit('projet', null);
  }

  // ---------- Le conseil (le joueur) ----------
  annoncerEvenement(texte) {
    for (const v of this.habitants) noter(v, this.temps, `Au village : ${texte}`);
  }

  // Le conseil parle à un habitant : il l'entend et décide quoi répondre.
  dire(id, message) {
    const v = this.habitant(id);
    if (!v || v.mort || v.nourrisson) return;
    const msg = clip(message, 300);
    (v.dialogue ||= []).push({ t: this.temps, de: 'conseil', texte: msg });
    noter(v, this.temps, `Un membre du conseil te parle : « ${msg} »`);
    if (v.statut === 'agit') { v.path = null; if (v.conversation) this.quitterConversation(v); this.attendre(v); }
    else if (v.statut === 'reflechit') v.reparler = true;
    v.priorite = true;
    this.flux.push({ t: this.temps, id: -1, type: 'conseil', texte: msg, a: v.id });
  }

  annoncer(message) {
    const msg = clip(message, 300);
    this.annoncerEvenement(`Le conseil annonce à tout le village : « ${msg} »`);
    this.flux.push({ t: this.temps, id: -1, type: 'conseil', texte: msg, a: null });
    this.log(`Annonce du conseil : « ${msg} »`, 'conseil');
  }

  repondreRequete(rid, texte) {
    const r = this.requetes.find((x) => x.id === rid);
    if (!r || r.repondue) return;
    r.repondue = true;
    r.reponse = clip(texte, 300);
    this.dire(r.de, `À propos de ta demande (« ${clip(r.texte, 120)} ») : ${r.reponse}`);
  }

  ignorerRequete(rid) {
    const r = this.requetes.find((x) => x.id === rid);
    if (!r || r.repondue) return;
    r.repondue = true;
    r.reponse = null;
    noter(this.habitant(r.de), this.temps, `Le conseil n'a pas répondu à ta demande (« ${clip(r.texte, 100)} »).`);
  }

  donnerAuHabitant(id, objet, q) {
    const v = this.habitant(id);
    if (!v || v.mort) return { ok: false, raison: 'Habitant introuvable.' };
    if (objet === 'pieces') { if (this.res.pieces < q) return { ok: false, raison: 'La caisse est insuffisante.' }; this.res.pieces -= q; }
    else if (objet === 'nourriture') { if (this.res.nourriture < q) return { ok: false, raison: 'Le marché n’a pas assez de rations.' }; this.res.nourriture -= q; }
    else if (objet === 'remedes') { if (this.res.remedes < q) return { ok: false, raison: 'Plus de remèdes.' }; this.res.remedes -= q; }
    else return { ok: false };
    v.poche[objet] += q;
    noter(v, this.temps, `Le conseil t'a remis ${q} ${NOMS_OBJETS[objet]}.`);
    this.log(`Le conseil remet ${q} ${NOMS_OBJETS[objet]} à ${nomComplet(v)}.`, 'conseil', [v.id]);
    return { ok: true, message: `${v.prenom} a reçu ${q} ${NOMS_OBJETS[objet]}.` };
  }

  amender(id, montant, motif = '') {
    const v = this.habitant(id);
    if (!v || v.mort) return { ok: false, raison: 'Habitant introuvable.' };
    const m = Math.min(montant, Math.floor(v.poche.pieces));
    if (m <= 0) return { ok: false, raison: `${v.prenom} n'a pas d'argent sur lui.` };
    v.poche.pieces -= m;
    this.res.pieces += m;
    noter(v, this.temps, `Le conseil t'a infligé une amende de ${m} pièce(s)${motif ? ` : ${clip(motif, 120)}` : ''}.`);
    this.log(`Le conseil inflige ${m} pièces d'amende à ${nomComplet(v)}.`, 'conseil', [v.id]);
    return { ok: true, message: `Amende de ${m} pièces à ${v.prenom}.` };
  }

  confierMetier(id, metier) {
    const v = this.habitant(id);
    if (!v || v.mort || !METIERS_ADULTES.includes(metier) || this.categorie(v) !== 'adulte') return { ok: false };
    v.metier = metier;
    noter(v, this.temps, `Le conseil t'a confié le métier de ${libelleMetier(v).toLowerCase()} (lieu : ${LIEUX[METIERS[metier].lieu].nom}).`);
    this.log(`Le conseil confie le métier de ${libelleMetier(v).toLowerCase()} à ${nomComplet(v)}.`, 'conseil', [v.id]);
    return { ok: true };
  }

  accorderRepos(id) {
    const v = this.habitant(id);
    if (!v || v.mort) return;
    v.reposJusqua = this.temps + MIN_JOUR;
    noter(v, this.temps, 'Le conseil t’accorde un jour de repos : tu n’es pas attendu au travail.');
  }

  fixerSalaire(x) {
    this.salaire = clamp(Math.round(x * 10) / 10, 0, 10);
    this.annoncerEvenement(`Le conseil fixe le salaire à ${this.salaire} pièce(s) par heure travaillée.`);
    this.log(`Salaire fixé à ${this.salaire} pièce(s) par heure.`, 'conseil');
  }

  fixerPrix(x) {
    this.prix = clamp(Math.round(x * 10) / 10, 0, 10);
    this.annoncerEvenement(`Le conseil fixe le prix de la ration à ${this.prix} pièce(s).`);
    this.log(`Prix de la ration fixé à ${this.prix} pièce(s).`, 'conseil');
  }

  distribuer(part = 0.6) {
    const total = this.res.nourriture * part;
    if (total < 2) return { ok: false, raison: 'Le marché est presque vide.' };
    const maisons = this.batiments.filter((b) => b.type === 'maison' && this.occupants(b.id) > 0);
    const somme = maisons.reduce((s, b) => s + this.occupants(b.id), 0);
    this.res.nourriture -= total;
    for (const b of maisons) this.foyers[b.id].nourriture += (total * this.occupants(b.id)) / somme;
    this.annoncerEvenement(`Le conseil a fait distribuer ${Math.round(total)} rations aux maisons du village.`);
    this.log(`Le conseil distribue ${Math.round(total)} rations aux familles.`, 'conseil');
    return { ok: true, message: `${Math.round(total)} rations distribuées.` };
  }

  commercer(operation) {
    if (!this.navire) return { ok: false, raison: 'Aucun navire au port.' };
    const ops = {
      vendreHuile: { donne: { huile: 10 }, recoit: { pieces: 32 }, texte: '10 jarres d’huile vendues pour 32 pièces' },
      acheterBois: { donne: { pieces: 25 }, recoit: { bois: 12 }, texte: '12 bois achetés pour 25 pièces' },
      acheterPierre: { donne: { pieces: 20 }, recoit: { pierre: 12 }, texte: '12 pierres achetées pour 20 pièces' },
      acheterRemedes: { donne: { pieces: 30 }, recoit: { remedes: 8 }, texte: '8 remèdes achetés pour 30 pièces' },
      acheterNourriture: { donne: { pieces: 30 }, recoit: { nourriture: 45 }, texte: '45 rations achetées pour 30 pièces' },
      vendreNourriture: { donne: { nourriture: 40 }, recoit: { pieces: 45 }, texte: '40 rations vendues pour 45 pièces' },
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
    return JSON.stringify({
      version: 3, seed: this.seed, rng: this.rng.state, temps: this.temps,
      journal: this.journal.slice(-200), flux: this.flux.slice(-120), requetes: this.requetes, nextRequete: this.nextRequete,
      res: this.res, prix: this.prix, prixRemede: this.prixRemede, salaire: this.salaire, dettes: this.dettes, monde: this.monde,
      foyers: this.foyers, bonus: this.bonus, projet: this.projet, meteo: this.meteo, navire: this.navire,
      historique: this.historique, stats: this.stats, habitants: this.habitants, interieur: this.interieur,
      defunts: this.defunts, souhaits: this.souhaits, naissancesEnAttente: this.naissancesEnAttente,
      batimentsAjoutes: this.batiments.filter((b) => b.ajoute), noms: this.batiments.map((b) => [b.id, b.nom, b.famille]),
    }, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x));
  }

  static charger(json) {
    const d = JSON.parse(json);
    if (d.version !== 3) throw new Error('Sauvegarde d’une ancienne version');
    const sim = new Simulation({ seed: d.seed });
    sim.batiments = buildLayout();
    for (const b of d.batimentsAjoutes || []) sim.batiments.push(b);
    sim.batimentsParId = Object.fromEntries(sim.batiments.map((b) => [b.id, b]));
    for (const [id, nom, famille] of d.noms || []) if (sim.batimentsParId[id]) Object.assign(sim.batimentsParId[id], { nom, famille });
    sim.nav = new NavGrid(sim.batiments);
    for (const k of ['temps', 'journal', 'flux', 'requetes', 'nextRequete', 'res', 'prix', 'prixRemede', 'salaire', 'dettes', 'monde', 'foyers', 'bonus', 'projet', 'meteo', 'navire', 'historique', 'stats', 'habitants', 'interieur', 'defunts', 'souhaits', 'naissancesEnAttente']) {
      if (d[k] !== undefined) sim[k] = d[k];
    }
    sim.rng.state = d.rng;
    sim.derniereHeure = Math.floor(sim.temps / 60);
    sim.etatSaison = saison(sim.temps);
    sim.saisonNom = sim.etatSaison.nom;
    // numéros d'habitants : vivants et défunts rangés ensemble ; anciennes sauvegardes : dates de naissance déduites de l'âge
    sim.tous = [];
    for (const v of [...sim.habitants, ...(sim.defunts || [])]) {
      if (v.naissance === undefined) v.naissance = sim.temps - (v.age + 0.5) * ANNEE_MIN;
      v.parents ||= []; v.agonie ||= 0;
      sim.tous[v.id] = v;
    }
    sim.stats = { naissances: 0, deces: 0, ...sim.stats };
    sim.stats.salairesVeille ??= sim.stats.salaires || 0;
    const convs = new Map();
    for (const v of sim.habitants) {
      if (v.statut === 'reflechit') v.statut = 'attend';
      if (!v.conversation) continue;
      const key = `${v.conversation.a}-${v.conversation.b}-${v.conversation.debut}`;
      if (!convs.has(key)) convs.set(key, v.conversation);
      v.conversation = convs.get(key);
    }
    return sim;
  }
}
