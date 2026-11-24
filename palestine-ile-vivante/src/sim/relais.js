// Relais de nuit : fait vivre le village pendant que la page est fermée.
// Même moteur, mêmes habitants : seul le décor change (un serveur au lieu du navigateur).
// Les habitants pensent avec les modèles gratuits (clés enregistrées par le joueur) ; le temps ne coule que
// tant que peu d'habitants attendent une décision, exactement comme dans la page : le relais ne triche jamais
// en faisant avancer le monde sans que personne ne pense.
import { Simulation } from './simulation.js';
import { PenseurGroq } from './penseur-groq.js';

export const VITESSE_VEILLE = 2; // minutes de jeu par seconde réelle
export const SEUIL_ATTENTE = 10; // au-delà, le temps s'arrête jusqu'à ce que les habitants aient pensé
export const MAX_MINUTES_JEU = 720; // jamais plus de 12 h de jeu par passage

export async function faireVivre({
  etat, cles, transport, budgetMs = 240000, vitesse = VITESSE_VEILLE, maxMinutes = MAX_MINUTES_JEU,
  horloge = () => performance.now(), pause = (ms) => new Promise((r) => setTimeout(r, ms)), pasMs = 150, inactifMs = 90000,
}) {
  const sim = Simulation.charger(etat);
  const penseur = new PenseurGroq(sim, { transport, cles, horloge });
  await penseur.verifier();
  if (!penseur.disponible) return { ok: false, raison: penseur.derniereErreur || 'aucun modèle disponible', etat: null };

  const debut = horloge();
  const avant = { temps: sim.temps, deces: sim.stats.deces, naissances: sim.stats.naissances, decisions: sim.stats.decisions };
  let vu = sim.stats.decisions, derniereDecision = debut, dernier = debut, arret = 'budget';
  while (horloge() - debut < budgetMs) {
    const t = horloge();
    const dtReel = Math.min(1, Math.max(0, (t - dernier) / 1000));
    dernier = t;
    if (sim.nbAttente() <= SEUIL_ATTENTE) sim.update(dtReel * vitesse);
    penseur.tick();
    if (sim.stats.decisions !== vu) { vu = sim.stats.decisions; derniereDecision = t; }
    if (sim.temps - avant.temps >= maxMinutes) { arret = 'duree'; break; }
    // plus aucun modèle ne répond depuis un moment (quotas du jour épuisés) : inutile de laisser tourner
    if (t - derniereDecision > inactifMs) { arret = 'quotas'; break; }
    await pause(pasMs);
  }
  // les appels en cours se terminent (30 s au plus) ; leurs réponses sont appliquées avant d'enregistrer
  const limite = horloge() + 30000;
  while (penseur.actifs > 0 && horloge() < limite) await pause(200);

  return {
    ok: true, arret, etat: sim.serialiser(), temps: sim.temps,
    stats: {
      minutesJeu: Math.round(sim.temps - avant.temps), decisions: sim.stats.decisions - avant.decisions,
      deces: sim.stats.deces - avant.deces, naissances: sim.stats.naissances - avant.naissances,
      appels: penseur.stats.appels, echecs: penseur.stats.echecs, modeles: penseur.parFournisseur,
      moment: sim.horodatage(), vivants: sim.habitants.length,
    },
  };
}
