# Équipe 12 — Hackathon Azuréen #3

Projet réalisé à Nice les 18, 19 et 20 novembre 2026, sur le thème **« L'orientation et l'employabilité grâce à l'IA »**, organisé par [Code4Sud](https://code4sud.fr).

**Démo : https://potentiel-cache.planbhunalp.workers.dev**

## Le projet

Sujet 4 : le détecteur du potentiel caché. **Déclic est un jeu de rôle des compétences** : chaque jeune joue son propre rôle face à des problèmes du quotidien (un téléphone cassé, un anniversaire avec 20 €, un conflit sur Discord, un scooter en panne…). Un maître du jeu (MJ) IA révèle les compétences qu'il montre, et chacun repart avec sa fiche pour l'entretien avec le psychologue du travail ou le conseiller.

Une partie se joue à 1 à 6 joueurs autour d'un **écran commun**, chacun avec **son téléphone** (QR code, rien à installer) et une **fiche personnage papier** :

1. **Création du personnage** : chacun raconte 1 ou 2 choses qu'il a déjà faites ; le MJ en tire ses premières compétences, qu'il garde ou refuse.
2. **Un problème illustré** s'affiche. Chacun valide « J'ai lu », le groupe discute à voix haute (minuteur), puis chacun répond **en privé** sur son téléphone.
3. **Il n'y a ni bonne ni mauvaise réponse.** Seuls « je ne sais pas » et la violence sont refusés, au joueur concerné seulement, qui réécrit sa réponse.
4. **Chaque joueur reçoit une compétence** tirée de sa réponse, avec sa propre phrase comme preuve. Il la garde ou non, et colle la gommette de sa couleur RIASEC sur sa fiche.
5. À la fin : une **fiche imprimable** avec les compétences gardées, le profil d'intérêts RIASEC et des métiers proches (O\*NET, ESCO).

Garde-fous :
- les réponses sont privées : l'écran commun montre **qui** a répondu, jamais **ce qu'il** a répondu, ni qui a trouvé ;
- pas de bonne ni de mauvaise réponse : personne n'est jamais jugé ;
- le MJ ne choisit que dans une liste fermée de compétences ROME 4.0 par problème, et la preuve doit être une citation exacte du joueur ;
- un MJ de secours déterministe prend le relais si l'IA ne répond pas : la partie ne bloque jamais ;
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

## Données

- **ROME 4.0** (France Travail, open data) : 506 macro-compétences, codes RIASEC.
- **O\*NET 31.0** (USDOL/ETA, CC BY 4.0) : profils RIASEC des métiers, titres et descriptions traduits en français.
- **ESCO v1.2** (Union européenne, CC BY 4.0) : intitulés et compétences essentielles en français, via la correspondance ESCO ↔ O\*NET.

## Publier sur le site du hackathon

1. Complétez `projet.json` (nom, pitch, description, écoles, technologies, liens).
2. Ajoutez vos captures dans `captures/` et listez-les dans `projet.json`.
3. Poussez sur `main` : votre fiche apparaît sur https://orientation.code4sud.fr/projets/equipe-12 en moins d'une minute.

Toute la doc : https://orientation.code4sud.fr/doc/

## Licence

MIT — voir `LICENSE`.
