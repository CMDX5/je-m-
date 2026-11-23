# Palestine — Île Vivante

![Aperçu de l’île](apercu.png)

Simulation 3D en français (Three.js) : vous êtes le **conseil** d'un village fictif de 50 habitants sur une île méditerranéenne. Vous ne contrôlez personne : vous observez, vous parlez, vous demandez, vous arbitrez, vous tranchez.

## Le principe : rien n'est scénarisé

Les habitants ne sont **pas programmés** pour travailler, aimer, voler ou se disputer. Le code ne décrit que deux choses :

1. **Les lois du monde** (`src/sim/monde.js`) : la lumière du jour, le poisson qui se reconstitue lentement, la pinède qu'on peut épuiser, ce que rapporte une heure d'effort, la place limitée sur la jetée, la maladie, l'horloge interne du corps.
2. **Un esprit capable d'apprendre** (`src/sim/esprit.js`) :
   - des **besoins** qui procurent du bien-être quand ils sont satisfaits (satiété, énergie, vie sociale, santé, sérénité, estime de soi, sécurité du foyer) ;
   - deux **instincts** seulement, faibles et corrigés par l'expérience : manger calme la faim, dormir repose ;
   - la capacité de **retenir** ce que chaque geste a changé, à chaque moment de la journée, de **généraliser**, d'**enchaîner** deux savoirs (« ce geste rapporte des vivres » + « manger calme la faim »), d'**imiter** ceux qu'on admire et de **se transmettre** ce qu'on sait en parlant ;
   - un **tempérament inné** qui règle la façon d'apprendre (curiosité, patience, rancune, empathie…), pas le comportement.

Tout le reste **émerge** et change d'une île à l'autre (paramètre `?graine=`) :

- les **métiers** : personne n'en reçoit, chacun est reconnu pour ce qu'il fait réellement le plus ;
- la **journée type** (sommeil, repas, travail) ;
- l'**entraide**, les **dons** à la réserve commune, ou au contraire le pillage de la réserve par quelques-uns ;
- les **vols** (quand le garde-manger est vide), les **rancunes** nées d'un tort réel, les **règlements de comptes**, les **excuses** ou les **disputes** ;
- les **rumeurs** et les opinions sur les autres et sur le conseil ;
- les **questions portées à l'assemblée** : quand un problème revient dans le vécu de plusieurs habitants, l'un d'eux réunit le village, et chacun vote selon sa propre expérience.

Avant votre arrivée, les habitants vivent **10 jours seuls** (`?histoire=10`) : ce que vous découvrez en entrant est né de ces jours-là. L'onglet **Émergence** mesure ce qui est apparu ; le test automatique vérifie que l'apprentissage a lieu mais **n'impose aucune valeur cible** (ni nombre de disputes, ni répartition des métiers).

> Il s'agit d'une simulation d'apprentissage et de comportement. Les habitants n'ont pas de conscience réelle.

## Claude : la réflexion et la parole

Option hybride : l'apprentissage tourne dans le navigateur pour les 50 habitants ; **Claude** (`claude-opus-5-5`) intervient aux moments importants :

- **chaque soir**, les trois habitants dont la journée a été la plus marquante réfléchissent : Claude lit leur état simulé, leurs souvenirs, leurs rancunes, ce qu'ils ont appris, et formule une pensée, des conclusions sur les autres, une intention pour le lendemain, qui sont réinjectées dans la simulation ;
- **quand vous parlez** à un habitant, Claude lui prête sa voix d'après son vécu ; l'échange entre dans sa mémoire et pèse sur sa confiance.

La clé reste côté serveur (`tools/serve.mjs`, route `/api/esprit`). Sans identifiants, tout reste jouable avec des réflexions et réponses locales, tirées de l'état de l'habitant.

## Lancer

```bash
cd palestine-ile-vivante
npm install                # facultatif : installe le SDK Anthropic pour activer Claude
export ANTHROPIC_API_KEY=… # ou `ant auth login`
npm start                  # http://localhost:8080
npm test                   # 15 jours simulés sans affichage
```

## Commandes

Glisser : tourner · clic droit : se déplacer · molette : zoom · clic : sélectionner · double-clic : suivre · `Espace` : pause · `1`–`4` : vitesse · `Échap` : désélectionner.

## Architecture

```
src/
  sim/          simulation, indépendante du rendu (tourne dans Node)
    monde.js       lois du monde
    esprit.js      apprentissage : modèle de ses propres actions, généralisation, imitation, transmission
    simulation.js  boucle, corps, rencontres, torts et rancunes, assemblée, chantiers, sauvegarde
    villager.js    identité, tempérament, relations, mémoire épisodique, pensée
    cerveau.js     pont vers Claude (contexte d'un habitant → /api/esprit)
    navigation.js  grille + A*
  world/        relief procédural et plan du village
  render/       Three.js : environnement, terrain, bâtiments, habitants
  ui/           interface du conseil
tools/serve.mjs serveur local + route Claude
tests/          test sans affichage
```
