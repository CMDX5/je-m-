// Cycle de vie : calendrier (une année = 2 jours), vieillissement, mort, nourrissons, grossesse et naissance.
// On vérifie les LOIS du monde ; ce que les habitants en pensent, disent ou décident ne vient pas du jeu.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { ANNEE_MIN, MOIS_MIN, SEMAINE_MIN, MIN_JOUR, risqueDecesAnnuel } from '../src/sim/vie.js';

// ---- calendrier ----
assert.equal(ANNEE_MIN, 2 * MIN_JOUR, 'une année dure deux jours');
assert.equal(MOIS_MIN, 4 * 60, 'un mois dure quatre heures');
assert.ok(Math.abs(SEMAINE_MIN - 55.4) < 0.1, 'une semaine dure environ 55 minutes');
assert.ok(risqueDecesAnnuel(20) < 0.002 && risqueDecesAnnuel(70) > 0.02 && risqueDecesAnnuel(90) > 0.1 && risqueDecesAnnuel(0) === 0.04, 'la mortalité augmente avec l\'âge');

// avance le temps heure par heure en faisant manger et boire tout le monde (personne ne « pense » dans ces tests)
const avancer = (sim, minutes) => {
  for (let t = 0; t < minutes; t += 60) {
    for (const v of sim.habitants) if (!v.nourrisson) { v.besoins.faim = Math.max(v.besoins.faim, 70); v.besoins.soif = Math.max(v.besoins.soif, 70); }
    sim.update(Math.min(60, minutes - t));
  }
};
const nouveau = (seed = 3) => new Simulation({ seed }).init();
const dormir = (sim, ids) => { for (const id of ids) { const v = sim.habitant(id); v.statut = 'agit'; v.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} }; v.interieur = true; v.batiment = v.foyer; v.besoins.faim = 90; v.besoins.soif = 90; v.besoins.sante = 100; v.malade = false; } };

// ---- vieillir : un an = 2 jours ----
{
  const sim = nouveau();
  const v = sim.habitant(5);
  const age0 = v.age;
  sim.rng.chance = () => false; // aucun décès dans ce test
  avancer(sim, ANNEE_MIN + 60);
  assert.equal(v.age, age0 + 1, 'après une année (2 jours), un an de plus');
  assert.ok(v.evenements.some((e) => /Tu as maintenant/.test(e.texte)), 'il perçoit son anniversaire comme un fait');
  assert.equal(sim.annee, 2);
}

// ---- passages d'âge : école, majorité ----
{
  const sim = nouveau();
  sim.rng.chance = () => false;
  const e = sim.habitants.find((v) => v.metier === 'enfant');
  e.naissance = sim.temps - 5.99 * ANNEE_MIN; e.age = 5;
  const el = sim.habitants.find((v) => v.metier === 'eleve');
  el.naissance = sim.temps - 16.99 * ANNEE_MIN; el.age = 16;
  avancer(sim, 2 * 60);
  assert.equal(e.metier, 'eleve', 'à 6 ans, il va à l\'école');
  assert.equal(el.metier, 'sansmetier', 'à 17 ans, il est adulte sans métier confié');
  assert.equal(sim.confierMetier(el.id, 'pecheur').ok, true, 'le conseil peut lui confier un métier');
}

// ---- la mort : faim, vieillesse, effets ----
{
  const sim = nouveau();
  sim.rng.chance = () => false;
  const v = sim.habitants.find((x) => x.age > 30 && x.age < 60 && x.famille.length);
  const proche = sim.habitant(v.famille[0]);
  const autre = sim.habitants.find((x) => x.foyer !== v.foyer && !x.nourrisson);
  const avantArgent = proche.poche.pieces;
  v.poche.pieces = 40; v.besoins.sante = 0; v.besoins.faim = 2; v.besoins.soif = 50;
  sim.dettes.push({ de: v.id, a: autre.id, montant: 10 });
  const requete = { id: 99, de: v.id, texte: 'Aidez-nous', t: 0, repondue: false }; sim.requetes.push(requete);
  const n = sim.habitants.length;
  sim.marquerEnvoye(v.id);
  sim.update(200); // l'agonie dure assez longtemps pour qu'il s'éteigne
  assert.ok(v.mort, 'un corps sans santé pendant assez longtemps meurt');
  assert.equal(v.mort.cause, 'de faim');
  assert.equal(sim.habitants.length, n - 1);
  assert.ok(!sim.habitants.includes(v) && sim.defunts.includes(v) && sim.habitant(v.id) === v, 'sorti des vivants, retrouvable par son numéro');
  assert.equal(sim.vivant(v.id), undefined);
  assert.equal(proche.poche.pieces, avantArgent + 40, 'son argent revient à un proche');
  assert.ok(!sim.dettes.some((d) => d.de === v.id), 'ses dettes s\'éteignent');
  assert.equal(requete.repondue, true, 'sa demande au conseil est close');
  assert.ok(proche.evenements.some((e) => /est mort/.test(e.texte) && /faisait partie de ta famille/.test(e.texte)), 'sa famille l\'apprend comme un fait');
  assert.ok(autre.evenements.some((e) => /est mort/.test(e.texte)), 'tout le village l\'apprend');
  assert.ok(sim.journal.some((e) => /est mort/.test(e.texte)), 'la chronique le consigne');
  assert.match(sim.construirePrompt(proche.id), /Ceux que tu as perdus : .*mort.*de faim/, 'ses proches le perçoivent ainsi');
  assert.ok(!new RegExp(`Ta famille : .*${v.prenom} \\(`).test(sim.construirePrompt(proche.id)), 'il n\'est plus listé parmi les vivants de la famille');
  // un habitant mort ne décide plus, et un message en retard ne le ressuscite pas
  sim.appliquer(v.id, { pensee: 'Je suis là', humeur: 50, action: 'rien', parole: '' });
  assert.notEqual(v.pensee, 'Je suis là');
  sim.dire(v.id, 'Bonjour'); assert.equal(v.dialogue.length, 0);
  assert.equal(sim.donnerAuHabitant(v.id, 'pieces', 5).ok, false);
  assert.ok(sim.habitants.every((o) => o !== v));
}

// ---- mort de vieillesse : le risque augmente avec l'âge ----
{
  const sim = nouveau(11);
  let morts = 0;
  const vieux = sim.habitants.filter((v) => v.age >= 64);
  for (const v of vieux) { v.age = 90; v.naissance = sim.temps - 90.5 * ANNEE_MIN; }
  for (let i = 0; i < 10 * 24; i++) { for (const v of sim.habitants) { v.besoins.faim = 90; v.besoins.soif = 90; } sim.update(60); }
  morts = vieux.filter((v) => v.mort).length;
  assert.ok(morts >= Math.floor(vieux.length / 2), `à 90 ans, la moitié au moins est morte après 5 ans du village (${morts}/${vieux.length})`);
  assert.ok(vieux.filter((v) => v.mort).every((v) => v.mort.cause === 'de vieillesse' || /maladie|faiblesse/.test(v.mort.cause)));
}

// ---- avoir un enfant : lois et consentement ----
{
  const sim = nouveau(5);
  sim.rng.chance = () => false;
  const adultes = sim.habitants.filter((v) => v.age >= 17);
  const femme = adultes.find((v) => v.genre === 'F' && v.age < 40 && v.age >= 22 && v.conjoint == null) || adultes.find((v) => v.genre === 'F' && v.age < 40);
  const homme = adultes.find((v) => v.genre === 'H' && v.foyer !== femme.foyer && v.age < 70);
  const memeFoyer = adultes.find((v) => v.genre === 'H' && v.foyer === femme.foyer && v.id !== femme.conjoint);
  const conjoint = femme.conjoint != null ? sim.habitant(femme.conjoint) : null;
  assert.equal(sim.verifierProjetEnfant(femme, femme), 'personne de ce nom');
  assert.match(sim.verifierProjetEnfant(femme, adultes.find((v) => v.genre === 'F' && v !== femme)), /homme et une femme/);
  const enfant = sim.habitants.find((v) => v.age < 17);
  assert.match(sim.verifierProjetEnfant(femme, enfant), /17 ans/);
  if (memeFoyer) assert.match(sim.verifierProjetEnfant(femme, memeFoyer), /même famille/, 'pas au sein de la famille');
  if (conjoint) assert.equal(sim.verifierProjetEnfant(femme, conjoint), null, 'un couple le peut');
  const vieille = adultes.find((v) => v.genre === 'F' && v.age > 50);
  if (vieille) assert.match(sim.verifierProjetEnfant(vieille, homme), /plus en âge/);
  assert.equal(sim.verifierProjetEnfant(femme, homme), null);

  // un seul souhait ne suffit pas : l'autre doit le vouloir aussi
  const placer = (a, b) => { for (const v of [a, b]) { v.interieur = false; v.batiment = null; v.statut = 'attend'; v.x = 0; v.z = 10; } };
  placer(femme, homme);
  sim.marquerEnvoye(femme.id);
  sim.appliquer(femme.id, { pensee: 'Je voudrais un enfant.', humeur: 60, action: 'avoir_un_enfant', personne: homme.prenom, parole: '' });
  sim.update(120);
  assert.equal(femme.enceinte, null, 'sans son accord, il n\'y a pas de grossesse');
  assert.ok(homme.evenements.some((e) => /voudrait avoir un enfant avec toi/.test(e.texte)), 'il l\'apprend comme un fait');
  assert.equal(homme.statut, 'attend', 'et décide en priorité');
  // lui répond : il le veut aussi
  placer(femme, homme);
  sim.marquerEnvoye(homme.id);
  sim.appliquer(homme.id, { pensee: 'Moi aussi.', humeur: 70, action: 'avoir_un_enfant', personne: femme.prenom, parole: '' });
  sim.update(120);
  assert.ok(femme.enceinte && femme.enceinte.pere === homme.id, 'quand les deux le veulent, elle attend un enfant');
  assert.match(sim.construirePrompt(femme.id), /Tu attends un enfant de .* mois sur 9/);
  assert.match(sim.construirePrompt(homme.id), new RegExp(`${femme.prenom} attend ton enfant`));
  assert.match(sim.verifierProjetEnfant(femme, homme), /attend déjà/);

  // grossesse : 9 mois = 36 h ; naissance sans prénom
  dormir(sim, [femme.id, homme.id]);
  avancer(sim, 8 * MOIS_MIN);
  assert.equal(sim.naissancesEnAttente.length, 0, 'pas avant 9 mois');
  const avant = sim.habitants.length;
  avancer(sim, 2 * MOIS_MIN);
  assert.equal(sim.naissancesEnAttente.length, 1, 'au terme, l\'enfant naît et attend un prénom');
  assert.match(sim.construirePrompt(femme.id), /vient de naître .* n'a pas encore de prénom/);
  assert.equal(sim.habitants.length, avant, 'il n\'existe pas encore sans prénom');
  femme.statut = 'reflechit';
  // ses parents le nomment : un prénom déjà pris est refusé, un autre accepté
  const pris = sim.habitant(0).prenom;
  sim.appliquer(femme.id, { pensee: 'Mon enfant.', humeur: 80, action: 'rien', parole: '', prenom_enfant: pris });
  assert.equal(sim.habitants.length, avant, 'prénom déjà porté : refusé');
  assert.ok(femme.evenements.some((e) => /déjà porté/.test(e.texte)));
  femme.statut = 'reflechit';
  sim.appliquer(femme.id, { pensee: 'Mon enfant.', humeur: 80, action: 'rien', parole: '', prenom_enfant: 'zahra' });
  const bebe = sim.habitants.find((v) => v.prenom === 'Zahra');
  assert.ok(bebe, 'l\'enfant naît avec le prénom choisi par ses parents (mis en majuscule)');
  assert.equal(sim.habitants.length, avant + 1);
  assert.equal(bebe.id, sim.tous.length - 1);
  assert.equal(bebe.nom, homme.nom);
  assert.ok(bebe.nourrisson && bebe.age === 0 && bebe.statut === 'agit');
  assert.deepEqual(bebe.parents, [femme.id, homme.id]);
  assert.equal(bebe.foyer, femme.foyer);
  assert.ok(femme.famille.includes(bebe.id) && homme.famille.includes(bebe.id));
  assert.equal(femme.enceinte, null);
  assert.match(sim.verifierProjetEnfant(femme, homme), /vient d'accoucher/);
  assert.equal(sim.stats.naissances, 1);

  // un nourrisson ne décide pas, n'appelle aucun modèle, et la maison le nourrit
  assert.ok(!sim.demandes().includes(bebe.id));
  const stock = sim.foyers[bebe.foyer].nourriture;
  avancer(sim, 24 * 60);
  assert.ok(!sim.demandes().includes(bebe.id), 'toujours aucune demande de décision');
  assert.ok(sim.foyers[bebe.foyer].nourriture < stock + 1, 'la maison le nourrit');
  assert.ok(bebe.besoins.faim > 40 && !bebe.mort, 'il va bien tant qu\'il y a des provisions');
  sim.dire(bebe.id, 'coucou'); assert.equal(bebe.statut, 'agit', 'le conseil ne le fait pas « décider »');
  const parlant = sim.habitants.find((v) => v.age >= 17 && v.statut === 'attend');
  if (parlant) { sim.marquerEnvoye(parlant.id); sim.appliquer(parlant.id, { pensee: '…', humeur: 50, action: 'parler', personne: bebe.prenom, parole: 'Coucou' }); assert.ok(parlant.evenements.some((e) => /nourrisson/.test(e.texte))); }
  assert.match(sim.construirePrompt(femme.id), /nourrisson/);

  // il grandit : à 2 ans, il commence à décider (mémoire vide)
  sim.rng.chance = () => false;
  avancer(sim, 2 * ANNEE_MIN + 120);
  assert.equal(bebe.nourrisson, false);
  assert.ok(bebe.age >= 2);
  assert.ok(bebe.statut === 'attend' || bebe.statut === 'reflechit' || bebe.statut === 'agit');
  assert.equal(bebe.souvenirs.length, 0, 'une mémoire vide : il apprend de sa propre vie');

  // sauvegarde : naissance, mort et parenté survivent
  sim.mourir(sim.habitant(0), 'subitement');
  const copie = Simulation.charger(sim.serialiser());
  assert.equal(copie.habitants.length, sim.habitants.length);
  assert.equal(copie.defunts.length, 1);
  assert.equal(copie.habitant(bebe.id).prenom, 'Zahra');
  assert.equal(copie.habitant(0).mort.cause, 'subitement', 'un défunt reste retrouvable après rechargement');
  copie.update(60);
}

// ---- prénom non choisi : le village en donne un après 12 h ----
{
  const sim = nouveau(8);
  sim.rng.chance = () => false;
  const mere = sim.habitants.find((v) => v.genre === 'F' && v.age >= 20 && v.age < 40);
  const pere = sim.habitants.find((v) => v.genre === 'H' && v.foyer !== mere.foyer && v.age < 60);
  mere.enceinte = { pere: pere.id, debut: sim.temps - 9 * MOIS_MIN, terme: sim.temps + 30 };
  dormir(sim, [mere.id, pere.id]);
  sim.update(120);
  assert.equal(sim.naissancesEnAttente.length, 1);
  const n = sim.habitants.length;
  avancer(sim, 9 * 60);
  assert.equal(sim.habitants.length, n, 'avant 12 h, on attend les parents');
  avancer(sim, 4 * 60);
  assert.equal(sim.habitants.length, n + 1, 'au bout de 12 h, le village l\'appelle');
  assert.equal(sim.naissancesEnAttente.length, 0);
  assert.ok(mere.evenements.some((e) => /le village l'a appelé ainsi/.test(e.texte)), 'les parents savent que le prénom n\'est pas le leur');
}

// ---- mort de la mère avant terme ----
{
  const sim = nouveau(9);
  const mere = sim.habitants.find((v) => v.genre === 'F' && v.age >= 20 && v.age < 40);
  const pere = sim.habitants.find((v) => v.genre === 'H' && v.foyer !== mere.foyer && v.age < 60);
  mere.enceinte = { pere: pere.id, debut: sim.temps, terme: sim.temps + 5000 };
  sim.mourir(mere, 'de maladie');
  assert.equal(mere.enceinte, null);
  assert.ok(pere.evenements.some((e) => /morte alors qu'elle attendait/.test(e.texte)));
  avancer(sim, 6000);
  assert.equal(sim.naissancesEnAttente.length, 0, 'pas de naissance');
}

// ---- anciennes sauvegardes : dates de naissance déduites de l'âge ----
{
  const sim = nouveau(4);
  const brut = JSON.parse(sim.serialiser());
  for (const v of brut.habitants) { delete v.naissance; delete v.parents; delete v.agonie; }
  delete brut.defunts; delete brut.souhaits; delete brut.naissancesEnAttente;
  brut.stats = { paroles: 0 };
  const vieux = Simulation.charger(JSON.stringify(brut));
  assert.equal(vieux.habitants.length, 50);
  assert.ok(vieux.habitants.every((v) => Number.isFinite(v.naissance)));
  const v = vieux.habitant(7), age = v.age;
  vieux.rng.chance = () => false;
  vieux.update(60);
  assert.equal(v.age, age, 'l\'âge ne saute pas au chargement');
  assert.equal(vieux.defunts.length, 0);
}

console.log('Cycle de vie : calendrier (année = 2 jours), vieillissement, mort, nourrissons, grossesse, naissance, anciennes sauvegardes. OK');
