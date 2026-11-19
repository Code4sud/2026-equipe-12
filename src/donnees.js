// Données statiques embarquées dans le bundle du Worker (wrangler les intègre au build).
// Les mêmes fichiers sont servis tels quels au navigateur depuis public/data/.
import rome from "../public/data/rome.json" with { type: "json" };
import problemesJson from "../public/data/problemes.json" with { type: "json" };
import metiers from "../public/data/metiers.json" with { type: "json" };

export { rome, metiers };

/** Liste des problèmes du jeu (tableau d'objets, cf. SPEC §4.1). */
export const problemes = problemesJson.problemes;

/** Accès rapide aux macro-compétences ROME par code. */
export const MACROS = new Map(rome.macros.map((m) => [m.code, m]));
