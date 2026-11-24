// Saisons : une pluie par an (4 minutes à ×1), puis le beau temps, la chaleur, la saison sèche.
// On vérifie les LOIS du monde (calendrier, effets physiques, faits perçus) ; ce que les habitants en font ne vient pas du jeu.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { saison, dateDuVillage, DEBUT_PLUIE_MIN, PLUIE_MIN } from '../src/sim/saison.js';
import { produire, risqueMaladie } from '../src/sim/monde.js';
import { ANNEE_MIN, MOIS_MIN } from '../src/sim/vie.js';

// ---- le calendrier : exactement une pluie par an, de 4 minutes à ×1 (= 240 minutes de jeu) ----
assert.equal(PLUIE_MIN, 240);
const compte = { pluie: 0, beau: 0, chaleur: 0, seche: 0 };
for (let t = 0; t < ANNEE_MIN; t++) compte[saison(DEBUT_PLUIE_MIN + t).nom]++;
assert.deepEqual(compte, { pluie: 240, beau: 720, chaleur: 960, seche: 960 }, 'pluie 1 mois, beau temps 3, chaleur 4, saison sèche 4');
assert.equal(saison(DEBUT_PLUIE_MIN).nom, 'pluie');
assert.equal(saison(DEBUT_PLUIE_MIN + 239).nom, 'pluie');
assert.equal(saison(DEBUT_PLUIE_MIN + 240).nom, 'beau', 'après la pluie vient le beau temps');
assert.equal(saison(DEBUT_PLUIE_MIN + ANNEE_MIN).nom, 'pluie', 'la pluie revient l\'année suivante');
assert.equal(saison(DEBUT_PLUIE_MIN + 5 * ANNEE_MIN + 100).nom, 'pluie');
assert.equal(saison(DEBUT_PLUIE_MIN - 10).nom, 'seche', 'avant la première pluie, c\'est la fin de la saison sèche');
// courbes : la chaleur monte jusqu'au cœur de la saison sèche, la terre sèche de plus en plus, la verdure suit la pluie
const au = (mois) => saison(DEBUT_PLUIE_MIN + mois * MOIS_MIN - 1);
assert.ok(au(2).chaleur < au(6).chaleur && au(6).chaleur < au(8).chaleur, 'la chaleur monte');
assert.ok(au(8).chaleur >= 0.95, 'pic de chaleur au début de la saison sèche');
assert.ok(au(12).chaleur < au(8).chaleur, 'puis elle se tasse avant la pluie');
assert.ok(au(3).seche < au(6).seche && au(6).seche < au(12).seche, 'la terre sèche de plus en plus');
assert.ok(au(2).verdure > au(6).verdure && au(6).verdure > au(12).verdure, 'tout verdit après la pluie, tout jaunit ensuite');
assert.equal(saison(DEBUT_PLUIE_MIN).intensitePluie, 0, 'la pluie commence doucement');
assert.ok(saison(DEBUT_PLUIE_MIN + 120).intensitePluie === 1, 'puis tombe franchement');
assert.ok(saison(DEBUT_PLUIE_MIN + 239).intensitePluie < 0.1, 'et s\'arrête doucement');
assert.equal(saison(DEBUT_PLUIE_MIN + 1000).intensitePluie, 0);
assert.equal(saison(DEBUT_PLUIE_MIN + 100).resteDePluie, 140);
assert.equal(saison(DEBUT_PLUIE_MIN + 1000).jusquaPluie, ANNEE_MIN - 1000);

// ---- la date du village : on part de novembre 2026 ----
assert.equal(dateDuVillage(6 * 60).texte, 'nov. 2026', 'au départ, nous sommes en novembre 2026');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN).texte, 'déc. 2026', 'la pluie tombe en décembre');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + MOIS_MIN).texte, 'janv. 2027', 'un mois du village = 4 h de jeu');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + 3 * MOIS_MIN).texte, 'mars 2027');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + 7 * MOIS_MIN).texte, 'juil. 2027');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + 8 * MOIS_MIN).texte, 'août 2027', 'la saison sèche commence en août');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + 11 * MOIS_MIN).texte, 'nov. 2027');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + ANNEE_MIN).texte, 'déc. 2027', 'une année du village = 2 jours : même mois, un an plus tard');
assert.equal(dateDuVillage(DEBUT_PLUIE_MIN + 10 * ANNEE_MIN).texte, 'déc. 2036');
const MOIS_PAR_SAISON = { pluie: ['déc.'], beau: ['janv.', 'févr.', 'mars'], chaleur: ['avr.', 'mai', 'juin', 'juil.'], seche: ['août', 'sept.', 'oct.', 'nov.'] };
for (let t = 0; t < 5 * ANNEE_MIN; t += 30) assert.ok(MOIS_PAR_SAISON[saison(t).nom].includes(dateDuVillage(t).texte.split(' ')[0]), `le mois suit la saison à t=${t}`);

// ---- la production : la terre rend le plus après la pluie, le moins à la fin de la saison sèche ----
const monde = () => ({ poisson: 1, foret: 1, fertilite: 1, olives: 1, placesJetee: 4 });
const champs = (meteo) => produire('champs', monde(), 12, meteo, 0, 60, 1).nourriture;
const apresPluie = champs({ seche: 0.05 }), seche = champs({ seche: 1 }), sousPluie = champs({ pluie: true });
assert.ok(apresPluie > champs({ seche: 0.5 }) && champs({ seche: 0.5 }) > seche, 'la récolte baisse quand la terre sèche');
assert.ok(seche / apresPluie < 0.55, 'moins de la moitié à la fin de la saison sèche');
assert.ok(sousPluie < apresPluie, 'sous la pluie, on travaille mal');
const fatigueChaud = produire('carriere', monde(), 13, { chaleurSaison: 1 }, 0, 60, 1).fatigue;
const fatigueFrais = produire('carriere', monde(), 13, { chaleurSaison: 0 }, 0, 60, 1).fatigue;
assert.ok(fatigueChaud > fatigueFrais, 'travailler en plein soleil de saison chaude fatigue plus');
const malade = { besoins: { faim: 80, soif: 80, energie: 80 }, age: 30 };
assert.ok(risqueMaladie(malade, {}, 1) > risqueMaladie(malade, {}, 0), 'la chaleur pèse sur la santé');

// ---- dans la simulation ----
const nouveau = () => new Simulation({ seed: 3 }).init();
const placer = (sim, mois, jusqu = 0) => { sim.temps = DEBUT_PLUIE_MIN + mois * MOIS_MIN + jusqu; sim.derniereHeure = Math.floor(sim.temps / 60); sim.etatSaison = saison(sim.temps); sim.saisonNom = sim.etatSaison.nom; };
const dehors = (v) => { v.interieur = false; v.batiment = null; v.statut = 'agit'; v.path = null; v.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} }; v.besoins.soif = 90; v.besoins.faim = 90; };
const nourrir = (sim) => { for (const v of sim.habitants) if (!v.nourrisson) { v.besoins.faim = 90; v.besoins.soif = Math.max(v.besoins.soif, 90); v.besoins.energie = Math.max(v.besoins.energie, 80); } };

// la soif : plus vite dehors, en pleine chaleur, qu'au beau temps
{
  const mesure = (mois) => { const sim = nouveau(); sim.rng.chance = () => false; placer(sim, mois, 4 * 60 - 480 + 480); const v = sim.habitants.find((x) => x.age > 20); dehors(v); sim.temps = Math.floor(sim.temps / MIN_JOUR) * MIN_JOUR + 12 * 60; sim.derniereHeure = Math.floor(sim.temps / 60); sim.update(60); return 90 - v.besoins.soif; };
  const MIN_JOUR = 1440;
  const beau = mesure(2), chaud = mesure(8);
  assert.ok(chaud > beau * 1.4, `en pleine chaleur, on a soif bien plus vite (${chaud.toFixed(1)} contre ${beau.toFixed(1)} points en une heure)`);
}

// la pluie remplit les jarres, la terre boit ; hors de la pluie, rien ne se remplit
{
  const sim = nouveau(); sim.rng.chance = () => false;
  for (const f of Object.values(sim.foyers)) f.eau = 0;
  placer(sim, 0); // début de la pluie
  const fertAvant = (sim.monde.fertilite = 0.5);
  for (let h = 0; h < 4; h++) { nourrir(sim); sim.update(60); }
  const f = sim.foyers[sim.habitants[0].foyer];
  assert.ok(f.eau > 2, `la pluie remplit les jarres (${f.eau.toFixed(1)})`);
  assert.ok(f.eau <= sim.occupants(sim.habitants[0].foyer) * 10 + 1e-6, 'dans la limite de la jarre');
  assert.ok(sim.monde.fertilite > fertAvant, 'la terre reprend de la fertilité');
  const apres = f.eau;
  placer(sim, 2);
  sim.update(60);
  assert.ok(sim.foyers[sim.habitants[0].foyer].eau <= apres, 'hors de la pluie, les jarres ne se remplissent pas');
}

// ce que les habitants perçoivent : des faits, jamais une consigne
{
  const sim = nouveau();
  const phrases = {};
  for (const [mois, nom] of [[0, 'pluie'], [2, 'beau'], [6, 'chaleur'], [10, 'seche']]) {
    placer(sim, mois, 30);
    phrases[nom] = sim.meteoTexte();
    const prompt = sim.construirePrompt(5);
    assert.match(prompt, /Saison :/, `la saison est dite (${nom})`);
    assert.ok(!/(il faut|tu dois|tu devrais|devrait|conseil de|stocker|économiser|prépare)/i.test(sim.meteoTexte() + prompt.split('Saison :')[1].split('\n')[0]), `aucune consigne dans la météo (${nom})`);
  }
  assert.equal(phrases.pluie, 'Il pleut.');
  assert.match(phrases.beau, /Beau temps/);
  assert.match(phrases.chaleur, /chaud/);
  assert.match(phrases.chaleur, /dernière fois il y a \d+ mois/, 'ils savent depuis quand il n\'a pas plu : à eux d\'en tirer ce qu\'ils veulent');
  assert.match(phrases.seche, /saison sèche/);
  placer(sim, 6, 30);
  assert.match(sim.construirePrompt(5), /la pluie revient dans \d+ mois/);
  placer(sim, 0, 30);
  assert.match(sim.construirePrompt(5), /mois de la pluie/);
  assert.match(sim.construirePrompt(5), /nous sommes en déc\. 2026/, 'les habitants savent quel mois on est');
}

// les changements de saison sont annoncés une fois chacun, deux années de suite
{
  const sim = nouveau(); sim.rng.chance = () => false;
  const vus = [];
  sim.on('saison', (e) => vus.push(e.nom));
  for (let h = 0; h < 4 * 24; h++) { nourrir(sim); sim.update(60); }
  const ordre = ['pluie', 'beau', 'chaleur', 'seche'];
  assert.equal(vus[0], 'pluie', 'la première pluie arrive à 8 h du premier jour, deux heures après le départ');
  assert.deepEqual(vus, vus.map((_, i) => ordre[i % 4]), 'dans l\'ordre, sans doublon, le cycle recommence chaque année');
  assert.equal(vus.length, 8, 'deux années complètes en 4 jours');
  assert.equal(vus.filter((n) => n === 'pluie').length, 2, 'une seule pluie par an');
  const pluies = sim.journal.filter((e) => /La pluie tombe/.test(e.texte)).length;
  const fins = sim.journal.filter((e) => /La pluie a cessé/.test(e.texte)).length;
  assert.ok(pluies >= 1 && fins >= 1, 'la chronique raconte la pluie et son retrait');
}

// la vague de chaleur : courte, et jamais au beau temps ni sous la pluie (même venue d'une ancienne sauvegarde)
{
  const sim = nouveau(); sim.rng.chance = () => false;
  placer(sim, 2, 30);
  sim.meteo.secheresse = sim.temps + 2 * 1440; // ancien événement de deux jours (= une année du village)
  sim.saisons();
  assert.equal(sim.meteo.secheresse, 0, 'pas de vague de chaleur au beau temps');
  placer(sim, 6, 30);
  sim.meteo.secheresse = sim.temps + 2 * 1440;
  sim.saisons();
  assert.ok(sim.meteo.secheresse <= sim.temps + 8 * 60, 'en saison chaude, elle est plafonnée à 8 h de jeu (deux mois)');
  assert.ok(sim.meteo.secheresse > sim.temps, 'mais elle existe');
}

// rechargement : pas de fausse saison, pas d'annonce en double
{
  const sim = nouveau(); sim.rng.chance = () => false;
  placer(sim, 6, 10);
  const copie = Simulation.charger(sim.serialiser());
  assert.equal(copie.etatSaison.nom, 'chaleur');
  const avant = copie.journal.filter((e) => /saison|pluie|chaleur/i.test(e.texte)).length;
  for (let h = 0; h < 3; h++) { nourrir(copie); copie.update(60); }
  assert.equal(copie.journal.filter((e) => /La pluie tombe|La chaleur s’installe|La saison sèche commence|beau temps revient/.test(e.texte)).length, 0, 'aucune annonce fantôme après rechargement');
  assert.equal(copie.journal.filter((e) => /saison|pluie|chaleur/i.test(e.texte)).length, avant);
}

console.log('Saisons : une pluie par an (4 min à ×1), beau temps, chaleur, saison sèche ; effets physiques et faits perçus. OK');
