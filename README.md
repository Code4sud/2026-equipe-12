# Équipe 12 — Hackathon Azuréen #3

Projet réalisé à Nice les 18, 19 et 20 novembre 2026, sur le thème **« L'orientation et l'employabilité grâce à l'IA »**, organisé par [Code4Sud](https://code4sud.fr).

**Démo : https://potentiel-cache.planbhunalp.workers.dev**

## Le projet

Sujet 4 : le détecteur du potentiel caché. **Déclic est un jeu de rôle des compétences** : chaque jeune joue son propre rôle face à des problèmes du quotidien (l'histoire du tournoi du quartier, du budget à la caisse de la buvette). Un maître du jeu (MJ) IA repère les compétences que montrent ses propres mots, et chacun repart avec sa fiche pour l'entretien avec le psychologue du travail ou le conseiller.

Une partie se joue à 1 à 6 joueurs autour d'un **écran commun**, chacun avec **son téléphone** (QR code, rien à installer) et une **fiche personnage papier** :

1. **Création du personnage** : chacun raconte 1 ou 2 choses qu'il a déjà faites ; le MJ en tire ses premières compétences, qu'il garde ou refuse.
2. **Une histoire, « Le tournoi du quartier »** : 6 épisodes qui s'enchaînent (le budget, l'affiche, une embrouille dans l'équipe, le téléphone mystère, le jour J, la caisse de la buvette), un par profil RIASEC. Chaque épisode s'affiche sur l'écran commun ; chacun valide « J'ai lu », le groupe discute à voix haute (minuteur), puis chacun répond **en privé** sur son téléphone.
3. **Il n'y a ni bonne ni mauvaise réponse.** Seuls « je ne sais pas » et la violence sont refusés, au joueur concerné seulement : il réécrit sa réponse, aidé par des débuts de phrase (« Moi, je demanderais à… », « D'abord, je… », « J'irais voir… »), ou passe ce tour sans reproche.
4. **L'idée du tour** : le MJ IA propose l'idée qui fait avancer l'histoire et l'affiche sur l'écran avec ses propres mots (le pseudo seulement si l'auteur est d'accord). Ce joueur reçoit la compétence sur son téléphone et **l'écrit sur sa fiche papier**. Tant qu'un joueur pas encore retenu a écrit une vraie réponse, le MJ choisit **obligatoirement** parmi eux, et la longueur d'une réponse n'est pas un critère. Chaque autre réponse peut aussi recevoir, **en privé**, une compétence repérée, seulement si elle contient une action précise et citable : chacun a la même chance d'en recevoir une. Entre deux épisodes, une phrase de liaison reprend l'idée retenue.
5. À la fin : une **fiche imprimable** (4 à 5 pages A4) qui **complète le Rapport des Possibles** du Centre, sur son modèle : les compétences **repérées** avec leur trace (les propres mots du jeune) et une question sur son vécu, les **types d'activités** où il a montré des compétences (le type RIASEC de chaque épisode ; ce n'est pas son profil d'intérêts, qui reste celui du rapport), des métiers à explorer rangés par les 5 zones du rapport (indicatif, sans étiquette de proximité), ses prochains pas à écrire à la main, une notice et un encart pour le psychologue (amorces de reflet, relances ouvertes, épisodes où il a préféré passer). Elle n'est pas un diplôme : le jeune l'apporte à son entretien s'il le souhaite.

Garde-fous :
- les réponses sont privées : l'écran commun montre **qui** a répondu ; seule l'idée retenue est affichée, avec le pseudo de son auteur ;
- pas de bonne ni de mauvaise réponse : personne n'est jamais jugé ;
- le MJ ne choisit que dans une liste fermée de compétences ROME 4.0 par problème (ou, si aucune ne convient, parmi les 16 savoir-être, marqués « hors scénario »), et la trace doit être une citation exacte du joueur ; la carte dit « Tu as proposé de … : c'est ce qu'on appelle « … » », jamais « tu es » ni un superlatif, et rien sur la santé, l'origine, la famille, la religion, les opinions ou la vie sexuelle (contrôlé côté serveur) ;
- un MJ de secours déterministe prend le relais si l'IA ne répond pas : la partie ne bloque jamais ; il ne mesure pas la qualité (réponse sérieuse et en lien avec le sujet, priorité à qui n'a pas encore été retenu) et départage les ex aequo par un tirage au hasard enregistré ;
- pas de score, pas de verdict : le jeune valide chaque compétence ;
- rien n'est conservé : la partie est effacée une heure après la fin.

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
| `npx wrangler dev --var MJ_MODE:mock` puis `npm run simulate` | partie complète simulée (1 écran + 3 joueurs en WebSocket) |
| `npm run check` | vérifie que le bundle compile (`wrangler deploy --dry-run`, rien n'est déployé) |
| `npx wrangler deploy` puis `npx wrangler secret put OPENAI_API_KEY` | mise en production sur Cloudflare |
| `npm run build` | copie `public/` dans `dist/` pour GitHub Pages (démo statique de l'outil solo) |

## CI/CD

Workflow `.github/workflows/ci-cd.yml` (GitHub Actions) :

- **CI**, sur chaque pull request et chaque push sur `main` : `npm test`, build du Worker à blanc (`npm run check`), puis une partie complète simulée contre `wrangler dev` (écran + 3 joueurs en WebSocket, MJ de secours).
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

- **ROME 4.0** (France Travail, open data) : 506 macro-compétences. Le fichier contient aussi des codes RIASEC (colonnes U et V de la feuille « REF - Macro ») dont l'origine et la méthode n'ont pas pu être vérifiées : la fiche du jeu prend le type RIASEC de l'épisode, et l'outil solo présente ces codes comme un simple repère.
- **O\*NET 31.0** (USDOL/ETA, CC BY 4.0) : profils RIASEC des métiers, titres et descriptions traduits en français.
- **ESCO v1.2** (Union européenne, CC BY 4.0) : intitulés et compétences essentielles en français, via la correspondance ESCO ↔ O\*NET.

## Publier sur le site du hackathon

1. Complétez `projet.json` (nom, pitch, description, écoles, technologies, liens).
2. Ajoutez vos captures dans `captures/` et listez-les dans `projet.json`.
3. Poussez sur `main` : votre fiche apparaît sur https://orientation.code4sud.fr/projets/equipe-12 en moins d'une minute.

Toute la doc : https://orientation.code4sud.fr/doc/

## Licence

MIT — voir `LICENSE`.
