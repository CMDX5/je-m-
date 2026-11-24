// Économie : les rations du marché se gâtent (chaleur, entrepôt plein) et la caisse du conseil se lit en jours de salaires.
// Les « habitants raisonnables » ci-dessous ne sont PAS la pensée du jeu : ils servent seulement à vérifier que le monde tient.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { saison, DEBUT_PLUIE_MIN } from '../src/sim/saison.js';
import { METIERS } from '../src/sim/data.js';
import { MOIS_MIN } from '../src/sim/vie.js';

const nouveau = (seed = 3) => new Simulation({ seed }).init();
const placer = (sim, mois) => { sim.temps = DEBUT_PLUIE_MIN + mois * MOIS_MIN; sim.derniereHeure = Math.floor(sim.temps / 60); sim.etatSaison = saison(sim.temps); sim.saisonNom = sim.etatSaison.nom; };

// ---- les rations se gâtent, plus vite par forte chaleur ----
{
  const frais = nouveau(), chaud = nouveau();
  placer(frais, 2); placer(chaud, 8);
  frais.res.nourriture = chaud.res.nourriture = 300;
  frais.denrees(); chaud.denrees();
  const perteFrais = 300 - frais.res.nourriture, perteChaud = 300 - chaud.res.nourriture;
  assert.ok(perteFrais > 0 && perteChaud > perteFrais * 1.8, `la chaleur gâte plus vite (${perteChaud.toFixed(2)} contre ${perteFrais.toFixed(2)} rations par heure)`);
  assert.ok(perteChaud < 300 * 0.01, 'sans excès : une perte lente, pas un désastre');
}
// ---- l'entrepôt a une capacité : le surplus se perd vite ----
{
  const sim = nouveau(); placer(sim, 2);
  sim.res.nourriture = 3000;
  for (let h = 0; h < 24; h++) sim.denrees();
  assert.ok(sim.res.nourriture < 1000, `3000 rations ne se gardent pas : il en reste ${Math.round(sim.res.nourriture)} après un jour`);
  assert.ok(sim.res.nourriture > 500, 'mais on garde de quoi tenir');
  sim.res.nourriture = 0; sim.denrees(); assert.equal(sim.res.nourriture, 0, 'jamais négatif');
}

// ---- le puits communal alimente les maisons (la demande d'eau des habitants a enfin une réponse) ----
{
  const sans = nouveau(), avec = nouveau();
  placer(sans, 2); placer(avec, 2);
  avec.bonus.puits = true;
  for (const sim of [sans, avec]) for (const f of Object.values(sim.foyers)) f.eau = 0;
  for (let h = 0; h < 24; h++) { sans.saisons(); avec.saisons(); }
  const id = avec.habitants[0].foyer;
  assert.equal(sans.foyers[id].eau, 0, 'sans puits, les jarres vides restent vides');
  const occ = avec.occupants(id);
  assert.ok(avec.foyers[id].eau > occ * 2.5, `avec le puits, une journée remplit bien les jarres (${avec.foyers[id].eau.toFixed(1)} doses pour ${occ} personnes)`);
  assert.ok(avec.foyers[id].eau <= occ * 10 + 1e-6, 'dans la limite de la jarre');
  assert.match(avec.construirePrompt(5), /puits communal remplit peu à peu/);
  assert.ok(!/puits communal/.test(sans.construirePrompt(5)));
}

// ---- la fontaine du marché : la réponse à « des réserves d'eau plus accessibles » ----
{
  const sim = nouveau(); sim.rng.chance = () => false;
  assert.deepEqual(sim.lancerProjet('fontaine'), { ok: true });
  assert.deepEqual(sim.siteProjet('fontaine'), { x: -3, z: 17.5 }, 'sur la place du marché');
  sim.projet.progres = sim.projet.travail; sim.terminerProjet();
  assert.equal(sim.bonus.fontaine, true);
  const f = sim.batimentsParId.fontaine;
  assert.ok(f && f.ajoute && sim.batiments.includes(f));
  assert.equal(sim.lancerProjet('fontaine').ok, false, 'une seule fontaine');
  assert.match(sim.construirePrompt(5), /fontaine sur la place du marché donne de l'eau gratuite/, 'les habitants le savent');
  const v = sim.habitants.find((h) => h.age > 20 && !h.interieur) || sim.habitants.find((h) => h.age > 20);
  v.interieur = false; v.poche.eau = 0;
  // du marché, on va à la fontaine plutôt qu'à la source lointaine ; de la source, on reste à la source
  v.x = 4; v.z = 12;
  const lieu = sim.lieuPour(v, { cle: 'source' });
  assert.equal(lieu.nomLieu, 'la fontaine du marché'); assert.ok(Math.hypot(lieu.x - f.x, lieu.z - f.z) < 4.5, 'on boit au bord de la fontaine');
  v.x = -12; v.z = -50;
  assert.notEqual(sim.lieuPour(v, { cle: 'source' }).nomLieu, 'la fontaine du marché');
  // et l'eau y est gratuite, comme à la source
  v.x = f.x; v.z = f.z + 2.5; v.besoins.soif = 20; sim.boire(v, {});
  assert.equal(v.besoins.soif, 65, 'boire à la fontaine étanche la soif');
  v.x = 4; v.z = 40; v.besoins.soif = 20; v.poche.eau = 0; v.interieur = false;
  const a = {}; sim.boire(v, a);
  assert.equal(v.besoins.soif, 20, 'loin de tout point d\'eau, rien à boire');
  const copie = Simulation.charger(sim.serialiser());
  assert.equal(copie.bonus.fontaine, true); assert.ok(copie.batimentsParId.fontaine);
  assert.ok(!/fontaine sur la place/.test(nouveau().construirePrompt(5)));
}

// ---- la halle ombragée du marché : l'abri frais demandé par les habitants ----
{
  const sim = nouveau(); sim.rng.chance = () => false;
  placer(sim, 6); // pleine chaleur
  const avant = { bois: sim.res.bois, pierre: sim.res.pierre };
  assert.deepEqual(sim.lancerProjet('halle'), { ok: true });
  assert.ok(sim.res.bois < avant.bois && sim.res.pierre < avant.pierre, 'le chantier consomme du bois et de la pierre');
  assert.deepEqual(sim.siteProjet('halle'), { x: 4, z: 17.5 }, 'sur la place du marché');
  assert.equal(sim.bonus.halle, false);
  sim.projet.progres = sim.projet.travail; sim.terminerProjet();
  assert.equal(sim.bonus.halle, true);
  const halle = sim.batimentsParId.halle;
  assert.ok(halle && sim.batiments.includes(halle) && halle.ajoute);
  assert.equal(sim.lancerProjet('halle').ok, false, 'une seule halle');
  assert.ok(sim.nav.walkable(halle.x, halle.z), 'on passe sous la halle : elle ne bloque rien');
  assert.match(sim.construirePrompt(5), /halle ombragée, sur la place du marché, abrite de la chaleur/, 'les habitants le savent');

  // à l'ombre de la halle, la chaleur pèse comme à l'intérieur ; à côté, en plein soleil, non
  const mesure = (x, z) => {
    const v = sim.habitants.find((h) => h.age > 20);
    v.interieur = false; v.batiment = null; v.statut = 'agit'; v.path = null; v.x = x; v.z = z;
    v.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} };
    v.besoins.soif = 90; sim.temps = Math.floor(sim.temps / 1440) * 1440 + 12 * 60; sim.update(60);
    return 90 - v.besoins.soif;
  };
  const ombre = mesure(halle.x, halle.z), soleil = mesure(halle.x + 20, halle.z);
  const base = 6; // soif d'une heure sans aucune chaleur (0,1 point par minute)
  assert.ok(soleil > base * 1.4, `en plein soleil la chaleur ajoute beaucoup (${soleil.toFixed(1)} points en une heure)`);
  assert.ok(ombre < soleil && (ombre - base) < (soleil - base) * 0.5, `sous la halle, au moins la moitié de la soif due à la chaleur disparaît (${ombre.toFixed(1)} contre ${soleil.toFixed(1)})`);
  assert.ok(sim.sousLaHalle({ x: halle.x + 5, z: halle.z }) && !sim.sousLaHalle({ x: halle.x + 8, z: halle.z }), 'l\'ombre s\'arrête au bord de la toile');

  // rechargement : la halle est toujours là, toujours ouverte, toujours efficace
  const copie = Simulation.charger(sim.serialiser());
  assert.equal(copie.bonus.halle, true);
  assert.ok(copie.batimentsParId.halle && copie.nav.walkable(halle.x, halle.z));
  assert.ok(copie.sousLaHalle({ x: halle.x, z: halle.z }));
  const sans = nouveau();
  assert.ok(!/halle ombragée/.test(sans.construirePrompt(5)));
}

// ---- la caisse en jours de salaires ----
{
  const sim = nouveau();
  assert.equal(sim.joursDeCaisse(), null, 'inconnu tant qu\'aucune journée n\'est écoulée');
  sim.stats.salaires = 200; sim.res.pieces = 600;
  sim.quotidien();
  assert.equal(sim.historique.at(-1).salaires, 200, 'les salaires versés dans la journée sont consignés');
  assert.equal(sim.joursDeCaisse(), 3, '600 pièces à raison de 200 par jour : 3 jours');
  sim.stats.salaires = 500; sim.quotidien();
  assert.equal(sim.historique.at(-1).salaires, 300, 'seulement ce qui a été versé depuis la veille');
  sim.res.pieces = 150; sim.caisseAlertee = false;
  sim.horaire();
  assert.ok(sim.journal.some((e) => /ne couvrira pas une journée de salaires/.test(e.texte)), 'la chronique prévient quand la caisse est presque vide');
  sim.horaire();
  assert.equal(sim.journal.filter((e) => /ne couvrira pas une journée de salaires/.test(e.texte)).length, 1, 'un seul avertissement');
  const copie = Simulation.charger(sim.serialiser());
  copie.quotidien();
  assert.ok(copie.historique.at(-1).salaires < 5, 'après rechargement, pas de faux versement géant');
}

// ---- le monde tient sur plusieurs années avec des habitants raisonnables ----
function raisonnable(sim, v) {
  const b = v.besoins, h = sim.heure();
  const nuit = h < 6 || h > 21;
  const maison = sim.foyers[v.foyer] || {};
  if (b.energie < 25 || (nuit && b.energie < 80)) return { action: 'dormir', duree_minutes: 420 };
  if (b.soif < 45) return v.poche.eau >= 1 || (maison.eau ?? 0) >= 1 ? { action: 'boire' } : { action: 'puiser_eau' };
  if (b.faim < 50) {
    if (v.poche.nourriture >= 0.5 || (maison.nourriture ?? 0) >= 1) return { action: 'manger' };
    if (v.poche.pieces >= 2 && sim.res.nourriture > 3) return { action: 'acheter', objet: 'nourriture', quantite: Math.min(6, Math.floor(v.poche.pieces)) };
    return { action: 'travailler' };
  }
  if (v.malade && sim.res.remedes >= 1) return { action: 'se_soigner' };
  if (v.age < 12) return { action: v.age < 6 ? 'rien' : 'etudier', duree_minutes: 60 };
  if (METIERS[v.metier]?.lieu) return { action: 'travailler', duree_minutes: 120 };
  return { action: 'flaner', lieu: 'plage', duree_minutes: 40 };
}
{
  const sim = nouveau(11);
  let pic = 0;
  for (let m = 0; m < 1440 * 10; m++) {
    sim.update(1);
    for (const id of sim.demandes()) { const v = sim.habitant(id); sim.marquerEnvoye(id); sim.appliquer(id, { pensee: '…', humeur: 60, parole: '', ...raisonnable(sim, v) }); }
    if (m % 60 === 0) pic = Math.max(pic, sim.res.nourriture);
  }
  assert.ok(pic < 1500, `le marché ne gonfle plus sans fin (pic de ${Math.round(pic)} rations sur 5 ans du village)`);
  assert.ok(sim.habitants.length >= 47, `le village tient (${sim.habitants.length} habitants sur 50)`);
  assert.ok(sim.habitants.every((v) => v.besoins.faim > 0 || v.mort), 'personne ne meurt de faim quand il se nourrit');
  assert.ok(sim.nourritureFoyers() > 20, 'les maisons ne sont pas vides');
  assert.ok(Number.isFinite(sim.joursDeCaisse() ?? 0));
}

console.log('Économie : rations gâtées par la chaleur et l\'entrepôt plein, caisse en jours de salaires, village stable sur 5 ans. OK');
