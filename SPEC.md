# SPEC — « Déclic » : le jeu de rôle des compétences (MVP)

Document de référence pour tout le développement. **Si le code et cette spec divergent, c'est la spec qui fait foi** (sauf bug évident de la spec : le signaler).

## 0. Contexte

Hackathon Code4Sud (Nice, 18-20 nov. 2026), sujet 4 « détecteur du potentiel caché ». Public : jeunes à partir de 15 ans (guide du Centre, sans âge maximum), en questionnement sur leur orientation ou en situation de décrochage, qui peuvent penser ne rien savoir faire (adaptation `public-15-25-decrochage` ; à titre de repère, les missions locales accompagnent les 16-25 ans). Lieu : le Centre des Possibles, avec un psychologue du travail ou un conseiller qui anime.

Règles du hackathon à respecter **partout** :
- **pas de score, pas de classement, pas de verdict** ;
- l'humain décide : l'outil éclaire, il ne remplace pas le psy ;
- **aucune donnée personnelle réelle** : pseudos, rien n'est stocké après la partie, données de test inventées ;
- **aucune déduction** sur la santé, l'origine, la nationalité, la langue maternelle, la situation familiale, la religion, les opinions politiques ou syndicales, la vie ou l'orientation sexuelle, la situation financière, et **aucun jugement** sur la personnalité, les émotions, l'intelligence ou l'état psychologique : le MJ décrit ce que le jeune SAIT FAIRE, jamais ce qu'il EST (adaptation `aucune-deduction-sensible` ; RGPD art. 9 ; Code de déontologie des psychologues 2021, art. 13 et 21) ;
- le jeune **valide** ce qui est retenu sur lui.

Toute l'interface est **en français**, au **tutoiement** pour le jeune, avec des phrases courtes et simples.

## 1. Le jeu (règles validées par l'équipe)

Une partie = 2 à 6 joueurs autour d'une table + un **écran commun** (PC ou projecteur), piloté par l'animateur. Chaque joueur utilise **son téléphone** (QR code, aucune installation). Chacun a aussi une **fiche personnage papier** où il recopie ses compétences (plus de gommettes depuis le 19/11/2026).

1. **Accueil** : l'animateur crée la partie sur l'écran commun, qui affiche un QR code et un code à 4 lettres. Les joueurs rejoignent la partie avec un pseudo et un avatar (emoji).
2. **Création du personnage** : chaque joueur écrit sur son téléphone 1 ou 2 choses qu'il a déjà faites dans la vraie vie. L'IA en tire **au maximum 3 compétences de départ** (avec les mêmes règles que l'outil existant : liste ROME fermée, citation exacte). Le joueur garde ou retire chacune (« C'est moi / Pas moi »).
3. **L'histoire « Le tournoi du quartier »** (décision du 19/11/2026) : de 3 à 6 épisodes qui s'enchaînent, joués **dans l'ordre** de l'histoire (`public/data/problemes.json`, champ `episode`). **Par défaut, autant d'épisodes que de joueurs, entre 3 et 6**, avec des types RIASEC éloignés sur l'hexagone : 3 → E, A, R ; 4 → E, A, I, C ; 5 → E, A, I, R, C ; 6 → les 6 (décision de Pierre du 21/11/2026 §4, adaptations `duree-episode-et-partie` et `defaut-3-episodes-couverture-riasec`). L'animateur peut choisir un autre nombre (1 à 6). Pour chaque épisode :
   1. **Présentation** : l'écran commun affiche l'illustration et la situation, et le MJ la lit à voix haute (synthèse vocale du navigateur).
   2. **Réflexion silencieuse** (minuteur, 30 s par défaut ; options 0 / 20 / 30 / 45 s ; 0 la désactive) : chacun réfléchit seul à ce qu'il ferait et peut noter un mot sur son téléphone (note privée, facultative, jamais évaluée, jamais envoyée au MJ ni à l'écran). À la fin du temps, la discussion démarre **d'elle-même**, sans rien couper (adaptations `ordre-oral-puis-ecrit`, `nouveau-temps-de-reflexion-individuel`, `nouveau-premiere-idee-avant-discussion` ; 30 s est un choix de conception à chronométrer : principe transposé de Tobin et du brainstorming, objectif différent — critique point 23).
   3. **Phase d'échange** (minuteur ; par défaut **max(90, 30 × nombre de joueurs) s** : 90 s jusqu'à 3 joueurs, 120 s à 4, 150 s à 5, 180 s à 6 ; heuristique à valider au chronomètre, adaptation `duree-discussion-120s`) : les joueurs **discutent à voix haute** entre eux. Rien n'est saisi.
   4. **Réponse** (minuteur, 90 s par défaut) : chacun écrit **sa** réponse sur son téléphone. **Elle est privée** : seul son auteur la voit (et le MJ IA la lit). L'écran commun affiche seulement qui a répondu, jamais quoi. **Il n'y a ni bonne ni mauvaise réponse.** Seules deux réponses sont refusées, **au joueur concerné seulement** (les autres ne voient rien et ne sont jamais relancés) : « je ne sais pas » (rien d'autre que de l'hésitation, ou vide) et la violence ; il reçoit un message bienveillant (« Toutes les idées comptent ! … », « Ici, on cherche une solution sans violence… »). Dès le **1er** « je ne sais pas », le refus porte le code `sans_reponse` : le téléphone propose des débuts de phrase (« Moi, je demanderais à… », « D'abord, je… », « J'irais voir… ») et un bouton **« Je passe ce tour »**, sans reproche (réponse vide, comme un absent ; décision de Pierre §3, critique point 11). Le fait d'avoir passé est signalé **au psychologue seulement**, sur la fiche (`passes`), jamais au groupe : l'écran le voit « fini » comme les autres. La violence reste refusée. L'animateur peut passer sans attendre (un absent a une réponse vide). Après sa réponse, une question **facultative** : « Ce genre de situation, tu aimerais en vivre dans un travail ? » (oui / un peu / non, sans score ; adaptation `nouveau-preference-par-episode`).
   5. **L'idée du tour** : dès que tout le monde a répondu, le MJ IA choisit **l'idée qui fait avancer l'histoire** (effet `choisir`, un seul appel avec toutes les réponses anonymes J1, J2…). Les réponses sont **mélangées (Fisher-Yates) avant l'étiquetage J1, J2…**, avec un tirage enregistré dans l'état (`tirages`) pour pouvoir le vérifier (adaptation `idee-du-tour`). **Rotation stricte, contrôlée par le serveur** : si au moins un joueur pas encore retenu a écrit une vraie réponse (pas du remplissage), l'idée est choisie parmi eux ; sinon « rotation non respectée » → MJ de secours parmi eux (adaptation `rotation-joueurs-retenus` ; le prompt le dit aussi : « tu choisis OBLIGATOIREMENT parmi eux », et « la longueur d'une réponse n'est pas un critère : une idée courte et concrète vaut une idée longue », adaptation `idee-du-tour`). Garantie : tout joueur qui répond sérieusement à chaque épisode est retenu au moins une fois (6 joueurs au plus, autant d'épisodes que de joueurs). L'écran affiche d'abord l'idée **sans nom** (« Cette idée fait avancer l'histoire : « … » », ses propres mots, extrait exact de sa réponse) ; son auteur reçoit sur son téléphone « C'est ton idée ! On affiche ton pseudo ? [Oui] [Non, reste discret] » et le pseudo n'apparaît que sur Oui (décision de Pierre §2). Il reçoit la compétence de l'idée dans les deux cas, l'écrit sur sa fiche papier et dit s'il la garde (« Je la garde / Pas moi »). L'animateur peut **« Choisir une autre idée »** : le joueur proposé est écarté pour cet épisode, le MJ choisit parmi les autres réponses (le MJ propose, l'animateur valide ; adaptation `mj-ia-bienveillant`). Ce n'est pas un classement : l'idée n'est jamais présentée comme « la meilleure ». Personne n'a rien écrit : pas d'idée retenue, l'histoire continue.
   6. **Compétences privées** (décision de Pierre §1, critique point 3) : ensuite, **chaque autre réponse écrite** peut recevoir une compétence, affichée **seulement sur le téléphone de son auteur** (effet `attribuer`), **uniquement si la réponse contient une action précise et citable** (citation exacte d'au moins 3 mots, ou la réponse entière ; pas la carte « participation » ni la compétence « générique » ; tâche `attribuerPrivee` du MJ, §5) ; sinon le joueur retrouve simplement son idée, sans compétence (« Ton idée : … » reformulée par le MJ et contrôlée, ou sa réponse telle quelle). Promesse affichée : « chacun a la même chance d'en recevoir une », jamais « chacun repart avec au moins une ». L'épisode suivant démarre quand l'auteur de l'idée a répondu aux deux questions et que chacun a dit s'il garde sa compétence privée (ou quand l'animateur passe ; une compétence restée sans réponse reste modifiable plus tard).
   7. **Liaison** : à partir du 2e épisode, une phrase relie l'épisode au précédent. Le MJ IA l'écrit après l'idée du tour (effet `lier`, 20 mots au plus, reprend l'idée retenue sans pseudo, sans jugement ni sujet sensible, contrôlée côté serveur) ; sinon (MJ de secours, IA en retard ou sortie refusée) la **transition fixe** de l'épisode (champ `transition`, neutre pour rester juste quand on saute des épisodes), à défaut « L'histoire continue. » (adaptation `histoire-tournoi-du-quartier`).
4. **Débrief** (réglage `debrief`, désactivé par défaut tant que les écrans ne l'affichent pas) : après le dernier épisode, l'écran pose « Quel moment de l'histoire t'a surpris ? », « Quelle compétence de ta fiche te ressemble le plus ? », « Raconte une fois, dans ta vraie vie, où tu l'as déjà utilisée. » ; la réponse à la 3e question est écrite en privé (facultative) et va sur la fiche pour le psychologue. L'animateur termine (adaptation `nouveau-debriefing` ; durée et questions : choix de conception).
5. **Fin** : chaque joueur voit **sa fiche** sur son téléphone : compétences de départ et compétences repérées en jeu, avec leur trace (ses propres mots), les types d'activités où il a montré des compétences, des métiers à explorer (indicatif, O*NET + ESCO), un lien pour imprimer sa fiche et la fiche pour le psy. L'écran commun affiche un message de fin **collectif**, sans aucune comparaison entre joueurs.

**Jamais affiché nulle part** : le mot « faux », « mauvaise réponse », un score, un classement, ou qui a trouvé. Le contenu d'une réponse n'est montré qu'à son auteur.

## 2. Architecture

- **Cloudflare Workers** (JavaScript ES modules, **pas de TypeScript, pas de bundler maison**, `wrangler` fait le bundle) + **Durable Objects** (une instance par partie, SQLite-backed, WebSocket Hibernation API, alarmes pour les minuteurs) + **Static Assets** (`public/`).
- IA : **OpenAI** (Chat Completions, sans SDK : `src/openai.js`), modèle `gpt-5-nano`, le moins cher d'OpenAI (décision du 19/11/2026). Secret Worker `OPENAI_API_KEY`. **Sans clé (ou avec `MJ_MODE=mock`), un MJ « mock » déterministe prend le relais** : le jeu doit être entièrement jouable sans clé (démo de secours, tests).
- Pas de base de données : l'état d'une partie vit dans son Durable Object. On le supprime à la fin (`deleteAll`) une heure après la fin de partie (alarme).
- Le développement se fait en local avec `wrangler dev` (`compatibility_date` ≤ 2026-09-02 : c'est la plus récente acceptée par le workerd de wrangler 4.127). **Ne rien déployer, ne rien pousser sur un dépôt distant.**

### 2.1 Arborescence cible

```
wrangler.jsonc
package.json                 (scripts : dev, test, simulate, check, build)
SPEC.md
src/
  worker.js                  routes HTTP, upgrade WebSocket → DO          [owner: D]
  partie.js                  classe Durable Object `Partie`               [owner: D]
  jeu.js                     logique de jeu PURE (machine à états)       [owner: C]
  mj.js                      MJ : IA OpenAI + mock + validations            [owner: C]
  analyse.js                 récit → compétences (outil existant) + mock [owner: D]
  donnees.js                 import des JSON (rome, problemes, metiers)  [owner: D]
public/                      servi tel quel (assets)
  index.html                 accueil : « Créer une partie » / « Rejoindre » / lien vers l'outil solo [owner: E]
  ecran.html, js/ecran.js    écran commun (animateur)                   [owner: E]
  jeu.css                    styles communs du jeu (écran + téléphone)   [owner: E]
  joueur.html, js/joueur.js  téléphone du joueur                        [owner: F]
  fiche.html, js/fiche-page.js   fiche personnage imprimable (données de la partie) [owner: F]
  fiche-papier.html          gabarit A4 vierge à imprimer               [owner: F]
  js/fiche.js                rendu HTML de la fiche (partagé)           [owner: F]
  js/riasec.js               constantes RIASEC + calculs (partagé)      [owner: F]
  js/metiers-proches.js      rapprochement métiers (existant)           [owner: F]
  outil.html, js/outil.js, js/exemples.js, style.css   outil solo existant (à réparer après le déplacement) [owner: F]
  data/rome.json             ROME 4.0 (existant)
  data/metiers.json          métiers O*NET (existant) + enrichissement ESCO [owner: B]
  data/problemes.json        les problèmes du jeu                      [owner: A]
  illustrations/*.svg        une illustration par problème + logo      [owner: A2]
scripts/
  build-rome.py, build-metiers.py   (existants)
  build-esco.mjs             enrichissement ESCO                         [owner: B]
  simulate.mjs               simulation d'une partie complète contre `wrangler dev` [owner: D]
  build-pages.mjs            copie public/ → dist/ pour GitHub Pages     [owner: D]
test/                        tests `node --test` (Node 22, aucune dépendance de test)
```

Chaque agent ne modifie **que les fichiers dont il est propriétaire**. S'il a besoin d'un changement ailleurs, il le note dans son rapport final. **Aucun agent ne fait de `git commit`** : c'est l'orchestrateur qui commite.

### 2.2 Routes HTTP (`src/worker.js`)

| Méthode | Route | Effet |
|---|---|---|
| POST | `/api/parties` | crée une partie. Corps optionnel `{ nbProblemes?: 1..6, dureeEchange?: s, dureeReponse?: s, dureeReflexion?: 0 \| 10..120, debrief?: bool }` (`nbProblemes` et `dureeEchange` absents = automatiques selon le nombre de joueurs, figés au démarrage ; réflexion 30 s par défaut). Génère un code de 4 lettres majuscules sans voyelle ambiguë (alphabet `BCDFGHJKLMNPQRSTVWXZ`), initialise le DO `getByName(code)`, et renvoie `{ code, cleEcran }` (voir « Accès animateur » ci-dessous) |
| GET | `/api/parties/:code/ws?role=ecran&cle=<cleEcran>` | WebSocket de l'écran commun (animateur) : `cle` obligatoire, sinon fermeture **4003** (§2.3) |
| GET | `/api/parties/:code/ws?role=joueur&joueur=<id?>` | WebSocket d'un joueur (`joueur` absent = nouveau joueur) |
| GET | `/api/parties/:code/fiche/:joueurId` | JSON de la fiche du joueur (pour `fiche.html`) ; 404 si inconnu |
| POST | `/api/analyse` | outil solo existant : `{ recit }` → analyse (même contrat que l'ancien `server.js`) |
| * | le reste | Static Assets (`public/`). `/p/:code` sert `joueur.html` (via `run_worker_first` ou une réécriture dans le worker) |

Le code de partie est validé avec `^[A-Z]{4}$` ; sinon, 404.

**Accès animateur** : le code de partie est public (affiché, dans le QR code) ; il ne suffit donc pas pour piloter la partie. À la création, `Partie.init` tire `cleEcran = crypto.randomUUID()`, la range dans l'état du DO et la renvoie **une seule fois**, dans la réponse de `POST /api/parties`. Elle n'apparaît **jamais** dans une vue (`vue()`, quel que soit le rôle) ni dans la fiche. `index.html` ouvre ensuite `ecran.html?code=XXXX#cle=<cleEcran>` : la clé est dans le **fragment**, qui ne part ni dans les logs du serveur ni dans le `Referer`. `ecran.js` la range dans `sessionStorage` (clé `pc-ecran-<code>`, pour survivre à un rechargement de l'onglet), l'efface de la barre d'adresse (`history.replaceState`) et l'ajoute à sa connexion WebSocket (`?role=ecran&cle=…`). Le mode démo `ecran.html?demo=1` n'utilise ni serveur ni clé.

### 2.3 Protocole WebSocket

Tous les messages sont du JSON `{ t: "<type>", ... }`.

**Serveur → client** : après **chaque** changement, le serveur envoie à chaque socket **une vue complète filtrée selon son rôle** : `{ t: "etat", vue, serveur }`, où `serveur` est l'heure du serveur (epoch ms) au moment de l'envoi. Le client calcule `decalage = serveur - Date.now()` à la réception et l'utilise pour les minuteurs (voir §3.3). Le client se contente d'afficher `vue` : aucune logique de jeu dans le front. Le serveur peut aussi envoyer `{ t: "erreur", message }`, et `{ t: "bienvenue", joueurId }` à la première connexion d'un joueur (le client le garde dans `localStorage` sous la clé `pc-joueur-<code>` pour se reconnecter). Un message accepté qui ne change rien (même réponse renvoyée, même réglage) n'est pas diffusé : seul son expéditeur reçoit sa vue.

**Limites (anti-abus)** :
- socket écran (`role=ecran`) sans `cle` ou avec une `cle` différente de `cleEcran` (comparaison en temps constant ; une partie sans `cleEcran` refuse tout écran) : acceptée le temps d'envoyer `{ t:"erreur", message:"Accès animateur refusé : …" }` puis fermée avec le code **4003**. Elle ne reçoit aucune vue, ne pilote rien, ne compte pas parmi les écrans et ne ferme jamais l'écran de l'animateur. L'écran affiche alors « Cette page animateur n'est accessible que depuis l'ordinateur qui a créé la partie » avec un lien vers l'accueil (même message, sans connexion, s'il n'a aucune clé) ;
- nouvelle socket joueur sans `joueurId` connu : refusée en HTTP 409 au-delà de `MAX_JOUEURS × 2 + 2` sockets joueur ouvertes ; après `accueil`, elle est acceptée le temps d'envoyer `{ t:"erreur", message:"La partie a déjà commencé." }` puis fermée avec le code **4009** ;
- au plus **2** sockets écran et **3** sockets par joueur connu : une nouvelle connexion ferme la plus ancienne (code **4002**, précédé d'un `erreur` « Cette page a été ouverte ailleurs. ») ;
- débit : seau à jetons par socket (10 messages d'affilée, 5 par seconde) ; au-delà, `erreur` « Doucement : trop de messages d'un coup. », et après 20 refus la socket est fermée (code **4008**) ;
- le front **ne se reconnecte pas** automatiquement après une fermeture 4001 (partie effacée), 4002, 4003 (accès animateur refusé), 4008 ou 4009 : il affiche le message reçu.

**Client → serveur** :

| Rôle | Message | Quand |
|---|---|---|
| joueur | `{ t:"rejoindre", pseudo, avatar }` | phase `accueil` (pseudo : 1 à 20 caractères après nettoyage (NFC, sans caractères de contrôle ni invisibles comme U+200B ou U+202E, espaces réduits), avec au moins une lettre ou un chiffre ; unique sans tenir compte de la casse ni des accents ; avatar : un des `AVATARS`) |
| joueur | `{ t:"recit", texte }` | phase `creation` (10 à 1000 caractères) |
| joueur | `{ t:"valider_depart", garder:[bool,…] }` | phase `creation`, après l'analyse |
| joueur | `{ t:"lu" }` | phase `presentation` : « J'ai lu ». Quand **tous** les joueurs ont lu, la partie passe d'elle-même à `echange` |
| joueur | `{ t:"reponse", texte }` | phase `reponse` (0 à 500 caractères ; renvoyer remplace la réponse tant que la phase n'est pas finie). **Refusée** (erreur au joueur seul, état inchangé) si c'est « je ne sais pas » / vide (`estSansReponse`) ou violent (`estViolente`) : voir `refusReponse` de `src/texte.js` |
| joueur | `{ t:"garder_competence", garder:bool }` | phase `competences` (compétence du problème en cours) |
| joueur | `{ t:"garder_competence", garder:bool, problemeIndex }` | **à tout moment** dès que le joueur a reçu la compétence de ce problème, jusqu'à la fin **comprise** (phase `fin`) : sert surtout pour une compétence restée sans réponse (`gardee:null`) quand l'écran est passé au problème suivant, listée dans `moi.competencesEnAttente`. Le joueur peut aussi changer d'avis. Une réponse pour un ancien problème ne fait jamais avancer la partie |
| joueur | `{ t:"garder_competence", garder:bool, departIndex }` | **à tout moment**, jusqu'à la fin **comprise**, pour une compétence de **départ** déjà dans ses compétences (`problemeIndex:null`) : surtout celles mises en attente (`gardee:null`) quand l'animateur a clos la création avant que le joueur valide (voir §3.1). `departIndex` = identifiant stable de la compétence (sa position dans `depart.propositions`, fixée à `analyse_faite`). Ne fait jamais avancer la partie ; refusé avec un `problemeIndex` en même temps |
| écran | `{ t:"demarrer" }` | `accueil` → `creation` (≥ 1 joueur ; 2 recommandés) |
| écran | `{ t:"suivant" }` | passe à l'étape suivante quand l'étape le permet (voir §3). En `competences`, tant que l'attribution n'est pas arrivée, il **relance l'étape avec le MJ de secours** (mock, immédiat) : l'animateur n'est jamais bloqué par un MJ IA lent ou perdu |
| écran | `{ t:"fin_minuteur" }` | termine le minuteur en cours et passe à la suite (même si le temps est déjà écoulé) |
| écran | `{ t:"reglages", dureeEchange?, dureeReponse? }` | phase `accueil` seulement |

| joueur | `{ t:"note", texte }` | phases `reflexion` et `echange` (0 à 200 caractères) : note privée, jamais envoyée au MJ ni à l'écran |
| joueur | `{ t:"passer" }` | phase `reponse` : « Je passe ce tour » (réponse vide, `passe:true`) ; une vraie réponse envoyée ensuite la remplace |
| joueur | `{ t:"preference", valeur:"oui"\|"un_peu"\|"non", problemeIndex? }` | après sa réponse (épisode en cours) ou pour un épisode déjà joué ; ne fait jamais avancer |
| joueur | `{ t:"afficher_pseudo", accord:bool }` | phase `competences`, auteur de l'idée du tour seulement |
| joueur | `{ t:"debrief", texte }` | phase `debrief` (0 à 500 caractères, privé) |
| écran | `{ t:"autre_idee" }` | phase `competences`, une idée affichée : le MJ choisit parmi les autres réponses |
| écran | `{ t:"reglages", …, dureeReflexion?, nbProblemes?: 1..6\|null, debrief? }` | phase `accueil` (`nbProblemes:null` = retour à l'automatique) |

Tout message invalide ou hors phase → `{ t:"erreur", message }` en français, sans changer l'état. Un refus de réponse porte en plus `code` : `"sans_reponse"` (« je ne sais pas ») ou `"violence"`. Avec `"sans_reponse"`, il porte aussi `amorces` : les débuts de phrase de `src/texte.js` (`AMORCES`), à proposer (préremplis quand on les touche) avec le bouton « Je passe ce tour ». Une amorce envoyée seule, sans suite (« D'abord, je… »), est refusée comme un « je ne sais pas ». Message à afficher quand on passe : `MESSAGE_PASSE` (« Pas de souci, l'histoire continue. Tu pourras proposer ton idée au prochain épisode. »).

## 3. Machine à états (`src/jeu.js`, PURE)

`src/jeu.js` **n'a aucune I/O** : pas de `fetch`, pas d'horloge système (le temps `maintenant` est passé en paramètre), pas d'aléatoire non injecté. API :

```js
export function creerEtat({ code, problemes, nbProblemes /* absent = auto */, dureeEchange /* absent = auto */, dureeReponse = 90, dureeReflexion = 30, debrief = false, graine }) → etat
export function appliquer(etat, evenement, maintenant) → { etat, effets }
export function vue(etat, role, joueurId) → objet sérialisable (vue filtrée)
export function effetsIAEnAttente(etat) → [effets IA que l'état attend encore] (chien de garde du DO)
export const AVATARS = ["🦊","🐼","🦁","🐸","🐙","🦉","🐢","🐝","🦄","🐧","🐯","🐨"]
```

- `evenement` = un message client enrichi `{ ...msg, role, joueurId }` **ou** un événement interne :
  - `{ t:"minuteur_fini" }` : l'alarme du minuteur. Elle **ne fait jamais avancer la partie** : elle met `tempsEcoule:true` (une seule fois). On attend que tout le monde ait répondu (`reponse`, `choix`), ou l'animateur (`fin_minuteur` / `suivant`)
  - `{ t:"analyse_faite", joueurId, competences }` (création du personnage ; accepté aussi **après** `creation` si le joueur était encore en `analyse` quand l'animateur a clos la création : ses propositions deviennent alors directement des compétences de départ en attente)
  - `{ t:"attribution_faite", problemeIndex, essai?, joueurId, competence, departage? }` (l'idée du tour ; refusée si `essai` périmé, si le joueur a été écarté par l'animateur, ou si la rotation stricte n'est pas respectée ; `departage` = tirage du MJ de secours entre ex aequo, rangé dans `tirages[problemeIndex].departage`)
  - `{ t:"competences_privees", problemeIndex, competences: { [joueurId]: competence | { reformulation: string|null } } }` (une seule fois par épisode, acceptée même après le passage à l'épisode suivant ; une compétence n'est gardée que si elle est citable, sinon `retour:"idee"` et la reformulation éventuelle)
  - `{ t:"liaison_faite", problemeIndex, essai, texte|null }` (phrase de liaison vers l'épisode `problemeIndex` ; refusée si l'idée du tour a changé depuis — autre `essai` — ou si l'épisode a déjà commencé)
  - `{ t:"erreur_ia", tache:"attribuer", problemeIndex }` : compétences privées impossibles → chacun garde son idée
  - `{ t:"erreur_ia", tourId|joueurId }` → dernier recours quand l'IA **et** le mock échouent : récit → 0 proposition (le joueur peut valider ; après `creation` : `depart.etat:"valide"`, 0 compétence de départ) ; évaluation → `indice` ; attribution → chaque joueur reçoit la compétence de participation (jamais sans compétence)
- `effets` = une liste d'actions que le DO exécute **après** avoir persisté le nouvel état :
  - `{ type:"minuteur", fin: <epoch ms> }` (programme l'alarme) / `{ type:"annuler_minuteur" }`
  - `{ type:"analyser_recit", joueurId, texte }`
  - `{ type:"evaluer", tourId, probleme, reponses:[{ joueurId, texte }], secours? }`
  - `{ type:"choisir", problemeIndex, essai, probleme, reponses: [{ joueurId, texte, dejaRetenu }] /* mélangées */, obligatoires: [joueurId], secours? }` → `{ t:"attribution_faite", problemeIndex, essai, joueurId|null, competence|null }` (la compétence de l'idée du tour)
  - `{ type:"attribuer", problemeIndex, probleme, reponses: [{ joueurId, texte }] }` → `mj.attribuerPrivee` (un appel par joueur) → `{ t:"competences_privees", … }`
  - `{ type:"lier", problemeIndex /* épisode suivant */, essai, precedent, suivant, idee /* citation de l'idée du tour */ }` → `mj.lier` → `{ t:"liaison_faite", … }` (facultatif : pas de chien de garde, la transition fixe s'affiche en attendant ou en cas d'échec)
  - `{ type:"nettoyer", fin }` (supprime la partie une heure après la fin)
  - `secours: true` = calculer directement avec le MJ mock (relance par l'écran ou par le chien de garde).
- **Chien de garde IA (DO)** : `effetsIAEnAttente` liste aussi `analyser_recit` pour un joueur resté en `analyse` **après** la création (création close par l'animateur). Pour chaque effet IA, le DO persiste une échéance (`gardesIA`, 45 s) **avant** l'appel et programme l'alarme au plus tard à cette échéance. Si l'appel est perdu (redémarrage du DO, rechargement de `wrangler dev`, déploiement), l'alarme reconstruit l'effet avec `effetsIAEnAttente(etat)` et le relance avec le mock. Un résultat en double est refusé par les gardes de `tourId`, de `problemeIndex` et d'attribution déjà présente.
- Le tirage des problèmes est **déterministe à partir de `graine`** (le DO passe une graine aléatoire). Les problèmes tirés couvrent des types RIASEC dominants différents quand c'est possible.

### 3.1 Phases

```
accueil → creation → [ presentation → reflexion? → echange → reponse → competences ] × nbProblemes → debrief? → fin
```

| Phase | Entrée | Sortie |
|---|---|---|
| `accueil` | création | écran `demarrer` (≥ 1 joueur) |
| `creation` | | dès que **tous** les joueurs ont validé leurs compétences de départ, **ou** écran `suivant`. Dans ce cas, un joueur dont l'analyse est prête (`a_valider`) mais qui n'a pas validé ne perd rien : ses propositions deviennent des compétences de départ **en attente** (`problemeIndex:null`, `gardee:null`, `departIndex`), `depart.etat:"valide"` ; il les garde ou les retire plus tard (`garder_competence` avec `departIndex`, listées dans `moi.competencesEnAttente`). Un joueur encore en `analyse` : son `analyse_faite` est accepté hors `creation` et donne de même des compétences en attente. Un joueur qui n'a rien écrit n'a aucune compétence de départ |
| `presentation` | chaque joueur valide « J'ai lu » | **tous** ont lu, **ou** écran `suivant` → `reflexion` (ou `echange` si `dureeReflexion` = 0) |
| `reflexion` | minuteur `dureeReflexion` | à 0, **passe seule** à `echange` (seule phase qui avance d'elle-même) ; écran `fin_minuteur`/`suivant` |
| `echange` | minuteur `dureeEchange` | écran `fin_minuteur`/`suivant` (à 0, `tempsEcoule` : on attend l'animateur) |
| `reponse` | minuteur `dureeReponse` | tous ont donné une vraie réponse, **ou** écran `fin_minuteur`/`suivant` → effet `attribuer`, phase `competences` (les absents : réponse vide). À 0, `tempsEcoule` : les joueurs peuvent encore répondre |
| `competences` | « Le MJ lit vos idées… » (effet `choisir`) puis l'idée du tour à l'écran (vue `idee` : pseudo, avatar, texte, compétence) | `attribution_faite` → chaque joueur voit sa compétence ; quand l'**auteur de l'idée** a répondu `garder_competence`, **ou** écran `suivant` → problème suivant (`presentation`) ou `fin`. Avant l'attribution, écran `suivant` = relance avec le MJ de secours. Une compétence restée sans réponse reste modifiable ensuite (`garder_competence` avec `problemeIndex`) |
| `debrief` | (réglage `debrief`) après le dernier épisode | écran `suivant` → `fin` |
| `fin` | effet `nettoyer` | — |

Un joueur qui rejoint après `accueil` est refusé (« La partie a déjà commencé ») **sauf reconnexion** avec un `joueurId` connu. Un joueur déconnecté reste dans la partie : s'il ne répond pas, sa réponse est vide.

### 3.2 État (indicatif, sérialisable en JSON)

```js
{
  code, phase, creeA, graine,
  reglages: { nbProblemes, nbProblemesAuto, dureeEchange, dureeEchangeAuto, dureeReponse, dureeReflexion, debrief },
  problemes: [ids tirés], problemeIndex, tour /*1|2*/, tourId /*string unique*/,
  minuteurFin: epoch|null, minuteurDebut: epoch|null,
  joueurs: { [id]: { id, pseudo, avatar, connecte, recit, depart:{ etat:"attente"|"analyse"|"a_valider"|"valide", propositions:[…], gardees:[…] },
                     reponses: { [problemeIndex]: { tour1: texte|null, lu: bool, note?, passe?: true, preference?: "oui"|"un_peu"|"non", retour?: "competence"|"idee", reformulation?: string } },
                     competences: [ { problemeIndex|null, departIndex? /* compétences de départ */, idee?: bool /* true = idée du tour, false = compétence privée */, horsScenario?: bool /* savoir-être hors liste de l'épisode */, code, libelle, mots, preuve, typePreuve:"vecu"|"jeu"|"participation", riasec, gardee: bool|null } ],
                     debrief: texte|null } },
  attribution: { [id]: competence } | null,
  idee: { joueurId|null, accordPseudo: bool|null } | null,
  tirages: { [problemeIndex]: { essai, graine, ordre:[joueurId], departage?: { exAequo:[joueurId], graine, tire } } },   // mélange de Fisher-Yates et départage du MJ de secours, enregistrés
  essaisChoix: { [problemeIndex]: n }, exclus: { [problemeIndex]: [joueurId] },  // « Choisir une autre idée »
  privees: { [problemeIndex]: "attente"|"fait" },                      // compétences privées
  liaisons: { [problemeIndex]: { essai, texte|null } },                  // phrase de liaison vers cet épisode
}
```

### 3.3 Vues (`vue(etat, role, joueurId)`)

- **écran** : `{ code, phase, problemeIndex, nbProblemes, probleme:{ id,titre,situation,question,illustration } | null, minuteurFin, minuteurDebut, minuteurDuree, joueurs:[{ pseudo, avatar, connecte, aFini }]` (`aFini` : ce joueur a-t-il lu / validé / répondu / choisi / gardé sa compétence dans la phase en cours, `null` si la phase n'attend rien des joueurs ; décision de Pierre du 19/11/2026 : l'animateur doit voir **qui** il attend, jamais **ce que** le joueur a répondu), `compte:{ repondu, total }` (rempli en `creation`, `presentation`, `reponse`, `indice`, `choix` et `competences`), `tempsEcoule` (minuteur à 0, la partie attend), `reglages`, `attenteIA` (le MJ travaille), `evaluation:{ resolu, synthese|null }` (pendant `solution`), `indice` (pendant `indice` et après), `choix:[textes]` (pendant `choix`, **sans** dire lequel est correct), `solution` (pendant `solution`), `fin:{ nbCompetencesTotal }` }. **Jamais** le texte d'une réponse, jamais quel joueur a trouvé, jamais les compétences d'un joueur nommé.
- **écran** (ajouts du 21/11/2026) : `idee:{ pseudo|null, avatar|null, accordPseudo, texte, competence, notee }` (pseudo et avatar `null` tant que l'auteur n'a pas dit oui), `autreIdeePossible`, `liaison` (les deux vues, à partir du 2e épisode : phrase du MJ, sinon transition fixe ; `null` au 1er épisode et hors épisode), `reglages` complets (avec `nbProblemesAuto`, `dureeEchangeAuto`, `dureeReflexion`, `debrief`). En `competences`, `compte` ne compte que les joueurs qui ont quelque chose à trancher. Jamais une compétence privée, jamais qui a passé son tour.
- **joueur** : `{ code, phase, moi:{ id, pseudo, avatar, depart, aLu, maNote, maReponse, jaiPasse, sansReponse, maPreference, peutDonnerPreference, monIdee:{ accordPseudo }|null, retourPrive:"competence"|"idee"|null, maReformulation /* « Ton idée : … » quand retourPrive vaut "idee", sinon null */, competenceDuProbleme, competencesEnAttente, competences, monDebrief }, probleme…, minuteurFin, minuteurDebut, minuteurDuree, tempsEcoule, compte, idee, fin:{ lienFiche } }` : uniquement **ses** données à lui. `competenceDuProbleme` (idée du tour ou compétence privée) n'apparaît qu'une fois l'idée du tour affichée. `sansReponse` : l'animateur est passé sans sa réponse (« Pas de souci, l'histoire continue. Tu pourras proposer ton idée au prochain épisode. »).
- **Fiche** (`GET /api/parties/:code/fiche/:joueurId`) : en plus des compétences, `problemes[i]` porte `riasec` et `questionVecu`, et la fiche donne `passes:[{ index, titre }]` (pour le psychologue : « A préféré passer à l'épisode X : à explorer en entretien »), `preferences:[{ index, titre, valeur }]` et `debrief`.
  - `competencesEnAttente` : ses compétences encore sans réponse (`gardee:null`), **hors** `competenceDuProbleme` (déjà affichée) : compétences de jeu (chacune porte son `problemeIndex`, à renvoyer dans `garder_competence`) et compétences de départ mises en attente quand l'animateur a clos la création (`problemeIndex:null` + `departIndex`, à renvoyer dans `garder_competence`), celles de départ en premier. Le téléphone les propose avec le même bloc « Cette compétence t'attend » (« Je la garde / Pas moi ») à tout moment, y compris en phase `fin`. La fiche (`fiche.js`) ne montre une compétence qu'une fois gardée (`gardee:true`).
- **Minuteur (les deux vues)** : `minuteurFin` (epoch ms du serveur), `minuteurDebut` (epoch ms du serveur) et `minuteurDuree` (ms, = `minuteurFin - minuteurDebut`), tous `null` hors `reflexion`/`echange`/`reponse`. Le client calcule `total = minuteurDuree` et `reste = minuteurFin - (Date.now() + decalage)` avec le `decalage` du dernier `{ t:"etat", serveur }` (§2.3) : le cercle reste juste après un rechargement de la page et ne dépend pas de l'horloge du téléphone.

## 4. Données

### 4.1 `public/data/problemes.json` (owner A)

Situations revues le 19/11/2026 d'après la doc du hackathon : **une situation par profil RIASEC** (les 6 profils du Centre des Possibles), chacune tirée des exemples de « compétences cachées » du sujet 4 (garder des enfants, réparer un scooter, animer une communauté en ligne, tenir la caisse d'une association, aider une voisine dans une démarche…). Plus de bonne réponse : ni critères, ni indices, ni 4 propositions.

```json
{
  "version": 1,
  "problemes": [
    {
      "id": "caisse-buvette",
      "titre": "La caisse de la buvette",
      "illustration": "illustrations/caisse-buvette.svg",
      "situation": "2 à 4 phrases, au présent, à la 2e personne du pluriel (« Vous… »), situation de la vie de jeunes de 15-25 ans",
      "question": "Que faites-vous ?",
      "riasec": "C",
      "solution": {
        "resume": "1 à 2 phrases : une façon de s'en sortir (repère pour l'équipe, jamais montré comme « la bonne réponse »)",
        "motsCles": ["mots/racines en minuscules sans accents : vocabulaire du sujet, pour le MJ mock", "…"]
      },
      "competences": [
        { "code": "<code macro ROME existant dans rome.json>", "pourquoi": "comportement observable dans une réponse qui justifie cette compétence", "motsCles": ["…"], "mots": "Tu as …" }
      ],
      "competenceParDefaut": "4A201",
      "competenceParticipation": "6D102",
      "questionVecu": "Ça t'est déjà arrivé de … ?"
    }
  ]
}
```

Contraintes :
- **8 situations** : `scooter-panne` (R, réparer un scooter), `telephone-casse` (I, « le téléphone mystère » : comprendre une panne), `affiche-evenement` (A), `enfants-voisine` (S, garder des enfants), `conflit-discord` (E, animer le serveur de l'équipe), `caisse-buvette` (C, tenir la caisse d'une association), `voisine-formulaire` (S, aider une voisine dans une démarche), `anniversaire-20-euros` (E). Les 6 profils RIASEC sont couverts ; le tirage d'une partie privilégie des profils différents.
- Les situations ne touchent **jamais** à la santé, à la famille (pas de « ta mère », « ton petit frère »… : utiliser voisin·e, pote, coach, club…), à la religion, à l'origine, à l'argent du foyer, à la police ou à la justice. Pas de permis de conduire.
- `competences` : **4 à 6 codes macro ROME existants** dans `public/data/rome.json` (vérifiés par script), cohérents avec ce qu'un jeune peut montrer en répondant (un mix de savoir-faire et de savoir-être `6D1xx`). Mots-clés en racines (pas d'infinitif).
- `competenceParticipation` : un code `6D1xx` (par défaut `6D102` « Avoir l'esprit d'équipe »), pour un joueur qui n'a rien répondu (l'animateur est passé), avec `typePreuve:"participation"`.
- `competenceParDefaut` : code pris dans `competences`, donné par le mock à une réponse sérieuse qui ne contient aucun mot-clé (voir §5).
- `competences[i].mots` : phrase « mots » au tutoiement, concrète et liée à la situation (« Tu as pensé à compter le stock pour vérifier les ventes. »).

### 4.2 Compétence attribuée (format commun)

```js
{ code, libelle /* ROME */, mots /* « Tu as proposé de … : c'est ce qu'on appelle « <libellé> ». » */, preuve /* la TRACE : citation EXACTE d'une réponse du joueur, ou le texte du choix */, typePreuve: "vecu"|"jeu"|"participation", riasec: [majeur, mineur?], horsScenario /* savoir-être pris hors de la liste de l'épisode */, problemeIndex, gardee: null|true|false }
```

Vocabulaire (critique psy point 2, adaptation `nouveau-vocabulaire-reperage-pas-validation`) : une compétence est **repérée**, jamais « validée » ni « certifiée » ; la citation est une **trace** (elle montre ce que le jeune a écrit, pas qu'il possède la compétence). Le nom de champ `preuve` est gardé dans le code pour la compatibilité.

Une compétence de départ (`typePreuve:"vecu"`, `problemeIndex:null`) porte en plus `departIndex` : sa position dans `depart.propositions`, identifiant stable pour `garder_competence`.

### 4.3 `public/data/metiers.json` + ESCO (owner B)

Chaque métier peut recevoir `esco: [{ uri, titre /* libellé FR officiel ESCO */, type /* exactMatch|closeMatch|narrowMatch|broadMatch */, competences: [libellés FR des compétences essentielles, max 8] }]` (au maximum 2 entrées, en préférant exact, puis close, puis narrow, puis broad). Sources : la correspondance officielle ESCO ↔ O*NET (`https://esco.ec.europa.eu/system/files/2023-08/ONET_%28Occupations%29_0_updated.csv`) et l'API ESCO (`https://ec.europa.eu/esco/api/resource/occupation?uri=…&language=fr`). Ajouter la mention de source ESCO (© Union européenne, licence CC BY 4.0 / réutilisation des données de la Commission) dans `source`.

## 5. MJ IA (`src/mj.js`, owner C)

```js
export function creerMJ({ apiKey, mode, rome, modele = "gpt-5-nano" }) → {
  choisir({ probleme, reponses /* mélangées, avec dejaRetenu */, obligatoires, graine, pseudos }) → Promise<{ joueurId, competence, departage? } | null>,
  attribuerPrivee({ probleme, reponses: [{ joueurId, texte }], pseudos }) → Promise<{ [joueurId]: competence | { reformulation: string|null } }>,
  lier({ precedent, suivant, idee, pseudos }) → Promise<string|null>,
  evaluer({ probleme, reponses }) → Promise<{ resolu: bool, synthese: string|null }>,   // ancienne tâche
  attribuer({ probleme, historique }) → Promise<{ [joueurId]: competence }>,             // ancienne tâche
}
export function mjMock({ rome }) → même interface, déterministe
```

**Règles communes à toutes les tâches** (prompt + contrôles serveur) :
- **Codes** : un code de la liste de l'épisode (`probleme.competences`) ; **si aucune ne correspond honnêtement**, un des 16 **savoir-être professionnels** du ROME (catégorie « Savoir-être professionnel » de `rome.json`, 6D101 à 6D116) ; jamais un autre code (rejet → MJ de secours). Un savoir-être pris hors de la liste porte `horsScenario:true` : la fiche l'affiche « repérée hors scénario, à discuter avec ton psy » (adaptation `referentiel-rome-liste-fermee`).
- **Phrase de la carte** (`mots`) : « `<action>` : c'est ce qu'on appelle « `<libellé ROME>` ». » (critique psy point 2, adaptation `phrase-mots-valorisante`). L'IA écrit l'action, « Tu as proposé de » + un verbe à l'infinitif (« Tu as proposé de prévenir le coach ») ; le serveur ajoute le libellé. Phrase d'action gardée seulement si `motsValides` (une phrase, au plus 160 caractères, « Tu … », sans pseudo ni mot interdit), qu'elle commence par « Tu as », sans **jugement sur la personne** (« tu es / t'es + adjectif », timide, anxieux, intelligent, émotif, doué…), sans **superlatif** (génial, incroyable, parfait…) ni **sujet sensible** (famille, religion, santé, origine…) (`motsActionValides`, filet de sécurité derrière le prompt : `contientJugement`, `contientSujetSensible` de `src/texte.js`, racines sans accents qui couvrent le genre et le nombre). Sinon, la **trace** : « Tu as proposé « `<citation, 12 mots au plus>` » : c'est ce qu'on appelle « … ». ». La phrase prévue de l'épisode (`competences[i].mots`) ne sert plus qu'en l'absence de citation : elle décrit le comportement en général et peut en dire plus que la réponse (pas de sur-promesse). Jamais « Tu as montré que tu sais ».
- **Règle 1 du prompt** (adaptation `aucune-deduction-sensible`) : aucune déduction sur la santé, l'origine, la nationalité, la langue maternelle, la situation familiale, la religion, les opinions politiques ou syndicales, la vie ou l'orientation sexuelle, la situation financière (RGPD art. 9) ; aucun jugement sur la personnalité, les émotions, l'intelligence ou l'état psychologique : ce que le joueur SAIT FAIRE, jamais ce qu'il EST (Code de déontologie des psychologues 2021, art. 13 et 21). Le prompt du récit (`src/analyse.js`) a la même règle, ne fixe plus de durée d'entretien (« c'est le psychologue qui en fixe la durée », adaptation `psy-mene-entretien`) et n'impose plus de minimum de compétences (adaptation `max-3-competences-depart`).

**Tâches du jeu en groupe** :
- `choisir` (l'idée du tour, publique) : un seul appel, réponses anonymes J1, J2… dans l'ordre du mélange de Fisher-Yates fait par `jeu.js`. Prompt : « Si au moins un joueur marqué « pas encore retenu » a écrit une vraie réponse, tu choisis OBLIGATOIREMENT parmi eux l'idée qui fait le mieux avancer l'histoire » (adaptation `rotation-joueurs-retenus`) et « La longueur d'une réponse n'est pas un critère : une idée courte et concrète vaut une idée longue » (adaptation `idee-du-tour`). **Contrôles** : joueur connu, joueur parmi `obligatoires` (sinon « rotation non respectée » → MJ de secours parmi eux ; `src/partie.js` le revérifie avec `respecterRotation`), code autorisé, pas de remplissage, citation exacte d'au moins 3 mots.
- `attribuerPrivee` (compétence privée de chaque AUTRE réponse ; décision de Pierre §1, critique point 3) : **un appel par joueur** (jamais la réponse d'un autre dans le prompt), tâche « reperer » : l'IA dit d'abord si la réponse contient une **action précise et citable** (`action`). Oui → une compétence (code autorisé, citation exacte d'au moins 3 mots, phrase d'action contrôlée ; sortie hors contrat → MJ de secours pour ce joueur). Non → `{ reformulation }` : « Ton idée : … », une phrase de 160 caractères au plus, sans pseudo, sans mot interdit, sans jugement ni sujet sensible (`reformulationValide`), sinon `null` (le téléphone montre sa réponse). Réponse vide → `{ reformulation: null }` sans appel.
- `lier` (phrase de liaison vers l'épisode suivant, adaptation `histoire-tournoi-du-quartier`) : une phrase de 20 mots et 160 caractères au plus, qui reprend l'idée retenue sans pseudo, sans « bravo » / « bonne idée » / jugement, sans sujet sensible (`liaisonValide`) ; sinon `null` → transition fixe (`transitionFixe` de `src/texte.js` : champ `transition` de l'épisode, sinon « L'histoire continue. »). Ne lève jamais d'erreur.
- **MJ de secours** (mock) — il ne mesure pas la qualité : il vérifie qu'une réponse est sérieuse et en lien avec le sujet, puis privilégie qui n'a pas encore été retenu (adaptation `mj-de-secours`). `choisir` : vraies réponses d'abord (pas de remplissage), parmi les `obligatoires` s'il y en a, score = min(mots-clés du sujet, 2) + 1 si sérieuse + 3 si pas encore retenu (`scoreSecours` : la longueur ne rapporte plus rien au-delà de 2 mots-clés). **Ex aequo : tirage au hasard enregistré** (`departage: { exAequo /* triés */, graine, tire }`, rangé par `jeu.js` dans `tirages[i].departage`) ; graine fournie par le DO (code et graine de la partie, épisode, essai), sinon tirée des réponses ex aequo : même entrée, même tirage (tests). `attribuerPrivee` : une compétence seulement si un **mot-clé d'une compétence de l'épisode** apparaît dans une proposition citable (3 mots au moins, ou la réponse entière) ; sinon `{ reformulation: null }` — jamais la compétence « générique » ni la participation. `lier` : `null` (transition fixe).

- **IA (OpenAI)** : `appelerJSON` de `src/openai.js`, soit `POST /v1/chat/completions` avec `reasoning_effort:"low"`, `response_format:{ type:"json_schema", json_schema:{ name, strict:true, schema } }`, `max_completion_tokens: 8000`, le prompt système en message `developer` (mis en cache automatiquement par OpenAI). Un refus (`message.refusal`) ou une réponse tronquée (`finish_reason:"length"`) est une erreur. Timeout de 25 s ; en cas d'erreur ou de timeout, **basculer sur le mock** pour cet appel (le jeu ne doit jamais bloquer).
- `evaluer` : `resolu = true` si **au moins une** réponse remplit les `criteres` du problème. La `synthese` (si résolu) est formulée **collectivement** (« Bonne idée de l'équipe : … »), **sans nommer ni citer personne**, en 1 à 2 phrases. Le prompt interdit de juger une réponse comme fausse. **Contrôle serveur** (injection de prompt) : la synthèse est gardée seulement si elle commence par « Bonne idée de l'équipe », fait au plus 300 caractères, ne contient ni mot interdit, ni pseudo de la partie (`evaluer({ …, pseudos })`, les pseudos ne sont jamais envoyés à l'IA), ni 5 mots consécutifs repris d'une réponse ; sinon `solution.resume`.
- `attribuer` : **une** compétence par joueur, avec un code **obligatoirement** dans `probleme.competences` ou parmi les savoir-être (sinon on rejette et on utilise le mock pour ce joueur). `preuve` = citation **exacte** d'une des réponses du joueur, vérifiée avec la même normalisation que `src/analyse.js` (casse, apostrophes, espaces). Si le joueur n'a que des choix (pas de texte), preuve = texte du choix, `typePreuve:"jeu"`. Réponse vide ou hors sujet → `competenceParticipation`, `typePreuve:"participation"`, et `preuve` = « A participé à la discussion de groupe ». `mots` : au tutoiement, valorisant, sans jargon, **jamais** « même si tu t'es trompé ». **Un appel à l'IA par joueur** (en parallèle) : la réponse d'un joueur n'est jamais dans le prompt d'un autre. **Contrôles serveur** : `mots` gardés seulement si une seule phrase, au plus 160 caractères, commençant par « Tu », sans pseudo ni mot interdit, et pour une compétence la phrase d'action doit passer `motsActionValides` (sinon la trace, voir « Phrase de la carte ») ; citation d'au moins 3 mots sauf si c'est la réponse entière (sinon mock pour ce joueur) ; `participation:true` refusé pour une réponse sérieuse ou un choix (mock pour ce joueur) ; joueur qui n'a écrit que du **remplissage** (voir Mock) : la citation n'est jamais acceptée → mock pour ce joueur (même priorité : compétence de son choix, sinon participation). Une réponse sérieuse, même courte ou différente de la solution, n'est jamais « hors sujet ». Le libellé ROME est affiché avec ses accents rétablis (« Être », « Élaborer », « œuvre »).
- **Mock** : `evaluer` → résolu si une réponse contient au moins 2 `solution.motsCles` (normalisés : minuscules, sans accents) ; synthèse = `solution.resume`. `attribuer` → d'abord, une réponse de **remplissage ou d'hésitation** (normalisée : une fois retirés « je sais pas », « sais pas », « jsp », « aucune idée », « je vois pas », « on attend », « rien », « bof », « euh », « ? »…, il reste moins de 3 mots porteurs de sens et aucun mot-clé du problème ; ex. « je sais pas trop, on attend de voir ») n'est **jamais citée** : elle compte comme « pas de texte » (choix, sinon participation). Sinon, pour chaque joueur, la compétence du problème dont le plus de `motsCles` apparaissent dans ses réponses (en cas d'égalité, la première de la liste) ; à défaut de mot-clé, s'il a fait un choix qui a une `competence`, **celle du choix** (preuve = texte du choix) ; sinon, si la réponse est **sérieuse** (au moins 3 mots porteurs de sens) ou contient un mot de la solution, la compétence **la plus générique** : `competenceParDefaut`, sinon `6D103` (« Être force de proposition ») si présente, sinon le premier `6D1xx` de la liste, sinon le premier code. **Preuve tirée d'une réponse** = la **proposition** (découpée sur `. ! ? ; , :` puis, si elle dépasse 20 mots, sur « et » / « puis ») qui contient le plus de mots-clés de la compétence (sans mot-clé : la plus riche en mots porteurs de sens), sous-chaîne **exacte**, de 3 à 20 mots (moins seulement si la réponse entière est plus courte), conjonction de tête retirée (« et ce soir… » → « ce soir… ») ; trop longue → fenêtre de 20 mots autour du mot-clé ; elle ne finit **jamais** sur un article, une préposition ou un pronom seul (« les », « de », « pour », « d'un »…) : on la raccourcit avant. L'analyse mock du récit (`src/analyse.js`) cite de la même façon (3 à 25 mots). Que des choix : `choix[i].competence` si présent ; sinon le bon choix → ses mots-clés ; un autre choix → `competenceParticipation` avec `typePreuve:"jeu"`, preuve = texte du choix. Sinon (rien, remplissage, hors sujet) participation. Si le mock échoue pour un joueur, ce joueur reçoit la participation : personne n'est jamais sans compétence.
- Aucune déduction sensible : voir la règle 1 ci-dessus (même règle dans `src/analyse.js`, règle 3).
- **Anciennes tâches** (`evaluer`, `attribuer`) : gardées pour l'outil et les tests ; `attribuer` sert encore au MJ de secours pour la compétence de l'idée du tour (une réponse sérieuse sans mot-clé y reçoit la compétence générique : l'idée a été choisie, la compétence suit). Leurs `mots` suivent la règle de la phrase de la carte ci-dessus.

## 6. Front (owners E et F)

- HTML/CSS/JS vanilla, modules ES, **aucun framework, aucun build**. Bibliothèques externes autorisées **uniquement** via `https://cdnjs.cloudflare.com` ou `https://cdn.jsdelivr.net/npm/` avec une **version exacte** (ex. QR code : `qrcode-generator@1.4.4`).
- **Écran commun** (`ecran.html`) : pensé pour un projecteur, en **grand** (titres ≥ 48 px), lisible de loin. Il montre :
  - l'illustration, la situation, la question, un **minuteur visuel** (cercle ou barre) et des boutons animateur discrets en bas (« Suivant », « Fin du temps ») ;
  - un bouton 🔊 qui relit la situation avec `speechSynthesis`, en voix française ;
  - à l'accueil : le QR code vers `/p/<code>`, le code en très grand et la liste des avatars et pseudos qui arrivent ;
  - pendant la réponse : « 3/4 ont répondu » **sans noms**.
- **Téléphone** (`joueur.html`, servi aussi sur `/p/<code>`) : mobile d'abord (largeur de 360 px), gros boutons, dictée vocale si le navigateur la permet (`webkitSpeechRecognition`, reprise de `outil.js`), reconnexion automatique (backoff) et reprise grâce au `joueurId` en `localStorage`. Écrans selon la phase : rejoindre, création (récit puis cartes « C'est moi / Pas moi » ; tant qu'une carte n'est pas tranchée, le bouton Valider dit « Encore 1 carte à choisir » / « Encore N cartes à choisir »), « Regarde l'écran » pendant présentation et échange (avec le minuteur), saisie de la réponse, attente, 4 choix, compétence gagnée (carte colorée RIASEC + preuve + « Je la garde / Pas moi »), fin (sa fiche + liens).
- **Fiche** (`fiche.html?code=…&joueur=…`, rendu par `fiche.js`) : imprimable en A4 (`@media print`), 4 à 5 pages. Données : `GET /api/parties/:code/fiche/:joueurId` (compétences, `problemes[i].riasec` et `questionVecu`, `passes`, `preferences`, `debrief`). Sur le modèle du Rapport des Possibles (guide pratique et rapports du Centre), au tutoiement, en complément du rapport :
  - **Vocabulaire** : compétences **repérées**, **trace** = les propres mots du jeune (elle montre ce qu'il a écrit, pas qu'il possède la compétence) ; jamais « validé », « certifié », « mesure », « preuve » (critique psy points 2 et 4, adaptation `nouveau-vocabulaire-reperage-pas-validation`). Pied : « Ces compétences ont été repérées pendant un jeu, à partir de tes mots. Elles ne sont pas un diplôme : parles-en avec ton psy. »
  - **1. Tes compétences repérées** : récit de départ, puis compétences du jeu. Chaque ligne reprend la phrase de la carte « Tu as proposé de … : c'est ce qu'on appelle « libellé » » sans répéter le libellé, la trace (« Ta trace : « … » »), « ton idée a fait avancer l'histoire » pour l'idée du tour, « (repérée hors scénario, à discuter avec ton psy) » pour un savoir-être hors liste, et, une fois par épisode, « Question pour ton entretien : `questionVecu` » (adaptation `nouveau-question-vecu` : relire des réussites passées, critique psy point 1). Aucune compétence de jeu : « Tes réponses dans l'histoire sont à relire avec le psy. »
  - **Notice « Pour le psychologue — Comment lire cette fiche »** sous la partie 1 (adaptation `nouveau-notice-psy`) : IA, liste fermée ROME 4.0, citation exacte comme trace, ni test psychométrique ni évaluation psychologique, le jeune garde ou refuse chaque compétence et apporte la fiche s'il le souhaite (critique point 19), repères RIASEC qualitatifs qui ne remplacent pas l'IPH (en cas d'écart, l'IPH fait référence : critique point 6), métiers indicatifs.
  - **2. Les types d'activités où tu as montré des compétences pendant le jeu** (`blocInteretsOrdonnes`, adaptation `interets-classes-par-ordre`) : ce n'est pas un profil d'intérêts. Texte : « Ce n'est pas ton profil d'intérêts : celui-là est dans ton Rapport des Possibles. Si les deux diffèrent, c'est une bonne question pour ton entretien. » Chaque type est décrit par ses activités (`RIASEC[k].activites`, jamais « tu aimes »), avec « Compétences montrées : … ». « Types d'activités explorés dans cette partie : X sur 6 » ; les types joués sans compétence sont « pas apparus, ce qui ne veut pas dire absents », les types non joués ne sont pas classés (adaptation `defaut-3-episodes-couverture-riasec`). **Type RIASEC = celui de l'épisode** (`problemes[i].riasec`) : l'origine des codes RIASEC des colonnes U/V de la feuille « REF - Macro » du ROME n'a pas pu être vérifiée (critique psy point 8, adaptation `riasec-depuis-le-rome`). La partie 2 et les métiers ne comptent donc que les compétences repérées en jeu (ni le récit, ni la participation, ni un savoir-être hors scénario). La fiche du téléphone, qui ne reçoit pas les épisodes, garde pour l'instant les codes du ROME. Sous la partie 2 : « Ce jour-là, ces situations t'ont plu : … » (`preferences` oui / un peu, sans score).
  - **3. Des métiers à explorer, par zone (indicatif)** (`metiersParZone`, 2 métiers au plus par zone, une phrase chacun, lien orientation-regionsud.fr) : la proximité trie mais n'est jamais affichée, ni en chiffre ni en étiquette (« très proche / proche » retirées : critique psy point 4). Les seuils de Lewis et Morris (0,426 / 0,729) ne sont pas repris : ils ont été établis pour l'O*NET Interest Profiler, pas pour un profil tiré de 3 à 6 compétences (critique point 5) ; les seuils de `metiers-proches.js` sont des choix de conception. Si la partie a exploré moins de 6 types : « des métiers d'autres types peuvent aussi te correspondre ». Zones : durées du Rapport des Possibles et niveau du guide du Centre p. 10 (« Durées : Rapport des Possibles ; niveaux : guide du Centre », adaptation `fiche-finale-modele-rapport`). « 2 pistes par zone » : choix de conception (Chernev 2015 ; Scheibehenne 2010 en nuance, critique point 9).
  - **4. Mes prochains pas (à écrire à la main)** (adaptation `nouveau-plan-exploration-ecrit`) : « Ce que je vais chercher à l'Agora » (2 lignes « Métier ou mot-clé »), « Avec qui j'en parle ensuite », « en complément des recommandations de ton psychologue ». Rien n'est saisi dans l'application.
  - **Encart « Pour le psy ou le conseiller »** (adaptations `complement-rapport-des-possibles`, `encart-psy-questions`) : à utiliser quand le psychologue relie les résultats à la situation, aux valeurs et aux ressources du jeune (guide p. 11), tâche d'évocation de l'entretien motivationnel ; « A préféré passer à l'épisode X : à explorer en entretien » (`passes`, jamais montré au groupe ni sur le téléphone) ; avis par épisode ; réponse au débrief (« À reprendre avec le psychologue ») ; **amorces de reflet** (2 au plus) et **relances ouvertes** (4 au plus : récit, valeurs, focalisation, type d'activités dominant), « Des pistes, pas un questionnaire à dérouler » ; « Qu'as-tu écrit dans “Un premier pas” sur ta fiche papier ? ». Aucune durée d'entretien (adaptation `psy-mene-entretien`). Plafonds 2 et 4 : choix de conception.
  - **Ligne fixe vers un adulte** en pied de la fiche imprimable (adaptation `nouveau-relais-psychologue-fin-de-partie`) : « Si quelque chose te pèse, parles-en au psychologue ou au conseiller du Centre : il est là pour ça. » Aucun repérage par l'IA. Le téléphone l'affiche sous la fiche (`psy:false` retire la notice, l'encart, le plan d'action et cette ligne de la fiche du téléphone).
- **Fiche papier** (`fiche-papier.html`) : gabarit A4 vierge, une page, à imprimer avant la partie : nom, prénom (sur papier seulement, rien n'est saisi), date, avatar à dessiner, sous-titre « Écris avec tes mots : un mot-clé suffit. C'est toi qui décides de ce que tu gardes. » (adaptation `ecrire-sa-competence-a-la-main` : le geste d'écrire sert l'appropriation), « Ce que je sais déjà faire », 6 cases « Compétence repérée », puis **« Et maintenant ? »** à remplir à la main : « Ce qui m'a surpris sur moi », « Une piste qui me tente », « Un premier pas pour l'explorer (une personne à qui parler, un site, un stage…) » (adaptation `nouveau-mes-pistes-et-premier-pas`), pied « pas un diplôme » et ligne vers un adulte. Plus de légende RIASEC.
- **Outil solo** (`outil.html`) : 4 propositions au plus à la fois, les suivantes après décision, aucun minimum (adaptation `max-3-competences-depart`, `cartesVisibles` dans `joueur-outils.js`) ; « gardée par le jeune », « Trace — ses mots », pas de durée d'entretien ; l'origine non vérifiée des codes RIASEC du ROME y est dite (`INTRO_RIASEC_ROME`).
- Couleurs RIASEC (à reprendre partout) : R `#c8743a`, I `#3a7bc8`, A `#a24fc0`, S `#2e9b6a`, E `#d8a019`, C `#5f6b85`.
- Accessibilité : contrastes AA, `aria-live` pour les changements de phase, mode sombre (`prefers-color-scheme`).

## 7. Tests et critères d'acceptation du MVP

- `npm test` (= `node --test "test/**/*.test.js"` ; `node --test test/` échoue sous Node 22, qui lit `test/` comme un fichier) passe : jeu.js (toutes les transitions, les deux branches résolu / pas résolu, une compétence par joueur et par problème, aucune fuite de réponse dans la vue écran ni dans la vue d'un autre joueur), mj.js (mock, validation des codes et des citations, bascule sur le mock), problemes.json (schéma, codes ROME existants, exactement 1 choix correct, illustrations existantes, aucun mot interdit), metiers/esco (intégrité).
- `npm run simulate` : contre `wrangler dev` (MJ mock), crée une partie, connecte 1 écran et 3 joueurs en WebSocket, joue une partie complète de 2 problèmes (un résolu, un non résolu), et vérifie que chaque joueur a 2 compétences de jeu et que l'écran n'a jamais reçu de texte de réponse.
- `npx wrangler deploy --dry-run` réussit (le bundle compile).
- Parcours manuel dans le navigateur : écran + 2 onglets « téléphone » jusqu'à la fin, fiche imprimable.
