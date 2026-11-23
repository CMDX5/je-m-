// Test headless de la simulation : 6 jours de jeu, vérification des invariants.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';

const t0 = Date.now();
const sim = new Simulation({ seed: 2026 }).init();
assert.equal(sim.habitants.length, 50, '50 habitants');
const noms = new Set(sim.habitants.map((v) => v.prenom + ' ' + v.nom));
assert.equal(noms.size, 50, 'noms uniques');
for (const v of sim.habitants) assert.ok(v.metier, `métier pour ${v.prenom}`);

const activites = {};
let positionsHorsEau = 0, controles = 0;
for (let h = 0; h < 24 * 6; h++) {
  sim.update(60);
  if (sim.assemblee && sim.heure() > 19) sim.deciderAssemblee(sim.assemblee.prop.options[0].id);
  const ouvert = sim.conflits.find((c) => !c.resolu);
  if (ouvert && h % 30 === 0) sim.resoudreConflit(ouvert.id, 'mediation');
  for (const v of sim.habitants) {
    activites[v.activite?.type] = (activites[v.activite?.type] || 0) + 1;
    for (const k of Object.keys(v.besoins)) {
      assert.ok(Number.isFinite(v.besoins[k]) && v.besoins[k] >= 0 && v.besoins[k] <= 100, `besoin ${k} borné (${v.prenom}: ${v.besoins[k]})`);
    }
    assert.ok(Number.isFinite(v.moral) && Number.isFinite(v.confiance), 'moral/confiance finis');
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'position finie');
    controles++;
    if (sim.nav.walkable(v.x, v.z) || v.interieur) positionsHorsEau++;
  }
}
const memos = sim.habitants.reduce((s, v) => s + v.memoire.length, 0);
const conv = sim.habitants.reduce((s, v) => s + v.stats.conversations, 0) / 2;
const disputes = sim.habitants.reduce((s, v) => s + v.stats.disputes, 0) / 2;
const rumeurs = sim.habitants.reduce((s, v) => s + v.memoire.filter((m) => m.type === 'rumeur').length, 0);
console.log('Activités (échantillons horaires) :', activites);
console.log(`Ressources :`, Object.fromEntries(Object.entries(sim.res).map(([k, v]) => [k, Math.round(v)])));
console.log(`Conversations ${conv}, disputes ${disputes}, rumeurs ${rumeurs}, souvenirs ${memos}`);
console.log(`Moral moyen ${sim.moyenne('moral').toFixed(1)}, confiance ${sim.moyenne('confiance').toFixed(1)}`);
console.log(`Positions valides : ${(100 * positionsHorsEau / controles).toFixed(1)} %`);
console.log(`Assemblées : ${sim.historiqueAssemblees.length}, conflits : ${sim.conflits.length}`);
console.log(sim.journal.slice(-12).map((e) => `  ${sim.horodatage(e.t)} — ${e.texte}`).join('\n'));

assert.ok(conv > 50, 'les habitants se parlent');
assert.ok(memos > 200, 'les habitants se souviennent');
assert.ok(activites.travailler > 0 && activites.dormir > 0 && activites.manger >= 0, 'routine variée');
assert.ok(positionsHorsEau / controles > 0.97, 'les habitants restent sur la terre ferme');
assert.ok(sim.historiqueAssemblees.length >= 2, 'assemblées tenues');

// sauvegarde / chargement
const json = sim.serialiser();
const sim2 = Simulation.charger(json);
sim2.update(120);
assert.equal(sim2.habitants.length, 50);
console.log(`Sauvegarde ${(json.length / 1024).toFixed(0)} Ko rechargée et relancée.`);
console.log(`OK en ${Date.now() - t0} ms`);
