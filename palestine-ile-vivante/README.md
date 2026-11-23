# Palestine — Île Vivante

Simulation 3D en français (Three.js) : vous êtes le **conseil** d'un village fictif de 50 habitants sur une île méditerranéenne.

## Le principe

Le code ne programme **ni la pensée, ni le raisonnement, ni les interactions** des habitants. Il ne fait que deux choses :

1. **Le monde** (lois physiques, économiques, sociales) :
   - **Faim et eau** : ils doivent manger (chez eux, ou en achetant au marché) et boire (source, cruche).
   - **Sommeil et fatigue** : épuisés, ils travaillent moins bien ; la nuit, l'obscurité épuise plus vite.
   - **Santé** : blessures en mer, maladies, dispensaire et remèdes.
   - **Sécurité** : tempête, nuit dehors, garde-manger vide, vol subi.
   - **Argent** : salaire à l'heure versé par la caisse du conseil, achats, dons, prêts et dettes.
   - **Logement** : couchages par maison, surpeuplement, maisons libres où s'installer.
   - **Travail** : champs, pêche (4 places sur la jetée), oliveraie, carrière, pinède, atelier, marché, dispensaire, école, chantier.
   - **Métier** : attribué au départ (c'est autorisé) ; chacun reste libre d'y aller ou non.
2. **Ce que chaque habitant perçoit**, écrit en français : son corps, son foyer, son argent, qui est autour de lui, ce qui vient de se passer (paroles entendues, dons reçus, vols constatés, annonces du conseil), ses propres souvenirs.

À partir de cela, **un modèle de langage pense pour chacun** (`src/sim/prompts.js`, `src/sim/perception.js`). L'habitant choisit seul un geste parmi ceux qu'autorise le monde (aller, travailler, parler, donner, prêter, prendre sans demander, acheter, dormir…), dit ce qu'il veut à voix haute, décide quoi retenir, se fait ses propres avis sur les autres, réécrit qui il est, remet en cause son métier ou écrit au conseil. **Aucun trait de caractère ne lui est attribué.** Le texte donné au modèle décrit le monde et le format de réponse ; il ne dit jamais quoi penser ni comment réagir.

La conscience réelle n'est pas créée pour autant : les habitants sont fictifs, leur pensée est celle d'un modèle de langage. Et ce modèle porte déjà des connaissances humaines : les habitants ne partent pas d'une page blanche.

## Un modèle gratuit : Ollama (recommandé)

```bash
# 1. installer Ollama : https://ollama.com
ollama pull qwen2.5:3b        # ~2 Go ; autres modèles possibles : llama3.2:3b, gemma3:4b…
# 2. lancer le jeu
cd palestine-ile-vivante
npm start                     # http://localhost:8080
```

Le serveur détecte Ollama tout seul. `OLLAMA_MODEL=…` change de modèle. Je n'ai **pas pu tester avec un vrai modèle** (réseau fermé là où j'ai développé) : la chaîne est testée avec un faux serveur Ollama de même protocole. La qualité du français et le débit dépendent de votre machine et du modèle ; une carte graphique aide beaucoup.

Autres fournisseurs (variable `LLM_PROVIDER`, sinon détection dans l'ordre ollama → openai → anthropic) :

| Fournisseur | Configuration | Coût |
|---|---|---|
| `ollama` | `OLLAMA_MODEL`, `OLLAMA_HOST` | gratuit (votre machine) |
| `openai` | `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` : LM Studio, llama.cpp, ou tout service compatible (certains ont une offre gratuite limitée) | selon le service |
| `anthropic` | `npm install` + `ANTHROPIC_API_KEY` ; modèle `claude-haiku-5-5` (`CLAUDE_MODEL=…` pour changer) | payant, quelques centimes à quelques dizaines de centimes par journée de jeu selon l'usage (estimation) |

## Vitesse du temps

Les habitants décident **en parallèle**, quand ils ont fini ce qu'ils faisaient (travail, repas, sommeil…). Si plus de 12 d'entre eux attendent encore leur pensée, **le temps s'arrête** (bandeau « ⏳ »). La vitesse réelle du jeu est donc bornée par le débit de votre modèle, pas par les boutons ×1…×60. Sans modèle connecté, le village reste figé et un bandeau explique comment en installer un.

## Ce que fait le conseil

Parler à un habitant (il décide s'il répond et comment) · annoncer au village · fixer salaires et prix · donner pièces, rations, remèdes · amender · accorder du repos · confier un métier · distribuer les rations du marché · ouvrir des chantiers (puits, maison, jetée, école) · commercer avec les navires · répondre (ou non) aux demandes que les habitants lui écrivent. Chaque habitant se souvient de ce que le conseil a fait, à sa façon, et le juge à ses propres mots (fiche de l'habitant, onglet Paroles).

## Tests

```bash
npm test
```
- `tests/simulation.test.mjs` : 5 jours avec un **décideur aléatoire de test** (ce n'est pas un habitant, il sert à vérifier que le monde tient : stocks positifs, besoins bornés, dons, prêts, vols, salaires, sauvegarde) ;
- `tests/serveur.test.mjs` : serveur → faux Ollama → décision appliquée au monde ; pannes et réponses illisibles.

## Commandes

Glisser : tourner · clic droit : se déplacer · molette : zoom · clic : sélectionner · double-clic : suivre · `Espace` : pause · `1`–`4` : vitesse · `Échap` : désélectionner. Paramètre d'URL : `?graine=1234` (autre île).

## Architecture

```
src/sim/   monde.js        lois du monde
           simulation.js   corps, déplacements, exécution des gestes, économie, paroles, conseil
           prompts.js      texte système et schémas JSON (partagés avec le serveur)
           perception.js   ce que perçoit un habitant, en français
           penseur.js      pilote navigateur : demandes de pensée en parallèle
           villager.js     identité, corps, poche, ce que l'habitant écrit lui-même
src/world, src/render, src/ui   relief, 3D, interface
tools/serve.mjs   serveur local + /api/pensee (Ollama, OpenAI-compatible, Claude Haiku)
```
