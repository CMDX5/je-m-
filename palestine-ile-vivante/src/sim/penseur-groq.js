// Pensée des habitants quand le jeu est en ligne (Vercel) : modèles gratuits de Groq et de Google Gemini.
// Autonome : dès que des habitants doivent décider, un groupe part réfléchir, sans bouton.
// Chaque modèle a ses propres limites gratuites : quand l'un doit souffler (limite par minute)
// ou a fini son quota du jour, le groupe suivant part vers le modèle suivant, Groq d'abord, puis Gemini.
// Les clés du joueur restent dans son navigateur ; elles passent par nos fonctions Vercel
// (api/pensee.js, api/modeles.js) uniquement pour atteindre le fournisseur, sans être stockées.

import { promptLot, appliquerLot } from './penseur-claude.js';

const TAILLE_GROUPE = 12;
const ECART_MIN_MS = 2500; // laisse respirer les limites gratuites

export const FOURNISSEURS = {
  groq: {
    nom: 'Groq',
    cle: 'ile-vivante:groq',
    preferences: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant'],
    exclus: /whisper|guard|tts|embed|orpheus|playai|compound|prompt/i,
  },
  gemini: {
    nom: 'Gemini',
    cle: 'ile-vivante:gemini',
    preferences: [],
    exclus: /embed|image|tts|audio|live|veo|imagen|aqa|vision|robotics|computer|native|learnlm|nano|banana/i,
  },
};
const ORDRE = ['groq', 'gemini'];

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

// Gemini : les « Flash-Lite » ont les quotas gratuits les plus larges, puis les « Flash » ; versions récentes et stables d'abord.
function rangGemini(m) {
  const famille = /flash-lite/.test(m) ? 0 : /flash/.test(m) ? 1 : /gemma/.test(m) ? 3 : /pro/.test(m) ? 4 : 2;
  const essai = /preview|exp/.test(m) ? 1 : 0;
  const version = Number((m.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
  return [famille, essai, -version];
}
function trierGemini(liste) {
  return liste.filter((m) => /gemini|gemma/.test(m)).sort((a, b) => {
    const ra = rangGemini(a), rb = rangGemini(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.localeCompare(b);
  });
}

export class PenseurGroq {
  constructor(sim) {
    this.sim = sim;
    this.mode = 'groq';
    this.cles = Object.fromEntries(ORDRE.map((f) => [f, lire(FOURNISSEURS[f].cle) || '']));
    this.modele = lire(`${FOURNISSEURS.groq.cle}:modele`) || '';
    this.fournisseurActuel = 'groq';
    this.disponible = false;
    this.pret = false;
    this.actifs = 0;
    this.groupe = [];
    this.stats = { appels: 0, ok: 0, echecs: 0, ms: 0 };
    this.parFournisseur = Object.fromEntries(ORDRE.map((f) => [f, 0]));
    this.derniereErreur = '';
    this.erreurs = {}; // par fournisseur
    this.dernierEnvoi = -Infinity;
    this.entrees = []; // [{ f, m }] dans l'ordre de préférence
    this.pauses = new Map(); // "f|m" → fin de pause (performance.now)
    this.jetons = new Map(); // "f|m" → jetons estimés par envoi
  }

  get cle() { return this.cles.groq || this.cles.gemini; }
  get fournisseur() {
    const actifs = ORDRE.filter((f) => this.entrees.some((e) => e.f === f)).map((f) => FOURNISSEURS[f].nom);
    return actifs.length ? `${actifs.join(' + ')} (gratuit)` : 'aucun';
  }
  get pauseJusqua() {
    if (!this.entrees.length) return 0;
    return Math.min(...this.entrees.map((e) => this.pauses.get(`${e.f}|${e.m}`) || 0));
  }
  set pauseJusqua(t) { for (const e of this.entrees) this.pauses.set(`${e.f}|${e.m}`, t); }

  async verifierUn(f) {
    const cle = this.cles[f];
    if (!cle) return [];
    const nom = FOURNISSEURS[f].nom;
    try {
      const r = await fetch('api/modeles', { headers: { 'x-fournisseur': f, 'x-cle': cle } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { this.erreurs[f] = `${nom} refuse cette clé. Vérifiez-la ou créez-en une nouvelle.`; this.oublierCle(f, false); return []; }
      if (!r.ok) { this.erreurs[f] = d.erreur || `${nom} injoignable pour le moment.`; return []; }
      const dispo = (d.modeles || []).filter((m) => !FOURNISSEURS[f].exclus.test(m));
      const liste = f === 'gemini' ? trierGemini(dispo) : [...FOURNISSEURS.groq.preferences.filter((m) => dispo.includes(m)), ...dispo.filter((m) => !FOURNISSEURS.groq.preferences.includes(m))];
      this.erreurs[f] = liste.length ? '' : `Aucun modèle de discussion disponible sur ce compte ${nom}.`;
      return liste.map((m) => ({ f, m }));
    } catch {
      this.erreurs[f] = 'Pas de connexion internet.';
      return [];
    }
  }

  async verifier() {
    const listes = await Promise.all(ORDRE.map((f) => this.verifierUn(f)));
    this.entrees = listes.flat();
    this.disponible = this.entrees.length > 0;
    if (this.disponible) {
      const premier = this.entrees[0];
      this.modele = premier.m;
      this.fournisseurActuel = premier.f;
      ecrire(`${FOURNISSEURS.groq.cle}:modele`, this.modele);
    }
    this.derniereErreur = this.disponible ? '' : (ORDRE.map((f) => this.erreurs[f]).find(Boolean) || '');
    this.pret = true;
    return this.disponible;
  }

  aCle(f) { return !!this.cles[f]; }
  actif(f) { return this.entrees.some((e) => e.f === f); }

  async enregistrerCle(cle, f = 'groq') {
    this.cles[f] = String(cle || '').trim();
    ecrire(FOURNISSEURS[f].cle, this.cles[f] || null);
    this.pret = false;
    await this.verifier();
    if (!this.actif(f)) { this.derniereErreur = this.erreurs[f] || `${FOURNISSEURS[f].nom} refuse cette clé.`; return false; }
    return true;
  }

  oublierCle(f = 'groq', effacer = true) {
    if (effacer) { this.derniereErreur = ''; this.erreurs[f] = ''; }
    this.cles[f] = '';
    ecrire(FOURNISSEURS[f].cle, null);
    this.entrees = this.entrees.filter((e) => e.f !== f);
    this.disponible = this.entrees.length > 0;
  }

  // premier modèle, dans l'ordre de préférence, qui n'est pas en train de souffler
  choisir(maintenant) {
    return this.entrees.find((e) => maintenant >= (this.pauses.get(`${e.f}|${e.m}`) || 0));
  }

  tick() {
    const maintenant = performance.now();
    if (!this.disponible || this.actifs || maintenant - this.dernierEnvoi < ECART_MIN_MS) return;
    const e = this.choisir(maintenant);
    if (!e) return;
    const ids = this.sim.demandes().slice(0, TAILLE_GROUPE);
    if (ids.length) this.lancer(ids, e);
  }

  reflechir() { /* autonome : pas de bouton */ }

  pauser(e, ms) {
    const k = `${e.f}|${e.m}`;
    this.pauses.set(k, Math.max(this.pauses.get(k) || 0, performance.now() + ms));
  }

  // N'envoie le groupe suivant vers ce modèle que lorsqu'il a de quoi le traiter (évite les refus).
  reglerRythme(e, q) {
    if (!q) return;
    const besoin = this.jetons.get(`${e.f}|${e.m}`) || 4000;
    if (Number.isFinite(q.jetons) && q.jetons < besoin * 1.1) this.pauser(e, Math.min(65000, duree(q.jetonsReset) + 300));
    if (Number.isFinite(q.requetes) && q.requetes < 1) this.pauser(e, Math.min(65000, duree(q.requetesReset) + 300));
  }

  async lancer(ids, e = this.entrees[0]) {
    const sim = this.sim;
    const prompt = promptLot(sim, ids);
    for (const id of ids) sim.marquerEnvoye(id);
    this.actifs = 1;
    this.groupe = ids;
    this.dernierEnvoi = performance.now();
    this.stats.appels++;
    this.modele = e.m;
    this.fournisseurActuel = e.f;
    const k = `${e.f}|${e.m}`;
    const t0 = performance.now();
    try {
      const r = await fetch('api/pensee', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fournisseur': e.f, 'x-cle': this.cles[e.f] },
        body: JSON.stringify({ prompt, modele: e.m }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw Object.assign(new Error('limite'), { attente: d.attente || 20, quota: d.quota });
      if (r.status === 401) { this.oublierCle(e.f, false); throw new Error(`${FOURNISSEURS[e.f].nom} refuse la clé enregistrée. Saisissez-en une nouvelle.`); }
      if (r.status === 404) { this.entrees = this.entrees.filter((x) => x !== e); this.disponible = this.entrees.length > 0; throw new Error(''); }
      if (!r.ok) throw new Error(d.erreur || `erreur ${r.status}`);
      if (sim !== this.sim) return;
      if (d.jetonsUtilises) this.jetons.set(k, (this.jetons.get(k) || d.jetonsUtilises) * 0.5 + d.jetonsUtilises * 0.5);
      this.reglerRythme(e, d.quota);
      const n = appliquerLot(sim, ids, extraireJson(d.texte));
      this.stats.ok += n;
      this.stats.echecs += ids.length - n;
      this.parFournisseur[e.f] += n;
      this.derniereErreur = '';
      const ms = performance.now() - t0;
      this.stats.ms = this.stats.ms ? this.stats.ms * 0.7 + ms * 0.3 : ms;
    } catch (err) {
      for (const id of ids) sim.echec(id);
      this.stats.echecs += ids.length;
      if (err.attente) {
        // longue attente = quota du jour épuisé pour ce modèle : les groupes suivants iront vers un autre modèle
        this.pauser(e, Math.min(err.attente, 6 * 3600) * 1000);
        const reprise = this.pauseJusqua - performance.now();
        this.derniereErreur = !this.choisir(performance.now()) && reprise > 15000
          ? `Limites gratuites atteintes : les habitants reprennent dans ${reprise > 120000 ? `${Math.ceil(reprise / 60000)} min` : `${Math.ceil(reprise / 1000)} s`}.${this.aCle('gemini') ? '' : ' Ajoutez une clé Gemini (onglet Village) pour continuer.'}`
          : '';
      } else {
        this.pauser(e, 5000);
        this.derniereErreur = err instanceof SyntaxError ? 'Réponse illisible, nouvel essai dans un instant.' : err.message;
      }
    } finally {
      this.actifs = 0;
      this.groupe = [];
    }
  }
}
