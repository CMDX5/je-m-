// Construit, en français, ce que perçoit un habitant au moment de décider :
// son corps, son foyer, son entourage, ce qui vient de se passer, ses propres souvenirs.
// Ce sont des FAITS du monde. Aucune émotion ni aucune opinion n'est suggérée.

import { libelleMetier, nomComplet } from './villager.js';
import { METIERS, LIEUX, NOMS_OBJETS } from './data.js';

const mot = (x, bas, hauts) => {
  for (const [seuil, texte] of hauts) if (x >= seuil) return texte;
  return bas;
};

function etatCorps(v) {
  const b = v.besoins;
  const e = v.genre === 'F' ? 'e' : ''; // accord : « tu es fatiguée »
  const faim = mot(b.faim, `tu es affamé${e}`, [[75, `tu es rassasié${e}`], [50, "tu n'as pas faim"], [30, 'tu as faim'], [15, 'tu as très faim']]);
  const soif = mot(b.soif, `tu es assoiffé${e}`, [[75, "tu n'as pas soif"], [50, 'tu as un peu soif'], [30, 'tu as soif'], [15, 'tu as très soif']]);
  const fatigue = mot(b.energie, "tu t'écroules de fatigue", [[75, 'tu es en forme'], [50, `tu es un peu fatigué${e}`], [30, `tu es fatigué${e}`], [15, `tu es épuisé${e}`]]);
  const sante = v.malade ? 'tu es malade' : mot(b.sante, `tu es très affaibli${e}`, [[75, 'tu es en bonne santé'], [50, 'tu te sens un peu faible'], [30, 'ta santé est fragile']]);
  const secu = mot(b.securite, 'tu as très peur', [[70, 'tu te sens en sécurité'], [45, (e ? 'tu te sens un peu inquiète' : 'tu te sens un peu inquiet')], [25, `tu te sens menacé${e}`]]);
  // des sensations, pas des chiffres : personne ne connaît sa soif « à 64 sur 100 »
  return `${faim}, ${soif}, ${fatigue}, ${sante}, ${secu}.`;
}

function periode(h) {
  if (h < 5.5) return 'nuit noire';
  if (h < 7) return 'aube';
  if (h < 12) return 'matin';
  if (h < 14) return 'midi';
  if (h < 18.5) return 'après-midi';
  if (h < 20.5) return 'crépuscule';
  return 'nuit';
}

function lieuActuel(sim, v) {
  if (v.interieur && v.batiment) {
    const b = sim.batiment(v.batiment);
    return v.batiment === v.foyer ? 'chez toi' : `à l'intérieur : ${b?.nom || v.batiment}`;
  }
  return v.activite?.nomLieu ? `à ${v.activite.nomLieu}` : 'dehors, dans le village';
}

function quiEstLa(sim, v) {
  const out = [];
  for (const o of sim.habitants) {
    if (o === v) continue;
    const proche = v.interieur ? (o.interieur && o.batiment === v.batiment) : (!o.interieur && Math.hypot(o.x - v.x, o.z - v.z) < 10);
    if (!proche) continue;
    let etat = o.conversation ? 'est en pleine conversation' : o.activite?.etat || 'est là';
    if (o.statut !== 'agit' && !o.conversation) etat = 'est là, sans rien faire de précis';
    out.push(`${nomComplet(o)} (${o.age} ans, ${libelleMetier(o).toLowerCase()}${o.malade ? ', a l\'air malade' : ''}) ${etat.toLowerCase()}`);
    if (out.length >= 7) break;
  }
  return out;
}

export function construirePrompt(sim, v, type = 'decision', { commun = true } = {}) {
  const h = sim.heure();
  const hh = Math.floor(h), mm = String(Math.floor((h - hh) * 60)).padStart(2, '0');
  const foyer = sim.foyers[v.foyer];
  const maison = sim.batiment(v.foyer);
  const occupants = sim.occupants(v.foyer);
  const couchages = sim.couchages(v.foyer);
  const famille = v.famille.map((id) => sim.habitant(id)).map((o) => `${o.prenom} (${o.age} ans)`).join(', ');
  const L = [];

  if (type === 'bilan') {
    L.push(`Tu es ${nomComplet(v)}, ${v.age} ans. Il est ${hh}h${mm}, tu vas dormir.`);
    if (v.identite) L.push(`Ce que tu écrivais de toi : ${v.identite}`);
    if (v.resume) L.push(`Ton dernier résumé : ${v.resume}`);
    if (v.lecons) L.push(`Ce que tu pensais avoir compris de la vie ici : ${v.lecons}`);
    L.push('Ce que tu as retenu récemment :');
    for (const s of v.souvenirs.slice(-14)) L.push(`- (${sim.horodatage(s.t)}) ${s.texte}`);
    const avis = Object.entries(v.avis).slice(-8).map(([id, a]) => `${sim.habitant(Number(id)).prenom} : ${a.texte}`);
    if (avis.length) L.push(`Tes avis sur les autres : ${avis.join(' ; ')}`);
    return L.join('\n');
  }

  // ----- décision -----
  L.push(`Jour ${sim.jour}, ${hh}h${mm} (${periode(h)}). ${sim.meteoTexte()}`);
  L.push(`Tu es ${nomComplet(v)}, ${v.age} ans, ${v.genre === 'F' ? 'une femme' : 'un homme'}. ${METIERS[v.metier]?.lieu ? `Ton métier : ${libelleMetier(v).toLowerCase()} (lieu de travail habituel : ${LIEUX[METIERS[v.metier].lieu].nom}).` : `Ta situation : ${libelleMetier(v).toLowerCase()}, sans métier confié.`}`);
  if (v.identite) L.push(`Ce que tu écris de toi : ${v.identite}`);
  L.push(`Ton foyer : ${maison?.nom || 'ta maison'}, ${occupants} personne(s) pour ${couchages} couchage(s)${famille ? `. Ta famille : ${famille}` : '. Tu vis seul'}.`);
  L.push('');
  L.push(`Ce que tu ressens : ${etatCorps(v)}`);
  const p = v.poche;
  const porte = [p.nourriture >= 0.5 && `${Math.round(p.nourriture * 10) / 10} ration(s)`, p.eau >= 0.5 && `${Math.round(p.eau)} dose(s) d'eau`, p.huile >= 0.5 && `${Math.round(p.huile)} jarre(s) d'huile`, p.remedes >= 0.5 && `${Math.round(p.remedes)} remède(s)`].filter(Boolean).join(', ');
  L.push(`Tu as ${Math.round(p.pieces)} pièce(s) sur toi${porte ? ` et tu portes : ${porte}` : ''}. Chez toi : ${Math.round(foyer?.nourriture ?? 0)} ration(s), ${Math.round(foyer?.eau ?? 0)} dose(s) d'eau.`);
  const dettes = sim.dettes.filter((d) => d.de === v.id || d.a === v.id).map((d) => (d.de === v.id ? `tu dois ${Math.round(d.montant)} pièce(s) à ${sim.habitant(d.a).prenom}` : `${sim.habitant(d.de).prenom} te doit ${Math.round(d.montant)} pièce(s)`));
  if (dettes.length) L.push(`Dettes : ${dettes.join(' ; ')}.`);
  if (v.impaye > 0) L.push(`Le conseil n'a pas pu te payer ${Math.round(v.impaye)} pièce(s) de salaire.`);
  L.push('');
  L.push(`Où tu es : ${lieuActuel(sim, v)}.`);
  const la = quiEstLa(sim, v);
  L.push(la.length ? `Autour de toi : ${la.join(' ; ')}.` : 'Il n\'y a personne autour de toi.');
  if (v.urgence) L.push(`Ton corps : ${v.urgence}.`);

  const ev = v.evenements.slice(-10);
  if (ev.length) {
    L.push('');
    L.push('Ce qui vient de se passer :');
    for (const e of ev) L.push(`- ${e.texte}`);
  }

  const souv = v.souvenirs.slice(-12);
  if (v.resume || v.lecons || souv.length) {
    L.push('');
    if (v.resume) L.push(`Ce que tu retiens de ta vie : ${v.resume}`);
    if (v.lecons) L.push(`Ce que tu as compris de la vie ici : ${v.lecons}`);
    if (souv.length) {
      L.push('Tes souvenirs récents :');
      for (const s of souv) L.push(`- (${sim.horodatage(s.t)}) ${s.texte}`);
    }
  }
  const recents = Object.entries(v.avis).sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0)).slice(0, 4).map(([id]) => Number(id));
  const concernes = new Set([...v.famille, ...recents, ...sim.habitants.filter((o) => o !== v && (o.interieur ? o.batiment === v.batiment && v.interieur : !v.interieur && Math.hypot(o.x - v.x, o.z - v.z) < 10)).map((o) => o.id)]);
  const avis = [...concernes].filter((id) => v.avis[id]).map((id) => `${sim.habitant(id).prenom} : ${v.avis[id].texte}`);
  if (avis.length) L.push(`Ce que tu penses de tes proches et des gens autour de toi : ${avis.join(' ; ')}.`);

  if (!commun) return L.join('\n');
  L.push('');
  L.push(infosVillage(sim));
  L.push('');
  L.push('Réponds par le JSON.');
  return L.join('\n');
}

// Informations publiques du village (les mêmes pour tous).
export function infosVillage(sim) {
  const L = [];
  L.push('Le village :');
  L.push(`- Marché : ${Math.round(sim.res.nourriture)} ration(s) à vendre, ${sim.prix} pièce(s) la ration ; remède : ${sim.prixRemede} pièces. Eau gratuite à la source.`);
  L.push(`- Le conseil paie ${sim.salaire} pièce(s) par heure travaillée.${sim.projet && !sim.projet.enAttente ? ` Un chantier est ouvert : ${sim.projet.nom}.` : ''}${sim.navire ? ' Un navire marchand est au port.' : ''}`);
  const libres = sim.maisonsLibres();
  if (libres.length) L.push(`- Maison(s) libre(s) : ${libres.map((b) => `${b.id} (${b.nom})`).join(', ')}.`);
  L.push(`- Les habitants : ${sim.roster()}`);
  return L.join('\n');
}
