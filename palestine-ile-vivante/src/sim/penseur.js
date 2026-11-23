// Pilote côté navigateur : envoie à /api/pensee ce que chaque habitant perçoit,
// reçoit sa décision (pensée, paroles, geste) et la rend au moteur.
// Les habitants décident en parallèle ; le moteur ne les attend pas pour tourner,
// sauf si trop d'entre eux attendent (voir main.js : l'horloge s'arrête alors).

export class Penseur {
  constructor(sim) {
    this.sim = sim;
    this.disponible = false;
    this.fournisseur = null;
    this.modele = null;
    this.concurrence = 2;
    this.actifs = 0;
    this.stats = { appels: 0, ok: 0, echecs: 0, ms: 0 };
    this.derniereErreur = '';
    this.pauseJusqua = 0;
    this.echecsConsecutifs = 0;
    this.derniereVerif = 0;
  }

  async verifier() {
    this.derniereVerif = performance.now();
    try {
      const r = await fetch('api/config');
      const d = await r.json();
      this.disponible = !!d.disponible;
      this.fournisseur = d.fournisseur;
      this.modele = d.modele;
      this.concurrence = Math.max(1, d.concurrence || 2);
      this.derniereErreur = d.disponible ? '' : (d.raison || 'Aucun modèle de langage connecté.');
    } catch {
      this.disponible = false;
      this.derniereErreur = 'Serveur injoignable (lancez `npm start`).';
    }
    return this.disponible;
  }

  tick() {
    const maintenant = performance.now();
    if (!this.disponible) {
      if (maintenant - this.derniereVerif > 5000 && this.actifs === 0) this.verifier();
      return;
    }
    if (maintenant < this.pauseJusqua) return;
    while (this.actifs < this.concurrence) {
      let id = this.sim.demandes().find((i) => !this.enCours?.has(`d${i}`));
      let type = 'decision';
      if (id === undefined) { id = this.sim.demandesBilan().find((i) => !this.enCours?.has(`b${i}`)); type = 'bilan'; }
      if (id === undefined) break;
      this.lancer(id, type);
    }
  }

  async lancer(id, type) {
    (this.enCours ||= new Set()).add(`${type[0]}${id}`);
    const sim = this.sim;
    const prompt = sim.construirePrompt(id, type);
    sim.marquerEnvoye(id, type);
    this.actifs++;
    this.stats.appels++;
    const t0 = performance.now();
    try {
      const r = await fetch('api/pensee', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, prompt }), signal: AbortSignal.timeout(180000),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.erreur) throw Object.assign(new Error(d?.erreur || `HTTP ${r.status}`), { statut: r.status });
      if (sim !== this.sim) return;
      if (type === 'bilan') sim.appliquerBilan(id, d); else sim.appliquer(id, d);
      this.stats.ok++;
      this.echecsConsecutifs = 0;
      this.stats.ms = this.stats.ms ? this.stats.ms * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0;
    } catch (e) {
      this.stats.echecs++;
      this.echecsConsecutifs++;
      this.derniereErreur = e.message;
      if (type === 'decision') sim.echec(id);
      if (e.statut === 503 || this.echecsConsecutifs >= 6) { this.disponible = false; this.derniereVerif = performance.now(); this.echecsConsecutifs = 0; }
      else this.pauseJusqua = performance.now() + 1500;
    } finally {
      this.actifs--;
      this.enCours.delete(`${type[0]}${id}`);
    }
  }
}
