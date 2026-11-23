// Pensée des habitants quand le jeu est ouvert sur claude.ai (téléphone compris) :
// la page demande à Claude, sur le compte Claude de la personne qui joue.
// La plateforme demande que chaque appel parte d'un geste du joueur : un toucher
// « Laisser réfléchir » fait penser un groupe d'habitants en un seul appel.
// Chacun reçoit SA perception et Claude décide pour lui seul, à sa place.

import { SYSTEME } from './prompts.js';
import { construirePrompt, infosVillage } from './perception.js';

const TAILLE_GROUPE = 16;

const CONSIGNE = `Tu vas prêter ta pensée, l'un après l'autre, à plusieurs habitants d'un même village. Pour CHACUN, mets-toi entièrement à sa place : il ne connaît que SA propre perception (ci-dessous) et ignore ce que vivent les autres et ce que tu décides pour eux. Ne mélange pas leurs vies. Chacun décide librement, selon ce qu'il vit.

Voici les règles de ce monde, identiques pour chacun :

`;

const FORMAT = `

FORMAT DE TA RÉPONSE : uniquement un tableau JSON, un objet par habitant, dans l'ordre donné. Chaque objet a la clé "id" (le numéro de l'habitant) et les clés décrites ci-dessus ("pensee", "humeur", "action", "parole", et seulement si besoin "lieu", "personne", "objet", "quantite", "pret", "duree_minutes", "ton", "souvenir", "avis_sur", "avis", "identite", "requete_conseil"). Pensée et parole courtes (une ou deux phrases). Exemple de forme : [{"id": 3, "pensee": "...", "humeur": 60, "action": "travailler", "parole": ""}]`;

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

  // Appelé par le bouton « Laisser réfléchir ».
  async reflechir() {
    if (!this.disponible || this.actifs) return;
    const sim = this.sim;
    const ids = sim.demandes().slice(0, TAILLE_GROUPE);
    if (!ids.length) return;
    const blocs = ids.map((id) => `=== Habitant id=${id} ===\n${construirePrompt(sim, sim.habitant(id), 'decision', { commun: false })}`);
    const prompt = `${CONSIGNE}${SYSTEME}${FORMAT}\n\n${infosVillage(sim)}\n\n${blocs.join('\n\n')}\n\nRéponds maintenant par le tableau JSON (${ids.length} objets).`;
    for (const id of ids) sim.marquerEnvoye(id);
    this.groupe = ids;
    this.actifs = 1;
    this.stats.appels++;
    this.derniereErreur = '';
    const t0 = performance.now();
    try {
      const rep = await this.sample.json(prompt, { modelTier: 'quick', cache: false });
      const liste = Array.isArray(rep) ? rep : Array.isArray(rep?.habitants) ? rep.habitants : [];
      const parId = new Map();
      liste.forEach((d, i) => {
        if (!d || typeof d !== 'object') return;
        const id = Number.isInteger(Number(d.id)) && ids.includes(Number(d.id)) ? Number(d.id) : ids[i];
        if (id !== undefined && !parId.has(id)) parId.set(id, d);
      });
      for (const id of ids) {
        if (sim !== this.sim) return;
        if (parId.has(id)) sim.appliquer(id, parId.get(id));
        else sim.echec(id);
      }
      this.stats.ok += parId.size;
      this.stats.echecs += ids.length - parId.size;
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
}
