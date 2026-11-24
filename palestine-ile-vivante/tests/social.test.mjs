// Gestes sociaux choisis par les habitants : demander quelque chose à quelqu'un, déclarer une dispute.
// Le jeu porte la demande et constate la dispute ; la réponse, les mots et le ton viennent des habitants.
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/simulation.js';

const nouveau = () => { const s = new Simulation({ seed: 3 }).init(); s.rng.chance = () => false; return s; };
const dehors = (v, x = 0, z = 10) => { v.interieur = false; v.batiment = null; v.statut = 'attend'; v.path = null; v.x = x; v.z = z; v.conversation = null; };

// ---- demander ----
{
  const sim = nouveau();
  const [a, b] = sim.habitants.filter((v) => v.age >= 17);
  dehors(a); dehors(b, 1, 10);
  b.statut = 'agit'; b.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} };
  sim.marquerEnvoye(a.id);
  sim.appliquer(a.id, { pensee: 'Nous manquons de pain.', humeur: 40, action: 'demander', personne: b.prenom, objet: 'du pain', quantite: 3, parole: 'Peux-tu nous dépanner ?' });
  sim.update(20);
  assert.equal(sim.stats.demandes, 1, 'la demande est portée à la personne');
  assert.ok(a.evenements.some((e) => /Tu as demandé 3 ration\(s\) à/.test(e.texte)), 'il sait qu\'il a demandé');
  assert.ok(b.evenements.some((e) => new RegExp(`${a.prenom} te demande 3 ration`).test(e.texte)), 'l\'autre l\'apprend comme un fait');
  assert.ok(b.evenements.some((e) => /Peux-tu nous dépanner/.test(e.texte)), 'avec les mots de celui qui demande');
  assert.equal(b.statut, 'attend', 'et décide en priorité de ce qu\'il en fait');
  assert.ok(sim.interieur.some((e) => e.type === 'demande' && e.id === a.id), 'la demande est dans la vie intérieure');
  assert.equal(b.poche.nourriture, 0, 'le jeu ne donne rien à sa place : c\'est lui qui décide');
  // sans paroles : la demande est portée quand même
  const [c, d] = sim.habitants.filter((v) => v.age >= 17 && v !== a && v !== b);
  dehors(c, 30, 10); dehors(d, 31, 10); d.statut = 'agit'; d.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} };
  sim.marquerEnvoye(c.id);
  sim.appliquer(c.id, { pensee: '…', humeur: 50, action: 'demander', personne: d.prenom, objet: 'pieces', quantite: 5, parole: '' });
  sim.update(20);
  assert.ok(d.evenements.some((e) => /te demande 5 pièce/.test(e.texte)) && d.statut === 'attend');
  // ce qui ne se demande pas
  const e1 = sim.habitants.find((v) => v.statut === 'attend' && v.age >= 17 && v !== b && v !== d);
  sim.marquerEnvoye(e1.id); sim.appliquer(e1.id, { pensee: '…', humeur: 50, action: 'demander', personne: b.prenom, objet: 'huile', quantite: 1, parole: '' });
  assert.ok(e1.evenements.some((e) => /pas possible : précise ce que tu demandes/.test(e.texte)), 'objet impossible : refusé avec la raison');
  const e2 = sim.habitants.find((v) => v.statut === 'attend' && v.age >= 17 && v !== e1);
  if (e2) { sim.marquerEnvoye(e2.id); sim.appliquer(e2.id, { pensee: '…', humeur: 50, action: 'demander', personne: 'Personne', objet: 'eau', quantite: 1, parole: '' }); assert.ok(e2.evenements.some((e) => /personne de ce nom/.test(e.texte))); }
}

// ---- les mots de l'habitant pour un objet : articles et quantités comprises ----
{
  for (const [mot, attendu] of [['du pain', 'ration'], ['des rations', 'ration'], ['une ration', 'ration'], ["de l'eau", "dose(s) d’eau"], ['une cruche d\'eau', "dose(s) d’eau"], ['des remèdes', 'remède'], ['5 pièces', 'pièce'], ['de l\'argent', 'pièce']]) {
    const sim = nouveau();
    const [a, b] = sim.habitants.filter((v) => v.age >= 17);
    dehors(a); dehors(b, 1, 10); b.statut = 'agit'; b.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} };
    sim.marquerEnvoye(a.id);
    sim.appliquer(a.id, { pensee: '…', humeur: 50, action: 'demander', personne: b.prenom, objet: mot, quantite: 2, parole: '' });
    sim.update(20);
    assert.ok(b.evenements.some((e) => e.texte.includes(attendu)), `« ${mot} » est compris (${attendu})`);
  }
}

// ---- la dispute : déclarée par l'habitant, ou reconnue à un ton de colère qu'il a choisi ----
{
  const essai = (ton, dispute) => {
    const sim = nouveau();
    const [a, b] = sim.habitants.filter((v) => v.age >= 17);
    dehors(a); dehors(b, 1, 10);
    sim.parler(a, b, 'Tu es toujours en retard.', ton, dispute);
    return { sim, c: a.conversation };
  };
  assert.equal(essai('calme', true).c.dispute, true, 'il déclare lui-même que c\'est une dispute, même d\'un ton calme');
  assert.equal(essai('calme', true).sim.stats.disputes, 1, 'la dispute est comptée et consignée');
  assert.ok(essai('calme', true).sim.journal.some((e) => /se disputent/.test(e.texte)));
  for (const ton of ['colère', 'furieux', 'énervé', 'agacée', 'fâché', 'hostile', 'agressif']) assert.equal(essai(ton, false).c.dispute, true, `le ton « ${ton} » est reconnu`);
  for (const ton of ['calme', 'chaleureux', 'joyeux', 'triste', 'amusé']) assert.equal(essai(ton, false).c.dispute, false, `le ton « ${ton} » n'est pas une dispute`);
  assert.equal(essai('calme', false).sim.stats.disputes, 0);

  // le choix traverse tout le parcours : décision → déplacement → paroles
  const sim = nouveau();
  const [a, b] = sim.habitants.filter((v) => v.age >= 17);
  dehors(a); dehors(b, 1, 10);
  b.statut = 'agit'; b.activite = { type: 'rester', action: 'rien', fin: 1e12, duree: 1e6, bilan: {} };
  sim.marquerEnvoye(a.id);
  sim.appliquer(a.id, { pensee: 'Assez.', humeur: 20, action: 'parler', personne: b.prenom, parole: 'Je ne veux plus te voir ici.', ton: 'froid', dispute: true });
  sim.update(15);
  assert.equal(sim.stats.disputes, 1, 'la dispute déclarée par l\'habitant est bien prise en compte');
}

console.log('Gestes sociaux : demander (porté, jamais exaucé à sa place), dispute déclarée ou reconnue. OK');
