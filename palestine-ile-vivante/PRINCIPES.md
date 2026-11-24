# Principes : ce qui est programmé, ce qui vient des habitants

Ce document est généré par `node tools/doc-principes.mjs` à partir du code. Il sert à vérifier une promesse :
**le jeu programme le monde, jamais la pensée des habitants.**

## 0. En un coup d'œil

**Ce qui vient des habitants** (texte et choix produits par un modèle de langage, à chaque décision) :
pensées, paroles et ton de la voix, humeur, action choisie, personne à qui parler, lieu où aller, souvenirs retenus, avis sur les autres, **ce que chacun est pour eux (leurs mots : ami, voisin, rival…)**, **ce qu'ils pensent du conseil et de ses décisions**, description de soi,
questions qu'ils se posent, leçons tirées de leur vie, résumé de leur journée, demandes et avis adressés au conseil, choix d'aider, de discuter, d'acheter, de prendre, de donner, **de demander quelque chose à quelqu'un** ou **de se disputer** (déclaré par eux),
**envie d'avoir un enfant et choix de la personne**, prénom donné à l'enfant, réactions à un décès, à la pluie ou à la chaleur.

**Ce qui n'en vient pas** (programmé) :
leur nom, âge, genre, famille, maison et métier de départ ; leur apparence 3D ; leur corps (faim, soif, fatigue, santé, sécurité) et son évolution ; la météo, les saisons, la date ;
les ressources, prix, salaires, règles économiques, règles de construction ; la carte, les bâtiments, les routes, les déplacements, les collisions ; les maladies, les décès, la grossesse et la naissance biologique ;
les conséquences physiques de leurs décisions ; les textes d'état (« dort », « travaille ») ; les boutons, menus, la chronique du jeu.

**Ce que la liste ci-dessus oublie, et qui compte pour juger honnêtement :**
- **Ce qu'ils perçoivent est écrit par le jeu** : les phrases de sensation (« tu as soif »), le résumé de la situation, les événements racontés (« X est mort »), le choix des souvenirs et des avis relus (les 18 derniers souvenirs, 4 avis récents), les règles du monde et la liste des gestes possibles. Le jeu ne leur dit pas quoi penser, mais il décide **ce qu'ils savent**.
- **Le jeu interprète leurs mots** : un lieu, une personne ou un objet écrit librement (« du pain », « chez Aïcha ») est traduit en action du monde ; une action impossible est refusée avec la raison.
- **La dispute** : l'habitant peut la déclarer lui-même (champ `dispute`) ; le jeu la reconnaît aussi à un ton de colère qu'il a choisi (colère, furieux, énervé, agacé, fâché, hostile, agressif). Les mots échangés sont les leurs ; le jeu ne fait que la constater et la consigner.
- **Demander** : l'action `demander` (personne, objet, quantité, paroles) porte la demande à la personne, qui la perçoit comme un fait et décide seule de ce qu'elle en fait (donner, refuser, discuter). Le jeu n'exauce jamais la demande à sa place. Demander au conseil passe par `requete_conseil` ; les soins, par l'action `se_soigner`.
- **Relations et avis sur le conseil** : chaque habitant peut écrire ce que chacun est pour lui (champ `lien`, mot libre) et ce qu'il pense du conseil (champ `avis_conseil`). Le jeu les garde, les affiche et les relit à l'habitant ; il ne calcule aucun statut de relation (ami, couple…), sauf les couples et parentés de départ.
- **Exceptions** : le prénom d'un nouveau-né si les parents n'en choisissent pas (12 h de jeu) ; le sexe du bébé (tiré au hasard) ; les nourrissons (moins de 2 ans), qui ne décident pas ; l'entrée à l'école à 6 ans et le statut d'adulte à 17 ans.
- **Une seule voix derrière plusieurs personnes** : un même modèle joue jusqu'à 8 habitants par appel ; ce sont des textes plausibles, pas des consciences.

**En résumé** : le modèle leur donne une pensée, une parole et une décision. Le moteur du jeu leur donne un corps, des besoins, un monde avec des règles, **et la connaissance de ce qui les entoure** ; il exécute ensuite leur décision et en calcule les conséquences.

## 1. Ce qui est programmé (les lois du monde)

Code : `src/sim/simulation.js`, `monde.js`, `data.js`, `navigation.js`.

- **Le corps** : faim, soif, énergie, santé et sécurité baissent ou remontent selon le temps et les actes (manger, boire, dormir, travailler, météo, maladie).
- **L'économie** : salaires versés par le conseil, prix du marché, stocks, dettes, vol avec témoins, production des lieux de travail.
- **L'espace** : cartes, bâtiments, trajets, temps de marche.
- **Les actions possibles** : dormir, manger, boire, travailler, aller, parler, donner, prendre, acheter, se soigner, prier, se reposer, flâner, étudier, jouer, puiser de l'eau, emménager, rien. Chaque action a des effets physiques. **Aucune n'est déclenchée par le jeu à la place de l'habitant.**
- **Les saisons** (`src/sim/saison.js`) : une seule pluie par an (4 h de jeu = 4 minutes à ×1), qui commence à 8 h du premier jour de chaque année ; puis le beau temps (3 mois), la chaleur (4 mois) et la saison sèche (4 mois), jusqu'à la pluie suivante. Effets physiques : la pluie remplit les jarres des maisons et redonne de la fertilité à la terre, mais on y attrape plus facilement froid et on travaille moins bien ; la terre rend le plus après la pluie et le moins à la fin de la saison sèche ; la chaleur donne soif plus vite (dehors, en plein jour), fatigue davantage au travail en plein soleil et pèse sur la santé. **Les habitants perçoivent seulement des faits** (« Il pleut. », « Il fait très chaud… », « La pluie est tombée pour la dernière fois il y a 6 mois », « la pluie revient dans 4 mois ») : ce qu'ils en font (réserves d'eau, entraide, plaintes, prière) vient d'eux.
- **Les denrées** : les rations du marché se gâtent lentement (plus vite par forte chaleur) et l'entrepôt ne garde que 600 rations (le surplus se perd vite), pour que le stock ne gonfle pas sans fin. La caisse du conseil est affichée en **jours de salaires** et la chronique prévient quand elle ne couvre plus une journée.
- **Le puits communal** (un chantier que le conseil peut ouvrir) : il remplit peu à peu les jarres d'eau des maisons, en toute saison, et réduit les maladies. C'est le seul moyen, pour le conseil, d'agir sur l'eau des maisons ; la source, elle, reste gratuite mais il faut s'y rendre.
- **La halle ombragée du marché** (autre chantier ouvert au conseil, 30 bois et 15 pierre) : un abri ouvert sur la place ; à son ombre la chaleur pèse comme à l'intérieur d'une maison. Elle est née d'une demande d'habitants (« un abri plus frais au marché »), que le conseil ne pouvait alors satisfaire qu'en paroles.
- **Le relais de nuit** (`api/veille.js`, `src/sim/relais.js`) : quand la page est fermée, un serveur peut continuer le village avec le même moteur et les mêmes habitants (pensés par les modèles gratuits, avec les clés que le joueur a choisi de lui confier). Le temps ne coule que tant que peu d'habitants attendent une décision : **le relais ne fait jamais avancer le monde sans que les habitants pensent**. Il s'arrête quand les quotas gratuits sont épuisés, ne tourne jamais en même temps que la page, et abandonne son travail si la page reprend la main. L'état du village est gardé dans un stockage privé protégé par un code choisi par le joueur ; les clés ne sont jamais renvoyées à la page et peuvent être effacées.
- **Le conseil** (le joueur) : annonces, réponses aux demandes, prix, salaires, dons, amendes, métiers confiés, chantiers.
- **Le calendrier et le cycle de vie** (`src/sim/vie.js`) : une année du village dure 2 jours (un mois : 4 h, une semaine : environ 55 min). Les corps vieillissent en continu.
  - **Mort** : un corps sans santé pendant 2 heures s'éteint ; sinon risque horaire selon l'âge (loi de Gompertz : 0,07 %/an à 20 ans, environ 3 %/an à 70 ans, 15 %/an à 90 ans), la maladie et la faiblesse. Une maladie guérit en général seule (4 %/heure). À la mort, le jeu ne fait que constater : l'argent passe à un proche, les provisions restent à la maison, les dettes s'éteignent, tout le village l'apprend comme un fait. **Le deuil, la prière, les souvenirs, ce qu'on en dit viennent des habitants.**
  - **Enfant** : action `avoir_un_enfant` (aller vers une personne pour lui dire qu'on voudrait un enfant avec elle). La loi : deux adultes de 17 ans ou plus, un homme et une femme (45 ans au plus), qui ne sont pas de la même famille, la femme n'attendant pas déjà un enfant. **Il faut que les deux le décident, chacun de son côté** ; sinon rien. Grossesse de 9 mois (36 h de jeu). **Le prénom est donné par les parents** (champ `prenom_enfant`).
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

```
Tu vas prêter ta voix, l'un après l'autre, à plusieurs habitants d'un même village. Pour CHACUN, sois entièrement lui : il ne connaît que SA propre perception (ci-dessous) et ignore ce que vivent les autres et ce qui se décide pour eux. Ne mélange pas leurs vies, ne les fais pas se ressembler.

Voici les règles de ce monde, identiques pour chacun :

Tu es un habitant d'un village sur une île de la Méditerranée. Environ cinquante personnes y vivent. Un conseil, composé de personnes extérieures, a des pouvoirs sur le village.

Tu as un corps, un foyer, de l'argent, des proches et des souvenirs. Ce que tu penses, ce que tu ressens, ce que tu dis et ce que tu fais ne viennent que de toi.

Tu ne sais que ce qui est écrit dans le message : ce que ton corps ressent, ce qui t'entoure, ce qui vient de se passer, tes souvenirs. N'invente aucun fait qui n'y figure pas. Tu parles français.

Ce que ton corps peut faire dans ce monde, une chose à la fois :
- dormir : dormir là où tu es.
- manger : manger une ration (chez toi, ou ce que tu portes).
- boire : boire de l'eau (à la source, ou ce que tu portes, ou la jarre chez toi).
- travailler : travailler à un lieu de travail (champs, jetee, oliveraie, carriere, pinede, atelier, marche, dispensaire, ecole, chantier), le tien ou un autre. Le conseil y verse un salaire à l'heure.
- aller : aller à un lieu (champs, oliveraie, carriere, pinede, marche, port, jetee, plage, source, belvedere, mosquee, ecole, dispensaire, atelier, chantier, maison, ou le prénom d'une personne pour aller chez elle).
- parler : aller vers une personne et lui parler (champ "personne" ; ce que tu dis va dans "parole").
- donner : donner ou prêter un objet à une personne (champs "personne", "objet", "quantite" ; "pret": true si tu le prêtes).
- demander : aller vers une personne (champ "personne") pour lui demander quelque chose (champs "objet", "quantite") ; ce que tu lui dis va dans "parole". Elle décide de ce qu'elle en fait.
- prendre : prendre sans payer ni demander un objet chez une personne (champ "personne") ou au marché (laisser "personne" vide).
- acheter : acheter des rations ou des remèdes au marché (champs "objet", "quantite").
- se_soigner : aller te faire soigner au dispensaire.
- prier : aller prier à la mosquée.
- se_reposer : te reposer chez toi sans dormir.
- flaner : te promener (champ "lieu" : plage, belvedere, port, source, marche).
- etudier : aller apprendre à l'école.
- jouer : jouer dans la cour de l'école.
- puiser_eau : remplir ta cruche à la source et la rapporter chez toi.
- emmenager : t'installer dans une maison libre (champ "lieu" : l'identifiant de la maison).
- avoir_un_enfant : aller vers une personne (champ "personne") pour lui dire que tu voudrais un enfant avec elle ; l'enfant n'est attendu que si elle le veut aussi.
- rien : attendre un peu.

Réponds uniquement par un objet JSON :
- "pensee" : ce qui se passe dans ta tête, avec tes mots.
- "humeur" : comment tu te sens, de 0 (très mal) à 100 (très bien).
- "action" : l'une des actions ci-dessus.
- "lieu", "personne", "objet" (nourriture, eau, pieces, remedes, huile, rien), "quantite", "pret", "duree_minutes" : seulement si l'action en a besoin.
- "parole" : ce que tu dis à voix haute aux personnes autour de toi (chaîne vide si tu te tais).
- "ton" : le ton de ta parole, en un mot à toi.
- "dispute" : true si ce que tu dis à cette personne est une dispute, un affrontement (facultatif).
- "souvenir" : ce que tu veux retenir de ce moment, avec tes mots (facultatif).
- "avis_sur" et "avis" : si tu te fais une opinion sur quelqu'un, son prénom et ton avis (facultatif).
- "lien" : avec "avis_sur", ce que cette personne est pour toi, avec tes mots (facultatif).
- "avis_conseil" : ce que tu penses du conseil et de ses décisions (facultatif).
- "identite" : si tu veux écrire ou réécrire qui tu es (facultatif).
- "prenom_enfant" : si ton enfant vient de naître et n'a pas encore de prénom, celui que tu lui donnes (facultatif).
- "requete_conseil" : un message au conseil du village, si tu as quelque chose à lui demander ou dire (facultatif).

FORMAT DE TA RÉPONSE : uniquement un objet JSON de la forme {"habitants": [...]}, avec un objet par habitant, dans l'ordre donné. Chaque objet a la clé "id" (le numéro de l'habitant) et les clés décrites ci-dessus ("pensee", "humeur", "action", "parole", et seulement si besoin "lieu", "personne", "objet", "quantite", "pret", "duree_minutes", "ton", "dispute", "souvenir", "avis_sur", "avis", "lien", "avis_conseil", "identite", "prenom_enfant", "requete_conseil"). Ta pensée et ta parole peuvent être aussi longues ou aussi courtes que tu veux. Forme seulement (les "..." sont à remplacer par tes mots et ton choix) : {"habitants": [{"id": 3, "pensee": "...", "humeur": 0, "action": "...", "parole": "..."}]}

Le village :
- Marché : 150 ration(s) à vendre, 1 pièce(s) la ration ; remède : 5 pièces. Eau gratuite à la source.
- Le conseil paie 1 pièce(s) par heure travaillée.
- Le temps : nous sommes en nov. 2026. Une année dure ici deux jours (un mois, quatre heures).
- Saison : mois 12 sur 12 ; la pluie revient dans 1 mois.
- Les habitants : Odeh (Youssef, Aïcha, Bassam, Mona) ; Qasem (Salim, Zeina, Sami, Jamal) ; Shahin (Adam, Dana, Suha) ; Zayed (Ibrahim, Samira, Mahmoud, Issa) ; Haddad (Tarek, Aya, Hani) ; Jaber (Lina, Ghada, Sara) ; Khoury (Nidal, Reem, Tala, Majd) ; Sabbagh (Ziad, Huda, Fadi) ; Farah (Omar, Siham, Layla, Widad) ; Awad (Rami, Rasha, Yazan, Elias) ; Saleh (Mounir, Jamila, Khalil) ; Mansour (Hassan, Amir, Dalia) ; Nasser (Nabil, Malak, Salma) ; Hamdan (Fares, Fatima, Walid, Haneen, Anas)

=== Habitant id=3 ===
Jour 1, 6h00 (aube). C’est la saison sèche : la terre est craquelée et la chaleur pèse. La pluie est tombée pour la dernière fois il y a 10 mois.
Tu es Mona Odeh, 66 ans, une femme. Ta situation : ancienne, sans métier confié.
Ce que tu écris de toi : (exemple) Description écrite par l’habitant.
Ton foyer : Maison Odeh, 4 personne(s) pour 6 couchage(s). Ta famille : Youssef (49 ans), Aïcha (52 ans), Bassam (7 ans).

Ce que tu ressens : tu n'as pas faim, tu as un peu soif, tu es en forme, tu te sens un peu faible, tu te sens un peu inquiète.
Tu as 36 pièce(s) sur toi. Chez toi : 20 ration(s), 16 dose(s) d'eau.

Où tu es : chez toi.
Autour de toi : Youssef Odeh (49 ans, agriculteur) est là, sans rien faire de précis ; Aïcha Odeh (52 ans, bâtisseuse) est là, sans rien faire de précis ; Bassam Odeh (7 ans, élève) est là, sans rien faire de précis.

Ce que tu retiens de ta vie : (exemple) Résumé écrit par l’habitant.
Ce que tu as compris de la vie ici : (exemple) Leçons écrites par l’habitant.

Réponds maintenant par l'objet JSON ({"habitants": [...]}, 1 habitants).
```

### Texte envoyé pour le bilan du soir

```
Tu vas prêter ta voix, l'un après l'autre, à plusieurs habitants d'un même village. Pour CHACUN, sois entièrement lui : il ne connaît que SA propre perception (ci-dessous) et ignore ce que vivent les autres et ce qui se décide pour eux. Ne mélange pas leurs vies, ne les fais pas se ressembler.

Voici les règles de ce monde, identiques pour chacun :

Tu es un habitant d'un village sur une île de la Méditerranée. Tu t'apprêtes à dormir. Tu ne sais que ce qui est écrit dans le message. N'invente rien. Tu parles français, à la première personne.

Réponds uniquement par un objet JSON, avec les mots que tu veux et la longueur que tu veux :
- "resume" : ce que tu gardes en mémoire de ta vie récente.
- "identite" : qui tu es, selon toi.
- "lecons" : ce que tu as compris jusqu'ici de la vie sur cette île, d'après ce que tu as vécu ; tu peux garder, corriger ou oublier ce que tu pensais avant.
- "questions" : ce que tu te demandes en ce moment, si quelque chose t'interroge ; laisse vide sinon.

FORMAT DE TA RÉPONSE : uniquement un objet JSON {"habitants": [...]}, un objet par habitant, dans l'ordre donné, avec les clés "id", "resume", "identite", "lecons", "questions".

=== Habitant id=3 ===
Tu es Mona Odeh, 66 ans. Il est 6h00, tu vas dormir.
Ce que tu écrivais de toi : (exemple) Description écrite par l’habitant.
Ton dernier résumé : (exemple) Résumé écrit par l’habitant.
Ce que tu pensais avoir compris de la vie ici : (exemple) Leçons écrites par l’habitant.
Ce que tu as retenu récemment :

Réponds maintenant par l'objet JSON (1 habitants).
```

## 4. Limites et choix à connaître

- **Le modèle a appris le français dans des textes humains.** Il « sait » déjà qu'on boit quand on a soif : on ne peut pas séparer cela de la langue.
- **Plusieurs habitants sont pensés dans un même appel** (8 par appel au plus, réduit à 4 quand les limites gratuites se resserrent, pour respecter les quotas gratuits). Il est demandé de ne pas les mélanger.
- **Le journal « vie intérieure »** trie l'affichage avec des mots-clés (`penseePersonnelle` dans `simulation.js`) : ce tri ne change rien à ce que vit l'habitant, seulement à ce qui est montré.
- **Bilan du soir** : au moins un appel sur quatre lui est réservé quand des habitants ont à le faire, pour que leurs souvenirs, leurs leçons et leurs questions se forment même si la file de décisions est longue.
- **Priorité de parole** : quand le conseil parle à un habitant ou qu'on lui parle, il repasse en tête de file pour répondre.
- **Quand un modèle est indisponible**, l'habitant garde son tour et attend ; il n'est pas réduit à « ne rien faire ».
- **Les sensations** sont des phrases du jeu (« tu as soif », « tu es fatigué ») choisies selon des seuils : c'est la perception du corps, pas une consigne.
- **Exceptions à « tout vient des habitants »** : le village donne un prénom à un nouveau-né si ses parents n'en choisissent pas en 12 h de jeu ; les nourrissons ne décident pas ; les liens de parenté de départ (couples, enfants) et les âges initiaux (3 à 82 ans) sont posés par le jeu ; un habitant qui devient adulte ou entre à l'école change de statut automatiquement (6 ans, 17 ans).
- **Aucune conscience réelle** : ce sont des textes produits par un modèle de langage. L'écran d'accueil le dit.

## 5. Comment vérifier

- `npm test` : lois du monde (dont le cycle de vie : `tests/vie.test.mjs`), absence de consignes de comportement dans les textes envoyés, bilan du soir, relais entre modèles.
- Onglet **Paroles** du jeu : ce que disent, pensent, retiennent et se demandent les habitants, avec « avant / après » pour leur description et leurs leçons.
