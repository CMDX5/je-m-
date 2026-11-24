// Test sans affichage du monde. On vérifie les LOIS du monde (rien d'impossible, rien de cassé),
// pas des comportements : ceux-ci appartiennent aux habitants (modèle de langage).
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { RNG } from '../src/sim/rng.js';
import { SYSTEME } from '../src/sim/prompts.js';
import { decider } from './fixture-aleatoire.mjs';

const t0 = Date.now();
const sim = new Simulation({ seed: 2026 }).init();
assert.equal(sim.habitants.length, 50, '50 habitants');
assert.equal(new Set(sim.habitants.map((v) => `${v.prenom} ${v.nom}`)).size, 50, 'noms uniques');
assert.ok(sim.habitants.every((v) => !('traits' in v)), 'aucun trait de caractère attribué');
assert.equal(sim.demandes().length, 50, 'au départ, chacun attend de décider');
assert.ok(!/généreux|colérique|égoïste de nature/i.test(SYSTEME.replace(/Tu peux aider[^.]*\./, '')), 'le texte système ne dicte aucun caractère');

// Sans modèle : le village ne bouge pas, rien ne casse, les corps s'usent.
sim.update(120);
assert.ok(sim.habitants.every((v) => v.statut === 'attend' && !v.path), 'sans pensée, personne ne bouge');
assert.ok(sim.habitants.every((v) => v.besoins.faim < 90), 'mais le corps, lui, continue');
// l'échec du modèle laisse l'habitant attendre un peu
sim.marquerEnvoye(0); sim.echec(0);
assert.equal(sim.habitant(0).statut, 'agit');

// Perception : en français, sans consigne de comportement
const prompt = sim.construirePrompt(5);
const promptLotTexte = (await import('../src/sim/penseur-claude.js')).promptLot(sim, [5]);
assert.ok(/Ce que tu ressens :/.test(prompt) && /Le village :/.test(prompt) && /Réponds par le JSON/.test(prompt));
assert.ok(!/\/100/.test(prompt), 'des sensations, pas des chiffres');
for (const consigne of ['Tu peux aider', 'de préférence', 'Que fais-tu', 'te presse', 'enfants et jeunes', 'en quelques mots', 'Reste bref', '"action": "travailler"']) assert.ok(!prompt.includes(consigne) && !SYSTEME.includes(consigne) && !promptLotTexte.includes(consigne), `aucune consigne de comportement : « ${consigne} »`);
assert.ok(prompt.length < 2600, `perception compacte (${prompt.length} caractères)`);

// Acheter avec ses propres mots (« des rations », « du pain ») : le marchand comprend
for (const [mot, attendu] of [['rations', 'nourriture'], ['du pain', 'nourriture'], ['une ration', 'nourriture'], [undefined, 'nourriture'], ['médicaments', 'remedes']]) {
  const ach = sim.habitants.find((v) => v.statut === 'attend' && v.age > 16);
  if (!ach) break;
  sim.marquerEnvoye(ach.id);
  sim.appliquer(ach.id, { pensee: 'Je vais acheter.', humeur: 60, action: 'acheter', objet: mot, quantite: 1, parole: '' });
  assert.ok(!ach.evenements.some((e) => /pas possible/.test(e.texte)), `achat compris : « ${mot} »`);
  assert.equal(ach.activite?.objet ?? ach.activite?.spec?.objet ?? attendu, attendu);
}

// Vie intérieure : le journal ne garde que ce que l'habitant écrit lui-même
{
  const v = sim.habitants.find((x) => x.statut === 'attend' && x.age > 16);
  const autre = sim.habitants.find((x) => x !== v);
  const n0 = sim.interieur.length;
  sim.marquerEnvoye(v.id);
  sim.appliquer(v.id, { pensee: `Je me demande si ${autre.prenom} m'en veut encore.`, humeur: 40, action: 'rien', parole: '', souvenir: 'Le premier matin sur la plage.', avis_sur: autre.prenom, avis: 'Il ne dit jamais ce qu\'il pense.', lien: 'un voisin qui me manque', avis_conseil: 'Le conseil écoute peu.', identite: 'Quelqu\'un qui doute.' });
  const types = sim.interieur.slice(n0).map((e) => e.type);
  assert.deepEqual(types, ['pensee', 'souvenir', 'avis', 'lien', 'conseil', 'identite'], 'pensée, souvenir, avis, relation (ses mots), avis sur le conseil et identité notés');
  assert.equal(v.avis[autre.id].lien, 'un voisin qui me manque');
  assert.equal(v.avisConseil.texte, 'Le conseil écoute peu.');
  assert.match(sim.construirePrompt(v.id), new RegExp(`${autre.prenom} \\(pour toi : un voisin qui me manque\\)`), 'il relit ce que l\'autre est pour lui');
  assert.match(sim.construirePrompt(v.id), /Ce que tu penses du conseil : Le conseil écoute peu/, 'et ce qu\'il pense du conseil');
  // un lien seul, sans nouvel avis, garde l\'avis précédent ; un avis identique ne se répète pas dans le journal
  const nb = sim.interieur.length; sim.marquerEnvoye(v.id); sim.appliquer(v.id, { pensee: '…', humeur: 50, action: 'rien', parole: '', avis_sur: autre.prenom, lien: 'un ami', avis_conseil: 'Le conseil écoute peu.' });
  assert.equal(v.avis[autre.id].texte, 'Il ne dit jamais ce qu\'il pense.');
  assert.equal(sim.interieur.slice(nb).filter((e) => e.type === 'lien').length, 1);
  assert.equal(sim.interieur.slice(nb).filter((e) => e.type === 'conseil').length, 0, 'une opinion inchangée n\'est pas répétée');
  const n1 = sim.interieur.length;
  const w = sim.habitants.find((x) => x.statut === 'attend' && x.age > 16);
  sim.marquerEnvoye(w.id);
  sim.appliquer(w.id, { pensee: "J'ai soif, je vais boire.", humeur: 60, action: 'rien', parole: '' });
  assert.equal(sim.interieur.length, n1, 'une pensée de simple routine reste dans l\'onglet Paroles');
  sim.appliquerBilan(v.id, { resume: 'Une journée.', identite: 'Quelqu\'un qui doute encore.', lecons: 'Ici, il faut demander.' });
  const fin = sim.interieur.slice(n1).map((e) => e.type);
  assert.deepEqual(fin, ['bilan', 'identite', 'lecons']);

  assert.equal(sim.interieur.at(-2).avant, 'Quelqu\'un qui doute.', 'on voit comment il se décrivait avant');
  sim.appliquerBilan(v.id, { resume: 'Encore une journée.', identite: 'Quelqu\'un qui doute encore.', lecons: 'Ici, il faut demander.', questions: 'Est-ce que je suis à ma place ?' });
  assert.equal(v.questions, 'Est-ce que je suis à ma place ?');
  assert.equal(sim.interieur.at(-1).type, 'questions');
  sim.appliquerBilan(v.id, { resume: 'Une autre.', questions: '' });
  assert.equal(v.questions, '', 'il peut effacer une question qui ne l\'occupe plus');
  const pensee = 'x'.repeat(900);
  const w2 = sim.habitants.find((x) => x.statut === 'attend' && x.age > 16);
  sim.marquerEnvoye(w2.id); sim.appliquer(w2.id, { pensee, humeur: 50, action: 'rien', parole: '' });
  assert.equal(w2.pensee.length, 900, 'plus de place pour une longue pensée');
}

// --- Cinq jours avec des décisions tirées au hasard (fixture) ---
const rng = new RNG(7);
let surTerre = 0, controles = 0;
for (let m = 0; m < 24 * 60 * 5; m++) {
  sim.update(1);
  for (const id of sim.demandes()) {
    sim.marquerEnvoye(id);
    sim.appliquer(id, decider(sim, sim.habitant(id), rng));
  }
  if (m % 30 === 0) {
    for (const v of sim.habitants) {
      for (const [k, x] of Object.entries(v.besoins)) assert.ok(Number.isFinite(x) && x >= 0 && x <= 100, `besoin ${k} borné (${v.prenom}: ${x})`);
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'position finie');
      for (const [k, x] of Object.entries(v.poche)) assert.ok(Number.isFinite(x) && x >= -1e-6, `poche ${k} positive (${v.prenom}: ${x})`);
      controles++;
      if (v.interieur || sim.nav.walkable(v.x, v.z)) surTerre++;
    }
    for (const f of Object.values(sim.foyers)) assert.ok(f.nourriture >= -1e-6 && f.eau >= -1e-6, 'stocks des foyers positifs');
    for (const k of Object.keys(sim.res)) assert.ok(sim.res[k] >= -1e-6 && Number.isFinite(sim.res[k]), `ressource ${k} valide`);
  }
}
assert.ok(sim.habitants.filter((v) => !v.nourrisson).every((v) => v.nbDecisions > 5), 'chacun a décidé de nombreuses fois');
assert.ok(sim.habitants.filter((v) => v.nourrisson).every((v) => v.nbDecisions === 0 && v.statut === 'agit'), 'un nourrisson n\'est jamais sollicité, même témoin d\'un vol');
assert.ok(surTerre / controles > 0.97, 'les habitants restent sur la terre ferme');
assert.ok(sim.stats.paroles > 50, 'des paroles ont été échangées');
assert.ok(sim.flux.some((f) => f.type === 'parole' && f.a != null), 'des paroles adressées à quelqu’un');
assert.ok(sim.stats.salaires > 0, 'des salaires ont été versés');
assert.ok(sim.habitants.some((v) => v.evenements.length || v.souvenirs.length), 'des événements perçus et des souvenirs écrits par eux');

// --- Lois du monde, vérifiées une à une ---
const a = sim.habitant(10), b = sim.habitant(11);
a.statut = 'attend'; b.statut = 'attend';
a.x = b.x = 10; a.z = b.z = 40; a.interieur = b.interieur = false; a.batiment = b.batiment = null;
a.path = b.path = null; a.conversation = b.conversation = null;
const avant = b.poche.pieces, chezA = a.poche.pieces;
a.poche.pieces = 30;
sim.marquerEnvoye(a.id);
sim.appliquer(a.id, { pensee: '', humeur: 50, action: 'donner', personne: b.prenom, objet: 'pieces', quantite: 10, pret: true, parole: 'Tiens, je te prête dix pièces.' });
sim.update(40);
assert.ok(b.poche.pieces >= avant + 10 - 1e-6, 'le don arrive à destination');
assert.ok(sim.dettes.some((d) => d.de === b.id && d.a === a.id && d.montant >= 10), 'un prêt crée une dette');
assert.ok(b.evenements.some((e) => /prête dix pièces/.test(e.texte)), 'le destinataire entend la parole');
// action impossible : l'habitant en est informé
sim.marquerEnvoye(a.id);
sim.appliquer(a.id, { pensee: '', humeur: 50, action: 'voler_en_avion', parole: '' });
assert.ok(a.evenements.some((e) => /pas possible/.test(e.texte)), 'une action inexistante est refusée avec une explication');
// le travail demande de la forme
const rendement = (e) => { const v = sim.habitant(20); v.besoins.energie = e; v.besoins.faim = 80; v.besoins.soif = 80; v.besoins.sante = 90; v.malade = false; return sim.rendement(v); };
assert.ok(rendement(90) > rendement(10) * 1.5, 'épuisé, on travaille moins bien');

// --- Sauvegarde ---
const json = sim.serialiser();
const sim2 = Simulation.charger(json);
assert.equal(sim2.habitants.length, sim.habitants.length, "même population après rechargement");
assert.equal(sim2.defunts.length, sim.defunts.length, "les défunts sont conservés");
sim2.update(60);
assert.ok(sim2.habitants.every((v) => v.statut !== 'reflechit'), 'les pensées en cours sont relancées au chargement');
assert.ok(sim2.interieur.length > 0 && sim2.interieur.length === sim.interieur.length, 'la vie intérieure est sauvegardée');

console.log(`Monde : 5 jours (an ${sim.annee}), ${sim.habitants.length} vivants, ${sim.stats.deces} décès, ${sim.stats.naissances} naissances, ${sim.stats.decisions} décisions (fixture aléatoire), ${sim.stats.paroles} paroles, ${sim.stats.dons} dons, ${sim.stats.prises} prises, ${sim.stats.disputes} disputes, ${sim.stats.achats} achats.`);
console.log(`Caisse du conseil : ${Math.round(sim.res.pieces)} pièces · marché : ${Math.round(sim.res.nourriture)} rations · foyers : ${Math.round(sim.nourritureFoyers())} rations`);
console.log(`Sauvegarde ${(json.length / 1024).toFixed(0)} Ko rechargée. OK en ${Date.now() - t0} ms`);
