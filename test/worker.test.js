// Tests du worker, de l'analyse (mode mock) et du Durable Object Partie,
// sans wrangler : le module "cloudflare:workers" est remplacé par un bouchon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

// Bouchon de "cloudflare:workers" (seule la classe DurableObject est utilisée).
const BOUCHON = "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }";
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "cloudflare:workers") {
          return { url: "data:text/javascript," + encodeURIComponent(${JSON.stringify(BOUCHON)}), shortCircuit: true };
        }
        return next(specifier, context);
      }`),
);
globalThis.WebSocketRequestResponsePair ??= class {
  constructor(requete, reponse) {
    Object.assign(this, { requete, reponse });
  }
};

const { outils, default: worker } = await import("../src/worker.js");
const { ALPHABET, genererCode, codeValide, lireReglages, router } = outils;
const { Partie } = await import("../src/partie.js");
const { analyser, DECLENCHEURS, norm, versCompetenceDepart } = await import("../src/analyse.js");

const rome = JSON.parse(readFileSync(new URL("../public/data/rome.json", import.meta.url), "utf8"));
const CODES_ROME = new Set(rome.macros.map((m) => m.code));

// ─────────────────────────── Codes de partie ───────────────────────────

test("genererCode : 4 lettres de l'alphabet sans voyelle", () => {
  assert.equal(ALPHABET, "BCDFGHJKLMNPQRSTVWXZ");
  for (let i = 0; i < 500; i++) {
    const code = genererCode();
    assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.ok(codeValide(code));
  }
});

test("genererCode : déterministe avec un aléa injecté", () => {
  assert.equal(genererCode(() => [0, 1, 2, 19]), "BCDZ");
  assert.equal(genererCode(() => [20, 21, 40, 39]), "BCBZ");
});

test("codeValide : ^[A-Z]{4}$", () => {
  for (const ok of ["ABCD", "ZZZZ", "BCDF"]) assert.ok(codeValide(ok), ok);
  for (const ko of ["abcd", "ABC", "ABCDE", "AB1D", "", null, undefined, 1234, "AB D"]) assert.ok(!codeValide(ko), String(ko));
});

// ─────────────────────────── Réglages ───────────────────────────

test("lireReglages : valeurs par défaut et valides", () => {
  assert.deepEqual(lireReglages(null), { reglages: {} });
  assert.deepEqual(lireReglages({}), { reglages: {} });
  assert.deepEqual(lireReglages({ nbProblemes: 2, dureeEchange: 20, dureeReponse: 30 }), {
    reglages: { nbProblemes: 2, dureeEchange: 20, dureeReponse: 30 },
  });
});

test("lireReglages : refuse les valeurs hors bornes, en français", () => {
  for (const corps of [{ nbProblemes: 0 }, { nbProblemes: 7 }, { nbProblemes: 2.5 }, { nbProblemes: "3" }, { dureeEchange: 2 }, { dureeReponse: 99999 }, [], "x"]) {
    const r = lireReglages(corps);
    assert.ok(r.erreur, JSON.stringify(corps));
    assert.equal(typeof r.erreur, "string");
  }
});

// ─────────────────────────── Routage ───────────────────────────

test("router : routes de la SPEC §2.2", () => {
  assert.deepEqual(router("POST", "/api/parties"), { nom: "creer", params: {} });
  assert.deepEqual(router("GET", "/api/parties/ABCD/ws"), { nom: "ws", params: { code: "ABCD" } });
  assert.deepEqual(router("GET", "/api/parties/ABCD/fiche/abcdef12-3456"), {
    nom: "fiche",
    params: { code: "ABCD", joueurId: "abcdef12-3456" },
  });
  assert.deepEqual(router("POST", "/api/analyse"), { nom: "analyse", params: {} });
  assert.deepEqual(router("GET", "/p/BCDF"), { nom: "joueur", params: { code: "BCDF" } });
  assert.deepEqual(router("GET", "/p/js/joueur.js"), { nom: "asset_joueur", params: { chemin: "/js/joueur.js" } });
  // URL relative résolue depuis /p/<code> (joueur.js) : routée vers l'API.
  assert.deepEqual(router("GET", "/p/api/parties/BCDF/ws"), { nom: "ws", params: { code: "BCDF" } });
  assert.equal(router("GET", "/p/api/parties/bcdf/ws").statut, 404);
});

test("router : codes invalides → 404, mauvaise méthode → 405", () => {
  assert.equal(router("GET", "/api/parties/abcd/ws").statut, 404);
  assert.equal(router("GET", "/api/parties/AB1D/ws").statut, 404);
  assert.equal(router("GET", "/api/parties/ABCDE/ws").statut, 404);
  assert.equal(router("GET", "/api/parties/ABCD/fiche/../x").statut, 404);
  assert.equal(router("GET", "/api/inconnu").statut, 404);
  assert.equal(router("GET", "/api/parties").statut, 405);
  assert.equal(router("DELETE", "/api/parties/ABCD/ws").statut, 405);
  assert.equal(router("GET", "/api/analyse").statut, 405);
});

test("worker.fetch : erreurs JSON en français et en-têtes de sécurité", async () => {
  const env = { MJ_MODE: "mock" };
  let r = await worker.fetch(new Request("http://x/api/parties/abcd/ws"), env);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match((await r.json()).erreur, /introuvable/i);

  r = await worker.fetch(new Request("http://x/api/parties", { method: "POST", body: "{pas du json" }), env);
  assert.equal(r.status, 400);
  assert.match((await r.json()).erreur, /JSON/);

  r = await worker.fetch(new Request("http://x/api/parties", { method: "POST", body: JSON.stringify({ nbProblemes: 9 }) }), env);
  assert.equal(r.status, 400);

  r = await worker.fetch(new Request("http://x/api/parties/ABCD/ws"), env);
  assert.equal(r.status, 426);
});

test("worker.fetch : /api/analyse en mode mock (même contrat que l'ancien server.js)", async () => {
  const recit = "Je garde mon petit frère le mercredi. Sur Discord je modère un serveur de 300 personnes.";
  const r = await worker.fetch(
    new Request("http://x/api/analyse", { method: "POST", body: JSON.stringify({ recit }) }),
    { MJ_MODE: "auto" },
  );
  assert.equal(r.status, 200);
  const a = await r.json();
  for (const cle of ["competences", "ecartees", "pistes_entretien", "a_approfondir", "modele", "referentiel"]) assert.ok(cle in a, cle);
  assert.equal(a.modele, "mock");
  assert.ok(a.competences.length >= 2);
  for (const c of a.competences) {
    for (const cle of ["code_rome", "situation", "citation", "mots_du_jeune", "question_psy", "libelle_rome", "categorie", "domaine", "riasec"]) {
      assert.ok(cle in c, cle);
    }
  }
  const court = await worker.fetch(new Request("http://x/api/analyse", { method: "POST", body: JSON.stringify({ recit: "trop court" }) }), {});
  assert.equal(court.status, 400);
});

test("worker.fetch : création de partie, réessai si le code est déjà pris", async () => {
  const pris = new Set();
  let appels = 0;
  const env = {
    PARTIE: {
      getByName: (code) => ({
        init: async (r) => {
          appels++;
          assert.equal(r.code, code);
          assert.equal(r.nbProblemes, 2);
          if (appels < 3) return false; // deux codes déjà utilisés
          pris.add(code);
          return { cleEcran: "cle-ecran-de-test-0001" };
        },
      }),
    },
  };
  const r = await worker.fetch(new Request("http://x/api/parties", { method: "POST", body: JSON.stringify({ nbProblemes: 2 }) }), env);
  assert.equal(r.status, 201);
  const corps = await r.json();
  const { code } = corps;
  assert.ok(codeValide(code));
  assert.deepEqual(Object.keys(corps).sort(), ["cleEcran", "code"]);
  assert.equal(corps.cleEcran, "cle-ecran-de-test-0001", "la clé animateur est renvoyée au créateur");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(appels, 3);
  assert.ok(pris.has(code));
});

// ─────────────────────────── Analyse (mock) ───────────────────────────

test("analyse : tous les déclencheurs du mock pointent vers un code ROME existant", () => {
  for (const d of DECLENCHEURS) assert.ok(CODES_ROME.has(d.code), d.code);
});

test("analyse mock : citations exactes, codes du référentiel, max respecté", async () => {
  const recit =
    "Je garde mon petit frère le mercredi après l'école.  Le week-end je tiens la caisse au snack et je rends la monnaie. " +
    "J'ai réparé le scooter de mon pote. J'ai organisé l'anniversaire surprise de ma pote. Sur Discord je modère un serveur.";
  const a = await analyser(recit, { rome, max: 3 });
  assert.equal(a.modele, "mock");
  assert.equal(a.competences.length, 3);
  for (const c of a.competences) {
    assert.ok(CODES_ROME.has(c.code_rome));
    assert.ok(recit.includes(c.citation), `citation non exacte : ${c.citation}`);
    const nbMots = c.citation.split(/\s+/).length;
    assert.ok(nbMots >= 3 && nbMots <= 25, c.citation);
    assert.match(c.mots_du_jeune, /^Tu /);
  }
  assert.deepEqual(a.competences.map((c) => c.code_rome), ["1A102", "4A201", "3E205"]);
  const tout = await analyser(recit, { rome });
  assert.ok(tout.competences.length >= 5);
});

test("analyse mock : déterministe, rien d'inventé sur un récit vide de sens", async () => {
  const r1 = await analyser("Je ne sais pas quoi dire, rien de spécial.", { rome, max: 3 });
  assert.equal(r1.competences.length, 0);
  assert.equal(r1.a_approfondir.length, 1);
  const recit = "Je cuisine pour mes potes le samedi soir et je fais des gâteaux.";
  assert.deepEqual(await analyser(recit, { rome, max: 3 }), await analyser(recit, { rome, max: 3 }));
});

test("analyse : mode mock forcé même avec une clé, et rome obligatoire", async () => {
  const a = await analyser("Je garde des enfants le soir après les cours.", { rome, apiKey: "sk-ant-faux", mode: "mock" });
  assert.equal(a.modele, "mock");
  await assert.rejects(() => analyser("texte", {}), /ROME/);
});

test("analyse : norm et conversion au format commun §4.2", () => {
  assert.equal(norm("  L’été,  «chez»   moi."), "l'été, \"chez\" moi");
  const c = versCompetenceDepart({ code_rome: "1A102", libelle_rome: "X", mots_du_jeune: "Tu…", citation: "je garde", riasec: ["S", "E"] });
  assert.deepEqual(c, { code: "1A102", libelle: "X", mots: "Tu…", preuve: "je garde", typePreuve: "vecu", riasec: ["S", "E"], problemeIndex: null, gardee: null });
});

// ─────────────────────────── Durable Object Partie (contexte simulé) ───────────────────────────

class FausseSocket {
  constructor(tags) {
    this.tags = tags;
    this.recus = [];
    this.readyState = 1;
    this.attachment = null;
  }
  send(s) {
    this.recus.push(JSON.parse(s));
  }
  close(code) {
    this.readyState = 3;
    this.codeFermeture ??= code;
  }
  serializeAttachment(a) {
    this.attachment = structuredClone(a);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  derniereVue() {
    return this.recus.filter((m) => m.t === "etat").at(-1)?.vue;
  }
}

function fauxContexte() {
  const stockage = new Map();
  const sockets = [];
  const enAttente = [];
  const ctx = {
    alarme: null,
    sockets,
    stockage,
    enAttente,
    blockConcurrencyWhile: (f) => (ctx.pret = f()),
    setWebSocketAutoResponse() {},
    waitUntil: (p) => enAttente.push(p),
    acceptWebSocket: (ws, tags) => {
      ws.tags = tags;
      sockets.push(ws);
    },
    getWebSockets: (tag) => sockets.filter((s) => s.readyState === 1 && (!tag || s.tags.includes(tag))),
    storage: {
      get: async (k) => structuredClone(stockage.get(k)),
      put: async (k, v) => {
        if (typeof k === "object") for (const [a, b] of Object.entries(k)) stockage.set(a, structuredClone(b));
        else stockage.set(k, structuredClone(v));
      },
      setAlarm: async (t) => {
        ctx.alarme = t;
      },
      deleteAlarm: async () => {
        ctx.alarme = null;
      },
      deleteAll: async () => stockage.clear(),
    },
  };
  return ctx;
}

async function attendreIA(ctx) {
  while (ctx.enAttente.length) await ctx.enAttente.shift();
}

function brancher(ctx, role, joueurId) {
  const ws = new FausseSocket([]);
  ctx.acceptWebSocket(ws, joueurId ? [role, joueurId] : [role]);
  ws.serializeAttachment({ role, joueurId: joueurId ?? null });
  return ws;
}

test("Partie : init unique, fiche, partie complète en mode mock sans fuite vers l'écran", async () => {
  const ctx = fauxContexte();
  const partie = new Partie(ctx, { MJ_MODE: "mock" });
  await ctx.pret;
  const creee = await partie.init({ code: "BCDF", nbProblemes: 1, dureeEchange: 10, dureeReponse: 10 });
  assert.match(creee?.cleEcran ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "cleEcran = crypto.randomUUID()");
  const CLE = creee.cleEcran;
  assert.equal(await partie.init({ code: "BCDF" }), false, "un code déjà initialisé est refusé");
  assert.equal(ctx.stockage.get("etat").code, "BCDF");
  assert.equal(ctx.stockage.get("etat").cleEcran, CLE, "clé persistée avec l'état");

  const ecran = brancher(ctx, "ecran");
  const a = brancher(ctx, "joueur", "joueur-aaaa-1111");
  const b = brancher(ctx, "joueur", "joueur-bbbb-2222");
  const envoyer = (ws, msg) => partie.webSocketMessage(ws, JSON.stringify(msg));

  await envoyer(a, { t: "rejoindre", pseudo: "Alex", avatar: "🦊" });
  await envoyer(b, { t: "rejoindre", pseudo: "Bea", avatar: "🐼", role: "ecran" }); // rôle forgé ignoré
  await envoyer(b, { t: "demarrer" });
  assert.equal(b.recus.at(-1).t, "erreur", "un joueur ne peut pas démarrer");
  await envoyer(ecran, { t: "demarrer" });
  assert.equal(partie.etat.phase, "creation");

  await envoyer(a, { t: "recit", texte: "Je garde mon petit frère le mercredi après l'école." });
  await envoyer(b, { t: "recit", texte: "Sur Discord je modère un serveur de 300 personnes." });
  await attendreIA(ctx);
  assert.equal(a.derniereVue().moi.depart.etat, "a_valider");
  assert.ok(a.derniereVue().moi.depart.propositions.length >= 1);
  for (const ws of [a, b]) await envoyer(ws, { t: "valider_depart", garder: ws.derniereVue().moi.depart.propositions.map(() => true) });
  assert.equal(partie.etat.phase, "presentation");

  // Tout le monde a lu la situation → la discussion démarre d'elle-même.
  await envoyer(a, { t: "lu" });
  assert.equal(partie.etat.phase, "presentation", "on attend que tout le monde ait lu");
  assert.deepEqual(ecran.derniereVue().joueurs.map((j) => j.aFini), [true, false]);
  await envoyer(b, { t: "lu" });
  assert.equal(partie.etat.phase, "echange");
  assert.ok(ctx.alarme > Date.now(), "minuteur programmé");
  // Alarme du minuteur arrivée à échéance : temps écoulé, mais on reste en échange.
  partie.etat.minuteurFin = Date.now() - 1;
  await partie.alarm();
  assert.equal(partie.etat.phase, "echange");
  assert.equal(partie.etat.tempsEcoule, true);
  assert.equal(ecran.derniereVue().tempsEcoule, true);
  await envoyer(ecran, { t: "fin_minuteur" }); // l'animateur lance la suite
  assert.equal(partie.etat.phase, "reponse");

  const SECRET_A = "Je demande de l'aide à un pote zorglubA";
  const SECRET_B = "On cherche une solution ensemble zorglubB";
  await envoyer(a, { t: "reponse", texte: SECRET_A });
  await envoyer(b, { t: "reponse", texte: SECRET_B });
  await attendreIA(ctx);
  assert.ok(["solution", "indice"].includes(partie.etat.phase), partie.etat.phase);
  if (partie.etat.phase === "indice") {
    await envoyer(ecran, { t: "suivant" }); // echange2
    await envoyer(ecran, { t: "fin_minuteur" }); // choix
    await envoyer(a, { t: "choix", index: 0 });
    await envoyer(b, { t: "choix", index: 1 });
  }
  assert.equal(partie.etat.phase, "solution");
  await envoyer(ecran, { t: "suivant" }); // attribuer
  await attendreIA(ctx);
  assert.equal(partie.etat.phase, "competences");
  assert.ok(a.derniereVue().moi.competenceDuProbleme);
  await envoyer(a, { t: "garder_competence", garder: true });
  await envoyer(b, { t: "garder_competence", garder: false });
  assert.equal(partie.etat.phase, "fin");
  assert.ok(ctx.alarme >= Date.now() + 59 * 60 * 1000, "nettoyage programmé une heure plus tard");

  const fiche = await partie.fiche("joueur-aaaa-1111");
  assert.equal(fiche.joueur.pseudo, "Alex");
  assert.equal(fiche.jeu.length, 1);
  assert.ok(fiche.depart.length >= 1);
  assert.equal(await partie.fiche("inconnu-0000"), null);

  // La clé animateur ne sort jamais : ni dans une vue (écran, joueurs), ni dans la fiche.
  for (const ws of [ecran, a, b]) assert.ok(!JSON.stringify(ws.recus).includes(CLE), "clé animateur dans une vue");
  assert.ok(!JSON.stringify(fiche).includes(CLE), "clé animateur dans la fiche");
  assert.ok(!JSON.stringify(await partie.fiche("joueur-bbbb-2222")).includes(CLE));

  // L'écran n'a jamais reçu le texte d'une réponse ; un joueur ne voit pas celle de l'autre.
  const toutEcran = JSON.stringify(ecran.recus);
  assert.ok(!toutEcran.includes("zorglub"), "fuite d'une réponse vers l'écran");
  assert.ok(!JSON.stringify(a.recus).includes("zorglubB"), "fuite de la réponse de B vers A");

  // Déconnexion puis nettoyage à l'échéance.
  b.readyState = 3;
  await partie.webSocketClose(b, 1006);
  assert.equal(partie.etat.joueurs["joueur-bbbb-2222"].connecte, false);
  await ctx.storage.put("nettoyage", Date.now() - 1);
  await partie.alarm();
  assert.equal(partie.etat, null);
  assert.equal(ctx.stockage.size, 0, "rien n'est conservé après la partie");
});

test("Partie : messages invalides → erreur en français, état inchangé", async () => {
  const ctx = fauxContexte();
  const partie = new Partie(ctx, { MJ_MODE: "mock" });
  await ctx.pret;
  await partie.init({ code: "BCDG" });
  const a = brancher(ctx, "joueur", "joueur-cccc-3333");
  const avant = JSON.stringify(partie.etat);
  await partie.webSocketMessage(a, "pas du json");
  await partie.webSocketMessage(a, JSON.stringify({ t: "minuteur_fini" }));
  await partie.webSocketMessage(a, JSON.stringify({ t: "reponse", texte: "x" }));
  await partie.webSocketMessage(a, "x".repeat(9000));
  assert.equal(JSON.stringify(partie.etat), avant);
  assert.equal(a.recus.filter((m) => m.t === "erreur").length, 4);
  for (const m of a.recus) assert.equal(typeof m.message, "string");
});

test("Partie : un joueur oublié par le MJ reçoit quand même sa compétence (mock en complément)", async () => {
  const ctx = fauxContexte();
  const partie = new Partie(ctx, { MJ_MODE: "mock" });
  await ctx.pret;
  const { problemes } = JSON.parse(readFileSync(new URL("../public/data/problemes.json", import.meta.url), "utf8"));
  const probleme = problemes[0];
  // MJ qui « oublie » le joueur B.
  partie.mj = {
    evaluer: async () => ({ resolu: false, synthese: null }),
    attribuer: async () => ({ "joueur-aaaa-1111": { code: probleme.competences[0].code, libelle: "x", mots: "Tu as aidé.", preuve: "aider", typePreuve: "jeu", riasec: [] } }),
  };
  const ev = await partie.calculerIA({
    type: "attribuer",
    problemeIndex: 0,
    probleme,
    historique: { "joueur-aaaa-1111": { reponses: ["aider"], choix: null }, "joueur-bbbb-2222": { reponses: [], choix: null } },
  });
  assert.equal(ev.t, "attribution_faite");
  assert.equal(ev.competences["joueur-aaaa-1111"].code, probleme.competences[0].code);
  assert.equal(ev.competences["joueur-bbbb-2222"].code, probleme.competenceParticipation);
  assert.equal(ev.competences["joueur-bbbb-2222"].typePreuve, "participation");
});

// ─────────────────────────── Non-régression (correctifs) ───────────────────────────

const { DELAI_GARDE_IA_MS, MAX_SOCKETS_JOUEURS, cleIA, CODE_ACCES_REFUSE, egalTempsConstant } = await import("../src/partie.js");
const { vue } = await import("../src/jeu.js");

/**
 * Exécute `f` avec un faux WebSocketPair et une Response qui accepte le statut 101
 * (Node refuse `new Response(null, { status: 101 })`).
 */
async function avecFauxWebSocket(f) {
  const VraieResponse = globalThis.Response;
  const avaitPaire = "WebSocketPair" in globalThis;
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = new FausseSocket([]);
      this[1] = new FausseSocket([]);
    }
  };
  globalThis.Response = class extends VraieResponse {
    constructor(corps, init) {
      if (init?.status === 101) {
        super(null, { status: 200 });
        this.statut = 101;
        this.webSocket = init.webSocket;
      } else super(corps, init);
    }
  };
  try {
    return await f();
  } finally {
    globalThis.Response = VraieResponse;
    if (!avaitPaire) delete globalThis.WebSocketPair;
  }
}

/** Partie en mode mock avec 1 écran et 1 joueur, avancée jusqu'à la phase `reponse`. */
async function partieEnReponse(code, env = { MJ_MODE: "mock" }) {
  const ctx = fauxContexte();
  const partie = new Partie(ctx, env);
  await ctx.pret;
  await partie.init({ code, nbProblemes: 1, dureeEchange: 10, dureeReponse: 10 });
  const ecran = brancher(ctx, "ecran");
  const a = brancher(ctx, "joueur", "joueur-aaaa-1111");
  const envoyer = (ws, msg) => partie.webSocketMessage(ws, JSON.stringify(msg));
  await envoyer(a, { t: "rejoindre", pseudo: "Alex", avatar: "🦊" });
  await envoyer(ecran, { t: "demarrer" });
  await envoyer(ecran, { t: "suivant" }); // creation → presentation (personne n'a fini)
  await envoyer(ecran, { t: "suivant" }); // echange
  await envoyer(ecran, { t: "fin_minuteur" }); // reponse
  assert.equal(partie.etat.phase, "reponse");
  return { ctx, partie, ecran, a, envoyer };
}

test("Partie : appel IA perdu (redémarrage du DO) → le chien de garde relance l'évaluation avec le mock", async () => {
  const env = { MJ_MODE: "mock" };
  const { ctx, partie, a, envoyer } = await partieEnReponse("BCDH", env);
  partie.lancerIA = async () => {}; // l'appel est perdu : aucun résultat ne reviendra
  const avant = Date.now();
  await envoyer(a, { t: "reponse", texte: "On éteint le téléphone et on le fait sécher" });
  assert.equal(partie.etat.phase, "evaluation");
  const gardes = ctx.stockage.get("gardesIA");
  const cle = cleIA({ type: "evaluer", tourId: partie.etat.tourId });
  assert.deepEqual(Object.keys(gardes), [cle], "échéance persistée avant l'appel");
  assert.ok(gardes[cle] >= avant + DELAI_GARDE_IA_MS && gardes[cle] <= Date.now() + DELAI_GARDE_IA_MS);
  assert.ok(ctx.alarme <= gardes[cle], "l'alarme sonne au plus tard à l'échéance");

  // Redémarrage : nouvelle instance sur le même stockage ; avant l'échéance, rien ne bouge.
  let relancee = new Partie(ctx, env);
  await ctx.pret;
  await relancee.alarm();
  assert.equal(relancee.etat.phase, "evaluation");

  // Échéance passée : le MJ de secours prend le relais.
  ctx.stockage.set("gardesIA", { [cle]: Date.now() - 1 });
  relancee = new Partie(ctx, env);
  await ctx.pret;
  await relancee.alarm();
  assert.ok(["solution", "indice"].includes(relancee.etat.phase), relancee.etat.phase);
  assert.deepEqual(ctx.stockage.get("gardesIA"), {}, "échéance retirée");
  assert.ok(ctx.alarme > Date.now(), "alarme d'abandon reprogrammée");
});

test("Partie : chien de garde en création (récit resté « en analyse ») et en compétences", async () => {
  const env = { MJ_MODE: "mock" };
  const ctx = fauxContexte();
  let partie = new Partie(ctx, env);
  await ctx.pret;
  await partie.init({ code: "BCDJ", nbProblemes: 1, dureeEchange: 10, dureeReponse: 10 });
  const ecran = brancher(ctx, "ecran");
  const a = brancher(ctx, "joueur", "joueur-aaaa-1111");
  const envoyer = (ws, msg) => partie.webSocketMessage(ws, JSON.stringify(msg));
  await envoyer(a, { t: "rejoindre", pseudo: "Alex", avatar: "🦊" });
  await envoyer(ecran, { t: "demarrer" });
  partie.lancerIA = async () => {};
  await envoyer(a, { t: "recit", texte: "Je garde mon petit frère le mercredi après l'école." });
  assert.equal(partie.etat.joueurs["joueur-aaaa-1111"].depart.etat, "analyse");
  const cle = cleIA({ type: "analyser_recit", joueurId: "joueur-aaaa-1111" });
  ctx.stockage.set("gardesIA", { [cle]: Date.now() - 1 });
  partie = new Partie(ctx, env);
  await ctx.pret;
  await partie.alarm();
  assert.equal(partie.etat.joueurs["joueur-aaaa-1111"].depart.etat, "a_valider", "analyse mock faite");

  // Compétences sans attribution.
  await partie.traiter({ t: "valider_depart", garder: partie.etat.joueurs["joueur-aaaa-1111"].depart.propositions.map(() => true), role: "joueur", joueurId: "joueur-aaaa-1111" });
  await partie.traiter({ t: "suivant", role: "ecran" }); // echange
  await partie.traiter({ t: "fin_minuteur", role: "ecran" }); // reponse
  await partie.traiter({ t: "reponse", texte: "Je le sèche", role: "joueur", joueurId: "joueur-aaaa-1111" });
  await attendreIA(ctx);
  if (partie.etat.phase === "indice") {
    await partie.traiter({ t: "suivant", role: "ecran" });
    await partie.traiter({ t: "fin_minuteur", role: "ecran" });
    await partie.traiter({ t: "fin_minuteur", role: "ecran" });
  }
  assert.equal(partie.etat.phase, "solution");
  partie.lancerIA = async () => {};
  await partie.traiter({ t: "suivant", role: "ecran" });
  assert.equal(partie.etat.phase, "competences");
  assert.equal(partie.etat.attribution, null);
  ctx.stockage.set("gardesIA", { [cleIA({ type: "attribuer", problemeIndex: 0 })]: Date.now() - 1 });
  partie = new Partie(ctx, env);
  await ctx.pret;
  await partie.alarm();
  assert.ok(partie.etat.attribution, "attribution faite par le mock");
  assert.ok(partie.etat.joueurs["joueur-aaaa-1111"].competences.some((c) => c.problemeIndex === 0));
});

test("Partie : « Suivant » pendant que le MJ réfléchit relance tout de suite avec le MJ de secours", async () => {
  const { ctx, partie, ecran, a, envoyer } = await partieEnReponse("BCDK");
  // MJ IA qui ne répond jamais.
  partie.mj = { evaluer: () => new Promise(() => {}), attribuer: () => new Promise(() => {}) };
  await envoyer(a, { t: "reponse", texte: "On éteint le téléphone et on le fait sécher" });
  assert.equal(partie.etat.phase, "evaluation");
  ctx.enAttente.length = 0; // l'appel bloqué n'est pas attendu
  await envoyer(ecran, { t: "suivant" });
  assert.equal(ecran.recus.at(-1).t, "etat", "accepté, pas d'erreur");
  await ctx.enAttente.shift();
  assert.ok(["solution", "indice"].includes(partie.etat.phase), partie.etat.phase);
});

test("Partie : chaque message { t:'etat' } porte l'heure du serveur ; la vue porte le début et la durée du minuteur", async () => {
  const avant = Date.now();
  const { a, ecran } = await partieEnReponse("BCDL");
  for (const ws of [a, ecran]) {
    const m = ws.recus.filter((x) => x.t === "etat").at(-1);
    assert.equal(typeof m.serveur, "number");
    assert.ok(m.serveur >= avant && m.serveur <= Date.now());
    assert.equal(m.vue.minuteurDuree, 10000);
    assert.equal(m.vue.minuteurFin - m.vue.minuteurDebut, 10000);
  }
});

test("Partie : un message qui ne change rien n'écrit pas le stockage et ne diffuse pas", async () => {
  const { ctx, ecran, a, envoyer } = await partieEnReponse("BCDM");
  let ecritures = 0;
  const put = ctx.storage.put;
  ctx.storage.put = async (...args) => {
    ecritures++;
    return put(...args);
  };
  const nbEcran = ecran.recus.length;
  await envoyer(a, { t: "rejoindre", pseudo: "Alex", avatar: "🦊" }); // reconnexion d'un joueur déjà connecté : rien ne change
  assert.equal(ecritures, 0, "aucune écriture");
  assert.equal(ecran.recus.length, nbEcran, "aucune diffusion");
  assert.equal(a.recus.at(-1).t, "etat", "l'expéditeur reçoit quand même sa vue");
});

test("Partie : débit limité par socket (seau à jetons), fermeture 4008 en cas d'abus répété", async () => {
  const ctx = fauxContexte();
  const partie = new Partie(ctx, { MJ_MODE: "mock" });
  await ctx.pret;
  await partie.init({ code: "BCDN" });
  const ecran = brancher(ctx, "ecran");
  let ecritures = 0;
  const put = ctx.storage.put;
  ctx.storage.put = async (...args) => {
    ecritures++;
    return put(...args);
  };
  for (let i = 0; i < 40; i++) await partie.webSocketMessage(ecran, JSON.stringify({ t: "reglages", dureeEchange: 60 }));
  assert.equal(ecritures, 1, "un seul réglage réellement changé → une seule écriture");
  assert.ok(ecran.recus.some((m) => m.t === "erreur" && /trop de messages/i.test(m.message)));
  assert.equal(ecran.readyState, 3);
  assert.equal(ecran.codeFermeture, 4008);
});

test("Partie.fetch : limites de sockets (joueurs inconnus, partie commencée, écrans, onglets d'un joueur)", async () => {
  await avecFauxWebSocket(async () => {
    const ctx = fauxContexte();
    const partie = new Partie(ctx, { MJ_MODE: "mock" });
    await ctx.pret;
    const { cleEcran } = await partie.init({ code: "BCDP" });
    const requete = (q) => ({ url: `http://x/api/parties/BCDP/ws?${q}`, headers: new Headers({ Upgrade: "websocket" }) });
    const derniere = () => ctx.sockets.at(-1);

    // Écrans : au plus 2, le plus ancien est remplacé.
    for (let i = 0; i < 3; i++) assert.equal((await partie.fetch(requete(`role=ecran&cle=${cleEcran}`))).statut, 101);
    const ecrans = ctx.sockets.filter((s) => s.tags.includes("ecran"));
    assert.equal(ecrans[0].codeFermeture, 4002);
    assert.equal(ctx.getWebSockets("ecran").length, 2);

    // Joueurs inconnus en accueil : acceptés jusqu'au plafond, puis 409.
    for (let i = 0; i < MAX_SOCKETS_JOUEURS; i++) {
      const r = await partie.fetch(requete("role=joueur"));
      assert.equal(r.statut, 101);
      assert.equal(derniere().recus[0].t, "bienvenue");
    }
    const plein = await partie.fetch(requete("role=joueur"));
    assert.equal(plein.status, 409);
    assert.match((await plein.json()).erreur, /complète/);

    // Un joueur connu peut toujours revenir ; au plus 3 onglets (le plus ancien est fermé).
    const premier = ctx.sockets.find((s) => s.tags.includes("joueur"));
    const id = premier.recus[0].joueurId;
    await partie.webSocketMessage(premier, JSON.stringify({ t: "rejoindre", pseudo: "Alex", avatar: "🦊" }));
    assert.ok(partie.etat.joueurs[id]);
    for (let i = 0; i < 3; i++) assert.equal((await partie.fetch(requete(`role=joueur&joueur=${id}`))).statut, 101);
    assert.equal(premier.codeFermeture, 4002);
    assert.equal(ctx.getWebSockets(id).length, 3);

    // Partie commencée : un nouveau joueur reçoit un message clair, puis la socket est fermée (4009).
    for (const s of ctx.sockets) if (s.tags.includes("joueur") && !s.tags.includes(id)) s.close(1000);
    await partie.traiter({ t: "demarrer", role: "ecran" });
    assert.equal((await partie.fetch(requete("role=joueur"))).statut, 101);
    const tard = derniere();
    assert.deepEqual(tard.recus.map((m) => m.t), ["erreur"]);
    assert.match(tard.recus[0].message, /déjà commencé/);
    assert.equal(tard.codeFermeture, 4009);
    assert.equal(Object.keys(partie.etat.joueurs).length, 1);
  });
});

// ─────────────────────────── Accès animateur (clé de l'écran) ───────────────────────────

test("egalTempsConstant : égalité stricte, longueurs et types différents refusés", () => {
  const cle = "3f2b8c1e-9d4a-4b7e-8f00-112233445566";
  assert.equal(egalTempsConstant(cle, cle), true);
  assert.equal(egalTempsConstant(cle.slice(0, -1) + "7", cle), false, "dernier caractère");
  assert.equal(egalTempsConstant("x" + cle.slice(1), cle), false, "premier caractère");
  assert.equal(egalTempsConstant(cle.slice(0, -1), cle), false, "préfixe");
  assert.equal(egalTempsConstant(cle + "0", cle), false, "suffixe en trop");
  assert.equal(egalTempsConstant(cle.toUpperCase(), cle), false, "casse");
  for (const ko of ["", null, undefined, 42, {}]) assert.equal(egalTempsConstant(ko, cle), false, String(ko));
  assert.equal(egalTempsConstant("", ""), false, "clé attendue vide : toujours refusé");
  assert.equal(egalTempsConstant(cle, undefined), false, "partie sans clé : toujours refusé");
});

test("Partie.fetch : écran sans clé ou avec une mauvaise clé refusé (4003), bonne clé acceptée", async () => {
  await avecFauxWebSocket(async () => {
    const ctx = fauxContexte();
    const partie = new Partie(ctx, { MJ_MODE: "mock" });
    await ctx.pret;
    const { cleEcran } = await partie.init({ code: "BCDQ" });
    const requete = (q) => ({ url: `http://x/api/parties/BCDQ/ws?${q}`, headers: new Headers({ Upgrade: "websocket" }) });
    const derniere = () => ctx.sockets.at(-1);

    // Bonne clé : écran accepté, il reçoit sa vue.
    assert.equal((await partie.fetch(requete(`role=ecran&cle=${encodeURIComponent(cleEcran)}`))).statut, 101);
    const animateur = derniere();
    assert.deepEqual(animateur.tags, ["ecran"]);
    assert.equal(animateur.recus[0].t, "etat");
    assert.equal(animateur.readyState, 1);

    const autreCle = cleEcran.slice(0, -1) + (cleEcran.endsWith("0") ? "1" : "0");
    const refus = [
      "role=ecran",
      "role=ecran&cle=",
      `role=ecran&cle=${autreCle}`,
      `role=ecran&cle=${cleEcran}x`,
      `role=ecran&cle=${cleEcran.toUpperCase()}`,
      `role=ecran&cle=${"a".repeat(5000)}`,
      `role=ecran&joueur=${cleEcran}`,
    ];
    for (const q of refus) {
      const r = await partie.fetch(requete(q));
      assert.equal(r.statut, 101, q);
      const ws = derniere();
      assert.deepEqual(ws.recus.map((m) => m.t), ["erreur"], `${q} : un message lisible, aucune vue`);
      assert.match(ws.recus[0].message, /Accès animateur refusé/);
      assert.equal(ws.codeFermeture, CODE_ACCES_REFUSE, q);
      assert.equal(CODE_ACCES_REFUSE, 4003);
      assert.ok(!JSON.stringify(ws.recus).includes(cleEcran), "la clé n'est pas renvoyée à l'intrus");
    }
    // L'intrus ne déconnecte jamais l'animateur et ne compte pas parmi les écrans.
    assert.equal(animateur.readyState, 1, "l'écran légitime reste connecté");
    assert.equal(animateur.codeFermeture, undefined);
    assert.equal(ctx.getWebSockets("ecran").length, 1);

    // Une socket refusée encore ouverte (fermeture en cours) ne reçoit aucune
    // diffusion et ne pilote rien.
    const intrus = new FausseSocket([]);
    ctx.acceptWebSocket(intrus, ["refuse"]);
    intrus.serializeAttachment({ role: "refuse", joueurId: null });
    const j = brancher(ctx, "joueur", "joueur-aaaa-1111");
    await partie.webSocketMessage(j, JSON.stringify({ t: "rejoindre", pseudo: "Alex", avatar: "🦊" }));
    assert.equal(intrus.recus.length, 0, "aucune vue diffusée à une socket refusée");
    await partie.webSocketMessage(intrus, JSON.stringify({ t: "demarrer" }));
    assert.equal(partie.etat.phase, "accueil", "une socket refusée ne pilote rien");
    assert.equal(intrus.codeFermeture, 4000);

    // L'animateur légitime, lui, pilote la partie.
    await partie.webSocketMessage(animateur, JSON.stringify({ t: "demarrer" }));
    assert.equal(partie.etat.phase, "creation");
    // ?cle= sur une connexion joueur ne donne aucun droit d'écran.
    assert.equal((await partie.fetch(requete(`role=joueur&joueur=joueur-aaaa-1111&cle=${cleEcran}`))).statut, 101);
    assert.deepEqual(derniere().tags, ["joueur", "joueur-aaaa-1111"]);
  });
});

test("Partie.fetch : partie sans cleEcran dans son état (créée avant le correctif) → écran refusé", async () => {
  await avecFauxWebSocket(async () => {
    const ctx = fauxContexte();
    const partie = new Partie(ctx, { MJ_MODE: "mock" });
    await ctx.pret;
    await partie.init({ code: "BCDR" });
    delete partie.etat.cleEcran;
    const requete = (q) => ({ url: `http://x/api/parties/BCDR/ws?${q}`, headers: new Headers({ Upgrade: "websocket" }) });
    for (const q of ["role=ecran", "role=ecran&cle=", "role=ecran&cle=undefined", "role=ecran&cle=null"]) {
      await partie.fetch(requete(q));
      assert.equal(ctx.sockets.at(-1).codeFermeture, 4003, q);
    }
  });
});

test("cleEcran absente de toute vue (écran, joueur, joueur inconnu) à chaque phase, et de la fiche", async () => {
  const { ctx, partie, ecran, a, envoyer } = await partieEnReponse("BCDS");
  const cle = partie.etat.cleEcran;
  assert.ok(cle, "clé présente dans l'état");
  const phases = new Set();
  const verifierVues = () => {
    phases.add(partie.etat.phase);
    for (const v of [vue(partie.etat, "ecran"), vue(partie.etat, "joueur", "joueur-aaaa-1111"), vue(partie.etat, "joueur", "inconnu-0000")]) {
      const texte = JSON.stringify(v);
      assert.ok(!texte.includes(cle), `fuite de la clé (phase ${partie.etat.phase})`);
      assert.ok(!texte.includes("cleEcran"), `champ cleEcran dans une vue (phase ${partie.etat.phase})`);
    }
  };
  verifierVues();
  await envoyer(a, { t: "reponse", texte: "On éteint le téléphone et on le fait sécher" });
  await attendreIA(ctx);
  verifierVues();
  for (let n = 0; partie.etat.phase !== "fin" && n < 20; n++) {
    const phase = partie.etat.phase;
    if (phase === "choix") await envoyer(a, { t: "choix", index: 0 });
    else if (phase === "competences" && partie.etat.attribution) await envoyer(a, { t: "garder_competence", garder: true });
    else if (phase === "echange2") await envoyer(ecran, { t: "fin_minuteur" });
    else await envoyer(ecran, { t: "suivant" });
    await attendreIA(ctx);
    verifierVues();
  }
  assert.equal(partie.etat.phase, "fin", `phases vues : ${[...phases].join(", ")}`);
  for (const ws of [ecran, a]) assert.ok(!JSON.stringify(ws.recus).includes(cle), "clé dans un message envoyé");
  const fiche = await partie.fiche("joueur-aaaa-1111");
  assert.ok(fiche);
  assert.ok(!JSON.stringify(fiche).includes(cle), "clé dans la fiche");
  assert.equal(partie.etat.cleEcran, cle, "la clé ne change pas en cours de partie");
});

test("lireJson : Content-Length vérifié avant lecture, flux coupé dès que la limite est dépassée", async () => {
  const { lireJson } = outils;
  // Content-Length trop grand : le corps n'est jamais lu.
  const jamaisLu = { headers: new Headers({ "content-length": "90000000" }), body: { getReader() { throw new Error("lu"); } } };
  assert.deepEqual(await lireJson(jamaisLu, 2000), { trop: true });
  assert.deepEqual(await lireJson({ headers: new Headers({ "content-length": "abc" }), body: null }, 2000), { trop: true });

  // Sans Content-Length (chunked) : lecture arrêtée tôt.
  let tires = 0;
  let annule = false;
  const flux = new ReadableStream({
    pull(c) {
      tires++;
      c.enqueue(new Uint8Array(1000).fill(0x61));
    },
    cancel() {
      annule = true;
    },
  });
  assert.deepEqual(await lireJson({ headers: new Headers(), body: flux }, 2000), { trop: true });
  assert.ok(tires <= 8, `lecture arrêtée tôt (${tires} morceaux)`);
  assert.ok(annule, "flux annulé");

  // Cas normaux.
  assert.deepEqual(await lireJson(new Request("http://x", { method: "POST", body: JSON.stringify({ a: "é" }) }), 2000), { corps: { a: "é" } });
  assert.deepEqual(await lireJson(new Request("http://x", { method: "POST" }), 2000), { corps: null });
  const r = await worker.fetch(new Request("http://x/api/parties", { method: "POST", body: "x".repeat(7000) }), {});
  assert.equal(r.status, 413);
});

test("analyse : le timeout est une limite TOTALE (signal d'abandon)", async () => {
  let signal = null;
  const client = {
    chat: {
      completions: {
        create: (params, options) =>
          new Promise((_, rejeter) => {
            signal = options?.signal;
            signal?.addEventListener("abort", () => rejeter(new Error("aborted")));
          }),
      },
    },
  };
  const debut = Date.now();
  await assert.rejects(analyser("Je garde mon petit frère le mercredi.", { rome, client, timeout: 50 }), /aborted/);
  assert.ok(signal, "un signal est passé au client");
  assert.ok(Date.now() - debut < 2000);
});

test("analyse : citation d'un ou deux mots écartée (« citation trop courte ») ; libellés accentués", async () => {
  const recit = "Je garde mon petit frère le mercredi après l'école.";
  const client = {
    chat: {
      completions: {
        create: async () => ({
          model: "gpt-5-nano",
          choices: [{
            finish_reason: "stop",
            message: { refusal: null, content: JSON.stringify({
              competences: [
                { code_rome: "1A102", situation: "Garde", citation: "je", mots_du_jeune: "Tu gardes.", question_psy: "?" },
                { code_rome: "1A102", situation: "Garde", citation: "Je garde mon petit frère", mots_du_jeune: "Tu gardes.", question_psy: "?" },
              ],
              pistes_entretien: [],
              a_approfondir: [],
            }) },
          }],
        }),
      },
    },
  };
  const res = await analyser(recit, { rome, client });
  assert.deepEqual(res.competences.map((c) => c.citation), ["Je garde mon petit frère"]);
  assert.deepEqual(res.ecartees, [{ code_rome: "1A102", raison: "citation trop courte" }]);

  const mock = await analyser("Quand mes potes vont mal, je les écoute pendant des heures au téléphone.", { rome, mode: "mock" });
  const ecoute = mock.competences.find((c) => c.code_rome === "6D101");
  assert.ok(ecoute);
  assert.equal(ecoute.libelle_rome, "Être à l'écoute, faire preuve d'empathie");
});
