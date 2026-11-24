// Résumé périodique de la partie, envoyé au site (api/rapport) pour que Claude surveille le jeu.
// Ne contient que des données du village fictif : jamais la clé Groq ni rien de personnel.

const moyenne = (l, f) => (l.length ? Math.round(l.reduce((s, x) => s + f(x), 0) / l.length) : 0);

export function resumer(sim, penseur, erreursPage) {
  const H = sim.habitants;
  const actions = {};
  for (const v of H) { const a = v.statut === 'agit' ? v.activite?.action || '?' : v.statut; actions[a] = (actions[a] || 0) + 1; }
  const r = {
    version: 1,
    moment: sim.horodatage(),
    population: { vivants: sim.habitants.length, defunts: sim.defunts.length, naissances: sim.stats.naissances || 0, deces: sim.stats.deces || 0, annee: sim.annee, nourrissons: sim.habitants.filter((v) => v.nourrisson).length, enceintes: sim.habitants.filter((v) => v.enceinte && !v.enceinte.accouche).length, prenomsAttendus: sim.naissancesEnAttente.length, causes: sim.defunts.slice(-6).map((d) => `${d.prenom} ${d.age} ans ${d.mort.cause}`) },
    penseur: penseur ? { mode: penseur.mode, modele: penseur.modele, fournisseur: penseur.fournisseurActuel || '', parFournisseur: penseur.parFournisseur || null, cles: penseur.cles ? Object.keys(penseur.cles).filter((f) => penseur.cles[f]) : [], ...penseur.stats, msMoyen: Math.round(penseur.stats.ms || 0), erreur: penseur.derniereErreur || '', technique: penseur.erreurTechnique || '', retires: penseur.retires || [], modeles: penseur.entrees ? penseur.entrees.map((e) => `${e.f}:${e.m}${e.principal ? '' : ' (secours)'}`) : [] } : null,
    stats: sim.stats,
    corps: {
      faim: moyenne(H, (v) => v.besoins.faim), soif: moyenne(H, (v) => v.besoins.soif), energie: moyenne(H, (v) => v.besoins.energie),
      sante: moyenne(H, (v) => v.besoins.sante), securite: moyenne(H, (v) => v.besoins.securite), humeur: moyenne(H, (v) => v.humeur),
      affames: H.filter((v) => v.besoins.faim < 15).length, assoiffes: H.filter((v) => v.besoins.soif < 15).length, malades: H.filter((v) => v.malade).length,
    },
    argent: { caisse: Math.round(sim.res.pieces), moyenneHabitants: moyenne(H, (v) => v.poche.pieces), sansArgent: H.filter((v) => v.poche.pieces < 1).length, salaire: sim.salaire, prix: sim.prix },
    vivres: { marche: Math.round(sim.res.nourriture), maisons: Math.round(sim.nourritureFoyers()), maisonsVides: Object.values(sim.foyers).filter((f) => f.nourriture < 1).length },
    nature: { poisson: Math.round(sim.monde.poisson * 100), foret: Math.round(sim.monde.foret * 100) },
    actions,
    attente: sim.nbAttente(),
    requetes: sim.requetes.filter((r) => !r.repondue).slice(-5).map((r) => ({ de: sim.habitant(r.de).prenom, texte: r.texte })),
    flux: sim.flux.slice(-24).map((f) => ({ t: sim.horodatage(f.t), de: f.id >= 0 ? sim.habitant(f.id)?.prenom : 'conseil', a: f.a != null ? sim.habitant(f.a)?.prenom : null, type: f.type, ton: f.ton, texte: f.texte })),
    journal: sim.journal.slice(-10).map((e) => `${sim.horodatage(e.t)} ${e.texte}`),
    // 4 habitants différents à chaque rapport, pour voir tout le village au fil du temps
    echantillon: H.filter((v) => v.nbDecisions > 0).sort(() => Math.random() - 0.5).slice(0, 4).map((v) => ({ nom: v.prenom, age: v.age, metier: v.metier, faim: Math.round(v.besoins.faim), soif: Math.round(v.besoins.soif), pieces: Math.round(v.poche.pieces), pensee: v.pensee, identite: v.identite, lecons: (v.lecons || '').slice(0, 220), questions: (v.questions || '').slice(0, 220), souvenirs: v.souvenirs.slice(-2).map((s) => s.texte.slice(0, 120)), avis: Object.values(v.avis).slice(-2).map((a) => a.texte) })),
    interieur: (sim.interieur || []).filter((e) => e.type !== 'pensee' && e.type !== 'parole').slice(-6).map((e) => ({ t: sim.horodatage(e.t), de: sim.habitant(e.id)?.prenom, type: e.type, texte: e.texte.slice(0, 220) })),
    bilans: { faits: H.filter((v) => v.resume).length, avecLecons: H.filter((v) => v.lecons).length, avecQuestions: H.filter((v) => v.questions).length, enAttente: H.filter((v) => v.bilanDu).length },
    erreursPage: erreursPage.slice(-5),
  };
  // la vie intérieure d'abord : les journaux d'hébergement coupent les longs messages par la fin
  const { version, moment, population, bilans, interieur, echantillon, flux, corps, argent, vivres, actions: act, attente, requetes, stats, penseur: pen, nature, journal, erreursPage: err } = r;
  if (pen) { pen.technique = String(pen.technique || '').replace(/\s+/g, ' ').slice(0, 140); pen.modeles = pen.modeles.length; }
  return { version, moment, population, bilans, interieur, echantillon, flux: flux.slice(-10).map((f) => ({ ...f, texte: String(f.texte).slice(0, 200) })), corps, argent, vivres, actions: act, attente, requetes, stats, penseur: pen, nature, journal: journal.slice(-5), erreursPage: err };
}

export function demarrerRapports(sim, penseur, intervalleMs = 120000) {
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message).slice(0, 200)));
  window.addEventListener('unhandledrejection', (e) => erreurs.push(String(e.reason?.message || e.reason).slice(0, 200)));
  let dernierTemps = -1;
  const envoyer = () => {
    if (document.visibilityState !== 'visible' || sim.temps === dernierTemps) return; // rien de neuf
    dernierTemps = sim.temps;
    let corps;
    try { corps = JSON.stringify(resumer(sim, penseur, erreurs)); } catch { return; }
    if (corps.length > 23000) corps = JSON.stringify({ ...JSON.parse(corps), flux: [], echantillon: [] });
    fetch('api/rapport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps, keepalive: true }).catch(() => {});
  };
  setTimeout(envoyer, 20000);
  setInterval(envoyer, intervalleMs);
}
