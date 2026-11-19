// Tests des fonctions pures de l'écran commun (public/js/ecran.js, importable sous Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../public/js/ecran.js";

test("formaterDuree / libelleDuree", () => {
  assert.equal(E.formaterDuree(83_500), "1:24");
  assert.equal(E.formaterDuree(-5), "0:00");
  assert.equal(E.formaterDuree(120_000), "2:00");
  assert.equal(E.libelleDuree(90), "1 min 30");
  assert.equal(E.libelleDuree(45), "45 s");
  assert.equal(E.libelleDuree(120), "2 min");
});
test("backoff plafonné et croissant", () => {
  const d = [1,2,3,4,5,6,10].map(E.delaiReconnexion);
  assert.deepEqual(d, [1000,2000,4000,8000,15000,15000,15000]);
});
test("compteReponses anonyme", () => {
  assert.deepEqual(E.compteReponses({ compte: { repondu: 3, total: 4 } }), { repondu: 3, total: 4 });
  assert.deepEqual(E.compteReponses({ joueurs: [{ aRepondu: true }, { aRepondu: false }] }), { repondu: 1, total: 2 });
});
test("minuteur", () => {
  assert.equal(E.dureePhase("echange2", { dureeEchange: 60 }), 60);
  assert.equal(E.dureePhase("choix"), 90);
  assert.equal(E.progressionMinuteur(1000 + 45_000, 90_000, 1000), 0.5);
  assert.equal(E.progressionMinuteur(0, 90_000, 1000), 0);
});
test("chaque phase de la démo se rend, sans fuite ni mot interdit", () => {
  const vues = E.vuesDemo(0);
  const phases = new Set(vues.map((v) => v.phase));
  for (const p of ["accueil","creation","presentation","echange","reponse","evaluation","solution","indice","echange2","choix","competences","fin"]) assert.ok(phases.has(p), p);
  for (const v of vues) {
    const html = E.rendreScene(v, { origine: "http://x" });
    assert.ok(html.length > 50, v.phase);
    assert.doesNotMatch(html, /\bfaux\b|mauvaise réponse|score|classement|undefined|null/i, v.phase);
    assert.ok(E.commandesPour(v));
  }
});
test("choix : jamais de marque correct", () => {
  const html = E.rendreScene({ phase: "choix", choix: [{ texte: "a", correct: false }, { texte: "b", correct: true }, "c", "d"], joueurs: [] });
  assert.doesNotMatch(html, /correct/i);
  assert.equal((html.match(/class="numero"/g) || []).length, 4);
});
test("échappement des pseudos (XSS)", () => {
  const html = E.rendreScene({ phase: "accueil", code: "ABCD", joueurs: [{ pseudo: "<img src=x onerror=alert(1)>", avatar: "🦊" }] }, { origine: "" });
  assert.doesNotMatch(html, /<img src=x/);
});
test("solution : synthèse si résolu, sinon resume", () => {
  assert.equal(E.texteSolution({ evaluation: { resolu: true, synthese: "S" }, solution: "R" }), "S");
  assert.equal(E.texteSolution({ evaluation: { resolu: false, synthese: null }, solution: { resume: "R" } }), "R");
});
test("commandes par phase", () => {
  assert.equal(E.commandesPour({ phase: "accueil", joueurs: [] })[0].desactive, true);
  assert.equal(E.commandesPour({ phase: "reponse" })[0].message.t, "fin_minuteur");
  assert.equal(E.commandesPour({ phase: "competences", problemeIndex: 2, nbProblemes: 3 })[0].libelle, "Voir la fin");
  assert.deepEqual(E.commandesPour({ phase: "evaluation" }), []);
});

// ---------- Non-régression (corrections front) ----------

const cible = (tag) => ({
  closest: (sel) => (sel.split(",").map((s) => s.trim().split(":")[0]).includes(tag) ? { tag } : null),
});

test("raccourci → / PageDown : marche même si le focus est sur un bouton ou un lien", () => {
  for (const key of ["ArrowRight", "PageDown"]) {
    assert.equal(E.estRaccourciSuivant({ key, target: cible("button") }), true, `${key} sur un bouton`);
    assert.equal(E.estRaccourciSuivant({ key, target: cible("a") }), true, `${key} sur un lien`);
    assert.equal(E.estRaccourciSuivant({ key, target: cible("body") }), true);
  }
  for (const tag of ["input", "select", "textarea", "[contenteditable]"]) {
    assert.equal(E.estRaccourciSuivant({ key: "PageDown", target: cible(tag) }), false, `pas dans ${tag}`);
  }
  assert.equal(E.estRaccourciSuivant({ key: "PageDown", ctrlKey: true, target: cible("body") }), false);
  assert.equal(E.estRaccourciSuivant({ key: "Enter", target: cible("body") }), false);
  assert.equal(E.estRaccourciSuivant({ key: "ArrowRight", target: {} }), true, "cible sans closest");
});

test("QR : adresse locale détectée, ?hote= force l'origine, avertissement visible sur localhost", () => {
  for (const h of ["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0", "LOCALHOST"]) assert.ok(E.estAdresseLocale(h), h);
  for (const h of ["192.168.1.20", "code4sud.github.io", ""]) assert.ok(!E.estAdresseLocale(h), h);
  assert.equal(E.origineQR("http://localhost:8787", "192.168.1.20:8787"), "http://192.168.1.20:8787");
  assert.equal(E.origineQR("http://localhost:8787", "https://exemple.fr/x"), "https://exemple.fr");
  assert.equal(E.origineQR("http://localhost:8787", ""), "http://localhost:8787");
  assert.equal(E.origineQR("http://localhost:8787", "javascript:alert(1)"), "http://localhost:8787");
  assert.equal(E.origineQR("http://localhost:8787", "a b c"), "http://localhost:8787");
  const local = E.rendreScene({ phase: "accueil", code: "KDMZ", joueurs: [] }, { origine: "http://localhost:8787" });
  assert.match(local, /class="alerte-locale"/);
  assert.match(local, /--ip 0\.0\.0\.0/);
  const ip = E.rendreScene({ phase: "accueil", code: "KDMZ", joueurs: [] }, { origine: "http://192.168.1.20:8787" });
  assert.doesNotMatch(ip, /alerte-locale/);
  assert.match(ip, /data-lien="http:\/\/192\.168\.1\.20:8787\/p\/KDMZ"/);
});

test("lecture vocale découpée en phrases courtes (bug Chrome des ~15 s)", async () => {
  const { readFileSync } = await import("node:fs");
  const { problemes } = JSON.parse(readFileSync(new URL("../public/data/problemes.json", import.meta.url), "utf-8"));
  for (const p of problemes) {
    const texte = E.texteALire({ probleme: p });
    const morceaux = E.decouperPhrases(texte);
    assert.ok(morceaux.length >= 3, `${p.id} : plusieurs énoncés`);
    assert.ok(morceaux.every((m) => m.length <= 160), `${p.id} : chaque énoncé ≤ 160 caractères`);
    assert.equal(morceaux.join(" "), texte.replace(/\s+/g, " ").trim(), `${p.id} : rien n'est perdu`);
  }
  const long = `${"mot ".repeat(80)}fin, encore ${"truc ".repeat(40)}.`;
  const m = E.decouperPhrases(long);
  assert.ok(m.every((x) => x.length <= 160));
  assert.equal(m.join(" "), long.replace(/\s+/g, " ").trim());
  assert.deepEqual(E.decouperPhrases(""), []);
});

test("fermetures définitives (4001/4002/4003/4008/4009) : pas de reconnexion ; minuteur : durée du serveur", () => {
  for (const c of [4001, 4002, 4003, 4008, 4009]) assert.equal(E.fermetureDefinitive(c), true, String(c));
  for (const c of [1000, 1001, 1006, 4000]) assert.equal(E.fermetureDefinitive(c), false, String(c));
  // Rechargement 30 s après le début d'un échange de 120 s : total = durée envoyée par le serveur.
  const debut = 1_000_000, fin = debut + 120_000, maintenant = debut + 30_000;
  assert.equal(E.totalMinuteurEcran({ minuteurFin: fin, minuteurDebut: debut, minuteurDuree: 120_000 }, 90_000, maintenant), 120_000);
  assert.equal(E.totalMinuteurEcran({ minuteurFin: fin, minuteurDebut: debut }, 90_000, maintenant), 120_000);
  assert.equal(E.totalMinuteurEcran({ minuteurFin: fin }, 120_000, maintenant), 120_000);
  assert.equal(E.totalMinuteurEcran({ minuteurFin: null }, 120_000, maintenant), null);
});

// ---------- Accès animateur (clé de l'écran) ----------

/** Faux sessionStorage (Map) ; `casse` = stockage bloqué (navigation privée). */
function fauxStockage(casse = false) {
  const m = new Map();
  return {
    m,
    getItem: (k) => { if (casse) throw new Error("bloqué"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (casse) throw new Error("bloqué"); m.set(k, String(v)); },
    removeItem: (k) => { if (casse) throw new Error("bloqué"); m.delete(k); },
  };
}

const CLE = "3f2b8c1e-9d4a-4b7e-8f00-112233445566";

test("clé animateur : lue dans le fragment, rangée dans sessionStorage (pc-ecran-<code>)", () => {
  assert.equal(E.cleStockageEcran("KDMZ"), "pc-ecran-KDMZ");
  const s = fauxStockage();
  assert.equal(E.obtenirCleEcran("KDMZ", `#cle=${CLE}`, s), CLE);
  assert.equal(s.m.get("pc-ecran-KDMZ"), CLE);
  // Rechargement : le fragment a été effacé, la clé vient du stockage.
  assert.equal(E.obtenirCleEcran("KDMZ", "", s), CLE);
  // Une autre partie n'en profite pas.
  assert.equal(E.obtenirCleEcran("BCDF", "", s), null);
  // Un nouveau fragment remplace l'ancienne clé.
  const autre = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(E.obtenirCleEcran("KDMZ", `#cle=${autre}`, s), autre);
  assert.equal(s.m.get("pc-ecran-KDMZ"), autre);
});

test("clé animateur : stockage bloqué ou absent, valeurs invalides ignorées", () => {
  assert.equal(E.obtenirCleEcran("KDMZ", `#cle=${CLE}`, fauxStockage(true)), CLE, "le fragment suffit");
  assert.equal(E.obtenirCleEcran("KDMZ", "", fauxStockage(true)), null);
  assert.equal(E.obtenirCleEcran("KDMZ", `#cle=${CLE}`, null), CLE);
  assert.equal(E.obtenirCleEcran("KDMZ", "", undefined), null);
  for (const h of ["", "#", "#cle=", "#cle=<script>", "#cle=abc", `#cle=${"a".repeat(200)}`, "#autre=1"]) {
    assert.equal(E.obtenirCleEcran("KDMZ", h, fauxStockage()), null, h);
  }
  const s = fauxStockage();
  s.m.set("pc-ecran-KDMZ", "<img src=x>");
  assert.equal(E.obtenirCleEcran("KDMZ", "", s), null, "valeur rangée invalide ignorée");
});

test("clé animateur : le fragment est nettoyé (le reste est conservé)", () => {
  assert.deepEqual(E.lireFragmentCle(`#cle=${CLE}`), { cle: CLE, present: true, reste: "" });
  assert.deepEqual(E.lireFragmentCle(`#cle=${CLE}&vue=2`), { cle: CLE, present: true, reste: "#vue=2" });
  assert.deepEqual(E.lireFragmentCle("#cle=abc"), { cle: null, present: true, reste: "" }, "clé invalide : effacée quand même");
  assert.equal(E.lireFragmentCle("").present, false);
  assert.equal(E.lireFragmentCle("#haut").present, false);
});

test("clé animateur : jointe à la connexion WebSocket de l'écran", () => {
  assert.equal(E.urlWebSocketEcran("http:", "192.168.1.20:8787", "KDMZ", CLE), `ws://192.168.1.20:8787/api/parties/KDMZ/ws?role=ecran&cle=${CLE}`);
  assert.equal(E.urlWebSocketEcran("https:", "x.fr", "KDMZ", "a b&c"), "wss://x.fr/api/parties/KDMZ/ws?role=ecran&cle=a%20b%26c");
  assert.equal(E.urlWebSocketEcran("http:", "x", "KDMZ", null), "ws://x/api/parties/KDMZ/ws?role=ecran&cle=");
});

test("accès animateur refusé (4003) : message clair, lien vers l'accueil, pas de reconnexion", () => {
  assert.equal(E.CODE_ACCES_REFUSE, 4003);
  assert.equal(E.fermetureDefinitive(E.CODE_ACCES_REFUSE), true);
  const html = E.rendreAccesRefuse("KDMZ");
  assert.match(html, /Cette page animateur n'est accessible que depuis l'ordinateur qui a créé la partie/);
  assert.match(html, /href="index\.html"/);
  assert.doesNotMatch(html, /undefined|null/);
  assert.doesNotMatch(E.rendreAccesRefuse("<b>"), /<b>/, "code échappé");
});

test("index.html ouvre l'écran avec la clé dans le fragment ; le mode démo n'en a pas besoin", async () => {
  const { readFileSync } = await import("node:fs");
  const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf-8");
  assert.match(index, /#cle=\$\{encodeURIComponent\(cleEcran\)\}/, "clé passée en fragment");
  assert.doesNotMatch(index, /[?&]cle=/, "jamais dans la query (logs, Referer)");
  const ecran = readFileSync(new URL("../public/js/ecran.js", import.meta.url), "utf-8");
  assert.match(ecran, /history\.replaceState/, "fragment effacé de la barre d'adresse");
  assert.match(ecran, /!demo && codeValide\(code\) \? obtenirCleEcran/, "pas de clé cherchée en démo");
  assert.match(ecran, /if \(demo\) \{\s*demarrerDemo\(\);/, "la démo démarre avant toute vérification de clé");
});
