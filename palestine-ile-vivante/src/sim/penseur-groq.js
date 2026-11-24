// Pensée des habitants quand le jeu est en ligne (Vercel) : modèles gratuits de Groq et de Google Gemini.
// Autonome : dès que des habitants doivent décider, un groupe part réfléchir, sans bouton.
// Chaque modèle a ses propres limites gratuites : quand l'un doit souffler (limite par minute)
// ou a fini son quota du jour, le groupe suivant part vers le modèle suivant, Groq d'abord, puis Gemini.
// Les clés du joueur restent dans son navigateur ; elles passent par nos fonctions Vercel
// (api/pensee.js, api/modeles.js) uniquement pour atteindre le fournisseur, sans être stockées.

import { promptLot, appliquerLot, promptLotBilan, appliquerLotBilan, TAILLE_BILAN } from './penseur-claude.js';

const TAILLE_GROUPE = 8; // moins d'habitants par demande : chacun garde mieux sa propre voix
const ECART_MIN_MS = 2500; // laisse respirer les limites gratuites
const MAX_PARALLELE = 3; // plusieurs groupes à la fois, chacun vers un modèle différent (chaque modèle a ses propres limites)

export const FOURNISSEURS = {
  groq: {
    nom: 'Groq',
    cle: 'ile-vivante:groq',
    preferences: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    // modèles assez bons pour penser à la place d'un habitant ; les autres ne servent qu'en secours
    principaux: /^(llama-3\.3-70b-versatile|openai\/gpt-oss-120b|qwen\/qwen3-32b)$/,
    exclus: /whisper|guard|tts|embed|orpheus|playai|compound|prompt/i,
  },
  gemini: {
    nom: 'Gemini',
    cle: 'ile-vivante:gemini',
    preferences: [],
    principaux: /^gemini-[\d.]+-flash(-lite)?$/,
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
    this.occupes = new Set(); // modèles qui réfléchissent en ce moment
    this.groupe = [];
    this.stats = { appels: 0, ok: 0, echecs: 0, renvois: 0, ms: 0 };
    this.parFournisseur = Object.fromEntries(ORDRE.map((f) => [f, 0]));
    this.derniereErreur = '';
    this.erreurs = {}; // par fournisseur
    this.dernierEnvoi = -Infinity;
    this.entrees = []; // [{ f, m }] dans l'ordre de préférence
    this.pauses = new Map(); // "f|m" → fin de pause (performance.now)
    this.decisionsDepuisBilan = 0;
    this.retires = []; // modèles écartés pendant la partie (pour les rapports)
    this.erreurTechnique = '';
    this.jetons = new Map(); // "f|m" → jetons estimés par envoi
  }

  get actifs() { return this.occupes.size; }

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
      // seulement des modèles connus pour tenir nos longs messages en français (les autres échouaient un par un)
      const dispo = (d.modeles || []).filter((m) => !FOURNISSEURS[f].exclus.test(m));
      const liste = f === 'gemini' ? trierGemini(dispo).filter((m) => FOURNISSEURS.gemini.principaux.test(m)) : FOURNISSEURS.groq.preferences.filter((m) => dispo.includes(m));
      this.erreurs[f] = liste.length ? '' : `Aucun modèle de discussion disponible sur ce compte ${nom}.`;
      return liste.map((m) => ({ f, m, principal: FOURNISSEURS[f].principaux.test(m) }));
    } catch {
      this.erreurs[f] = 'Pas de connexion internet.';
      return [];
    }
  }

  async verifier() {
    const listes = await Promise.all(ORDRE.map((f) => this.verifierUn(f)));
    // d'abord les bons modèles (Groq puis Gemini), ensuite ceux de secours
    const toutes = listes.flat();
    this.entrees = [...toutes.filter((e) => e.principal), ...toutes.filter((e) => !e.principal)];
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

  // premier modèle, dans l'ordre de préférence, qui n'est pas en train de souffler.
  // Un modèle de secours ne sert que si aucun bon modèle ne reprend dans la minute.
  choisir(maintenant) {
    const occupe = (e) => this.occupes.has(`${e.f}|${e.m}`);
    const libre = (e) => !occupe(e) && maintenant >= (this.pauses.get(`${e.f}|${e.m}`) || 0);
    const bon = this.entrees.find((e) => e.principal && libre(e));
    if (bon) return bon;
    const bientot = this.entrees.some((e) => e.principal && (occupe(e) || (this.pauses.get(`${e.f}|${e.m}`) || 0) - maintenant < 60000));
    return bientot ? undefined : this.entrees.find(libre);
  }

  retirer(e) {
    this.retires.push(`${e.f}:${e.m}`);
    this.entrees = this.entrees.filter((x) => x !== e);
    this.disponible = this.entrees.length > 0;
  }

  tick() {
    const maintenant = performance.now();
    if (!this.disponible || this.actifs >= MAX_PARALLELE || maintenant - this.dernierEnvoi < ECART_MIN_MS) return;
    const e = this.choisir(maintenant);
    if (!e) return;
    const ids = this.sim.demandes().slice(0, TAILLE_GROUPE);
    // Les décisions d'abord, mais le bilan du soir (souvenirs, qui je suis, leçons, questions) ne doit jamais être affamé :
    // quand peu d'habitants attendent, ou après trois groupes de décisions, ceux qui dorment font leur bilan.
    const dus = this.sim.demandesBilan();
    if (dus.length && (ids.length < 4 || this.decisionsDepuisBilan >= 3)) {
      this.decisionsDepuisBilan = 0;
      this.lancer(dus.slice(0, TAILLE_BILAN), e, 'bilan');
    } else if (ids.length) {
      this.decisionsDepuisBilan++;
      this.lancer(ids, e);
    }
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

  async lancer(ids, e = this.entrees[0], type = 'decision') {
    const sim = this.sim;
    const bilan = type === 'bilan';
    const prompt = bilan ? promptLotBilan(sim, ids) : promptLot(sim, ids);
    for (const id of ids) sim.marquerEnvoye(id, type);
    const k = `${e.f}|${e.m}`;
    this.occupes.add(k);
    this.groupe = ids;
    this.dernierEnvoi = performance.now();
    this.stats.appels++;
    this.modele = e.m;
    this.fournisseurActuel = e.f;
    const t0 = performance.now();
    try {
      const r = await fetch('api/pensee', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fournisseur': e.f, 'x-cle': this.cles[e.f] },
        body: JSON.stringify({ prompt, modele: e.m }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw Object.assign(new Error('limite'), { attente: d.attente || 20, quota: d.quota });
      if (r.status === 401) { this.oublierCle(e.f, false); throw new Error(`${FOURNISSEURS[e.f].nom} refuse la clé enregistrée. Saisissez-en une nouvelle.`); }
      // modèle inadapté (message trop long, introuvable) : on ne s'en sert plus ; surchargé : il souffle un moment
      if (!r.ok) this.erreurTechnique = `${e.f}:${e.m} ${r.status} ${String(d.detail || d.erreur || '').slice(0, 160)}`;
      if (d.retirer) { this.retirer(e); throw Object.assign(new Error('modèle retiré'), { silencieux: true }); }
      if (r.status === 503) throw Object.assign(new Error('surcharge'), { attente: d.attente || 60, surcharge: true });
      if (!r.ok) throw new Error(d.erreur || `erreur ${r.status}`);
      if (sim !== this.sim) return;
      if (d.jetonsUtilises) this.jetons.set(k, (this.jetons.get(k) || d.jetonsUtilises) * 0.5 + d.jetonsUtilises * 0.5);
      this.reglerRythme(e, d.quota);
      if (bilan) {
        this.stats.bilans = (this.stats.bilans || 0) + appliquerLotBilan(sim, ids, extraireJson(d.texte));
        this.derniereErreur = '';
        return;
      }
      const n = appliquerLot(sim, ids, extraireJson(d.texte));
      this.stats.ok += n;
      this.stats.echecs += ids.length - n;
      this.parFournisseur[e.f] += n;
      this.derniereErreur = '';
      const ms = performance.now() - t0;
      this.stats.ms = this.stats.ms ? this.stats.ms * 0.7 + ms * 0.3 : ms;
    } catch (err) {
      // le modèle n'a rien dit : ces habitants n'ont pas pensé, ils attendent le prochain modèle
      for (const id of ids) bilan ? sim.bilanManque(id) : sim.remettre(id);
      if (!bilan) this.stats.renvois += ids.length;
      if (err.silencieux) {
        this.derniereErreur = this.disponible ? '' : 'Aucun modèle ne convient sur ces comptes.';
      } else if (err.attente) {
        // longue attente = quota du jour épuisé pour ce modèle : les groupes suivants iront vers un autre modèle
        this.pauser(e, Math.min(err.attente, 6 * 3600) * 1000);
        const reprise = this.pauseJusqua - performance.now();
        const aucunLibre = !this.entrees.some((x) => performance.now() >= (this.pauses.get(`${x.f}|${x.m}`) || 0));
        this.derniereErreur = aucunLibre && reprise > 15000
          ? err.surcharge && reprise <= 120000 ? 'Les modèles gratuits sont très demandés en ce moment : les habitants reprennent dans un instant.' : `Limites gratuites atteintes : les habitants reprennent dans ${reprise > 120000 ? `${Math.ceil(reprise / 60000)} min` : `${Math.ceil(reprise / 1000)} s`}.${this.aCle('gemini') ? '' : ' Ajoutez une clé Gemini (onglet Village) pour continuer.'}`
          : '';
      } else {
        this.pauser(e, 5000);
        // détail technique gardé pour les rapports, jamais montré tel quel au joueur
        this.derniereErreur = '';
        this.erreurTechnique = String(err.message || err).slice(0, 200);
      }
    } finally {
      this.occupes.delete(k);
      this.groupe = [];
    }
  }
}
