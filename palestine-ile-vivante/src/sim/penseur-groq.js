// Pensée des habitants quand le jeu est en ligne (Vercel) : modèle gratuit de Groq.
// Autonome : dès que des habitants doivent décider, un groupe part réfléchir, sans bouton.
// La clé Groq du joueur reste dans son navigateur ; elle passe par nos fonctions Vercel
// (api/pensee.js) uniquement pour atteindre Groq, sans être stockée.

import { promptLot, appliquerLot } from './penseur-claude.js';

const CLE = 'ile-vivante:groq';
const TAILLE_GROUPE = 12;
const ECART_MIN_MS = 2500; // laisse respirer la limite gratuite de Groq
const PREFERENCES = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant'];

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

// « 7.66s », « 1m2.5s », « 250ms » → millisecondes
function duree(t) {
  if (!t) return 0;
  let ms = 0;
  for (const [, n, u] of String(t).matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(n) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[u];
  return ms;
}

function extraireJson(t) {
  const s = String(t || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch { /* on cherche l'objet */ }
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
  throw new SyntaxError('JSON introuvable');
}

export class PenseurGroq {
  constructor(sim) {
    this.sim = sim;
    this.mode = 'groq';
    this.cle = lire(CLE) || '';
    this.modele = lire(`${CLE}:modele`) || '';
    this.disponible = false;
    this.pret = false;
    this.fournisseur = 'Groq (gratuit)';
    this.actifs = 0;
    this.groupe = [];
    this.stats = { appels: 0, ok: 0, echecs: 0, ms: 0 };
    this.derniereErreur = '';
    this.pauseJusqua = 0;
    this.dernierEnvoi = -Infinity;
    this.disponibles = [];
    this.jetonsParEnvoi = 4000; // estimation, ajustée d'après Groq
  }

  async verifier() {
    if (!this.cle) { this.pret = true; this.disponible = false; return false; }
    try {
      const r = await fetch('api/modeles', { headers: { 'x-groq-key': this.cle } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { this.derniereErreur = 'Groq refuse cette clé. Vérifiez-la ou créez-en une nouvelle.'; this.oublierCle(false); }
      else if (!r.ok) this.derniereErreur = d.erreur || 'Groq injoignable pour le moment.';
      else {
        const dispo = d.modeles || [];
        this.disponibles = [...PREFERENCES.filter((m) => dispo.includes(m)), ...dispo.filter((m) => !PREFERENCES.includes(m) && !/whisper|guard|tts|embed|orpheus|playai|compound/i.test(m))];
        if (!this.disponibles.includes(this.modele)) this.modele = this.disponibles[0] || '';
        ecrire(`${CLE}:modele`, this.modele);
        this.disponible = !!this.modele;
        this.derniereErreur = this.modele ? '' : 'Aucun modèle de discussion disponible sur ce compte Groq.';
      }
    } catch {
      this.derniereErreur = 'Pas de connexion internet.';
    }
    this.pret = true;
    return this.disponible;
  }

  async enregistrerCle(cle) {
    this.cle = String(cle || '').trim();
    ecrire(CLE, this.cle);
    this.pret = false;
    return this.verifier();
  }

  oublierCle(effacer = true) {
    if (effacer) this.derniereErreur = '';
    this.cle = '';
    this.disponible = false;
    ecrire(CLE, null);
  }

  tick() {
    const maintenant = performance.now();
    if (!this.disponible || this.actifs || maintenant < this.pauseJusqua || maintenant - this.dernierEnvoi < ECART_MIN_MS) return;
    const ids = this.sim.demandes().slice(0, TAILLE_GROUPE);
    if (ids.length) this.lancer(ids);
  }

  reflechir() { /* autonome : pas de bouton */ }

  // N'envoie le groupe suivant que lorsque Groq a de quoi le traiter (évite les refus).
  reglerRythme(q) {
    if (!q) return;
    const maintenant = performance.now();
    if (Number.isFinite(q.jetons) && q.jetons < this.jetonsParEnvoi * 1.1) this.pauseJusqua = Math.max(this.pauseJusqua, maintenant + Math.min(65000, duree(q.jetonsReset) + 300));
    if (Number.isFinite(q.requetes) && q.requetes < 1) this.pauseJusqua = Math.max(this.pauseJusqua, maintenant + Math.min(65000, duree(q.requetesReset) + 300));
  }

  async lancer(ids) {
    const sim = this.sim;
    const prompt = promptLot(sim, ids);
    for (const id of ids) sim.marquerEnvoye(id);
    this.actifs = 1;
    this.groupe = ids;
    this.dernierEnvoi = performance.now();
    this.stats.appels++;
    const t0 = performance.now();
    try {
      const r = await fetch('api/pensee', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-groq-key': this.cle },
        body: JSON.stringify({ prompt, modele: this.modele }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw Object.assign(new Error('limite'), { attente: d.attente || 20, quota: d.quota });
      if (r.status === 401) { this.oublierCle(false); throw new Error('Groq refuse la clé enregistrée. Saisissez-en une nouvelle.'); }
      if (!r.ok) throw new Error(d.erreur || `erreur ${r.status}`);
      if (sim !== this.sim) return;
      if (d.jetonsUtilises) this.jetonsParEnvoi = this.jetonsParEnvoi * 0.5 + d.jetonsUtilises * 0.5;
      this.reglerRythme(d.quota);
      const n = appliquerLot(sim, ids, extraireJson(d.texte));
      this.stats.ok += n;
      this.stats.echecs += ids.length - n;
      this.derniereErreur = '';
      const ms = performance.now() - t0;
      this.stats.ms = this.stats.ms ? this.stats.ms * 0.7 + ms * 0.3 : ms;
    } catch (e) {
      for (const id of ids) sim.echec(id);
      this.stats.echecs += ids.length;
      if (e.attente) {
        // longue attente = quota du jour épuisé pour ce modèle : on passe au suivant
        const suivant = this.disponibles[this.disponibles.indexOf(this.modele) + 1];
        if (e.attente > 90 && suivant) {
          this.modele = suivant;
          ecrire(`${CLE}:modele`, suivant);
          this.pauseJusqua = performance.now() + 2000;
          this.derniereErreur = '';
        } else {
          this.pauseJusqua = performance.now() + e.attente * 1000;
          this.derniereErreur = e.attente > 15 ? `Limite gratuite de Groq atteinte : les habitants reprennent dans ${Math.ceil(e.attente)} s.` : '';
        }
      } else {
        this.pauseJusqua = performance.now() + 5000;
        this.derniereErreur = e instanceof SyntaxError ? 'Réponse de Groq illisible, nouvel essai dans un instant.' : e.message;
      }
    } finally {
      this.actifs = 0;
      this.groupe = [];
    }
  }
}
