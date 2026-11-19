// Appel de l'analyse « récit → compétences » de l'outil solo (POST api/analyse).
// Séparé de outil.js pour être testable sous Node (fetch injecté).

export const MESSAGE_SANS_SERVEUR =
  "Cette version en ligne est une démo sans serveur : elle ne peut pas analyser de récit. " +
  "Pour essayer l'analyse, lance le projet en local (npm run dev) et ouvre outil.html depuis http://localhost:8787.";

/**
 * Envoie le récit au serveur et renvoie l'analyse.
 * - URL relative (« api/analyse ») : fonctionne aussi si le site est servi sous un sous-chemin.
 * - Pas de serveur (démo statique : erreur réseau, 404, 405, 501) → message clair, sans
 *   repli sur des résultats pré-calculés (les anciens demo/*.json n'existent plus).
 */
export async function analyserRecit(recit, fetchFn = globalThis.fetch) {
  let rep;
  try {
    rep = await fetchFn("api/analyse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recit }),
    });
  } catch {
    rep = null;
  }
  if (rep && rep.ok) {
    const data = await rep.json().catch(() => null);
    if (data && Array.isArray(data.competences)) return data;
    throw new Error("Analyse impossible pour le moment.");
  }
  if (!rep || [404, 405, 501].includes(rep.status)) throw new Error(MESSAGE_SANS_SERVEUR);
  const err = await rep.json().catch(() => ({}));
  throw new Error(err.erreur || "Analyse impossible pour le moment.");
}
