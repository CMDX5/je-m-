// Génère PRINCIPES.md à partir du code réel (les textes envoyés aux habitants ne peuvent donc pas dériver).
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/simulation.js';
import { SYSTEME, SYSTEME_BILAN } from '../src/sim/prompts.js';
import { promptLot, promptLotBilan } from '../src/sim/penseur-claude.js';

const sim = new Simulation({ seed: 7 }).init();
const v = sim.habitants[3];
sim.appliquerBilan(v.id, { resume: '(exemple) Résumé écrit par l’habitant.', identite: '(exemple) Description écrite par l’habitant.', lecons: '(exemple) Leçons écrites par l’habitant.', questions: '' });
const decision = promptLot(sim, [v.id]);
const bilan = promptLotBilan(sim, [v.id]);

writeFileSync(new URL('../PRINCIPES.md', import.meta.url), `# Principes : ce qui est programmé, ce qui vient des habitants

Ce document est généré par \`node tools/doc-principes.mjs\` à partir du code. Il sert à vérifier une promesse :
**le jeu programme le monde, jamais la pensée des habitants.**

## 1. Ce qui est programmé (les lois du monde)

Code : \`src/sim/simulation.js\`, \`monde.js\`, \`data.js\`, \`navigation.js\`.

- **Le corps** : faim, soif, énergie, santé et sécurité baissent ou remontent selon le temps et les actes (manger, boire, dormir, travailler, météo, maladie).
- **L'économie** : salaires versés par le conseil, prix du marché, stocks, dettes, vol avec témoins, production des lieux de travail.
- **L'espace** : cartes, bâtiments, trajets, temps de marche.
- **Les actions possibles** : dormir, manger, boire, travailler, aller, parler, donner, prendre, acheter, se soigner, prier, se reposer, flâner, étudier, jouer, puiser de l'eau, emménager, rien. Chaque action a des effets physiques. **Aucune n'est déclenchée par le jeu à la place de l'habitant.**
- **Le conseil** (le joueur) : annonces, réponses aux demandes, prix, salaires, dons, amendes, métiers confiés, chantiers.

## 2. Ce qui vient des habitants (un modèle de langage, à chaque décision)

Pensée, parole, ton de la voix, humeur, action choisie, souvenirs retenus, avis sur les autres, description de soi, demandes au conseil,
et chaque soir : résumé de leur vie, **ce qu'ils ont compris de la vie sur l'île**, **ce qu'ils se demandent** (case libre, souvent vide).
Ces textes ne sont ni écrits, ni corrigés, ni trouvés par le jeu : il les garde, les affiche et les relit à l'habitant.

## 3. Ce que le jeu envoie à l'habitant

Il ne reçoit que des faits : son corps en sensations (pas de jauges chiffrées), sa poche, sa maison, qui est autour de lui, ce qui vient
de se passer, ses propres souvenirs, avis, leçons et questions, et les informations publiques du village.
Aucune personnalité, aucun trait de caractère, aucun but, aucun exemple de pensée.

### Texte envoyé pour une décision (exemple réel pour un habitant)

\`\`\`
${decision}
\`\`\`

### Texte envoyé pour le bilan du soir

\`\`\`
${bilan}
\`\`\`

## 4. Limites et choix à connaître

- **Le modèle a appris le français dans des textes humains.** Il « sait » déjà qu'on boit quand on a soif : on ne peut pas séparer cela de la langue.
- **Plusieurs habitants sont pensés dans un même appel** (8 par appel, pour respecter les quotas gratuits). Il est demandé de ne pas les mélanger.
- **Le journal « vie intérieure »** trie l'affichage avec des mots-clés (\`penseePersonnelle\` dans \`simulation.js\`) : ce tri ne change rien à ce que vit l'habitant, seulement à ce qui est montré.
- **Priorité de parole** : quand le conseil parle à un habitant ou qu'on lui parle, il repasse en tête de file pour répondre.
- **Quand un modèle est indisponible**, l'habitant garde son tour et attend ; il n'est pas réduit à « ne rien faire ».
- **Les sensations** sont des phrases du jeu (« tu as soif », « tu es fatigué ») choisies selon des seuils : c'est la perception du corps, pas une consigne.
- **Aucune conscience réelle** : ce sont des textes produits par un modèle de langage. L'écran d'accueil le dit.

## 5. Comment vérifier

- \`npm test\` : lois du monde, absence de consignes de comportement dans les textes envoyés, bilan du soir, relais entre modèles.
- Onglet **Paroles** du jeu : ce que disent, pensent, retiennent et se demandent les habitants, avec « avant / après » pour leur description et leurs leçons.
`);
console.log('PRINCIPES.md écrit');
