// Test sans affichage de la simulation.
// On vérifie des INVARIANTS (rien d'impossible, rien de cassé) et on MESURE ce qui émerge.
// On n'impose volontairement aucune valeur cible au comportement (ni nombre de disputes,
// ni répartition des métiers) : seulement que l'apprentissage a bien eu lieu.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';
import { croyances } from '../src/sim/esprit.js';

const t0 = Date.now();
const sim = new Simulation({ seed: 2026 }).init({ prehistoire: 10 });
assert.equal(sim.habitants.length, 50, '50 habitants');
assert.equal(new Set(sim.habitants.map((v) => `${v.prenom} ${v.nom}`)).size, 50, 'noms uniques');

let controles = 0, surTerre = 0;
for (let h = 0; h < 24 * 5; h++) {
  sim.update(60);
  if (sim.assemblee && sim.heure() > 19) sim.deciderAssemblee(sim.assemblee.prop.options[0].id);
  for (const v of sim.habitants) {
    for (const [k, x] of Object.entries(v.besoins)) assert.ok(Number.isFinite(x) && x >= 0 && x <= 100, `besoin ${k} borné (${v.prenom}: ${x})`);
    assert.ok(Number.isFinite(v.moral) && Number.isFinite(v.confiance), 'bien-être et confiance finis');
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'position finie');
    controles++;
    if (v.interieur || sim.nav.walkable(v.x, v.z)) surTerre++;
  }
  for (const f of Object.values(sim.foyers)) assert.ok(f.nourriture >= -1e-6, 'stocks positifs');
}

// --- L'apprentissage a eu lieu ---
const adultes = sim.habitants.filter((v) => v.age >= 17);
assert.ok(adultes.every((v) => v.esprit.appris > 20), 'chaque adulte a vécu et retenu des expériences');
assert.ok(sim.stats.transmissions > 50, 'des savoirs se transmettent');
const metiers = new Set(adultes.map((v) => v.metier).filter((m) => !['sans', 'ancien'].includes(m)));
assert.ok(metiers.size >= 3, `des métiers se sont différenciés (${[...metiers].join(', ')})`);
assert.ok(surTerre / controles > 0.97, 'les habitants restent sur la terre ferme');

// --- Déterminisme et sauvegarde ---
const json = sim.serialiser();
const sim2 = Simulation.charger(json);
sim2.update(180);
assert.equal(sim2.habitants.length, 50);
const a = new Simulation({ seed: 99 }).init({ prehistoire: 2 });
const b = new Simulation({ seed: 99 }).init({ prehistoire: 2 });
assert.equal(a.stats.conversations, b.stats.conversations, 'même graine, même histoire');

// --- Mesures (affichées, non imposées) ---
const st = sim.stats;
const rep = sim.repartitionMetiers();
console.log(`Après 10 jours seuls + 5 jours avec le conseil (graine 2026) :`);
console.log(`  métiers émergents : ${JSON.stringify(rep)}`);
console.log(`  conversations ${st.conversations} · savoirs transmis ${st.transmissions} · entraide ${st.aides} · dons ${Math.round(st.dons)} rations`);
console.log(`  vols ${st.vols} (${st.volsPris} pris) · règlements de comptes ${st.confrontations} · excuses ${st.excuses} · disputes ${st.disputes}`);
console.log(`  bien-être ${sim.moyenne('moral').toFixed(0)} · confiance ${sim.moyenne('confiance').toFixed(0)} · vivres ${Math.round(sim.nourritureFoyers())} (foyers) + ${Math.round(sim.res.nourriture)} (réserve) · poisson ${Math.round(sim.monde.poisson * 100)} %`);
console.log(`  assemblées convoquées par les habitants : ${sim.historiqueAssemblees.map((h) => `« ${h.titre} »`).join(', ') || 'aucune'}`);
const v = adultes[0];
console.log(`  ce qu'a appris ${v.prenom} : ${croyances(sim, v, 3).map((c) => c.texte).join(' ; ')}`);
console.log(`Sauvegarde ${(json.length / 1024).toFixed(0)} Ko rechargée. OK en ${Date.now() - t0} ms`);
