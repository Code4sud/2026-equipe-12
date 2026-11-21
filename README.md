# Équipe 12 — Hackathon Azuréen #3

Projet réalisé à Nice les 18, 19 et 20 novembre 2026, sur le thème **« L'orientation et l'employabilité grâce à l'IA »**, organisé par [Code4Sud](https://code4sud.fr).

**Démo : https://potentiel-cache.planbhunalp.workers.dev**

## Le projet

Sujet 4 : le détecteur du potentiel caché. **Déclic est un jeu de rôle des compétences** : chaque jeune joue son propre rôle face à des problèmes du quotidien (l'histoire du tournoi du quartier, du budget à la caisse de la buvette). Un maître du jeu (MJ) IA repère des compétences dans ses propres mots, et chacun repart avec sa fiche pour l'entretien avec le psychologue du travail ou le conseiller. Déclic n'agit pas sur la mesure du Rapport des Possibles : il prépare son interprétation en entretien.

Une partie se joue de 1 à 6 joueurs (souvent recommandé : 3 à 5) autour d'un **écran commun**, chacun avec **son téléphone** ou une tablette du Centre (QR code, rien à installer) et une **fiche personnage papier** :

1. **Avant de jouer** : l'écran et le téléphone annoncent le cadre : « Ce n'est pas un test noté. Il n'y a pas de bonne réponse à trouver : on cherche ce que toi, tu ferais. » Ce que le jeune écrit est lu par une IA (le MJ), qui propose ; c'est lui qui décide.
2. **Création du personnage** : chacun raconte 1 ou 2 choses qu'il a déjà faites ; le MJ en tire au plus 3 compétences de départ, qu'il garde ou refuse.
3. **Une histoire, « Le tournoi du quartier »** : par défaut, **autant d'épisodes que de joueurs, entre 3 et 6**, de types RIASEC éloignés (3 → E, A, R ; 4 → E, A, I, C ; 5 → E, A, I, R, C ; 6 → les 6), joués dans l'ordre de l'histoire ; l'animateur peut choisir un autre nombre. Pour chaque épisode :
   - l'écran affiche et lit la situation ; chacun valide « J'ai lu » (le téléphone peut la réécouter) ;
   - **30 s de réflexion en silence** : chacun pense à ce qu'il ferait et peut noter un mot sur son téléphone (personne ne le voit) ;
   - **la discussion à voix haute**, qui commence par un tour de table (90 s jusqu'à 3 joueurs, 30 s de plus par joueur au-delà) ;
   - **la réponse privée** sur le téléphone (« Et toi, que fais-tu ? », 90 s, dictée possible). **Il n'y a ni bonne ni mauvaise réponse.** Seuls « je ne sais pas » et la violence sont refusés, au joueur concerné seulement : dès le premier « je ne sais pas », il peut partir d'un début de phrase (« Moi, je demanderais à… », « D'abord, je… », « J'irais voir… ») ou **passer ce tour**, sans reproche ;
   - **l'idée du tour** : le MJ propose l'idée qui fait avancer l'histoire. L'écran l'affiche avec les mots de son auteur, **sans son pseudo** ; l'auteur décide sur son téléphone si son pseudo s'affiche. Comme pour les compétences privées, l'idée n'est retenue que si la réponse contient une action précise et citable. Son auteur reçoit la compétence et **l'écrit sur sa fiche papier** avec ses mots. Tant qu'un joueur pas encore retenu a écrit une vraie réponse, le MJ choisit **obligatoirement** parmi eux, et la longueur d'une réponse n'est pas un critère. L'animateur peut demander une autre idée ;
   - **les compétences privées** : chaque autre réponse peut recevoir une compétence repérée, montrée **seulement sur le téléphone de son auteur**, si elle contient une action précise et citable ; sinon, le joueur retrouve son idée, sans compétence. Chacun a la même chance d'en recevoir une ;
   - une question facultative : « Ce genre de situation, tu aimerais en vivre dans un travail ? » ; puis une phrase de liaison mène à l'épisode suivant.
4. **Débrief** (proposé par défaut) : trois questions à l'écran ; la dernière (« Raconte une fois, dans ta vraie vie, où tu as fait quelque chose comme ça. ») est écrite en privé et va sur la fiche.
5. À la fin : une **fiche imprimable** (4 à 5 pages A4) qui **complète le Rapport des Possibles** du Centre, sur son modèle : les compétences **repérées** avec leur trace (les propres mots du jeune) et une question sur son vécu, les **types d'activités** où il a montré des compétences (le type RIASEC de chaque épisode ; ce n'est pas son profil d'intérêts, qui reste celui du rapport), des métiers à explorer rangés par les 5 zones du rapport (indicatif, sans étiquette de proximité), ses prochains pas à écrire à la main, une notice et un encart pour le psychologue (amorces de reflet, relances ouvertes, épisodes où il a préféré passer, avis, débrief). Elle n'est pas un diplôme : le jeune l'apporte à son entretien s'il le souhaite.

Garde-fous :
- les réponses sont privées : l'écran commun montre **qui** a lu et répondu (dans l'ordre d'arrivée dans la partie, jamais qui a passé son tour) ; pendant le retour de l'épisode, il ne distingue plus personne (ni qui a reçu une compétence privée, ni qui a écrit l'idée du tour) ; seule l'idée du tour est affichée, avec le pseudo de son auteur seulement s'il est d'accord. Au moment d'écrire, le jeune est prévenu qu'un bout de sa phrase peut s'afficher sans son nom si elle devient l'idée du tour ;
- pas de bonne ni de mauvaise réponse : personne n'est jamais jugé ;
- le MJ ne choisit que dans une liste fermée de compétences ROME 4.0 par épisode (ou, si aucune ne convient, parmi les 16 savoir-être, marqués « hors scénario »), et la trace doit être une citation exacte du joueur ; la carte dit « Tu as proposé de … : c'est ce qu'on appelle « … » », jamais « tu es » ni un superlatif, et rien sur la santé, l'origine, la famille, la religion, les opinions ou la vie sexuelle (contrôlé côté serveur) ;
- les réponses sont mélangées avant d'être montrées au MJ, et le tirage est enregistré ;
- un MJ de secours déterministe prend le relais si l'IA ne répond pas : la partie ne bloque jamais ; il ne mesure pas la qualité (réponse sérieuse et en lien avec le sujet, priorité à qui n'a pas encore été retenu) et départage les ex aequo par un tirage au hasard enregistré ;
- pas de score, pas de verdict : le jeune garde ou refuse chaque compétence ;
- rien n'est conservé : la partie est effacée une heure après la fin.

Utilisation conseillée (à confirmer avec le Centre) : 3 ou 4 épisodes le jour des passations, les 6 en séance en amont chez un partenaire. La durée d'un épisode reste à chronométrer lors des premières parties.

Architecture : Cloudflare Workers + un Durable Object par partie (WebSocket, minuteurs), logique de jeu en machine à états pure (`src/jeu.js`), MJ IA OpenAI `gpt-5-nano` (le modèle le moins cher d'OpenAI). Le contrat complet est dans [`SPEC.md`](SPEC.md).

## Lancer le projet

Cloudflare Workers + Durable Objects, en local avec `wrangler dev` (Node 22).

```bash
npm install
cp .dev.vars.example .dev.vars   # optionnel : y mettre OPENAI_API_KEY (jamais commité)
npm run dev                      # http://localhost:8787
```

- Sans clé (ou avec `MJ_MODE=mock`), un **MJ mock déterministe** remplace l'IA : le jeu reste entièrement jouable.
- Écran commun : lancer `npx wrangler dev --ip 0.0.0.0`, puis ouvrir l'écran **par l'IP du PC** (`http://<ip-du-pc>:8787/` → « Créer une partie ») : le QR code reprend l'adresse de la page, et un QR vers `localhost` ne marche pas sur un téléphone. Si l'écran reste ouvert sur `localhost`, ajouter `&hote=<ip-du-pc>:8787` à son adresse. Téléphones : le QR code ou `http://<ip-du-pc>:8787/p/<CODE>`.
- Écran animateur protégé : seul l'onglet qui a cliqué « Créer une partie » pilote la partie (clé secrète gardée dans cet onglet, même après un rechargement ou l'ajout de `&hote=`). Une adresse `ecran.html?code=…` recopiée ou partagée affiche « Accès animateur refusé » : pour changer d'ordinateur, créer une nouvelle partie. La démo `ecran.html?demo=1` reste libre.
- Dictée vocale sur téléphone : le navigateur l'exige en https. Lancer `npx wrangler dev --ip 0.0.0.0 --local-protocol https` (certificat local à accepter sur le téléphone) ou passer par un tunnel https ; en http, le bouton micro est masqué.
- Outil solo (sans jeu) : http://localhost:8787/outil.html

| Commande | Effet |
|---|---|
| `npm test` | tests `node --test` (jeu, MJ, données, worker, Durable Object, front) |
| `npx wrangler dev --port 8787 --var MJ_MODE:mock` puis `npm run simulate -- http://127.0.0.1:8787` | partie complète simulée (1 écran + 3 joueurs en WebSocket, réglages automatiques : 3 épisodes E, A, R, débrief, fiche) |
| `npm run check` | vérifie que le bundle compile (`wrangler deploy --dry-run`, rien n'est déployé) |
| `npx wrangler deploy` puis `npx wrangler secret put OPENAI_API_KEY` | mise en production sur Cloudflare |
| `npm run build` | copie `public/` dans `dist/` pour GitHub Pages (démo statique de l'outil solo) |

## CI/CD

Workflow `.github/workflows/ci-cd.yml` (GitHub Actions) :

- **CI**, sur chaque pull request et chaque push sur `main` : `npm test`, build du Worker à blanc (`npm run check`), puis une partie complète simulée contre `wrangler dev` (écran + 3 joueurs en WebSocket, MJ de secours, 3 épisodes et débrief).
- **CD**, sur chaque push sur `main` quand la CI passe : `wrangler deploy` sur https://potentiel-cache.planbhunalp.workers.dev, puis vérification que la production répond.
- Le déploiement s'active quand le dépôt a les secrets `CLOUDFLARE_API_TOKEN` (token Cloudflare limité à « Workers Scripts : Edit » sur ce compte) et `CLOUDFLARE_ACCOUNT_ID` (réglages du dépôt, droits administrateur). Sans eux, il est sauté. La clé OpenAI reste un secret du Worker, jamais dans GitHub.

## Données personnelles (RGPD)

Le détail est sur la page [`confidentialite.html`](public/confidentialite.html), liée depuis l'accueil, l'écran de connexion des joueurs, la fiche et la version solo. En résumé :

- **Minimisation** : un pseudo et un avatar, pas de compte, pas de nom, pas d'e-mail, pas de téléphone, aucun cookie de suivi ni mesure d'audience.
- **Finalité unique** : faire tourner la partie et produire la fiche de compétences du jeune.
- **IA** : le récit et les réponses partent vers l'API OpenAI **sans les pseudos** (joueurs « J1, J2… ») ; la sortie est contrôlée côté serveur.
- **Pas de décision automatique** (art. 22) : ni score ni verdict, le jeune garde ou refuse chaque compétence.
- **Conservation** : partie effacée une heure après la fin (`deleteAll` du Durable Object), ou après 6 heures sans activité ; pas de base de données. La fiche papier (nom, prénom) reste sur papier.
- **Déploiement réel** : à intégrer au traitement du Centre des Possibles (Métropole Nice Côte d'Azur) : mise à jour de l'AIPD, information du jeune et de ses représentants légaux s'il est mineur, contrat de sous-traitance avec l'hébergeur et le fournisseur d'IA, transfert hors UE encadré ou modèle hébergé en Europe.

## Données

- **ROME 4.0** (France Travail, open data) : 506 macro-compétences. Le fichier contient aussi des codes RIASEC (colonnes U et V de la feuille « REF - Macro ») dont l'origine et la méthode n'ont pas pu être vérifiées : le jeu prend le type RIASEC de l'épisode, et l'outil solo présente ces codes comme un simple repère.
- **O\*NET 31.0** (USDOL/ETA, CC BY 4.0) : profils RIASEC des métiers, titres et descriptions traduits en français.
- **ESCO v1.2** (Union européenne, CC BY 4.0) : intitulés et compétences essentielles en français, via la correspondance ESCO ↔ O\*NET.

## Pourquoi ces choix (sources)

Chaque choix du jeu a été confronté à la littérature, puis relu sous l'angle de la psychologie de l'orientation ; en cas de désaccord, c'est cette relecture critique qui l'emporte. Les noms entre crochets identifient les adaptations ; [`SPEC.md`](SPEC.md) reprend les mêmes noms là où le comportement est décrit. Les références complètes sont dans « Références », plus bas.

Ce que Déclic peut promettre : il aide le jeune à relire des réussites passées (récit de départ, question sur le vécu) et lui donne un retour informatif sur une action qu'il propose. Une réponse à « que ferais-tu ? » reste une intention, pas une réussite vécue : un effet sur le sentiment d'efficacité est une **hypothèse à tester**, pas un mécanisme acquis. Pour Bandura (1977), la persuasion verbale est une source plus faible que l'expérience de maîtrise, pas une source nulle ; la méta-analyse de Byars-Winston et al. (2017) est corrélationnelle et ne teste pas une intervention.

### Place dans le parcours du Centre

- **Un complément du Rapport des Possibles, pas un nouveau test** [`complement-rapport-des-possibles`, `psy-mene-entretien`] : la fiche sert au moment où le psychologue relie les résultats à la situation, aux valeurs et aux ressources du jeune (guide du Centre, p. 11), soit la tâche d'évocation de l'entretien motivationnel (Miller & Rollnick, 2023). C'est le psychologue qui fixe la durée de l'entretien : aucune durée n'est inventée. Le jeune apporte la fiche s'il le souhaite.
- **Des amorces de reflet et des relances ouvertes plutôt qu'un questionnaire** [`encart-psy-questions`] : l'entretien motivationnel s'applique au conseil en orientation (Rochat, 2019 ; Klonek et al., 2016) ; les relances suivent l'ordre récit, valeurs, focalisation, avec une question narrative (« Raconte-moi une autre fois où tu as fait ça », Savickas et al., 2009) ; voir aussi la revue des interventions d'orientation au lycée de D. Wang et al. (2024). Pour vérifier que le psychologue reste fidèle à l'entretien motivationnel, on utilise le MITI 4 (Moyers et al., 2016) ; il code le conseiller, pas le discours du jeune (celui-ci se code avec MISC 2.5 ou MI-SCOPE, l'outil de Klonek et al., 2016).
- **Un plan d'action écrit à la main** [`nouveau-plan-exploration-ecrit`, `nouveau-mes-pistes-et-premier-pas`] : l'exercice écrit et la recherche d'informations font partie des ingrédients efficaces des interventions d'orientation (Brown & Ryan Krane, 2000 ; Brown et al., 2003) ; un « soi possible » relié à une action concrète a plus d'effet (Oyserman et al., 2006) ; une évaluation peut devenir un moment d'échange avec la personne évaluée (Finn & Tonsager, 1997).

### Public, groupe, matériel

- **Le public** [`public-15-25-decrochage`] : jeunes à partir de 15 ans, sans âge maximum (guide du Centre), en questionnement ou en décrochage ; à titre de repère, les missions locales accompagnent les 16-25 ans (Code du travail, art. L5314-2). Le doute sur ses capacités est associé à l'indécision (Taylor & Betz, 1983 ; Choi et al., 2012). France Travail évalue déjà des habiletés par mises en situation (méthode de recrutement par simulation, France Travail, s.d.) : c'est une analogie, pas une preuve. L'idée que les questionnaires avantagent ceux qui savent parler d'eux est une **hypothèse de l'équipe**.
- **1 à 6 joueurs, souvent 3 à 5** [`taille-groupe-1-a-6`] : à 5, la discussion reste un dialogue ; à 10, elle devient une suite de monologues (Fay et al., 2000) ; le travail en petits groupes réussit mieux à 3-4 (Lou et al., 1996, 2001). « 6 joueurs pour 6 épisodes » est un choix de conception.
- **Une tablette du Centre en secours** [`telephone-sans-installation`] : tous les jeunes n'ont pas un smartphone avec batterie et données (CRÉDOC, Hoibian et al., 2026).

### Le déroulé d'un épisode

- **Des épisodes de types RIASEC éloignés** [`duree-episode-et-partie`, `defaut-3-episodes-couverture-riasec`] : sur l'hexagone de Holland, les types opposés sont les plus différents (Prediger, 1982 ; Tracey & Rounds, 1993 ; Rounds & Tracey, 1996) ; avec 3 épisodes, E, A et R couvrent l'hexagone mieux que trois voisins. Aucune durée d'épisode n'est annoncée avant d'avoir été chronométrée : la règle des « 10 minutes d'attention » n'est pas établie (Bradbury, 2016 ; Wilson & Korn, 2007).
- **Réfléchir seul avant de parler** [`ordre-oral-puis-ecrit`, `nouveau-temps-de-reflexion-individuel`, `nouveau-premiere-idee-avant-discussion`] : les idées produites seules avant la discussion sont plus nombreuses et plus variées (Diehl & Stroebe, 1987 ; Girotra et al., 2010 ; groupe nominal de Delbecq & Van de Ven, 1971) ; répondre seul puis discuter avec ses pairs améliore la compréhension (Smith et al., 2009) ; parler d'abord expose au conformisme (Deutsch & Gerard, 1955) ; laisser un temps d'attente aide à répondre (Tobin, 1987). **Principe transposé, objectif différent** : ces travaux portent sur la créativité ou l'apprentissage, pas sur l'expression de soi.
- **Un tour de table et une durée selon la taille du groupe** [`duree-discussion-120s`, `nouveau-relance-equite-de-parole`] : les grands groupes produisent moins par personne (Mullen et al., 1991) ; un tour de parole structuré et des rôles partagés équilibrent les statuts dans le groupe (Cohen, 1994 ; Cohen & Lotan, 1995 ; Delbecq & Van de Ven, 1971).
- **« Et toi, que fais-tu ? »** [`question-ouverte-unique`] : une consigne de tendance comportementale (« que ferais-tu ») plutôt que de connaissance (McDaniel et al., 2007), individuelle (Brunyé et al., 2009 : le « tu » fait prendre la perspective du personnage) et ouverte : le type de consigne et les réponses rédigées jouent sur les écarts entre groupes (Whetzel et al., 2008 ; Lievens et al., 2019).
- **Une réponse courte, au clavier ou à la voix** [`duree-reponse-90s`, `langage-simple-dictee-accessibilite`] : on tape lentement sur un téléphone (Palin et al., 2019) ; écrire aide à apprendre (Bangert-Drowns et al., 2004) ; 14 % des jeunes de la Journée défense et citoyenneté ont des difficultés de lecture (DEPP : Giraudeau-Barthet, 2026), d'où la dictée et la page qui dit ce que devient la voix (MDN Web Docs, s.d.).
- **Des illustrations et « Réécouter l'épisode »** [`presentation-episode`] : une image qui montre la situation aide à comprendre un texte (Carney & Levin, 2002) ; la lecture à voix haute aide les lecteurs en difficulté (Wood et al., 2018).
- **Une histoire qui se suit** [`histoire-tournoi-du-quartier`] : le récit soutient l'engagement dans un jeu sérieux (Naul & Liu, 2020) ; les liaisons reprennent l'idée retenue sans la juger (pas de « bravo » : un retour centré sur la personne plutôt que sur la tâche peut nuire, Kluger & DeNisi, 1996).

### « Je ne sais pas », passer son tour, le cadre

- **Accepter « je ne sais pas » dès la première fois** [`refus-je-sais-pas-et-violence`, `absent-sans-penalite`] : il faut aider à dire « je ne sais pas », pas le refuser (Waterman & Blades, 2011) ; les débuts de phrase sont un étayage (Wood et al., 1976) ; « Je passe ce tour » sans reproche protège la sécurité psychologique du groupe (Edmondson, 1999) et le regard inconditionnel (Rogers, 1957). Pour un jeune qui pense ne rien savoir faire, ce « je ne sais pas » est une donnée utile au psychologue : il est signalé sur la fiche, jamais au groupe.
- **Annoncer le cadre avant de jouer** [`nouveau-annonce-pas-un-test`] : présenter une tâche comme un test peut faire baisser la réussite des groupes stéréotypés (Steele & Aronson, 1995), un effet plus faible et plus incertain qu'annoncé (Flore & Wicherts, 2015). La formulation suit la critique : « Ce n'est pas un test noté. Ce que tu écris est lu par une IA et sert à préparer ton entretien avec le psy. »
- **Dire que le MJ est une IA** [`nouveau-transparence-ia`] : obligation de transparence (règlement européen sur l'IA, art. 50 ; UE, 2024) et information des personnes (RGPD, 2016).

### L'idée du tour : équité et place de l'animateur

- **Rotation stricte, contrôlée par le serveur** [`rotation-joueurs-retenus`, `idee-retenue-pas-la-meilleure`] : donner à chacun un statut de contributeur compte plus que désigner « la meilleure » idée (Cohen & Lotan, 1995 ; Ames, 1992) ; la sortie d'un modèle d'IA se contrôle côté serveur (ANSSI, 2024).
- **Réponses mélangées, longueur neutralisée** [`idee-du-tour`, `mj-de-secours`] : un modèle de langage qui juge favorise la première réponse lue et les réponses longues (P. Wang et al., 2024 ; Zheng et al., 2023) ; d'où le mélange de Fisher-Yates enregistré et un MJ de secours dont le score ne récompense pas la longueur.
- **Le pseudo seulement avec accord** [`idee-affichee-avec-pseudo`, `nouveau-citation-publique-avec-accord`] : le retour porte sur l'idée et ce qu'elle apporte à la tâche, pas sur la personne (Hattie & Timperley, 2007) ; le jeune choisit s'il veut être nommé.
- **Un affichage neutre de l'avancement** [`ecran-montre-qui-a-repondu`] : rendre visible qui a contribué limite le désengagement en groupe (Karau & Williams, 1993), sans mettre en avant le dernier (Ames, 1992). Seulement pour lire et répondre : pendant le retour des compétences, l'écran ne montre ni pseudo ni compteur, sinon il dirait au groupe qui a reçu une compétence privée.
- **Le MJ propose, l'animateur valide** [`mj-ia-bienveillant`] : un MJ IA est un assistant du meneur de jeu (Zhu et al., 2023) ; le jeu de rôle est déjà utilisé avec un professionnel qui l'encadre (Arenas et al., 2022) ; un humain qui ne peut pas corriger l'automate finit par s'y fier sans vérifier (Parasuraman & Manzey, 2010).

### Les compétences repérées

- **Une compétence privée seulement si la réponse contient une action précise et citable** [`idee-du-tour`, `joueurs-jamais-retenus`] : une récompense réservée au « gagnant » démotive les autres (Vansteenkiste & Deci, 2003 ; Deci et al., 1999). Mais un retour donné pour n'importe quelle réponse perd sa crédibilité, surtout chez les jeunes à faible estime de soi (Brummelman et al., 2014 ; Kluger & DeNisi, 1996) : d'où la condition d'une action citable et la promesse « chacun a la même chance d'en recevoir une », jamais « chacun en repart avec une ».
- **« Tu as proposé de … : c'est ce qu'on appelle « … » »** [`phrase-mots-valorisante`, `nouveau-phrase-competence-verbe-d-action`] : un retour qui décrit une action, sans adjectif sur la personne ni superlatif (Hattie & Timperley, 2007 ; Kluger & DeNisi, 1996 ; Brummelman et al., 2014), et ancré dans les mots du jeune pour éviter l'effet Barnum (Forer, 1949).
- **« Repérées », « trace », jamais « validées »** [`nouveau-vocabulaire-reperage-pas-validation`] : la validation des acquis suppose une procédure et des preuves (Conseil de l'UE, 2012 ; Cedefop, 2023) ; la citation montre ce que le jeune a écrit, pas qu'il possède la compétence.
- **Une liste fermée ROME 4.0, plus les savoir-être** [`referentiel-rome-liste-fermee`] : un référentiel public français (France Travail, 2026) ; un savoir-être pris hors de l'épisode est signalé « hors scénario » (Cedefop, 2023).
- **Au plus 3 compétences de départ, 4 cartes à la fois dans l'outil solo** [`max-3-competences-depart`] : la mémoire de travail tient environ 4 éléments (Cowan, 2001) ; le chiffre 3 reste une heuristique (voir plus bas).
- **Écrire sa compétence à la main, avec ses mots** [`ecrire-sa-competence-a-la-main`, `fiche-papier`] : produire soi-même une information aide à la retenir (Bertsch et al., 2007 ; Forrin et al., 2012) ; l'avantage de l'écriture manuscrite sur le clavier n'est pas établi (Urry et al., 2021), c'est l'appropriation qui compte ; l'exercice écrit est un ingrédient efficace (Brown et al., 2003).
- **Une fin collective qui renvoie aux traces** [`fin-collective`] : une structure coopérative plutôt que compétitive (Roseth et al., 2008), un retour sur la tâche plutôt qu'un éloge général (Hattie & Timperley, 2007).

### La fiche

- **Des types d'activités, pas un profil d'intérêts** [`interets-classes-par-ordre`, `fiche-finale-modele-rapport`] : sentiment de compétence et intérêts sont liés mais distincts (Rottinghaus et al., 2003 ; Ackerman & Heggestad, 1997) ; un repère tiré de 3 à 6 compétences n'a pas la validité d'un test (AERA et al., 2014) ; les intérêts évoluent encore à l'adolescence (Low et al., 2005). En cas d'écart, l'IPH du Rapport fait référence : c'est une question pour l'entretien.
- **Le type RIASEC de l'épisode, pas celui du ROME** [`riasec-depuis-le-rome`] : le fichier ROME (France Travail, 2026) contient des codes RIASEC (colonnes U et V de « REF - Macro ») dont l'origine et la méthode n'ont pas pu être vérifiées (piste : Beltrame, s.d.) ; toutes les vues prennent donc le type de l'épisode : la carte sur le téléphone, la puce de l'idée sur l'écran commun, la fiche du téléphone et la fiche imprimée (même classement des types d'activités et mêmes métiers). Les compétences du récit de départ n'ont pas d'épisode, donc pas de type.
- **Des métiers à explorer, par zone, sans étiquette de proximité** [`champ-des-possibles-5-zones`] : zones et durées du Rapport des Possibles, niveaux du guide du Centre (p. 10) et des Job Zones O*NET (National Center for O*NET Development, 2025), licence O*NET CC BY 4.0 (2026). Les seuils de Lewis & Morris (2025) ont été établis pour l'O*NET Interest Profiler, pas pour un profil tiré de quelques compétences : ils ne sont pas repris. « 2 pistes par zone » s'appuie sur Chernev et al. (2015), selon qui trop de choix gêne surtout quand les préférences sont incertaines ; Scheibehenne et al. (2010) trouvent un effet moyen proche de zéro : c'est une nuance.
- **Une question sur le vécu** [`question-vecu-non-utilisee`, `nouveau-question-vecu`] : en entretien, les questions sur ce qu'on a déjà fait prédisent un peu mieux que les questions hypothétiques (Taylor & Small, 2002) ; relire une expérience la transforme en apprentissage (Kolb, 1984) ; c'est l'esprit de la validation des acquis (Conseil de l'UE, 2012).
- **L'avis par épisode** [`nouveau-preference-par-episode`] : un intérêt naissant se repère dans ce qui a plu à un moment donné (Hidi & Renninger, 2006).
- **Un débrief court** [`nouveau-debriefing`] : le débrief est la partie où un jeu sérieux produit ses apprentissages (Crookall, 2010 ; Wouters et al., 2013) ; un jeu sérieux d'aide au choix d'un métier existe déjà pour les jeunes (Keller et al., 2023).
- **Une notice pour le psychologue** [`nouveau-notice-psy`] : dire comment la fiche a été produite et ses limites (Code de déontologie des psychologues, 2021) évite de se fier aveuglément à l'IA (Parasuraman & Manzey, 2010 ; règlement européen sur l'IA, art. 14).

### Éthique et données

- **Aucune déduction sensible, aucun jugement sur la personne** [`aucune-deduction-sensible`] : RGPD art. 9 (2016) ; Code de déontologie des psychologues (2021), art. 13 et 21.
- **Une ligne fixe vers un adulte en fin de partie** [`nouveau-relais-psychologue-fin-de-partie`] : la santé mentale des jeunes sans emploi ni formation est plus fragile (Gariépy et al., 2022) ; l'IA ne repère rien, la ligne est la même pour tous.
- **Sécurité du système d'IA** : recommandations de l'ANSSI (2024) pour une IA générative (contrôle des sorties côté serveur, repli sans IA).

## Choix assumés sans source

Ces valeurs sont des choix de conception, à vérifier au chronomètre ou en séance avec le Centre :

- **90 s pour répondre** (« environ 2-3 phrases ») et l'option **120 s** affichée « 2 min » (90 s plus un tiers, en écho au tiers-temps des examens : une analogie, pas une source).
- **30 s de réflexion** (options 0, 20, 30 ou 45 s) : principe transposé de la recherche (voir plus haut), durée non testée.
- **Durée de discussion max(90, 30 × nombre de joueurs) s** : heuristique.
- **Au plus 3 compétences de départ**, pour que le jeune puisse juger chacune avec sa trace ; aucun minimum.
- **Autant d'épisodes que de joueurs, entre 3 et 6**, et **6 joueurs au plus pour 6 épisodes** ; la liste des types par nombre d'épisodes (E-A-R, E-A-I-C, E-A-I-R-C) suit l'hexagone mais le choix précis est le nôtre.
- **Une citation d'au moins 3 mots** pour une compétence privée, **12 mots** au plus dans la phrase de la carte, **160 caractères** par phrase, **20 mots** pour une liaison.
- **2 pistes par zone de métiers**, **2 amorces de reflet** et **4 relances** au plus pour le psychologue, et les seuils de tri de `metiers-proches.js`.
- **Les 3 questions et la durée du débrief** (5 à 10 min), **les 3 réponses de l'avis** (oui / un peu / non).
- **L'histoire « Le tournoi du quartier »** n'a pas encore été relue par des jeunes du Centre (risque de cliché ; voir ci-dessous).
- **L'effacement une heure après la fin**.

## Avant un usage réel

La relecture critique a relevé des points qui ne relèvent pas du code et restent à régler avec le Centre :

- **Qui anime** (psychologue, conseiller…) et une notice pour l'animateur, en plus de la notice psy.
- **Les groupes** : si possible par tranche d'âge (15 ans et jeunes adultes) ; le format à un joueur avec l'animateur existe déjà et peut être proposé comme un choix, sans stigmatiser.
- **Les situations** : les faire relire par un panel de jeunes du Centre et prévoir une variante neutre de l'histoire.
- **Les révélations à risque** (détresse, maltraitance) dans un récit ou une réponse : seule l'IA lit tout, et elle ne repère rien ; il faut un protocole écrit (qui lit les réponses intégrales, conduite à tenir, information préoccupante pour les mineurs).
- **La recherche** : mesurer l'accord entre psychologues et IA demande de garder des citations au-delà d'une heure, avec un consentement dédié et une pseudonymisation.
- **Pilote** : suivre le taux de « Pas moi » par type de compétence (idée du tour, compétence privée, savoir-être hors scénario) pour vérifier que le retour reste crédible (critique psy point 3).
- **Le cadre légal avant tout déploiement** (voir « Données personnelles ») et, pour le règlement européen sur l'IA, la justification écrite de l'exemption de l'art. 6(3) : tâche préparatoire, sans influence sensible sur la décision, l'humain décide.

## Références

Références vérifiées sauf mention contraire.

- Ackerman, P. L., & Heggestad, E. D. (1997). Intelligence, personality, and interests: Evidence for overlapping traits. Psychological Bulletin, 121(2), 219-245. https://doi.org/10.1037/0033-2909.121.2.219
- Agence nationale de la sécurité des systèmes d'information. (2024). Recommandations de sécurité pour un système d'IA générative (ANSSI-PA-102, version 1.0, 29 avril 2024). ANSSI. https://messervices.cyber.gouv.fr/guides/recommandations-de-securite-pour-un-systeme-dia-generative
- American Educational Research Association, American Psychological Association, & National Council on Measurement in Education. (2014). Standards for educational and psychological testing. American Educational Research Association. ISBN 978-0-935302-35-6. https://www.testingstandards.net/open-access-files.html
- Ames, C. (1992). Classrooms: Goals, structures, and student motivation. Journal of Educational Psychology, 84(3), 261-271. https://doi.org/10.1037/0022-0663.84.3.261
- Arenas, D. L., Viduani, A., & Araujo, R. B. (2022). Therapeutic use of role-playing game (RPG) in mental health: A scoping review. Simulation & Gaming, 53(3), 285-311. https://doi.org/10.1177/10468781211073720
- Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. Psychological Review, 84(2), 191-215. https://doi.org/10.1037/0033-295X.84.2.191
- Bangert-Drowns, R. L., Hurley, M. M., & Wilkinson, B. (2004). The effects of school-based writing-to-learn interventions on academic achievement: A meta-analysis. Review of Educational Research, 74(1), 29-58. https://doi.org/10.3102/00346543074001029
- Beltrame, F. (s.d.). RIASEC Investigation et RIASEC Flash [Réutilisation de données publiques]. data.gouv.fr. Consulté le 21 novembre 2026. Voir aussi : France Travail, Répertoire opérationnel des métiers et des emplois (ROME) [Jeu de données], data.gouv.fr, https://www.data.gouv.fr/fr/datasets/58da857388ee384902e505f5/ https://www.data.gouv.fr/fr/reuses/riasec-investigation-et-riasec-flash
- Bertsch, S., Pesta, B. J., Wiscott, R., & McDaniel, M. A. (2007). The generation effect: A meta-analytic review. Memory & Cognition, 35(2), 201-210. https://doi.org/10.3758/BF03193441
- Bradbury, N. A. (2016). Attention span during lectures: 8 seconds, 10 minutes, or more? Advances in Physiology Education, 40(4), 509-513. https://doi.org/10.1152/advan.00109.2016
- Brown, S. D., & Ryan Krane, N. E. (2000). Four (or five) sessions and a cloud of dust: Old assumptions and new observations about career counseling. In S. D. Brown & R. W. Lent (Eds.), Handbook of counseling psychology (3rd ed., pp. 740-766). Wiley. (Référence à confirmer sur l'ouvrage.) (Chapitre d'ouvrage, sans DOI)
- Brown, S. D., Ryan Krane, N. E., Brecheisen, J., Castelino, P., Budisin, I., Miller, M., & Edens, L. (2003). Critical ingredients of career choice interventions: More analyses and new hypotheses. Journal of Vocational Behavior, 62(3), 411-428. https://doi.org/10.1016/S0001-8791(02)00052-0
- Brummelman, E., Thomaes, S., Orobio de Castro, B., Overbeek, G., & Bushman, B. J. (2014). « That's not just beautiful—that's incredibly beautiful! »: The adverse impact of inflated praise on children with low self-esteem. Psychological Science, 25(3), 728-735. https://doi.org/10.1177/0956797613514251
- Brunyé, T. T., Ditman, T., Mahoney, C. R., Augustyn, J. S., & Taylor, H. A. (2009). When you and I share perspectives: Pronouns modulate perspective taking during narrative comprehension. Psychological Science, 20(1), 27-32. https://doi.org/10.1111/j.1467-9280.2008.02249.x
- Byars-Winston, A., Diestelmann, J., Savoy, J. N., & Hoyt, W. T. (2017). Unique effects and moderators of effects of sources on self-efficacy: A model-based meta-analysis. Journal of Counseling Psychology, 64(6), 645-658. https://doi.org/10.1037/cou0000219
- Carney, R. N., & Levin, J. R. (2002). Pictorial illustrations still improve students' learning from text. Educational Psychology Review, 14(1), 5-26. https://doi.org/10.1023/A:1013176309260
- Cedefop. (2023). European guidelines for validating non-formal and informal learning (3rd ed., Cedefop reference series No. 124). Publications Office of the European Union. https://doi.org/10.2801/389827
- Centre des Possibles, Métropole Nice Côte d'Azur, & Université Côte d'Azur. (s.d.). Guide pratique du Centre des Possibles [Document interne remis au Hackathon Azuréen #3, 2026]. (Document interne, non publié en ligne)
- Centre des Possibles. (s.d.). Rapport des Possibles [Modèle de rapport remis au jeune ; seule la structure est reprise, sans aucune donnée personnelle]. (Document interne, non publié en ligne)
- CERéDéPsy. (2021). Code de déontologie des psychologues (version consolidée au 9 septembre 2021, signée le 5 juin 2021 par 21 organisations de psychologues). https://psychologues.org/wp-content/uploads/2025/01/CODE-DE-DEONTOLOGIE-DES-PSYCHOLOGUES-2021_Colonnes_A3.pdf
- Chernev, A., Böckenholt, U., & Goodman, J. (2015). Choice overload: A conceptual review and meta-analysis. Journal of Consumer Psychology, 25(2), 333-358. https://doi.org/10.1016/j.jcps.2014.08.002
- Choi, B. Y., Park, H., Yang, E., Lee, S. K., Lee, Y., & Lee, S. M. (2012). Understanding career decision self-efficacy: A meta-analytic approach. Journal of Career Development, 39(5), 443-460. https://doi.org/10.1177/0894845311398042
- Code du travail. (2025). Article L5314-2 (missions locales pour l'insertion professionnelle et sociale des jeunes), version en vigueur au 1er janvier 2025. https://code.travail.gouv.fr/code-du-travail/l5314-2
- Cohen, E. G. (1994). Restructuring the classroom: Conditions for productive small groups. Review of Educational Research, 64(1), 1-35. https://doi.org/10.3102/00346543064001001
- Cohen, E. G., & Lotan, R. A. (1995). Producing equal-status interaction in the heterogeneous classroom. American Educational Research Journal, 32(1), 99-120. https://doi.org/10.3102/00028312032001099
- Conseil de l'Union européenne. (2012). Recommandation du Conseil du 20 décembre 2012 relative à la validation de l'apprentissage non formel et informel (2012/C 398/01). Journal officiel de l'Union européenne, C 398, 1-5. https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32012H1222(01)
- Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. Behavioral and Brain Sciences, 24(1), 87-114. https://doi.org/10.1017/S0140525X01003922
- Crookall, D. (2010). Serious games, debriefing, and simulation/gaming as a discipline. Simulation & Gaming, 41(6), 898-920. (Éditorial.) https://doi.org/10.1177/1046878110390784
- Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. Psychological Bulletin, 125(6), 627-668. https://doi.org/10.1037/0033-2909.125.6.627
- Delbecq, A. L., & Van de Ven, A. H. (1971). A group process model for problem identification and program planning. The Journal of Applied Behavioral Science, 7(4), 466-492. https://doi.org/10.1177/002188637100700404
- Deutsch, M., & Gerard, H. B. (1955). A study of normative and informational social influences upon individual judgment. The Journal of Abnormal and Social Psychology, 51(3), 629-636. https://doi.org/10.1037/h0046408
- Diehl, M., & Stroebe, W. (1987). Productivity loss in brainstorming groups: Toward the solution of a riddle. Journal of Personality and Social Psychology, 53(3), 497-509. https://doi.org/10.1037/0022-3514.53.3.497
- Edmondson, A. (1999). Psychological safety and learning behavior in work teams. Administrative Science Quarterly, 44(2), 350-383. https://doi.org/10.2307/2666999
- Fay, N., Garrod, S., & Carletta, J. (2000). Group discussion as interactive dialogue or as serial monologue: The influence of group size. Psychological Science, 11(6), 481-486. https://doi.org/10.1111/1467-9280.00292
- Finn, S. E., & Tonsager, M. E. (1997). Information-gathering and therapeutic models of assessment: Complementary paradigms. Psychological Assessment, 9(4), 374-385. https://doi.org/10.1037/1040-3590.9.4.374
- Flore, P. C., & Wicherts, J. M. (2015). Does stereotype threat influence performance of girls in stereotyped domains? A meta-analysis. Journal of School Psychology, 53(1), 25-44. https://doi.org/10.1016/j.jsp.2014.10.002
- Forer, B. R. (1949). The fallacy of personal validation: A classroom demonstration of gullibility. The Journal of Abnormal and Social Psychology, 44(1), 118-123. https://doi.org/10.1037/h0059240
- Forrin, N. D., MacLeod, C. M., & Ozubko, J. D. (2012). Widening the boundaries of the production effect. Memory & Cognition, 40(7), 1046-1055. https://doi.org/10.3758/s13421-012-0210-8
- France Travail. (2026, 19 octobre). Répertoire opérationnel des métiers et des emplois (ROME) : jeux de données open data [Page web]. https://www.francetravail.org/opendata/repertoire-operationnel-des-meti.html?type=article
- France Travail. (s.d.). La méthode de recrutement par simulation (MRS). Consulté en 2026. https://www.francetravail.fr/employeur/vos-recrutements/selectionnez-des-candidats/la-methode-de-recrutement-par-si.html
- Gariépy, G., Danna, S. M., Hawke, L., Henderson, J., & Iyer, S. N. (2022). The mental health of young people who are not in education, employment, or training: A systematic review and meta-analysis. Social Psychiatry and Psychiatric Epidemiology, 57(6), 1107-1121. https://doi.org/10.1007/s00127-021-02212-8
- Giraudeau-Barthet, H. (2026, octobre). Journée défense et citoyenneté 2025 : 14 % des jeunes rencontrent des difficultés de lecture (Note d'information n° 26.43). DEPP, ministère de l'Éducation nationale. https://www.education.gouv.fr/sites/default/files/document/educationnationaledepp-ni-2026-43-jdcpdf-521326.pdf
- Girotra, K., Terwiesch, C., & Ulrich, K. T. (2010). Idea generation and the quality of the best idea. Management Science, 56(4), 591-605. https://doi.org/10.1287/mnsc.1090.1144
- Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81-112. https://doi.org/10.3102/003465430298487
- Hidi, S., & Renninger, K. A. (2006). The four-phase model of interest development. Educational Psychologist, 41(2), 111-127. https://doi.org/10.1207/s15326985ep4102_4
- Hoibian, S., Brice Mansencal, L., Croutte, P., Nedjar-Calvet, S., Brenon, M., & Thomas, A. (2026). Baromètre du numérique, édition 2026 : rapport (enquête de juin 2025). CRÉDOC pour l'Arcep, l'Arcom, le CGE et l'ANCT. https://www.arcep.fr/uploads/tx_gspublication/barometre-du-numerique-edition-2026_RAPPORT.pdf
- Karau, S. J., & Williams, K. D. (1993). Social loafing: A meta-analytic review and theoretical integration. Journal of Personality and Social Psychology, 65(4), 681-706. https://doi.org/10.1037/0022-3514.65.4.681
- Keller, C., Makarova, E., & Döring, A. K. (2023). Career choice with the serious game Like2be. International Journal of Game-Based Learning, 13(1), 1-18. https://doi.org/10.4018/ijgbl.327788
- Klonek, F. E., Wunderlich, E., Spurk, D., & Kauffeld, S. (2016). Career counseling meets motivational interviewing: A sequential analysis of dynamic counselor-client interactions. Journal of Vocational Behavior, 94, 28-38. https://doi.org/10.1016/j.jvb.2016.01.008
- Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory. Psychological Bulletin, 119(2), 254-284. https://doi.org/10.1037/0033-2909.119.2.254
- Kolb, D. A. (1984). Experiential learning: Experience as the source of learning and development. Prentice-Hall. (Ouvrage sans DOI)
- Lewis, P., & Morris, J. (2025, 5 octobre). Career returns within the O*NET Interest Profiler tools. National Center for O*NET Development. https://www.onetcenter.org/reports/IP_Career_Returns.html
- Lievens, F., Sackett, P. R., Dahlke, J. A., Oostrom, J. K., & De Soete, B. (2019). Constructed response formats and their effects on minority-majority differences and validity. Journal of Applied Psychology, 104(5), 715-726. https://doi.org/10.1037/apl0000367
- Lou, Y., Abrami, P. C., & d'Apollonia, S. (2001). Small group and individual learning with technology: A meta-analysis. Review of Educational Research, 71(3), 449-521. https://doi.org/10.3102/00346543071003449
- Lou, Y., Abrami, P. C., Spence, J. C., Poulsen, C., Chambers, B., & d'Apollonia, S. (1996). Within-class grouping: A meta-analysis. Review of Educational Research, 66(4), 423-458. https://doi.org/10.3102/00346543066004423
- Low, K. S. D., Yoon, M., Roberts, B. W., & Rounds, J. (2005). The stability of vocational interests from early adolescence to middle adulthood: A quantitative review of longitudinal studies. Psychological Bulletin, 131(5), 713-737. https://doi.org/10.1037/0033-2909.131.5.713
- McDaniel, M. A., Hartman, N. S., Whetzel, D. L., & Grubb, W. L. (2007). Situational judgment tests, response instructions, and validity: A meta-analysis. Personnel Psychology, 60(1), 63-91. https://doi.org/10.1111/j.1744-6570.2007.00065.x
- MDN Web Docs. (s.d.). Using the Web Speech API. Mozilla. Consulté le 21 novembre 2026. https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- Miller, W. R., & Rollnick, S. (2023). Motivational interviewing: Helping people change and grow (4th ed.). Guilford Press. https://www.guilford.com/books/Motivational-Interviewing/Miller-Rollnick/9781462552795
- Moyers, T. B., Rowell, L. N., Manuel, J. K., Ernst, D., & Houck, J. M. (2016). The Motivational Interviewing Treatment Integrity code (MITI 4): Rationale, preliminary reliability and validity. Journal of Substance Abuse Treatment, 65, 36-42. https://doi.org/10.1016/j.jsat.2016.01.001
- Mullen, B., Johnson, C., & Salas, E. (1991). Productivity loss in brainstorming groups: A meta-analytic integration. Basic and Applied Social Psychology, 12(1), 3-23. https://doi.org/10.1207/s15324834basp1201_1
- National Center for O*NET Development. (2025). Job zone reference (O*NET 30.0 Database Dictionary). U.S. Department of Labor, Employment and Training Administration. https://www.onetcenter.org/dictionary/30.0/text/job_zone_reference.html
- National Center for O*NET Development. (2026). O*NET database license (O*NET 31.0, CC BY 4.0). https://www.onetcenter.org/license_db.html
- Naul, E., & Liu, M. (2020). Why story matters: A review of narrative in serious games. Journal of Educational Computing Research, 58(3), 687-707. https://doi.org/10.1177/0735633119859904
- Oyserman, D., Bybee, D., & Terry, K. (2006). Possible selves and academic outcomes: How and when possible selves impel action. Journal of Personality and Social Psychology, 91(1), 188-204. https://doi.org/10.1037/0022-3514.91.1.188
- Palin, K., Feit, A. M., Kim, S., Kristensson, P. O., & Oulasvirta, A. (2019). How do people type on mobile devices? Observations from a study with 37,000 volunteers. In Proceedings of the 21st International Conference on Human-Computer Interaction with Mobile Devices and Services (MobileHCI '19), Article 9 (pp. 1-12). ACM. https://doi.org/10.1145/3338286.3340120
- Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation: An attentional integration. Human Factors, 52(3), 381-410. https://doi.org/10.1177/0018720810376055
- Parlement européen & Conseil de l'Union européenne. (2024). Règlement (UE) 2024/1689 établissant des règles harmonisées concernant l'intelligence artificielle (règlement sur l'intelligence artificielle). Journal officiel de l'Union européenne, L, 12.7.2024 (art. 4, 6, 14, 15, 50, 113 et annexe III ; texte modifié depuis : obligations « haut risque » de l'annexe III applicables au 2 décembre 2027). https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32024R1689
- Prediger, D. J. (1982). Dimensions underlying Holland's hexagon: Missing link between interests and occupations? Journal of Vocational Behavior, 21(3), 259-287. https://doi.org/10.1016/0001-8791(82)90036-7
- Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016 relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel (règlement général sur la protection des données). (2016). Journal officiel de l'Union européenne, L 119, 4.5.2016 (art. 5, 9, 13, 22, 25 ; considérants 38, 39, 78). https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Rochat, S. (2019). Effects of motivational interviewing training in career counseling: A pilot study. Journal of Career Development, 46(3), 280-294. (Publication en ligne en 2017.) https://doi.org/10.1177/0894845317745380
- Rogers, C. R. (1957). The necessary and sufficient conditions of therapeutic personality change. Journal of Consulting Psychology, 21(2), 95-103. https://doi.org/10.1037/h0045357
- Roseth, C. J., Johnson, D. W., & Johnson, R. T. (2008). Promoting early adolescents' achievement and peer relationships: The effects of cooperative, competitive, and individualistic goal structures. Psychological Bulletin, 134(2), 223-246. https://doi.org/10.1037/0033-2909.134.2.223
- Rottinghaus, P. J., Larson, L. M., & Borgen, F. H. (2003). The relation of self-efficacy and interests: A meta-analysis of 60 samples. Journal of Vocational Behavior, 62(2), 221-236. https://doi.org/10.1016/S0001-8791(02)00039-8
- Rounds, J., & Tracey, T. J. (1996). Cross-cultural structural equivalence of RIASEC models and measures. Journal of Counseling Psychology, 43(3), 310-329. https://doi.org/10.1037/0022-0167.43.3.310
- Savickas, M. L., Nota, L., Rossier, J., Dauwalder, J.-P., Duarte, M. E., Guichard, J., Soresi, S., Van Esbroeck, R., & van Vianen, A. E. M. (2009). Life designing: A paradigm for career construction in the 21st century. Journal of Vocational Behavior, 75(3), 239-250. https://doi.org/10.1016/j.jvb.2009.04.004
- Scheibehenne, B., Greifeneder, R., & Todd, P. M. (2010). Can there ever be too many options? A meta-analytic review of choice overload. Journal of Consumer Research, 37(3), 409-425. https://doi.org/10.1086/651235
- Smith, M. K., Wood, W. B., Adams, W. K., Wieman, C., Knight, J. K., Guild, N., & Su, T. T. (2009). Why peer discussion improves student performance on in-class concept questions. Science, 323(5910), 122-124. https://doi.org/10.1126/science.1165919
- Steele, C. M., & Aronson, J. (1995). Stereotype threat and the intellectual test performance of African Americans. Journal of Personality and Social Psychology, 69(5), 797-811. https://doi.org/10.1037/0022-3514.69.5.797
- Taylor, K. M., & Betz, N. E. (1983). Applications of self-efficacy theory to the understanding and treatment of career indecision. Journal of Vocational Behavior, 22(1), 63-81. https://doi.org/10.1016/0001-8791(83)90006-4
- Taylor, P. J., & Small, B. (2002). Asking applicants what they would do versus what they did do: A meta-analytic comparison of situational and past behaviour employment interview questions. Journal of Occupational and Organizational Psychology, 75(3), 277-294. https://doi.org/10.1348/096317902320369712
- Tobin, K. (1987). The role of wait time in higher cognitive level learning. Review of Educational Research, 57(1), 69-95. https://doi.org/10.3102/00346543057001069
- Tracey, T. J., & Rounds, J. B. (1993). Evaluating Holland's and Gati's vocational-interest models: A structural meta-analysis. Psychological Bulletin, 113(2), 229-246. https://doi.org/10.1037/0033-2909.113.2.229
- Urry, H. L., Crittle, C. S., Floerke, V. A., et al. (2021). Don't ditch the laptop just yet: A direct replication of Mueller and Oppenheimer's (2014) Study 1 plus mini meta-analyses across similar studies. Psychological Science, 32(3), 326-339. https://doi.org/10.1177/0956797620965541
- Vansteenkiste, M., & Deci, E. L. (2003). Competitively contingent rewards and intrinsic motivation: Can losers remain motivated? Motivation and Emotion, 27(4), 273-299. https://doi.org/10.1023/A:1026259005264
- Wang, D., Li, Y., & Wang, G. (2024). A systematic review on career interventions for high school students. Frontiers in Psychology, 15, Article 1461503. https://doi.org/10.3389/fpsyg.2024.1461503
- Wang, P., Li, L., Chen, L., Cai, Z., Zhu, D., Lin, B., Cao, Y., Kong, L., Liu, Q., Liu, T., & Sui, Z. (2024). Large language models are not fair evaluators. In Proceedings of ACL 2024 (Long Papers) (pp. 9440-9450). Association for Computational Linguistics. https://aclanthology.org/2024.acl-long.511
- Waterman, A. H., & Blades, M. (2011). Helping children correctly say « I don't know » to unanswerable questions. Journal of Experimental Psychology: Applied, 17(4), 396-405. https://doi.org/10.1037/a0026150
- Whetzel, D. L., McDaniel, M. A., & Nguyen, N. T. (2008). Subgroup differences in situational judgment test performance: A meta-analysis. Human Performance, 21(3), 291-309. https://doi.org/10.1080/08959280802137820
- Wilson, K., & Korn, J. H. (2007). Attention during lectures: Beyond ten minutes. Teaching of Psychology, 34(2), 85-89. https://doi.org/10.1080/00986280701291291
- Wood, D., Bruner, J. S., & Ross, G. (1976). The role of tutoring in problem solving. Journal of Child Psychology and Psychiatry, 17(2), 89-100. https://doi.org/10.1111/j.1469-7610.1976.tb00381.x
- Wood, S. G., Moxley, J. H., Tighe, E. L., & Wagner, R. K. (2018). Does use of text-to-speech and related read-aloud tools improve reading comprehension for students with reading disabilities? A meta-analysis. Journal of Learning Disabilities, 51(1), 73-84. https://doi.org/10.1177/0022219416688170
- Wouters, P., van Nimwegen, C., van Oostendorp, H., & van der Spek, E. D. (2013). A meta-analysis of the cognitive and motivational effects of serious games. Journal of Educational Psychology, 105(2), 249-265. https://doi.org/10.1037/a0031311
- Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y., Lin, Z., Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., & Stoica, I. (2023). Judging LLM-as-a-judge with MT-Bench and Chatbot Arena. NeurIPS 2023, Datasets and Benchmarks Track (arXiv:2306.05685). https://arxiv.org/abs/2306.05685
- Zhu, A., Martin, L., Head, A., & Callison-Burch, C. (2023). CALYPSO: LLMs as dungeon master's assistants. Proceedings of the AAAI Conference on Artificial Intelligence and Interactive Digital Entertainment, 19(1), 380-390. https://doi.org/10.1609/aiide.v19i1.27534

## Publier sur le site du hackathon

1. Complétez `projet.json` (nom, pitch, description, écoles, technologies, liens).
2. Ajoutez vos captures dans `captures/` et listez-les dans `projet.json`.
3. Poussez sur `main` : votre fiche apparaît sur https://orientation.code4sud.fr/projets/equipe-12 en moins d'une minute.

Toute la doc : https://orientation.code4sud.fr/doc/

## Licence

MIT — voir `LICENSE`.
