// Copie public/ → dist/ pour GitHub Pages (démo statique : l'outil solo y marche
// avec les exemples pré-calculés ; le jeu, lui, a besoin du Worker).
// Usage : npm run build
import { cpSync, existsSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const racine = fileURLToPath(new URL("..", import.meta.url));
const source = join(racine, "public");
const cible = join(racine, "dist");

if (!existsSync(source)) {
  console.error("Dossier public/ introuvable.");
  process.exit(1);
}
rmSync(cible, { recursive: true, force: true });
cpSync(source, cible, { recursive: true });
// Pas de traitement Jekyll : les fichiers sont servis tels quels.
writeFileSync(join(cible, ".nojekyll"), "");

const compter = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? compter(join(d, f)) : 1), 0);
console.log(`dist/ prêt : ${compter(cible)} fichiers copiés depuis public/.`);
