// Génère PRINCIPES.md à partir du code réel (les textes envoyés aux habitants ne peuvent donc pas dériver).
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/simulation.js';
import { SYSTEME, SYSTEME_BILAN } from '../src/sim/prompts.js';
import { promptLot, promptLotBilan } from '../src/sim/penseur-claude.js';

const sim = new Simulation({ seed: 7 }).init();
const v = sim.habitant(3);
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
- **Les saisons** (\`src/sim/saison.js\`) : une seule pluie par an (4 h de jeu = 4 minutes à ×1), qui commence à 8 h du premier jour de chaque année ; puis le beau temps (3 mois), la chaleur (4 mois) et la saison sèche (4 mois), jusqu'à la pluie suivante. Effets physiques : la pluie remplit les jarres des maisons et redonne de la fertilité à la terre, mais on y attrape plus facilement froid et on travaille moins bien ; la terre rend le plus après la pluie et le moins à la fin de la saison sèche ; la chaleur donne soif plus vite (dehors, en plein jour), fatigue davantage au travail en plein soleil et pèse sur la santé. **Les habitants perçoivent seulement des faits** (« Il pleut. », « Il fait très chaud… », « La pluie est tombée pour la dernière fois il y a 6 mois », « la pluie revient dans 4 mois ») : ce qu'ils en font (réserves d'eau, entraide, plaintes, prière) vient d'eux.
- **Les denrées** : les rations du marché se gâtent lentement (plus vite par forte chaleur) et l'entrepôt ne garde que 600 rations (le surplus se perd vite), pour que le stock ne gonfle pas sans fin. La caisse du conseil est affichée en **jours de salaires** et la chronique prévient quand elle ne couvre plus une journée.
- **Le puits communal** (un chantier que le conseil peut ouvrir) : il remplit peu à peu les jarres d'eau des maisons, en toute saison, et réduit les maladies. C'est le seul moyen, pour le conseil, d'agir sur l'eau des maisons ; la source, elle, reste gratuite mais il faut s'y rendre.
- **Le conseil** (le joueur) : annonces, réponses aux demandes, prix, salaires, dons, amendes, métiers confiés, chantiers.
- **Le calendrier et le cycle de vie** (\`src/sim/vie.js\`) : une année du village dure 2 jours (un mois : 4 h, une semaine : environ 55 min). Les corps vieillissent en continu.
  - **Mort** : un corps sans santé pendant 2 heures s'éteint ; sinon risque horaire selon l'âge (loi de Gompertz : 0,07 %/an à 20 ans, environ 3 %/an à 70 ans, 15 %/an à 90 ans), la maladie et la faiblesse. Une maladie guérit en général seule (4 %/heure). À la mort, le jeu ne fait que constater : l'argent passe à un proche, les provisions restent à la maison, les dettes s'éteignent, tout le village l'apprend comme un fait. **Le deuil, la prière, les souvenirs, ce qu'on en dit viennent des habitants.**
  - **Enfant** : action \`avoir_un_enfant\` (aller vers une personne pour lui dire qu'on voudrait un enfant avec elle). La loi : deux adultes de 17 ans ou plus, un homme et une femme (45 ans au plus), qui ne sont pas de la même famille, la femme n'attendant pas déjà un enfant. **Il faut que les deux le décident, chacun de son côté** ; sinon rien. Grossesse de 9 mois (36 h de jeu). **Le prénom est donné par les parents** (champ \`prenom_enfant\`).
  - **Nourrissons** (moins de 2 ans) : ils ne décident pas encore ; la maison les nourrit (loi du monde) et s'il n'y a plus de provisions leur corps faiblit. À 2 ans, ils commencent à décider, avec une mémoire vide.

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
- **Plusieurs habitants sont pensés dans un même appel** (8 par appel au plus, réduit à 4 quand les limites gratuites se resserrent, pour respecter les quotas gratuits). Il est demandé de ne pas les mélanger.
- **Le journal « vie intérieure »** trie l'affichage avec des mots-clés (\`penseePersonnelle\` dans \`simulation.js\`) : ce tri ne change rien à ce que vit l'habitant, seulement à ce qui est montré.
- **Bilan du soir** : au moins un appel sur quatre lui est réservé quand des habitants ont à le faire, pour que leurs souvenirs, leurs leçons et leurs questions se forment même si la file de décisions est longue.
- **Priorité de parole** : quand le conseil parle à un habitant ou qu'on lui parle, il repasse en tête de file pour répondre.
- **Quand un modèle est indisponible**, l'habitant garde son tour et attend ; il n'est pas réduit à « ne rien faire ».
- **Les sensations** sont des phrases du jeu (« tu as soif », « tu es fatigué ») choisies selon des seuils : c'est la perception du corps, pas une consigne.
- **Exceptions à « tout vient des habitants »** : le village donne un prénom à un nouveau-né si ses parents n'en choisissent pas en 12 h de jeu ; les nourrissons ne décident pas ; les liens de parenté de départ (couples, enfants) et les âges initiaux (3 à 82 ans) sont posés par le jeu ; un habitant qui devient adulte ou entre à l'école change de statut automatiquement (6 ans, 17 ans).
- **Aucune conscience réelle** : ce sont des textes produits par un modèle de langage. L'écran d'accueil le dit.

## 5. Comment vérifier

- \`npm test\` : lois du monde (dont le cycle de vie : \`tests/vie.test.mjs\`), absence de consignes de comportement dans les textes envoyés, bilan du soir, relais entre modèles.
- Onglet **Paroles** du jeu : ce que disent, pensent, retiennent et se demandent les habitants, avec « avant / après » pour leur description et leurs leçons.
`);
console.log('PRINCIPES.md écrit');
