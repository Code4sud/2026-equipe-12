# SPEC — « Déclic » : le jeu de rôle des compétences (MVP)

Document de référence pour tout le développement. **Si le code et cette spec divergent, c'est la spec qui fait foi** (sauf bug évident de la spec : le signaler).

## 0. Contexte

Hackathon Code4Sud (Nice, 18-20 nov. 2026), sujet 4 « détecteur du potentiel caché ». Public : jeunes de 15 à 25 ans, souvent en décrochage, qui pensent « ne rien savoir faire ». Lieu : le Centre des Possibles, avec un psychologue du travail ou un conseiller qui anime.

Règles du hackathon à respecter **partout** :
- **pas de score, pas de classement, pas de verdict** ;
- l'humain décide : l'outil éclaire, il ne remplace pas le psy ;
- **aucune donnée personnelle réelle** : pseudos, rien n'est stocké après la partie, données de test inventées ;
- **aucune déduction** sur la santé, l'origine, la famille, la religion ;
- le jeune **valide** ce qui est retenu sur lui.

Toute l'interface est **en français**, au **tutoiement** pour le jeune, avec des phrases courtes et simples.

## 1. Le jeu (règles validées par l'équipe)

Une partie = 2 à 6 joueurs autour d'une table + un **écran commun** (PC ou projecteur), piloté par l'animateur. Chaque joueur utilise **son téléphone** (QR code, aucune installation). Chacun a aussi une **fiche personnage papier** où il recopie ses compétences et colle des gommettes de couleur.

1. **Accueil** : l'animateur crée la partie sur l'écran commun, qui affiche un QR code et un code à 4 lettres. Les joueurs rejoignent la partie avec un pseudo et un avatar (emoji).
2. **Création du personnage** : chaque joueur écrit sur son téléphone 1 ou 2 choses qu'il a déjà faites dans la vraie vie. L'IA en tire **au maximum 3 compétences de départ** (avec les mêmes règles que l'outil existant : liste ROME fermée, citation exacte). Le joueur garde ou retire chacune (« C'est moi / Pas moi »).
3. **Problèmes** : par défaut 3 problèmes par partie, tirés de `public/data/problemes.json`. Pour chaque problème :
   1. **Présentation** : l'écran commun affiche l'illustration et la situation, et le MJ la lit à voix haute (synthèse vocale du navigateur).
   2. **Phase d'échange** (minuteur, 120 s par défaut) : les joueurs **discutent à voix haute** entre eux. Rien n'est saisi.
   3. **Réponse** (minuteur, 90 s par défaut) : chacun écrit **sa** réponse sur son téléphone. **Elle est privée** : seul son auteur la voit (et le MJ IA la lit). L'écran commun affiche seulement qui a répondu, jamais quoi. **Il n'y a ni bonne ni mauvaise réponse.** Seules deux réponses sont refusées, **au joueur concerné seulement** (les autres ne voient rien et ne sont jamais relancés) : « je ne sais pas » (rien d'autre que de l'hésitation, ou vide) et la violence ; il reçoit un message bienveillant et réécrit (« Toutes les idées comptent ! … », « Ici, on cherche une solution sans violence… »). On boucle ainsi jusqu'à ce que tout le monde ait donné une vraie réponse ; l'animateur peut passer sans attendre (un absent a une réponse vide).
   4. **Compétences** : dès que tout le monde a répondu, **chaque joueur reçoit UNE compétence** (une seule par problème). L'IA la tire de **sa** réponse. Pas d'évaluation « résolu / pas résolu », pas d'indice, pas de choix parmi 4 propositions (décision du 19/11/2026). Le joueur la voit sur son téléphone, avec sa phrase comme preuve, et choisit « Je la garde / Pas moi ». S'il la garde, il la recopie sur sa fiche papier avec la gommette de la couleur RIASEC.
4. **Fin** : chaque joueur voit **sa fiche** sur son téléphone : compétences de départ et compétences gagnées en jeu, avec leurs preuves, ses repères RIASEC, des métiers à découvrir (O*NET + ESCO), un lien pour imprimer sa fiche et la fiche pour le psy. L'écran commun affiche un message de fin **collectif**, sans aucune comparaison entre joueurs.

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
| POST | `/api/parties` | crée une partie. Corps optionnel `{ nbProblemes?: 1..6, dureeEchange?: s, dureeReponse?: s }`. Génère un code de 4 lettres majuscules sans voyelle ambiguë (alphabet `BCDFGHJKLMNPQRSTVWXZ`), initialise le DO `getByName(code)`, et renvoie `{ code, cleEcran }` (voir « Accès animateur » ci-dessous) |
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

Tout message invalide ou hors phase → `{ t:"erreur", message }` en français, sans changer l'état.

## 3. Machine à états (`src/jeu.js`, PURE)

`src/jeu.js` **n'a aucune I/O** : pas de `fetch`, pas d'horloge système (le temps `maintenant` est passé en paramètre), pas d'aléatoire non injecté. API :

```js
export function creerEtat({ code, problemes, nbProblemes = 3, dureeEchange = 120, dureeReponse = 90, graine }) → etat
export function appliquer(etat, evenement, maintenant) → { etat, effets }
export function vue(etat, role, joueurId) → objet sérialisable (vue filtrée)
export function effetsIAEnAttente(etat) → [effets IA que l'état attend encore] (chien de garde du DO)
export const AVATARS = ["🦊","🐼","🦁","🐸","🐙","🦉","🐢","🐝","🦄","🐧","🐯","🐨"]
```

- `evenement` = un message client enrichi `{ ...msg, role, joueurId }` **ou** un événement interne :
  - `{ t:"minuteur_fini" }` : l'alarme du minuteur. Elle **ne fait jamais avancer la partie** : elle met `tempsEcoule:true` (une seule fois). On attend que tout le monde ait répondu (`reponse`, `choix`), ou l'animateur (`fin_minuteur` / `suivant`)
  - `{ t:"analyse_faite", joueurId, competences }` (création du personnage ; accepté aussi **après** `creation` si le joueur était encore en `analyse` quand l'animateur a clos la création : ses propositions deviennent alors directement des compétences de départ en attente)
  - `{ t:"attribution_faite", problemeIndex, competences: { [joueurId]: competence } }`
  - `{ t:"erreur_ia", tourId|joueurId }` → dernier recours quand l'IA **et** le mock échouent : récit → 0 proposition (le joueur peut valider ; après `creation` : `depart.etat:"valide"`, 0 compétence de départ) ; évaluation → `indice` ; attribution → chaque joueur reçoit la compétence de participation (jamais sans compétence)
- `effets` = une liste d'actions que le DO exécute **après** avoir persisté le nouvel état :
  - `{ type:"minuteur", fin: <epoch ms> }` (programme l'alarme) / `{ type:"annuler_minuteur" }`
  - `{ type:"analyser_recit", joueurId, texte }`
  - `{ type:"evaluer", tourId, probleme, reponses:[{ joueurId, texte }], secours? }`
  - `{ type:"attribuer", problemeIndex, probleme, historique: { [joueurId]: { reponses:[texte…], choix: index|null } }, secours? }`
  - `{ type:"nettoyer", fin }` (supprime la partie une heure après la fin)
  - `secours: true` = calculer directement avec le MJ mock (relance par l'écran ou par le chien de garde).
- **Chien de garde IA (DO)** : `effetsIAEnAttente` liste aussi `analyser_recit` pour un joueur resté en `analyse` **après** la création (création close par l'animateur). Pour chaque effet IA, le DO persiste une échéance (`gardesIA`, 45 s) **avant** l'appel et programme l'alarme au plus tard à cette échéance. Si l'appel est perdu (redémarrage du DO, rechargement de `wrangler dev`, déploiement), l'alarme reconstruit l'effet avec `effetsIAEnAttente(etat)` et le relance avec le mock. Un résultat en double est refusé par les gardes de `tourId`, de `problemeIndex` et d'attribution déjà présente.
- Le tirage des problèmes est **déterministe à partir de `graine`** (le DO passe une graine aléatoire). Les problèmes tirés couvrent des types RIASEC dominants différents quand c'est possible.

### 3.1 Phases

```
accueil → creation → [ presentation → echange → reponse → competences ] × nbProblemes → fin
```

| Phase | Entrée | Sortie |
|---|---|---|
| `accueil` | création | écran `demarrer` (≥ 1 joueur) |
| `creation` | | dès que **tous** les joueurs ont validé leurs compétences de départ, **ou** écran `suivant`. Dans ce cas, un joueur dont l'analyse est prête (`a_valider`) mais qui n'a pas validé ne perd rien : ses propositions deviennent des compétences de départ **en attente** (`problemeIndex:null`, `gardee:null`, `departIndex`), `depart.etat:"valide"` ; il les garde ou les retire plus tard (`garder_competence` avec `departIndex`, listées dans `moi.competencesEnAttente`). Un joueur encore en `analyse` : son `analyse_faite` est accepté hors `creation` et donne de même des compétences en attente. Un joueur qui n'a rien écrit n'a aucune compétence de départ |
| `presentation` | chaque joueur valide « J'ai lu » | **tous** ont lu, **ou** écran `suivant` |
| `echange` | minuteur `dureeEchange` | écran `fin_minuteur`/`suivant` (à 0, `tempsEcoule` : on attend l'animateur) |
| `reponse` | minuteur `dureeReponse` | tous ont donné une vraie réponse, **ou** écran `fin_minuteur`/`suivant` → effet `attribuer`, phase `competences` (les absents : réponse vide). À 0, `tempsEcoule` : les joueurs peuvent encore répondre |
| `competences` | « Le MJ prépare vos compétences… » puis affichage | `attribution_faite` → chaque joueur voit sa compétence ; quand **tous** ont répondu `garder_competence`, **ou** écran `suivant` → problème suivant (`presentation`) ou `fin`. Avant l'attribution, écran `suivant` = relance avec le MJ de secours. Une compétence restée sans réponse reste modifiable ensuite (`garder_competence` avec `problemeIndex`) |
| `fin` | effet `nettoyer` | — |

Un joueur qui rejoint après `accueil` est refusé (« La partie a déjà commencé ») **sauf reconnexion** avec un `joueurId` connu. Un joueur déconnecté reste dans la partie : s'il ne répond pas, sa réponse est vide.

### 3.2 État (indicatif, sérialisable en JSON)

```js
{
  code, phase, creeA, graine,
  reglages: { nbProblemes, dureeEchange, dureeReponse },
  problemes: [ids tirés], problemeIndex, tour /*1|2*/, tourId /*string unique*/,
  minuteurFin: epoch|null, minuteurDebut: epoch|null,
  joueurs: { [id]: { id, pseudo, avatar, connecte, recit, depart:{ etat:"attente"|"analyse"|"a_valider"|"valide", propositions:[…], gardees:[…] },
                     reponses: { [problemeIndex]: { tour1: texte|null, lu: bool } },
                     competences: [ { problemeIndex|null, departIndex? /* compétences de départ */, code, libelle, mots, preuve, typePreuve:"vecu"|"jeu"|"participation", riasec, gardee: bool|null } ] } },
  attribution: { [id]: competence } | null,
}
```

### 3.3 Vues (`vue(etat, role, joueurId)`)

- **écran** : `{ code, phase, problemeIndex, nbProblemes, probleme:{ id,titre,situation,question,illustration } | null, minuteurFin, minuteurDebut, minuteurDuree, joueurs:[{ pseudo, avatar, connecte, aFini }]` (`aFini` : ce joueur a-t-il lu / validé / répondu / choisi / gardé sa compétence dans la phase en cours, `null` si la phase n'attend rien des joueurs ; décision de Pierre du 19/11/2026 : l'animateur doit voir **qui** il attend, jamais **ce que** le joueur a répondu), `compte:{ repondu, total }` (rempli en `creation`, `presentation`, `reponse`, `indice`, `choix` et `competences`), `tempsEcoule` (minuteur à 0, la partie attend), `reglages`, `attenteIA` (le MJ travaille), `evaluation:{ resolu, synthese|null }` (pendant `solution`), `indice` (pendant `indice` et après), `choix:[textes]` (pendant `choix`, **sans** dire lequel est correct), `solution` (pendant `solution`), `fin:{ nbCompetencesTotal }` }. **Jamais** le texte d'une réponse, jamais quel joueur a trouvé, jamais les compétences d'un joueur nommé.
- **joueur** : `{ code, phase, moi:{ id, pseudo, avatar, depart, aLu, maReponse, competenceDuProbleme, competencesEnAttente, competences }, probleme…, minuteurFin, minuteurDebut, minuteurDuree, tempsEcoule, compte, indice, choix, solution, fin:{ lienFiche } }` : uniquement **ses** données à lui.
  - `competencesEnAttente` : ses compétences encore sans réponse (`gardee:null`), **hors** `competenceDuProbleme` (déjà affichée) : compétences de jeu (chacune porte son `problemeIndex`, à renvoyer dans `garder_competence`) et compétences de départ mises en attente quand l'animateur a clos la création (`problemeIndex:null` + `departIndex`, à renvoyer dans `garder_competence`), celles de départ en premier. Le téléphone les propose avec le même bloc « Cette compétence t'attend » (« Je la garde / Pas moi ») à tout moment, y compris en phase `fin`. La fiche (`fiche.js`) ne montre une compétence qu'une fois gardée (`gardee:true`).
- **Minuteur (les deux vues)** : `minuteurFin` (epoch ms du serveur), `minuteurDebut` (epoch ms du serveur) et `minuteurDuree` (ms, = `minuteurFin - minuteurDebut`), tous `null` hors `echange`/`reponse`/`echange2`/`choix`. Le client calcule `total = minuteurDuree` et `reste = minuteurFin - (Date.now() + decalage)` avec le `decalage` du dernier `{ t:"etat", serveur }` (§2.3) : le cercle reste juste après un rechargement de la page et ne dépend pas de l'horloge du téléphone.

## 4. Données

### 4.1 `public/data/problemes.json` (owner A)

```json
{
  "version": 1,
  "problemes": [
    {
      "id": "telephone-casse",
      "titre": "Téléphone cassé",
      "illustration": "illustrations/telephone-casse.svg",
      "situation": "2 à 4 phrases, au présent, à la 2e personne du pluriel (« Vous… »), situation de la vie de jeunes de 15-25 ans",
      "question": "Que faites-vous ?",
      "riasec": "C",
      "solution": {
        "resume": "1 à 2 phrases : une bonne façon de s'en sortir",
        "criteres": ["ce qu'une réponse doit contenir pour être considérée comme résolvant le problème (pour le MJ IA)", "…"],
        "motsCles": ["mots/racines en minuscules sans accents pour le MJ mock", "…"]
      },
      "indices": ["indice 1 : léger", "indice 2 : plus précis"],
      "choix": [
        { "texte": "proposition plausible", "correct": false },
        { "texte": "la bonne", "correct": true },
        { "texte": "…", "correct": false },
        { "texte": "…", "correct": false }
      ],
      "competences": [
        { "code": "<code macro ROME existant dans rome.json>", "pourquoi": "comportement observable dans une réponse qui justifie cette compétence", "motsCles": ["…"] }
      ],
      "competenceParticipation": "6D102",
      "questionVecu": "Ça t'est déjà arrivé de … ?"
    }
  ]
}
```

Contraintes :
- **6 problèmes**, ids **fixés** : `telephone-casse` (C/R), `anniversaire-20-euros` (E/C), `conflit-discord` (S/E), `scooter-panne` (R/I), `voisine-formulaire` (S/C), `affiche-evenement` (A/E).
- Les situations ne touchent **jamais** à la santé, à la famille (pas de « ta mère », etc. : utiliser voisin·e, pote, coach, club…), à la religion, à l'origine, à l'argent du foyer, à la police ou à la justice. Pas de permis de conduire (beaucoup ont moins de 18 ans).
- Les **4 choix** contiennent exactement **1 correct**, et les 3 autres sont **plausibles et respectables** : aucun choix ridicule ou dangereux qui ferait honte. La bonne réponse ne doit pas être toujours à la même position.
- `competences` : **4 à 6 codes macro ROME existants** dans `public/data/rome.json` (vérifiés par script), cohérents avec ce qu'un jeune peut montrer en répondant (un mix de savoir-faire et de savoir-être `6D1xx`). Ils doivent permettre de donner une compétence pertinente à **n'importe quelle** réponse sérieuse, même à côté : demander de l'aide, sécuriser, s'organiser, chercher une info, rester calme…
- `competenceParticipation` : un code `6D1xx` (par défaut `6D102` « Avoir l'esprit d'équipe »), utilisé pour une réponse vide ou hors sujet, avec `typePreuve:"participation"`.
- Champs **optionnels** lus par le MJ (`src/mj.js`) :
  - `competenceParDefaut` : code pris dans `competences`, donné par le mock à une réponse sérieuse qui ne contient aucun mot-clé (voir §5) ;
  - `choix[i].competence` : code pris dans `competences`, la compétence que **ce choix** montre vraiment (le mock la donne au joueur qui n'a que choisi ; elle est suggérée à l'IA). Sans ce champ, un choix non retenu ne reçoit jamais une compétence tirée de ses mots-clés (elle risquerait de le contredire) ;
  - `competences[i].mots` : phrase « mots » au tutoiement, concrète et liée au problème (« Tu as pensé à comparer avant de payer. »), utilisée à la place de « Tu as montré que tu sais <libellé ROME> » par le mock et quand les « mots » de l'IA sont rejetés.

### 4.2 Compétence attribuée (format commun)

```js
{ code, libelle /* ROME */, mots /* phrase au tutoiement : « Tu as pensé à … » */, preuve /* citation EXACTE d'une réponse du joueur, ou le texte du choix */, typePreuve: "vecu"|"jeu"|"participation", riasec: [majeur, mineur?], problemeIndex, gardee: null|true|false }
```

Une compétence de départ (`typePreuve:"vecu"`, `problemeIndex:null`) porte en plus `departIndex` : sa position dans `depart.propositions`, identifiant stable pour `garder_competence`.

### 4.3 `public/data/metiers.json` + ESCO (owner B)

Chaque métier peut recevoir `esco: [{ uri, titre /* libellé FR officiel ESCO */, type /* exactMatch|closeMatch|narrowMatch|broadMatch */, competences: [libellés FR des compétences essentielles, max 8] }]` (au maximum 2 entrées, en préférant exact, puis close, puis narrow, puis broad). Sources : la correspondance officielle ESCO ↔ O*NET (`https://esco.ec.europa.eu/system/files/2023-08/ONET_%28Occupations%29_0_updated.csv`) et l'API ESCO (`https://ec.europa.eu/esco/api/resource/occupation?uri=…&language=fr`). Ajouter la mention de source ESCO (© Union européenne, licence CC BY 4.0 / réutilisation des données de la Commission) dans `source`.

## 5. MJ IA (`src/mj.js`, owner C)

```js
export function creerMJ({ apiKey, mode, rome, modele = "gpt-5-nano" }) → {
  evaluer({ probleme, reponses }) → Promise<{ resolu: bool, synthese: string|null }>,
  attribuer({ probleme, historique }) → Promise<{ [joueurId]: competence }>,
}
export function mjMock({ rome }) → même interface, déterministe
```

- **IA (OpenAI)** : `appelerJSON` de `src/openai.js`, soit `POST /v1/chat/completions` avec `reasoning_effort:"low"`, `response_format:{ type:"json_schema", json_schema:{ name, strict:true, schema } }`, `max_completion_tokens: 8000`, le prompt système en message `developer` (mis en cache automatiquement par OpenAI). Un refus (`message.refusal`) ou une réponse tronquée (`finish_reason:"length"`) est une erreur. Timeout de 25 s ; en cas d'erreur ou de timeout, **basculer sur le mock** pour cet appel (le jeu ne doit jamais bloquer).
- `evaluer` : `resolu = true` si **au moins une** réponse remplit les `criteres` du problème. La `synthese` (si résolu) est formulée **collectivement** (« Bonne idée de l'équipe : … »), **sans nommer ni citer personne**, en 1 à 2 phrases. Le prompt interdit de juger une réponse comme fausse. **Contrôle serveur** (injection de prompt) : la synthèse est gardée seulement si elle commence par « Bonne idée de l'équipe », fait au plus 300 caractères, ne contient ni mot interdit, ni pseudo de la partie (`evaluer({ …, pseudos })`, les pseudos ne sont jamais envoyés à l'IA), ni 5 mots consécutifs repris d'une réponse ; sinon `solution.resume`.
- `attribuer` : **une** compétence par joueur, avec un code **obligatoirement** dans `probleme.competences` (sinon on rejette et on utilise le mock pour ce joueur). `preuve` = citation **exacte** d'une des réponses du joueur, vérifiée avec la même normalisation que `src/analyse.js` (casse, apostrophes, espaces). Si le joueur n'a que des choix (pas de texte), preuve = texte du choix, `typePreuve:"jeu"`. Réponse vide ou hors sujet → `competenceParticipation`, `typePreuve:"participation"`, et `preuve` = « A participé à la discussion de groupe ». `mots` : au tutoiement, valorisant, sans jargon, **jamais** « même si tu t'es trompé ». **Un appel à l'IA par joueur** (en parallèle) : la réponse d'un joueur n'est jamais dans le prompt d'un autre. **Contrôles serveur** : `mots` gardés seulement si une seule phrase, au plus 160 caractères, commençant par « Tu », sans pseudo ni mot interdit (sinon `competences[i].mots`, sinon la phrase par défaut) ; citation d'au moins 3 mots sauf si c'est la réponse entière (sinon mock pour ce joueur) ; `participation:true` refusé pour une réponse sérieuse ou un choix (mock pour ce joueur) ; joueur qui n'a écrit que du **remplissage** (voir Mock) : la citation n'est jamais acceptée → mock pour ce joueur (même priorité : compétence de son choix, sinon participation). Une réponse sérieuse, même courte ou différente de la solution, n'est jamais « hors sujet ». Le libellé ROME est affiché avec ses accents rétablis (« Être », « Élaborer », « œuvre »).
- **Mock** : `evaluer` → résolu si une réponse contient au moins 2 `solution.motsCles` (normalisés : minuscules, sans accents) ; synthèse = `solution.resume`. `attribuer` → d'abord, une réponse de **remplissage ou d'hésitation** (normalisée : une fois retirés « je sais pas », « sais pas », « jsp », « aucune idée », « je vois pas », « on attend », « rien », « bof », « euh », « ? »…, il reste moins de 3 mots porteurs de sens et aucun mot-clé du problème ; ex. « je sais pas trop, on attend de voir ») n'est **jamais citée** : elle compte comme « pas de texte » (choix, sinon participation). Sinon, pour chaque joueur, la compétence du problème dont le plus de `motsCles` apparaissent dans ses réponses (en cas d'égalité, la première de la liste) ; à défaut de mot-clé, s'il a fait un choix qui a une `competence`, **celle du choix** (preuve = texte du choix) ; sinon, si la réponse est **sérieuse** (au moins 3 mots porteurs de sens) ou contient un mot de la solution, la compétence **la plus générique** : `competenceParDefaut`, sinon `6D103` (« Être force de proposition ») si présente, sinon le premier `6D1xx` de la liste, sinon le premier code. **Preuve tirée d'une réponse** = la **proposition** (découpée sur `. ! ? ; , :` puis, si elle dépasse 20 mots, sur « et » / « puis ») qui contient le plus de mots-clés de la compétence (sans mot-clé : la plus riche en mots porteurs de sens), sous-chaîne **exacte**, de 3 à 20 mots (moins seulement si la réponse entière est plus courte), conjonction de tête retirée (« et ce soir… » → « ce soir… ») ; trop longue → fenêtre de 20 mots autour du mot-clé ; elle ne finit **jamais** sur un article, une préposition ou un pronom seul (« les », « de », « pour », « d'un »…) : on la raccourcit avant. L'analyse mock du récit (`src/analyse.js`) cite de la même façon (3 à 25 mots). Que des choix : `choix[i].competence` si présent ; sinon le bon choix → ses mots-clés ; un autre choix → `competenceParticipation` avec `typePreuve:"jeu"`, preuve = texte du choix. Sinon (rien, remplissage, hors sujet) participation. Si le mock échoue pour un joueur, ce joueur reçoit la participation : personne n'est jamais sans compétence.
- Aucune déduction sensible : le prompt reprend la règle 3 de `src/analyse.js`.

## 6. Front (owners E et F)

- HTML/CSS/JS vanilla, modules ES, **aucun framework, aucun build**. Bibliothèques externes autorisées **uniquement** via `https://cdnjs.cloudflare.com` ou `https://cdn.jsdelivr.net/npm/` avec une **version exacte** (ex. QR code : `qrcode-generator@1.4.4`).
- **Écran commun** (`ecran.html`) : pensé pour un projecteur, en **grand** (titres ≥ 48 px), lisible de loin. Il montre :
  - l'illustration, la situation, la question, un **minuteur visuel** (cercle ou barre) et des boutons animateur discrets en bas (« Suivant », « Fin du temps ») ;
  - un bouton 🔊 qui relit la situation avec `speechSynthesis`, en voix française ;
  - à l'accueil : le QR code vers `/p/<code>`, le code en très grand et la liste des avatars et pseudos qui arrivent ;
  - pendant la réponse : « 3/4 ont répondu » **sans noms**.
- **Téléphone** (`joueur.html`, servi aussi sur `/p/<code>`) : mobile d'abord (largeur de 360 px), gros boutons, dictée vocale si le navigateur la permet (`webkitSpeechRecognition`, reprise de `outil.js`), reconnexion automatique (backoff) et reprise grâce au `joueurId` en `localStorage`. Écrans selon la phase : rejoindre, création (récit puis cartes « C'est moi / Pas moi » ; tant qu'une carte n'est pas tranchée, le bouton Valider dit « Encore 1 carte à choisir » / « Encore N cartes à choisir »), « Regarde l'écran » pendant présentation et échange (avec le minuteur), saisie de la réponse, attente, 4 choix, compétence gagnée (carte colorée RIASEC + preuve + « Je la garde / Pas moi » + « Recopie-la sur ta fiche avec une gommette 🟢 »), fin (sa fiche + liens).
- **Fiche** (`fiche.html?code=…&joueur=…`) : imprimable en A4 (`@media print`). Elle reprend les compétences de départ et celles du jeu, avec leurs preuves, les **repères RIASEC** (reprendre la logique et les tuiles de `outil.js` : pas de score, pas de pourcentage), les **métiers à découvrir** (`metiers-proches.js` : 5 accessibles + 3 longs ; avec ESCO, le titre FR officiel et les compétences clés en détail) et un encart « Pour le psy » (questions pour en parler). Ces données viennent de `GET /api/parties/:code/fiche/:joueurId`.
- **Fiche papier** (`fiche-papier.html`) : gabarit A4 vierge à imprimer avant la partie : pseudo, avatar à dessiner, « Ce que je sais déjà faire », une grille de 6 cases « Compétence gagnée » (chacune avec un rond pour la gommette, une ligne pour la compétence et une ligne pour la preuve), et une légende des couleurs RIASEC (les mêmes que `outil.js`).
- Couleurs RIASEC (à reprendre partout) : R `#c8743a`, I `#3a7bc8`, A `#a24fc0`, S `#2e9b6a`, E `#d8a019`, C `#5f6b85`.
- Accessibilité : contrastes AA, `aria-live` pour les changements de phase, mode sombre (`prefers-color-scheme`).

## 7. Tests et critères d'acceptation du MVP

- `npm test` (= `node --test "test/**/*.test.js"` ; `node --test test/` échoue sous Node 22, qui lit `test/` comme un fichier) passe : jeu.js (toutes les transitions, les deux branches résolu / pas résolu, une compétence par joueur et par problème, aucune fuite de réponse dans la vue écran ni dans la vue d'un autre joueur), mj.js (mock, validation des codes et des citations, bascule sur le mock), problemes.json (schéma, codes ROME existants, exactement 1 choix correct, illustrations existantes, aucun mot interdit), metiers/esco (intégrité).
- `npm run simulate` : contre `wrangler dev` (MJ mock), crée une partie, connecte 1 écran et 3 joueurs en WebSocket, joue une partie complète de 2 problèmes (un résolu, un non résolu), et vérifie que chaque joueur a 2 compétences de jeu et que l'écran n'a jamais reçu de texte de réponse.
- `npx wrangler deploy --dry-run` réussit (le bundle compile).
- Parcours manuel dans le navigateur : écran + 2 onglets « téléphone » jusqu'à la fin, fiche imprimable.
