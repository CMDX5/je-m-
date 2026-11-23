// ESPRIT — comment un habitant apprend par lui-même.
//
// Ce qui est inné (comme chez un être humain) :
//   - des besoins corporels et sociaux qui procurent du bien-être quand ils sont satisfaits ;
//   - la capacité de percevoir ce qui l'entoure, de se souvenir et d'apprendre.
// Ce qui N'est PAS programmé : quand manger, où travailler, qui fréquenter,
// quand se disputer, à quelle heure prier ou dormir. Tout cela est appris
// par l'expérience, l'imitation des autres et ce qu'on se raconte.

import { clamp } from './rng.js';
import { pressionCircadienne } from './monde.js';

export const BESOINS = ['faim', 'energie', 'social', 'sante', 'serenite', 'estime'];
export const NB_TRANCHES = 8; // l'habitant perçoit l'heure en 8 tranches de 3 h

// Répertoire des gestes possibles : seulement CE QUE L'ON PEUT FAIRE et OÙ.
// Aucun horaire, aucune préférence.
export const ACTIONS = {
  dormir: { lieu: 'maison', interieur: true, rendu: 'dormir', etat: 'Dort' },
  manger: { lieu: 'maison', interieur: true, duree: [30, 40], rendu: 'manger', etat: 'Mange à la maison' },
  manger_reserve: { lieu: 'marche', duree: [25, 35], rendu: 'manger', etat: 'Se sert à la réserve commune', age: 8 },
  rester: { lieu: 'maison', interieur: true, duree: [40, 90], rendu: 'rester', etat: 'Reste à la maison' },
  cultiver: { lieu: 'champs', travail: true, age: 12, rendu: 'travailler', etat: 'Cultive les champs' },
  pecher: { lieu: 'jetee', travail: true, age: 14, rendu: 'travailler', etat: 'Pêche depuis la jetée' },
  olives: { lieu: 'oliveraie', travail: true, age: 10, rendu: 'travailler', etat: 'Récolte les olives' },
  pierre: { lieu: 'carriere', travail: true, age: 16, rendu: 'travailler', etat: 'Taille la pierre' },
  bois: { lieu: 'foret', travail: true, age: 16, rendu: 'travailler', etat: 'Coupe du bois' },
  artisanat: { lieu: 'atelier', interieur: true, travail: true, age: 13, rendu: 'travailler', etat: "Travaille à l'atelier" },
  commercer: { lieu: 'marche', travail: true, age: 16, rendu: 'travailler', etat: 'Tient un étal au marché' },
  soigner: { lieu: 'dispensaire', interieur: true, travail: true, age: 18, rendu: 'travailler', etat: 'Soigne au dispensaire' },
  enseigner: { lieu: 'ecole', interieur: true, travail: true, age: 20, rendu: 'travailler', etat: "Fait classe à l'école" },
  construire: { lieu: 'chantier', travail: true, age: 16, rendu: 'travailler', etat: 'Travaille sur le chantier' },
  apprendre: { lieu: 'ecole', interieur: true, age: 5, ageMax: 17, duree: [90, 180], rendu: 'ecole', etat: "Apprend à l'école" },
  se_soigner: { lieu: 'dispensaire', interieur: true, duree: [40, 60], rendu: 'soigner', etat: 'Se fait soigner' },
  prier: { lieu: 'mosquee', interieur: true, duree: [20, 40], age: 7, rendu: 'prier', etat: 'Prie à la mosquée' },
  plage: { lieu: 'plage', duree: [50, 110], rendu: 'flaner', etat: 'Se promène sur la plage' },
  source: { lieu: 'source', duree: [50, 110], rendu: 'flaner', etat: 'Va à la source' },
  belvedere: { lieu: 'belvedere', duree: [60, 120], age: 8, rendu: 'flaner', etat: 'Monte au belvédère' },
  place: { lieu: 'marche', duree: [40, 100], rendu: 'socialiser', etat: 'Passe du temps sur la place' },
  port: { lieu: 'port', duree: [40, 100], rendu: 'socialiser', etat: 'Traîne au port' },
  jouer: { lieu: 'cour_ecole', duree: [40, 80], ageMax: 13, rendu: 'jouer', etat: 'Joue avec les autres enfants' },
  fete: { lieu: 'marche', duree: [60, 120], rendu: 'fete', etat: 'Fait la fête sur la place' },
  donner: { lieu: 'marche', duree: [15, 20], age: 14, rendu: 'socialiser', etat: 'Apporte des vivres à la réserve' },
  // gestes envers une personne précise (la cible est choisie au moment de décider)
  visiter: { social: true, duree: [30, 60], age: 6, rendu: 'socialiser', etat: 'Rend visite' },
  aider: { social: true, duree: [25, 40], age: 12, rendu: 'aider', etat: 'Vient en aide' },
  confronter: { social: true, duree: [10, 20], age: 13, rendu: 'socialiser', etat: 'Va demander des comptes' },
  chaparder: { social: true, duree: [10, 15], age: 9, rendu: 'socialiser', etat: 'Rôde près d’une maison' },
};

// Forme à l'infinitif, pour exprimer ce qui a été appris.
export const INFINITIF = {
  dormir: 'dormir', manger: 'manger à la maison', manger_reserve: 'se servir à la réserve commune', rester: 'rester à la maison',
  cultiver: 'cultiver les champs', pecher: 'pêcher', olives: 'récolter les olives', pierre: 'tailler la pierre', bois: 'couper du bois',
  artisanat: "travailler à l'atelier", commercer: 'tenir un étal', soigner: 'soigner les malades', enseigner: 'faire la classe',
  construire: 'travailler au chantier', apprendre: "aller à l'école", se_soigner: 'se faire soigner', prier: 'prier à la mosquée',
  plage: 'marcher sur la plage', source: 'aller à la source', belvedere: 'monter au belvédère', place: 'passer du temps sur la place',
  port: 'traîner au port', jouer: 'jouer avec les autres', fete: 'faire la fête', donner: 'apporter des vivres à la réserve',
  visiter: 'rendre visite à un proche', aider: 'aider quelqu’un', confronter: 'demander des comptes', chaparder: 'se servir chez les voisins',
};

export const TRAVAUX = Object.keys(ACTIONS).filter((a) => ACTIONS[a].travail);

// Correspondance gestes répétés → métier reconnu par les autres (purement descriptif).
export const METIER_DE_TRAVAIL = {
  cultiver: 'agriculteur', pecher: 'pecheur', olives: 'oleiculteur', pierre: 'batisseur', bois: 'charpentier',
  artisanat: 'artisan', commercer: 'marchand', soigner: 'soignant', enseigner: 'enseignant', construire: 'batisseur',
};

// Usure naturelle par heure (le corps a faim, se fatigue, se sent seul… sans rien faire).
// Doit correspondre à Simulation.majBesoins.
export function usureNaturelle(v, h = 12) {
  return {
    faim: -3.6, energie: -2.7 * (v.age > 64 ? 1.15 : 1) * pressionCircadienne(h), social: -1.8 * (0.5 + v.traits.sociabilite),
    sante: 0, serenite: -0.6, estime: -0.48,
  };
}

export const tranche = (h) => Math.floor(h / 3) % NB_TRANCHES;
const u = (x) => 100 * (1 - Math.pow((100 - clamp(x, 0, 100)) / 100, 2)); // utilité concave
const du = (x) => (2 * (100 - clamp(x, 0, 100))) / 100; // utilité marginale

// ---------- Inné : à quel point chaque besoin compte pour cette personne ----------
export function poids(v) {
  const t = v.traits;
  return {
    faim: 1.0,
    energie: 0.85,
    sante: 1.0,
    social: 0.3 + 0.8 * t.sociabilite,
    serenite: 0.35 + 0.35 * t.piete + 0.25 * t.patience,
    estime: 0.2 + 0.7 * t.ardeur,
    securite: v.age < 14 ? 0.1 : 0.35 + 0.6 * t.patience,
  };
}

export function securite(sim, v) {
  const membres = sim.membresFoyer(v.foyer);
  const stock = sim.foyers[v.foyer]?.nourriture ?? 0;
  return clamp(stock / (membres * 5), 0, 1) * 100;
}

export function bienEtre(sim, v) {
  const w = poids(v);
  let s = 0, tot = 0;
  for (const k of BESOINS) { s += w[k] * u(v.besoins[k]); tot += w[k]; }
  s += w.securite * u(securite(sim, v));
  tot += w.securite;
  return s / tot;
}

// ---------- Création d'un esprit « neuf » ----------
// Instincts : les deux seuls savoirs innés, faibles, que l'expérience corrigera.
// (Un nouveau-né sait téter et dormir ; il ne sait ni pêcher ni commercer.)
function instincts() {
  const m = {};
  const cel = (d) => ({ n: 1, d: { faim: 0, energie: 0, social: 0, sante: 0, serenite: 0, estime: 0, ...d }, ds: 0 });
  m.manger = {};
  m.dormir = {};
  for (let tb = 0; tb < NB_TRANCHES; tb++) {
    m.manger[tb] = cel({ faim: 45 });
    m.dormir[tb] = cel({ energie: 8 });
  }
  return m;
}

export function nouvelEsprit() {
  return {
    modele: instincts(), // action -> tranche -> { n, d: {besoin: Δ/heure}, ds: Δsécurité/heure }
    essais: {}, // action -> nombre total d'essais
    vu: {}, // action -> tranche -> fréquence observée chez les autres (0..1)
    competence: {}, // travail -> 0..1, s'acquiert par la pratique
    travailRecent: {}, // travail -> heures (décroît), d'où émerge le « métier »
    griefs: {}, // id -> rancune (0..1) née d'un tort réellement subi
    episode: null,
    appris: 0, // nombre d'expériences vécues
    transmis: 0, // connaissances reçues des autres
    bloquesJetee: 0,
    pechesJetee: 0,
    faimsSansRepas: 0,
  };
}

function cellule(e, a, tb, creer = false) {
  let ma = e.modele[a];
  if (!ma) { if (!creer) return null; ma = e.modele[a] = {}; }
  let c = ma[tb];
  if (!c && creer) c = ma[tb] = { n: 0, d: Object.fromEntries(BESOINS.map((k) => [k, 0])), ds: 0 };
  return c || null;
}

// Prédiction de ce que fera une action, à partir de l'expérience propre.
// Sans expérience à cette heure-là, on généralise depuis les autres heures (moins fiable).
export function predire(e, a, tb) {
  const ma = e.modele[a];
  if (!ma) return null;
  // moyenne sur tous les moments de la journée (généralisation)
  let n = 0, ds = 0;
  const d = Object.fromEntries(BESOINS.map((k) => [k, 0]));
  for (const cc of Object.values(ma)) {
    n += cc.n;
    for (const k of BESOINS) d[k] += cc.d[k] * cc.n;
    ds += cc.ds * cc.n;
  }
  if (!n) return null;
  for (const k of BESOINS) d[k] /= n;
  ds /= n;
  // l'expérience à ce moment précis prime dès qu'elle existe
  const c = ma[tb];
  const nc = c ? c.n : 0;
  const k0 = 0.6;
  const mix = (x, y) => (nc * x + k0 * y) / (nc + k0);
  const out = { n, d: {}, ds: c ? mix(c.ds, ds) : ds, conf: n / (n + 1) };
  for (const k of BESOINS) out.d[k] = c ? mix(c.d[k], d[k]) : d[k];
  return out;
}

// ---------- Apprendre d'une expérience vécue ----------
export function debuterEpisode(sim, v, a, extra = {}) {
  v.esprit.episode = { a, tb: tranche(sim.heure()), t: sim.temps, besoins: { ...v.besoins }, sec: securite(sim, v), ...extra };
}

export function conclureEpisode(sim, v) {
  const ep = v.esprit.episode;
  if (!ep) return null;
  v.esprit.episode = null;
  const heures = (sim.temps - ep.t) / 60;
  if (heures < 0.15) return null;
  const e = v.esprit;
  const c = cellule(e, ep.a, ep.tb, true);
  c.n++;
  e.essais[ep.a] = (e.essais[ep.a] || 0) + 1;
  e.appris++;
  // apprentissage : les impatients retiennent surtout le récent
  const alpha = Math.max(1 / c.n, 0.06 + 0.16 * (1 - v.traits.patience));
  // l'habitant sent son corps s'user de lui-même (intéroception) : il juge l'action
  // sur ce qu'elle a changé PAR RAPPORT à cette usure naturelle
  const usure = usureNaturelle(v, (((ep.t % 1440) + 1440) % 1440) / 60);
  for (const k of BESOINS) {
    const naturel = Math.min(100, Math.max(0, ep.besoins[k] + usure[k] * heures)); // ce qui serait arrivé sans rien faire
    const obs = (v.besoins[k] - naturel) / heures;
    // besoin déjà comblé (ou épuisé) : l'observation est tronquée, elle ne prouve pas l'inutilité
    if (v.besoins[k] >= 99.5 && obs < c.d[k]) continue;
    if (v.besoins[k] <= 0.5 && obs > c.d[k]) continue;
    c.d[k] += alpha * (obs - c.d[k]);
  }
  // contribution PERSONNELLE au garde-manger (ce que j'ai rapporté moins ce que j'ai mangé),
  // indépendamment de ce que la famille a consommé entre-temps
  const membres = sim.membresFoyer(v.foyer);
  const dsObs = (((ep.apport || 0) - (ep.consomme || 0)) / (membres * 5)) * 100 / heures;
  c.ds += alpha * (dsObs - c.ds);

  // ressenti global de l'épisode (pour la mémoire des moments marquants)
  const avant = bienEtreDepuis(sim, v, ep.besoins, ep.sec);
  const apres = bienEtre(sim, v);
  return { a: ep.a, heures, ressenti: apres - avant, cible: ep.cible };
}

function bienEtreDepuis(sim, v, besoins, sec) {
  const w = poids(v);
  let s = 0, tot = 0;
  for (const k of BESOINS) { s += w[k] * u(besoins[k]); tot += w[k]; }
  s += w.securite * u(sec);
  return s / (tot + w.securite);
}

// ---------- Évaluer une action possible ----------
// valeur = bien-être attendu (selon l'expérience) + curiosité + influence des autres
export function valeur(sim, v, a, duree, extra = {}) {
  const e = v.esprit;
  const tb = tranche(sim.heure());
  const w = poids(v);
  const p = predire(e, a, tb);
  let val = 0;
  if (p) {
    // on ne peut pas combler plus que ce qui manque
    // bénéfice attendu PAR HEURE (on compare des usages de son temps)
    const h = Math.max(0.5, duree);
    for (const k of BESOINS) val += (w[k] * du(v.besoins[k]) * Math.min(p.d[k] * duree, 100 - v.besoins[k]) * p.conf) / h;
    val += (w.securite * du(securite(sim, v)) * Math.min(p.ds * duree, 100 - securite(sim, v)) * p.conf) / h;
    // enchaîner deux choses apprises : « ce geste rapporte des vivres » + « manger calme la faim »
    const membres = sim.membresFoyer(v.foyer);
    const stock = sim.foyers[v.foyer]?.nourriture ?? 0;
    const rationsH = (p.ds * membres * 5) / 100;
    if (rationsH > 0 && stock < membres * 1.5) {
      const repas = predire(e, 'manger', tb);
      const gainRepas = repas ? Math.max(0, repas.d.faim) * 0.6 : 0; // ce qu'un repas m'a apporté
      val += rationsH * w.faim * du(v.besoins.faim) * Math.min(gainRepas, 100 - v.besoins.faim) * p.conf * (repas ? repas.conf : 0) / Math.max(1, membres / 2);
    }
  }
  // ce que l'on perçoit directement : garde-manger vide, réserve vue vide
  if (a === 'manger' && (sim.foyers[v.foyer]?.nourriture ?? 0) < 0.6) val = Math.min(val, 0) - 2;
  if (a === 'manger_reserve' && e.reserveVue !== undefined && e.reserveVue < 1) val = Math.min(val, 0) - 2;
  // curiosité : l'inconnu attire les curieux
  // (à chaque moment de la journée : ce qui échoue la nuit peut réussir le jour)
  // (la faim, la fatigue ou la peine rendent moins curieux)
  const nCase = cellule(e, a, tb)?.n || 0;
  const disponibilite = Math.min(1, Math.min(v.besoins.faim, v.besoins.energie, v.besoins.sante) / 50);
  val += disponibilite * ((1 + 5 * v.traits.curiosite) / Math.sqrt(1 + (e.essais[a] || 0)) + (0.5 + v.traits.curiosite) / Math.sqrt(1 + nCase));
  // on fait volontiers ce que l'on voit faire autour de soi à cette heure-là
  val += 6 * v.traits.sociabilite * (e.vu[a]?.[tb] || 0);
  // une demande du conseil pèse selon la confiance qu'on lui accorde (et peut braquer)
  if (v.demande === a) val += ((v.confiance - 40) / 60) * 6;
  // une intention formée en réfléchissant
  if (v.intention && v.intention.action === a && sim.temps < v.intention.jusqua) val += 4;
  if (extra.bonus) val += extra.bonus;
  return val;
}

// ---------- Observer les autres (imitation) ----------
export function observer(sim, v) {
  if (v.interieur) return;
  const e = v.esprit;
  const tb = tranche(sim.heure());
  const vus = {};
  let total = 0;
  for (const o of sim.habitants) {
    if (o === v || o.interieur || !o.activite) continue;
    if (Math.hypot(o.x - v.x, o.z - v.z) > 22) continue;
    // on imite davantage ceux qu'on apprécie et qui ont l'air bien
    const r = v.relations[o.id];
    const admiration = Math.max(0.2, 1 + (r ? r.aff : 0) / 100) * (0.5 + o.moral / 100);
    vus[o.activite.action] = (vus[o.activite.action] || 0) + admiration;
    total += admiration;
  }
  if (!total) return;
  for (const a of Object.keys(ACTIONS)) {
    const f = (vus[a] || 0) / total;
    const m = (e.vu[a] ||= {});
    m[tb] = (m[tb] || 0) * 0.85 + f * 0.15;
  }
}

// ---------- Transmission (on se raconte ce qu'on a appris) ----------
// L'orateur partage ce qui lui réussit le mieux ; l'auditeur l'intègre selon sa confiance.
export function transmettre(sim, orateur, auditeur) {
  const eo = orateur.esprit, ea = auditeur.esprit;
  const confiance = clamp(0.1 + (auditeur.relations[orateur.id]?.aff ?? 0) / 150, 0.02, 0.6);
  // l'action dont l'orateur est le plus content (en moyenne)
  let meilleure = null, best = -Infinity;
  for (const [a, cases] of Object.entries(eo.modele)) {
    if (ACTIONS[a]?.social) continue;
    for (const [tb, c] of Object.entries(cases)) {
      if (c.n < 3) continue;
      const g = BESOINS.reduce((s, k) => s + c.d[k], 0) + c.ds;
      if (g > best) { best = g; meilleure = [a, Number(tb), c]; }
    }
  }
  if (!meilleure) return null;
  const [a, tb, c] = meilleure;
  if (auditeur.age < (ACTIONS[a].age || 0) || auditeur.age > (ACTIONS[a].ageMax || 200)) return null;
  const ca = cellule(ea, a, tb, true);
  const poidsRecu = confiance * (ca.n ? 0.3 : 1);
  for (const k of BESOINS) ca.d[k] += poidsRecu * (c.d[k] - ca.d[k]);
  ca.ds += poidsRecu * (c.ds - ca.ds);
  ca.n = Math.max(ca.n, 0.5); // c'est un « on m'a dit », pas une expérience
  ea.transmis++;
  return { a, tb };
}

// Les enfants héritent d'une partie de ce que savent leurs parents (le soir, en famille).
export function heriter(enfant, parent) {
  for (const [a, cases] of Object.entries(parent.esprit.modele)) {
    const act = ACTIONS[a];
    if (!act || enfant.age < (act.age || 0) || enfant.age > (act.ageMax || 200)) continue;
    for (const [tb, c] of Object.entries(cases)) {
      if (c.n < 2) continue;
      const ce = cellule(enfant.esprit, a, Number(tb), true);
      if (ce.n > 3) continue;
      for (const k of BESOINS) ce.d[k] += 0.25 * (c.d[k] - ce.d[k]);
      ce.ds += 0.25 * (c.ds - ce.ds);
      ce.n = Math.max(ce.n, 0.5);
    }
  }
}

// Métier reconnu : ce que la personne fait réellement le plus souvent.
export function metierEmergent(v) {
  let best = null, h = 0;
  for (const [a, x] of Object.entries(v.esprit.travailRecent)) if (x > h) { h = x; best = a; }
  if (!best || h < 3) return null;
  return METIER_DE_TRAVAIL[best];
}

// Ce que l'habitant « croit savoir » : ses meilleures découvertes, pour l'interface.
export function croyances(sim, v, n = 5) {
  const out = [];
  const noms = { faim: 'la faim', energie: 'la fatigue', social: 'la solitude', sante: 'la santé', serenite: "l'inquiétude", estime: "l'estime de soi" };
  for (const [a, cases] of Object.entries(v.esprit.modele)) {
    for (const [tb, c] of Object.entries(cases)) {
      if (c.n < 2) continue;
      let k = null, m = 0;
      for (const b of BESOINS) if (Math.abs(c.d[b]) > Math.abs(m)) { m = c.d[b]; k = b; }
      if (!k || Math.abs(m) < 2) continue;
      out.push({ a, tb: Number(tb), n: c.n, besoin: k, effet: m, texte: `${INFINITIF[a] || a} vers ${Number(tb) * 3}h–${Number(tb) * 3 + 3}h ${m > 0 ? 'soulage' : 'aggrave'} ${noms[k]}` });
    }
  }
  // un savoir par geste (le plus solide), pour refléter la variété de ce qui a été appris
  out.sort((x, y) => Math.abs(y.effet) * Math.log(1 + y.n) - Math.abs(x.effet) * Math.log(1 + x.n));
  const vus = new Set();
  return out.filter((c) => !vus.has(c.a) && vus.add(c.a)).slice(0, n);
}

// Ce qu'on attend d'une action d'après sa seule expérience (sans curiosité ni influence).
export function attente(sim, v, a, duree = 1) {
  const e = v.esprit;
  const p = predire(e, a, tranche(sim.heure()));
  if (!p) return 0;
  const w = poids(v);
  let val = 0;
  const h = Math.max(0.5, duree);
  for (const k of BESOINS) val += (w[k] * du(v.besoins[k]) * Math.min(p.d[k] * duree, 100 - v.besoins[k]) * p.conf) / h;
  return val;
}
