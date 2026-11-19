// Worker « Déclic » : routes HTTP (SPEC §2.2), WebSocket → Durable Object.
// Les fichiers statiques (public/) sont servis directement par Static Assets ;
// le worker ne passe en premier que pour /api/* et /p/* (voir wrangler.jsonc).
import { analyser } from "./analyse.js";
import { rome } from "./donnees.js";
import { DUREE_MAX, DUREE_MIN } from "./jeu.js";

export { Partie } from "./partie.js";

// ─────────────────────────── Fonctions pures (testées dans test/worker.test.js) ───────────────────────────
// Le module principal d'un Worker ne peut exporter que des gestionnaires : les
// fonctions pures sont exposées aux tests via l'objet `outils` (voir en bas).

/** Lettres des codes de partie : consonnes sans ambiguïté (pas de voyelle → pas de mot gênant). */
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const CODE_VALIDE = /^[A-Z]{4}$/;
const ID_JOUEUR_VALIDE = /^[A-Za-z0-9_-]{8,64}$/;

/** Code de 4 lettres tiré avec crypto.getRandomValues (injectable pour les tests). */
function genererCode(aleatoire = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  const valeurs = aleatoire(4);
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[valeurs[i] % ALPHABET.length];
  return code;
}

const codeValide = (code) => typeof code === "string" && CODE_VALIDE.test(code);

/**
 * Valide le corps de POST /api/parties.
 * @returns {{ reglages: object } | { erreur: string }}
 */
function lireReglages(corps) {
  if (corps === null || corps === undefined) return { reglages: {} };
  if (typeof corps !== "object" || Array.isArray(corps)) return { erreur: "Corps invalide : un objet JSON est attendu." };
  const reglages = {};
  if (corps.nbProblemes !== undefined) {
    const n = corps.nbProblemes;
    if (!Number.isInteger(n) || n < 1 || n > 6) return { erreur: "nbProblemes doit être un entier entre 1 et 6." };
    reglages.nbProblemes = n;
  }
  for (const cle of ["dureeEchange", "dureeReponse"]) {
    if (corps[cle] === undefined) continue;
    const n = corps[cle];
    if (!Number.isInteger(n) || n < DUREE_MIN || n > DUREE_MAX) {
      return { erreur: `${cle} doit être un nombre entier de secondes entre ${DUREE_MIN} et ${DUREE_MAX}.` };
    }
    reglages[cle] = n;
  }
  return { reglages };
}

/**
 * Routage pur : méthode + chemin → { nom, params } ou { statut, erreur }.
 * Noms : creer, ws, fiche, analyse, joueur, asset_joueur.
 */
function router(methode, chemin) {
  const seg = chemin.split("/").filter(Boolean);
  const attendre = (m, nom, params = {}) =>
    methode === m || (m === "GET" && methode === "HEAD" && nom !== "ws")
      ? { nom, params }
      : { statut: 405, erreur: "Méthode non autorisée." };

  if (seg[0] === "api") {
    if (seg.length === 2 && seg[1] === "parties") return attendre("POST", "creer");
    if (seg.length === 2 && seg[1] === "analyse") return attendre("POST", "analyse");
    if (seg[1] === "parties" && seg.length >= 4) {
      const code = seg[2];
      if (!codeValide(code)) return { statut: 404, erreur: "Partie introuvable." };
      if (seg.length === 4 && seg[3] === "ws") return attendre("GET", "ws", { code });
      if (seg.length === 5 && seg[3] === "fiche") {
        if (!ID_JOUEUR_VALIDE.test(seg[4])) return { statut: 404, erreur: "Joueur introuvable." };
        return attendre("GET", "fiche", { code, joueurId: seg[4] });
      }
    }
    return { statut: 404, erreur: "Adresse inconnue." };
  }

  if (seg[0] === "p") {
    // Chemin relatif résolu depuis /p/<code> (ex. /p/api/parties/<code>/ws) : c'est l'API.
    if (seg[1] === "api") return router(methode, "/" + seg.slice(1).join("/"));
    if (seg.length === 2 && /^[A-Za-z]{4}$/.test(seg[1])) return attendre("GET", "joueur", { code: seg[1] });
    // Ressource relative demandée depuis /p/<code> (ex. /p/js/joueur.js) : on sert /js/joueur.js.
    if (seg.length >= 2) return attendre("GET", "asset_joueur", { chemin: "/" + seg.slice(1).join("/") });
    return { statut: 404, erreur: "Partie introuvable." };
  }

  return { statut: 404, erreur: "Adresse inconnue." };
}

// ─────────────────────────── Réponses ───────────────────────────

const ENTETES_SECURITE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), microphone=(self)",
};

function avecSecurite(reponse, extra = {}) {
  if (reponse.status === 101 || reponse.webSocket) return reponse;
  const r = new Response(reponse.body, reponse);
  for (const [k, v] of Object.entries({ ...ENTETES_SECURITE, ...extra })) r.headers.set(k, v);
  return r;
}

function json(data, statut = 200) {
  return new Response(JSON.stringify(data), {
    status: statut,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const erreur = (statut, message) => json({ erreur: message }, statut);

/**
 * Lit le corps JSON sans jamais charger plus que nécessaire en mémoire :
 * Content-Length vérifié AVANT la lecture, puis lecture du flux avec un compteur
 * d'octets qui abandonne dès que la limite est dépassée (envoi « chunked »).
 * @param {number} max nombre maximal de caractères du corps (≤ 3 octets UTF-8 par caractère)
 */
async function lireJson(request, max) {
  const maxOctets = max * 3;
  const annonce = request.headers.get("content-length");
  if (annonce !== null) {
    const n = Number(annonce);
    if (!Number.isFinite(n) || n < 0 || n > maxOctets) return { trop: true };
  }
  let texte = "";
  if (request.body) {
    const lecteur = request.body.getReader();
    const morceaux = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxOctets) {
        await lecteur.cancel().catch(() => {});
        return { trop: true };
      }
      morceaux.push(value);
    }
    const octets = new Uint8Array(total);
    let pos = 0;
    for (const m of morceaux) {
      octets.set(m, pos);
      pos += m.byteLength;
    }
    texte = new TextDecoder().decode(octets);
  }
  if (texte.length > max) return { trop: true };
  if (!texte.trim()) return { corps: null };
  try {
    return { corps: JSON.parse(texte) };
  } catch {
    return { illisible: true };
  }
}

// ─────────────────────────── Gestionnaires ───────────────────────────

async function creerPartie(request, env) {
  const lu = await lireJson(request, 2000);
  if (lu.trop) return erreur(413, "Corps trop long.");
  if (lu.illisible) return erreur(400, "Corps illisible : JSON attendu.");
  const { reglages, erreur: message } = lireReglages(lu.corps);
  if (message) return erreur(400, message);

  for (let essai = 0; essai < 10; essai++) {
    const code = genererCode();
    const stub = env.PARTIE.getByName(code);
    const creee = await stub.init({ code, ...reglages });
    // cleEcran : clé de l'écran animateur, renvoyée UNE seule fois, à son créateur (SPEC §2.2).
    if (creee) return json({ code, cleEcran: creee.cleEcran }, 201);
  }
  return erreur(503, "Impossible de créer une partie pour le moment. Réessaie.");
}

async function analyseSolo(request, env) {
  const lu = await lireJson(request, 20000);
  if (lu.trop) return erreur(413, "Récit trop long (10 000 caractères max).");
  if (lu.illisible) return erreur(400, "Corps illisible : JSON attendu.");
  const recit = lu.corps?.recit;
  if (typeof recit !== "string" || recit.trim().length < 30) {
    return erreur(400, "Raconte au moins une ou deux situations (30 caractères minimum).");
  }
  const options = { apiKey: env.OPENAI_API_KEY, rome, effort: "low", mode: env.MJ_MODE === "mock" ? "mock" : "auto" };
  try {
    return json(await analyser(recit.slice(0, 10000), options));
  } catch (e) {
    if (e?.message?.startsWith("L'IA")) return erreur(422, e.message);
    // IA indisponible : on bascule sur l'analyse de secours (mots-clés), sans bloquer.
    console.error("Analyse IA impossible, bascule sur le mock :", e?.status ?? "", e?.message ?? e);
    return json({ ...(await analyser(recit.slice(0, 10000), { ...options, mode: "mock" })), secours: true });
  }
}

async function servirAsset(request, env, chemin) {
  const url = new URL(request.url);
  url.pathname = chemin;
  url.search = "";
  return env.ASSETS.fetch(new Request(url, { method: request.method, headers: request.headers }));
}

export const outils = { ALPHABET, CODE_VALIDE, ID_JOUEUR_VALIDE, genererCode, codeValide, lireReglages, lireJson, router, json };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = router(request.method, url.pathname);
    if (route.erreur) {
      if (url.pathname.startsWith("/p/") && route.statut === 404) {
        return avecSecurite(new Response("Partie introuvable.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }));
      }
      return avecSecurite(erreur(route.statut, route.erreur));
    }
    const { nom, params } = route;

    try {
      switch (nom) {
        case "creer":
          return avecSecurite(await creerPartie(request, env));

        case "ws": {
          if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
            return avecSecurite(erreur(426, "Connexion WebSocket attendue."));
          }
          return env.PARTIE.getByName(params.code).fetch(request);
        }

        case "fiche": {
          const fiche = await env.PARTIE.getByName(params.code).fiche(params.joueurId);
          if (!fiche) return avecSecurite(erreur(404, "Fiche introuvable : partie terminée ou joueur inconnu."));
          return avecSecurite(json(fiche));
        }

        case "analyse":
          return avecSecurite(await analyseSolo(request, env));

        case "joueur": {
          const code = params.code.toUpperCase();
          if (code !== params.code) return Response.redirect(new URL(`/p/${code}`, url).toString(), 302);
          // "/joueur" et non "/joueur.html" : Static Assets redirige les .html vers l'URL sans extension.
          return avecSecurite(await servirAsset(request, env, "/joueur"), { "cache-control": "no-cache" });
        }

        case "asset_joueur":
          return avecSecurite(await servirAsset(request, env, params.chemin));
      }
      return avecSecurite(erreur(404, "Adresse inconnue."));
    } catch (e) {
      console.error("Erreur :", e?.message ?? e);
      return avecSecurite(erreur(500, "Erreur du serveur. Réessaie dans un instant."));
    }
  },
};
