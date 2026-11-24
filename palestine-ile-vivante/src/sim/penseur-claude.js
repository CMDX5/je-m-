// Pensée des habitants quand le jeu est ouvert sur claude.ai (téléphone compris) :
// la page demande à Claude, sur le compte Claude de la personne qui joue.
// La plateforme demande que chaque appel parte d'un geste du joueur : un toucher
// « Laisser réfléchir » fait penser un groupe d'habitants en un seul appel.
// Chacun reçoit SA perception et Claude décide pour lui seul, à sa place.

import { SYSTEME, SYSTEME_BILAN } from './prompts.js';
import { construirePrompt, infosVillage } from './perception.js';

const TAILLE_GROUPE = 16;

const CONSIGNE = `Tu vas prêter ta voix, l'un après l'autre, à plusieurs habitants d'un même village. Pour CHACUN, sois entièrement lui : il ne connaît que SA propre perception (ci-dessous) et ignore ce que vivent les autres et ce qui se décide pour eux. Ne mélange pas leurs vies, ne les fais pas se ressembler.

Voici les règles de ce monde, identiques pour chacun :

`;

const FORMAT = `

FORMAT DE TA RÉPONSE : uniquement un objet JSON de la forme {"habitants": [...]}, avec un objet par habitant, dans l'ordre donné. Chaque objet a la clé "id" (le numéro de l'habitant) et les clés décrites ci-dessus ("pensee", "humeur", "action", "parole", et seulement si besoin "lieu", "personne", "objet", "quantite", "pret", "duree_minutes", "ton", "dispute", "souvenir", "avis_sur", "avis", "lien", "avis_conseil", "identite", "prenom_enfant", "requete_conseil"). Ta pensée et ta parole peuvent être aussi longues ou aussi courtes que tu veux. Forme seulement (les "..." sont à remplacer par tes mots et ton choix) : {"habitants": [{"id": 3, "pensee": "...", "humeur": 0, "action": "...", "parole": "..."}]}`;

const MESSAGES = {
  not_granted: "Vous n'avez pas autorisé cette page à utiliser Claude. Rechargez la page pour qu'elle vous le redemande.",
  sampling_disabled: "Claude n'est pas disponible pour ce compte.",
  not_declared: 'Cette version de la page ne peut pas utiliser Claude.',
  capability_disabled: 'Claude ne peut pas être utilisé dans cette vue.',
  capability_removed: 'Cette application Claude est trop ancienne pour faire penser les habitants.',
  rate_limited: 'Limite d’utilisation de Claude atteinte pour le moment. Réessayez un peu plus tard.',
  session_expired: 'Votre session Claude a expiré : reconnectez-vous.',
  invalid_json: 'Réponse de Claude illisible. Touchez à nouveau « Laisser réfléchir ».',
  refused: 'Claude a refusé de répondre pour ce groupe. Touchez à nouveau pour un autre groupe.',
  prompt_too_large: 'Trop d’informations à la fois : touchez à nouveau.',
};
const DEFINITIFS = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

// Un seul texte pour un groupe d'habitants : chacun avec SA perception.
export function promptLot(sim, ids) {
  const blocs = ids.map((id) => `=== Habitant id=${id} ===\n${construirePrompt(sim, sim.habitant(id), 'decision', { commun: false })}`);
  return `${CONSIGNE}${SYSTEME}${FORMAT}\n\n${infosVillage(sim)}\n\n${blocs.join('\n\n')}\n\nRéponds maintenant par l'objet JSON ({"habitants": [...]}, ${ids.length} habitants).`;
}

// Bilan du soir pour plusieurs habitants : chacun relit SES souvenirs et écrit, seul, ce qu'il en garde.
export const TAILLE_BILAN = 4;
export function promptLotBilan(sim, ids) {
  const blocs = ids.map((id) => `=== Habitant id=${id} ===\n${construirePrompt(sim, sim.habitant(id), 'bilan')}`);
  return `${CONSIGNE}${SYSTEME_BILAN}\n\nFORMAT DE TA RÉPONSE : uniquement un objet JSON {"habitants": [...]}, un objet par habitant, dans l'ordre donné, avec les clés "id", "resume", "identite", "lecons", "questions".\n\n${blocs.join('\n\n')}\n\nRéponds maintenant par l'objet JSON (${ids.length} habitants).`;
}
export function appliquerLotBilan(sim, ids, rep) {
  const liste = Array.isArray(rep) ? rep : Array.isArray(rep?.habitants) ? rep.habitants : [];
  let n = 0;
  ids.forEach((id, i) => {
    const d = liste.find((x) => Number(x?.id) === id) || liste[i];
    if (d && typeof d === 'object') { sim.appliquerBilan(id, d); n++; } else sim.bilanManque(id);
  });
  return n;
}

// Rend à chaque habitant SA décision ; ceux sans réponse restent un moment sans rien faire.
export function appliquerLot(sim, ids, rep) {
  const liste = Array.isArray(rep) ? rep : Array.isArray(rep?.habitants) ? rep.habitants : [];
  const parId = new Map();
  liste.forEach((d, i) => {
    if (!d || typeof d !== 'object') return;
    const id = Number.isInteger(Number(d.id)) && ids.includes(Number(d.id)) ? Number(d.id) : ids[i];
    if (id !== undefined && !parId.has(id)) parId.set(id, d);
  });
  for (const id of ids) {
    if (parId.has(id)) sim.appliquer(id, parId.get(id));
    else sim.echec(id);
  }
  return parId.size;
}

export class PenseurClaude {
  constructor(sim) {
    this.sim = sim;
    this.mode = 'claude';
    this.sample = null;
    this.disponible = false;
    this.pret = false; // la plateforme a répondu
    this.fournisseur = 'Claude (votre compte)';
    this.modele = 'rapide';
    this.actifs = 0;
    this.stats = { appels: 0, ok: 0, echecs: 0, ms: 0 };
    this.derniereErreur = '';
    this.groupe = [];
  }

  async verifier() {
    try {
      this.sample = (await window.claude?.use?.('sample')) || null;
    } catch {
      this.sample = null;
    }
    this.pret = true;
    this.disponible = !!this.sample;
    if (!this.disponible) this.derniereErreur = 'Cette page doit être ouverte sur claude.ai pour que les habitants puissent penser.';
    return this.disponible;
  }

  tick() { /* rien d'automatique : chaque appel part d'un geste du joueur */ }

  enAttente() {
    return this.sim.demandes().length;
  }

  // Appelé par le bouton « Laisser réfléchir ». S'il n'y a rien à décider, ceux qui dorment font leur bilan.
  async reflechir() {
    if (!this.disponible || this.actifs) return;
    const sim = this.sim;
    const ids = sim.demandes().slice(0, TAILLE_GROUPE);
    if (!ids.length) return this.bilans();
    const prompt = promptLot(sim, ids);
    for (const id of ids) sim.marquerEnvoye(id);
    this.groupe = ids;
    this.actifs = 1;
    this.stats.appels++;
    this.derniereErreur = '';
    const t0 = performance.now();
    try {
      const rep = await this.sample.json(prompt, { modelTier: 'quick', cache: false });
      if (sim !== this.sim) return;
      const n = appliquerLot(sim, ids, rep);
      this.stats.ok += n;
      this.stats.echecs += ids.length - n;
      const ms = performance.now() - t0;
      this.stats.ms = this.stats.ms ? this.stats.ms * 0.7 + ms * 0.3 : ms;
    } catch (e) {
      for (const id of ids) sim.echec(id);
      this.stats.echecs += ids.length;
      const code = e?.code || 'upstream_error';
      if (code !== 'cancelled') this.derniereErreur = MESSAGES[code] || 'Claude n’a pas pu répondre. Touchez à nouveau « Laisser réfléchir ».';
      if (DEFINITIFS.has(code)) this.disponible = false;
    } finally {
      this.actifs = 0;
      this.groupe = [];
    }
  }

  async bilans() {
    const sim = this.sim;
    const ids = sim.demandesBilan().slice(0, TAILLE_BILAN);
    if (!ids.length) return;
    const prompt = promptLotBilan(sim, ids);
    for (const id of ids) sim.marquerEnvoye(id, 'bilan');
    this.actifs = 1;
    try {
      const rep = await this.sample.json(prompt, { modelTier: 'quick', cache: false });
      if (sim === this.sim) appliquerLotBilan(sim, ids, rep);
    } catch {
      for (const id of ids) sim.bilanManque(id);
    } finally {
      this.actifs = 0;
    }
  }
}
