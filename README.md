# Équipe 12 — Hackathon Azuréen #3

Projet réalisé à Nice les 18, 19 et 20 novembre 2026, sur le thème **« L'orientation et l'employabilité grâce à l'IA »**, organisé par [Code4Sud](https://code4sud.fr).

## Le projet

**Potentiel caché, le jeu de rôle des compétences.** Des jeunes qui disent « je ne sais rien faire » jouent leur propre rôle face à des problèmes du quotidien. Un MJ (maître du jeu) IA révèle les compétences qu'ils montrent, preuves à l'appui, et chacun repart avec sa fiche pour en parler avec un psychologue du travail ou un conseiller.

Le contrat technique complet est dans [`SPEC.md`](SPEC.md). Le projet arrive par petites PR : amorce, données, moteur du jeu, MJ IA, serveur temps réel, fiche, écran commun, téléphone joueur.

## Lancer le projet

```bash
npm install
npm run dev        # http://localhost:8787 (Cloudflare Workers en local)
```

## Publier sur le site du hackathon

1. Complétez `projet.json` (nom, pitch, description, écoles, technologies, liens).
2. Ajoutez vos captures dans `captures/` et listez-les dans `projet.json`.
3. Poussez sur `main` : votre fiche apparaît sur https://orientation.code4sud.fr/projets/equipe-12 en moins d'une minute.

## Licence

MIT — voir `LICENSE`.
