// Pont vers Claude (côté navigateur) : prépare le contexte d'un habitant à partir de
// SON état simulé et de SES souvenirs, puis interroge le serveur local (/api/esprit).
// Si Claude n'est pas joignable, la simulation utilise ses réflexions locales.

import { nomComplet, libelleMetier, decrire, libelleRelation } from './villager.js';
import { croyances } from './esprit.js';

export function contexte(sim, v) {
  const rels = Object.entries(v.relations)
    .map(([id, r]) => ({ o: sim.habitant(Number(id)), r }))
    .filter((x) => Math.abs(x.r.aff) > 15 || v.famille.includes(x.o.id))
    .sort((a, b) => Math.abs(b.r.aff) - Math.abs(a.r.aff))
    .slice(0, 8)
    .map(({ o, r }) => ({ prenom: o.prenom, nom: o.nom, lien: libelleRelation(r, v.famille.includes(o.id)), affinite: Math.round(r.aff) }));
  const griefs = Object.entries(v.esprit.griefs)
    .filter(([, g]) => g > 0.1)
    .map(([id, g]) => ({ contre: sim.habitant(Number(id)).prenom, motif: v.esprit.griefMotif?.[id] || 'un tort', intensite: Math.round(g * 100) / 100 }));
  const souvenirs = [...v.memoire]
    .sort((a, b) => b.importance * (1 + (b.t > sim.temps - 1440 ? 1 : 0)) - a.importance * (1 + (a.t > sim.temps - 1440 ? 1 : 0)))
    .slice(0, 14)
    .map((m) => ({ quand: sim.horodatage(m.t), souvenir: m.texte, ressenti: Math.round(m.valence * 10) / 10 }));
  return {
    nom: nomComplet(v), age: v.age, genre: v.genre === 'F' ? 'femme' : 'homme',
    metier: libelleMetier(v), personnalite: decrire(v),
    traits: Object.fromEntries(Object.entries(v.traits).map(([k, x]) => [k, Math.round(x * 100) / 100])),
    moment: sim.horodatage(),
    besoins: Object.fromEntries(Object.entries(v.besoins).map(([k, x]) => [k, Math.round(x)])),
    malade: v.malade, moral: Math.round(v.moral), confianceEnversLeConseil: Math.round(v.confiance),
    vivresALaMaison: Math.round(sim.foyers[v.foyer]?.nourriture ?? 0),
    ceQuIlAAppris: croyances(sim, v, 5).map((c) => c.texte),
    rancunes: griefs, relations: rels, souvenirs,
    derniersEchangesAvecLeConseil: (v.dialogue || []).slice(-6).map((d) => `${d.de} : ${d.texte}`),
  };
}

export class Cerveau {
  constructor(sim) {
    this.sim = sim;
    this.disponible = false;
    this.modele = null;
    this.enCours = 0;
  }

  async verifier() {
    try {
      const r = await fetch('api/esprit', { method: 'GET' });
      const d = await r.json();
      this.disponible = !!d.disponible;
      this.modele = d.modele;
    } catch {
      this.disponible = false;
    }
    return this.disponible;
  }

  async appeler(corps) {
    if (!this.disponible) return null;
    this.enCours++;
    try {
      const r = await fetch('api/esprit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (r.status === 503) this.disponible = false;
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    } finally {
      this.enCours--;
    }
  }

  async reflechir(id) {
    const v = this.sim.habitant(id);
    const d = await this.appeler({ mode: 'reflexion', habitant: contexte(this.sim, v) });
    if (d && d.intention?.action === 'aucune') d.intention = null;
    return d;
  }

  async parler(id, message) {
    const v = this.sim.habitant(id);
    const d = await this.appeler({ mode: 'dialogue', habitant: contexte(this.sim, v), message });
    if (d && d.intention?.action === 'aucune') d.intention = null;
    return d;
  }
}

