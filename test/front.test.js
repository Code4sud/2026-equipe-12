// Tests des fonctions pures du front : riasec.js, fiche.js, metiers-proches.js.
// node --test test/front.test.js (aucune dépendance de test).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RIASEC, ORDRE_RIASEC, SANS_TYPE, echapper, riasecDe, typeDe, reperesRiasec, poidsRiasec,
  blocRiasec, blocInteretsOrdonnes, legendeRiasec, puceRiasec,
} from "../public/js/riasec.js";
import {
  rendreFiche, normaliserFiche, blocMetiers, blocEsco, lienEsco, ligneCompetence,
  refletsPsy, relancesPsy, lettreEpisode, competencesTypees, blocChampDesPossibles, ZONES_METIERS,
} from "../public/js/fiche.js";
import { metiersProches, metiersParZone, typesDominants } from "../public/js/metiers-proches.js";

const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");
const ROME = JSON.parse(lire("public/data/rome.json"));
const ONET = JSON.parse(lire("public/data/metiers.json"));

const INJECTION = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
const sansBalise = (html) => {
  assert.ok(!/<script/i.test(html), "aucune balise <script> ne doit apparaître");
  assert.ok(!/<img/i.test(html), "aucune balise <img> injectée ne doit apparaître");
  assert.ok(!/javascript:/i.test(html), "aucun lien javascript:");
};

const comp = (x) => ({ typePreuve: "jeu", problemeIndex: 0, gardee: true, ...x });

// ---------- riasec.js ----------

test("RIASEC : les 6 couleurs de la SPEC §6", () => {
  assert.deepEqual(ORDRE_RIASEC, ["R", "I", "A", "S", "E", "C"]);
  const attendu = { R: "#c8743a", I: "#3a7bc8", A: "#a24fc0", S: "#2e9b6a", E: "#d8a019", C: "#5f6b85" };
  for (const [k, c] of Object.entries(attendu)) {
    assert.equal(RIASEC[k].couleur, c);
    assert.ok(RIASEC[k].nom && RIASEC[k].verbe && RIASEC[k].question);
    assert.ok(!("gommette" in RIASEC[k]), "plus de gommettes");
  }
});

test("echapper neutralise les caractères HTML", () => {
  assert.equal(echapper(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(echapper(null), "");
  assert.equal(echapper(42), "42");
});

test("riasecDe : champ riasec de la compétence, sinon rome.json, sinon rien", () => {
  assert.deepEqual(riasecDe({ code: "1A102", riasec: ["E"] }, ROME), ["E"]);
  assert.deepEqual(riasecDe({ code: "1A102" }, ROME), ["S", "E"]);
  assert.deepEqual(riasecDe({ code_rome: "1A102" }, ROME), ["S", "E"]);
  assert.deepEqual(riasecDe({ code: "6D102", riasec: [] }, ROME), []);
  assert.deepEqual(riasecDe({ code: "ZZZZZ" }, null), []);
  assert.deepEqual(riasecDe({ code: "X", riasec: ["Q", "<b>"] }, ROME), [], "lettres inconnues ignorées");
});

test("typeDe : couleur du code majeur, savoir-être sinon", () => {
  const t = typeDe({ code: "3E205" }, ROME);
  assert.equal(t.lettre, "R");
  assert.equal(t.couleur, RIASEC.R.couleur);
  const s = typeDe({ code: "6D102", riasec: [] }, ROME);
  assert.equal(s.lettre, null);
  assert.equal(s.couleur, SANS_TYPE.couleur);
});

test("reperesRiasec : majeur/mineur, dominants, poids (jamais affichés)", () => {
  const cs = [comp({ code: "1A102" }), comp({ code: "1D101" }), comp({ code: "6D104" }), comp({ code: "6D102", riasec: [] })];
  const { parType, dominants } = reperesRiasec(cs, ROME);
  assert.equal(parType.S.majeur.length, 2);
  assert.equal(parType.E.majeur.length, 1);
  assert.equal(parType.E.mineur.length, 1);
  assert.deepEqual(dominants, ["S", "E"]);
  assert.deepEqual(poidsRiasec(parType), { R: 0, I: 0, A: 0, S: 4, E: 3, C: 0 });
  assert.deepEqual(reperesRiasec([], ROME).dominants, []);
});

test("blocRiasec : 6 tuiles, pas de pourcentage, texte échappé", () => {
  const html = blocRiasec([comp({ code: "1A102", libelle: INJECTION })], ROME);
  sansBalise(html);
  assert.equal((html.match(/class="tuile-riasec/g) || []).length, 6);
  assert.ok(!/%/.test(html.replace(/style="[^"]*"/g, "")), "pas de pourcentage");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("legendeRiasec et puceRiasec", () => {
  const l = legendeRiasec();
  for (const k of ORDRE_RIASEC) assert.ok(l.includes(RIASEC[k].couleur));
  assert.ok(l.includes("blanche"));
  assert.equal(puceRiasec("Z"), "");
  assert.ok(puceRiasec("S").includes(RIASEC.S.couleur));
});

// ---------- metiers-proches.js ----------

test("metiersProches : 5 accessibles (zone ≤ 3) + 3 longs (zone ≥ 4), null sans repère", () => {
  assert.equal(metiersProches({}, ONET.metiers), null);
  const res = metiersProches({ S: 4, E: 2 }, ONET.metiers);
  assert.ok(res.accessibles.length > 0 && res.accessibles.length <= 5);
  assert.ok(res.plusLongs.length <= 3);
  assert.ok(res.accessibles.every((m) => m.zone <= 3));
  assert.ok(res.plusLongs.every((m) => m.zone >= 4));
  assert.ok(res.accessibles.every((m) => m.proximite > 0));
  assert.equal(typesDominants(res.accessibles[0]).length, 2);
});

// ---------- fiche.js ----------

test("normaliserFiche : seules les compétences gardées, départ puis jeu", () => {
  const f = normaliserFiche({
    pseudo: "Lina", avatar: "🦊",
    competences: [
      comp({ code: "1D101", problemeIndex: 2 }),
      comp({ code: "3E205", typePreuve: "vecu", problemeIndex: null }),
      comp({ code: "6D101", gardee: false }),
      comp({ code: "6D102", gardee: null }),
      comp({ code: "6B318", problemeIndex: 0 }),
    ],
  });
  assert.deepEqual(f.depart.map((c) => c.code), ["3E205"]);
  assert.deepEqual(f.jeu.map((c) => c.code), ["6B318", "1D101"]);
  // Autres formes acceptées
  assert.equal(normaliserFiche({ joueur: { pseudo: "A", competences: [] } }).pseudo, "A");
  const g = normaliserFiche({ moi: { pseudo: "B" }, depart: [{ code: "3E205" }], jeu: [comp({ code: "6B318" })] });
  assert.equal(g.depart.length, 1);
  assert.equal(g.jeu.length, 1);
  assert.deepEqual(normaliserFiche(null).depart, []);
});

test("rendreFiche : pseudo, avatar et preuves échappés (aucune balise injectée)", () => {
  const html = rendreFiche(
    {
      code: "BCDF",
      pseudo: INJECTION,
      avatar: "<b>",
      problemes: [{ titre: INJECTION }],
      competences: [
        comp({ code: "3E205", typePreuve: "vecu", problemeIndex: null, preuve: INJECTION, mots: INJECTION }),
        comp({ code: "1D101", preuve: `" onmouseover="alert(1)`, libelle: INJECTION }),
        comp({ code: "6D102", riasec: [], typePreuve: "participation", problemeIndex: 1, preuve: "A participé à la discussion de groupe" }),
      ],
    },
    { rome: ROME, onet: ONET, date: INJECTION },
  );
  sansBalise(html);
  assert.ok(!/<b>/.test(html));
  assert.ok(!html.includes(`" onmouseover="`));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Pour le psy"));
  assert.ok(html.includes("Des métiers à explorer, par zone"), "métiers rangés comme dans le Rapport des Possibles");
  assert.ok(html.includes("(indicatif)"));
  assert.ok(html.includes("Rapport des Possibles"), "la fiche se présente comme un complément du rapport");
  assert.ok(html.includes("2. Les types d&#39;activités où tu as montré des compétences pendant le jeu"));
  assert.ok(!html.includes("classés par ordre"), "plus de « intérêts classés par ordre »");
  assert.ok(html.includes("https://www.orientation-regionsud.fr/"), "lien vers la borne de l'Agora (salaires, formations)");
  assert.ok(html.includes("pastille-blanche"), "savoir-être sans RIASEC → pastille blanche");
  assert.ok(!/gommette/i.test(html), "plus de gommettes sur la fiche");
  assert.ok(!/\bfaux\b|mauvaise réponse/i.test(html));
});

test("rendreFiche : fonctionne sans données (rome/onet absents, aucune compétence)", () => {
  const html = rendreFiche({ pseudo: "Sam", competences: [] });
  assert.ok(html.includes("Sam"));
  assert.ok(!html.includes("Des métiers à explorer"));
  assert.ok(html.includes("Tes réponses dans l'histoire sont à relire avec le psy."), "plus de « Pas encore de compétence gagnée »");
  const sansPsy = rendreFiche({ pseudo: "Sam", competences: [] }, { psy: false });
  assert.ok(!sansPsy.includes("Pour le psy"));
});

test("ESCO : affiché si présent, échappé, lien seulement vers une URI ESCO officielle", () => {
  assert.equal(blocEsco({}), "");
  assert.equal(blocEsco({ esco: [] }), "");
  assert.equal(lienEsco("javascript:alert(1)"), null);
  assert.equal(lienEsco("http://data.europa.eu/esco/occupation/x\" onclick=\"y"), null);
  const uri = "http://data.europa.eu/esco/occupation/0e1e2b1d-4f3a-4b6b-9a7e-123456789abc";
  assert.ok(lienEsco(uri).startsWith("https://esco.ec.europa.eu/fr/classification/occupation?uri="));
  const html = blocEsco({
    esco: [
      { uri, titre: "aide-soignant/aide-soignante", type: "exactMatch", competences: ["écouter activement", INJECTION] },
      { uri: "javascript:alert(1)", titre: INJECTION, type: "broadMatch", competences: [] },
      { uri, titre: "ignoré (3e entrée)", type: "closeMatch", competences: [] },
    ],
  });
  sansBalise(html);
  assert.ok(html.includes("aide-soignant/aide-soignante"));
  assert.ok(html.includes("correspondance exacte"));
  assert.ok(html.includes("écouter activement"));
  assert.ok(!html.includes("ignoré"), "2 entrées ESCO au maximum");
  assert.equal((html.match(/<a /g) || []).length, 1, "pas de lien pour une URI non ESCO");
});

test("blocMetiers : avec et sans champ esco dans metiers.json", () => {
  const cs = [comp({ code: "1A102" }), comp({ code: "1D101" })];
  const sans = blocMetiers(cs, { ...ONET, metiers: ONET.metiers.map(({ esco, ...m }) => m) }, ROME);
  assert.ok(sans.includes("Sans études longues (jusqu'à bac+2)"));
  assert.ok(!/rapidement/.test(sans), "plus de promesse « rapidement » pour des métiers à bac+2");
  assert.ok(!sans.includes('class="esco"'));
  const avec = blocMetiers(cs, {
    ...ONET,
    metiers: ONET.metiers.map((m) => ({ ...m, esco: [{ uri: "http://data.europa.eu/esco/occupation/abc-123", titre: `ESCO ${m.code}`, type: "closeMatch", competences: ["compétence clé"] }] })),
  }, ROME, { ouvert: true });
  assert.ok(avec.includes('class="esco"'));
  assert.ok(avec.includes("compétence clé"));
  assert.ok(avec.includes('class="metier ouvert"'));
  assert.equal(blocMetiers([], ONET, ROME), "", "aucun repère RIASEC → pas de métiers");
  assert.equal(blocMetiers(cs, null, ROME), "");
});

test("relancesPsy, refletsPsy et ligneCompetence", () => {
  const cs = [comp({ code: "1A102", libelle: "Assurer l'encadrement" }), comp({ code: "1D101" })];
  const qs = relancesPsy(cs, ROME);
  assert.ok(qs.length >= 3 && qs.length <= 4);
  assert.ok(qs[0].includes("Assurer l'encadrement"));
  const li = ligneCompetence(comp({ code: "1D101", preuve: INJECTION }), ROME, INJECTION);
  sansBalise(li);
  assert.ok(li.includes("Conseiller, accompagner une personne"), "libellé retrouvé dans rome.json");
});

// ---------- Pages ----------

test("fiche-papier.html : nom, prénom, 6 cases « Compétence repérée », sans légende RIASEC", () => {
  const html = lire("public/fiche-papier.html");
  assert.ok(html.includes("Prénom :") && html.includes("Compétence repérée n° 6"));
  assert.ok(!/RIASEC|Réaliste|Preuve :|pseudo/i.test(html), "ni légende RIASEC, ni preuve, ni pseudo");
  assert.equal((html.match(/class="case"/g) || []).length, 6);
  assert.ok(html.includes("Ce que je sais déjà faire"));
  assert.ok(/@page\s*\{\s*size:\s*A4/.test(html));
});

test("textes du front : jamais « faux » ni « mauvaise réponse »", () => {
  for (const p of ["public/js/joueur.js", "public/js/joueur-outils.js", "public/js/analyse-client.js", "public/js/fiche.js", "public/js/fiche-page.js", "public/js/riasec.js", "public/joueur.html", "public/fiche.html", "public/fiche-papier.html"]) {
    const t = lire(p);
    assert.ok(!/\bfaux\b|\bfausse\b|mauvaise réponse|tu t'es trompé/i.test(t), p);
  }
});

test("joueur.js : liste AVATARS identique à la SPEC", () => {
  const t = lire("public/js/joueur.js");
  const m = t.match(/const AVATARS = (\[[^\]]+\])/);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]), ["🦊", "🐼", "🦁", "🐸", "🐙", "🦉", "🐢", "🐝", "🦄", "🐧", "🐯", "🐨"]);
});

// ---------- Non-régression (corrections front) ----------

import { couleursLisibles, contraste } from "../public/js/riasec.js";
import { totalMinuteur, dicteeDisponible, competencesEnAttente, estDepartEnAttente, messageGarder, libelleValiderDepart, dureePhase } from "../public/js/joueur-outils.js";
import { analyserRecit, MESSAGE_SANS_SERVEUR } from "../public/js/analyse-client.js";

test("contrastes AA : bandeau de carte et puces lisibles pour les 6 couleurs RIASEC et le savoir-être", () => {
  for (const t of [...ORDRE_RIASEC.map((k) => RIASEC[k]), SANS_TYPE]) {
    const { fond, texte } = couleursLisibles(t.couleur);
    assert.ok(contraste(fond, texte) >= 4.5, `${t.nom} : ${texte} sur ${fond}`);
  }
  // Les couleurs SPEC restent telles quelles quand elles sont déjà lisibles.
  assert.deepEqual(couleursLisibles(RIASEC.C.couleur), { fond: RIASEC.C.couleur, texte: "#ffffff" });
  assert.equal(couleursLisibles(RIASEC.E.couleur).fond, RIASEC.E.couleur);
  // R et S : le blanc sur la couleur SPEC était à 3,5:1.
  assert.ok(contraste(RIASEC.R.couleur, "#ffffff") < 4.5);
  assert.notEqual(couleursLisibles(RIASEC.R.couleur).fond, RIASEC.R.couleur);
  const puce = puceRiasec("R");
  const fond = puce.match(/--fond-puce:(#[0-9a-f]{6})/)[1];
  const texte = puce.match(/--sur-puce:(#[0-9a-f]{6})/)[1];
  assert.ok(contraste(fond, texte) >= 4.5);
  assert.ok(puce.includes(`--type:${RIASEC.R.couleur}`), "la couleur SPEC reste disponible");
  for (const f of ["public/joueur.css", "public/style.css"]) {
    assert.match(lire(f), /\.puce \{[^}]*background: var\(--fond-puce/, `${f} : puce sur fond lisible`);
  }
  assert.match(lire("public/joueur.css"), /\.carte-competence-bandeau \{[^}]*background: var\(--fond-type/);
  assert.match(lire("public/js/joueur.js"), /--fond-type:\$\{fond\}/);
});

test("jeu.css : l'attribut hidden masque toujours (bouton Dicter, statut de connexion, plein écran)", () => {
  assert.match(lire("public/jeu.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test("joueur.css : « ✓ C'est moi » coché lisible (texte sur --succes)", () => {
  const css = lire("public/joueur.css");
  const m = css.match(/\.tel-garde \[data-garder="1"\]\[aria-pressed="true"\] \{[^}]*color: (#[0-9a-f]{6}); \}/);
  assert.ok(m, "règle présente");
  const succes = lire("public/jeu.css").match(/--succes: (#[0-9a-f]{6});/)[1];
  assert.ok(contraste(m[1], succes) >= 4.5, `texte sur --succes (${succes})`);
});

test("metiersProches : zone 1-2 proche du profil mise en avant, puis zone 3", () => {
  const e = metiersProches({ E: 4 }, ONET.metiers);
  assert.equal(e.accessibles.length, 5);
  assert.ok(e.accessibles.some((m) => m.zone <= 2), "au moins un métier sans bac+2");
  const zones = e.accessibles.map((m) => (m.zone <= 2 ? 0 : 1));
  assert.deepEqual(zones, [...zones].sort(), "zone 1-2 avant zone 3");
  for (const p of [{ I: 4 }, { E: 4 }, { C: 4 }, { A: 4 }, { R: 4 }, { S: 4, E: 2 }]) {
    const r = metiersProches(p, ONET.metiers);
    assert.ok(r.accessibles.length <= 5 && r.accessibles.every((m) => m.zone <= 3));
    assert.ok(r.accessibles.every((m) => m.zone === 3 || m.proximite >= 0.5), "pas de métier court sans rapport");
  }
  // S'il n'y a pas assez de zone 3, on complète avec la zone 1-2.
  const unZone3 = ONET.metiers.find((x) => x.zone === 3).code;
  const peu = ONET.metiers.filter((m) => m.zone <= 2 || m.code === unZone3);
  assert.equal(metiersProches({ R: 4 }, peu).accessibles.length, 5);
});

test("minuteur du téléphone : anneau juste après un rechargement en cours de phase", () => {
  const fin = 1_000_000;
  const maintenant = fin - 20_000; // il reste 20 s d'une phase de 90 s
  // Ancien comportement (aucune info dans la vue) : premier moment vu → anneau plein.
  assert.equal(totalMinuteur({ phase: "reponse", minuteurFin: fin }, maintenant, maintenant), 20_000);
  // Avec minuteurDebut (back) : durée réelle.
  assert.equal(totalMinuteur({ phase: "reponse", minuteurFin: fin, minuteurDebut: fin - 90_000 }, maintenant, maintenant), 90_000);
  // Avec la durée (ms) envoyée par src/jeu.js, ou les réglages.
  assert.equal(totalMinuteur({ phase: "reponse", minuteurFin: fin, minuteurDuree: 90_000 }, maintenant, maintenant), 90_000);
  assert.equal(totalMinuteur({ phase: "echange", minuteurFin: fin, reglages: { dureeEchange: 120, dureeReponse: 90 } }, maintenant, maintenant), 120_000);
  assert.equal(dureePhase("reponse", { dureeReponse: 45 }), 45);
  assert.equal(dureePhase("choix", { dureeReponse: 45 }), null, "plus de choix parmi 4");
  assert.equal(dureePhase("solution", { dureeReponse: 45 }), null);
  // Jamais moins que le temps restant ; null sans minuteur.
  assert.equal(totalMinuteur({ phase: "reponse", minuteurFin: fin, minuteurDuree: 10_000 }, maintenant, maintenant), 20_000);
  assert.equal(totalMinuteur({ phase: "reponse", minuteurFin: null }, maintenant, maintenant), null);
  assert.match(lire("public/js/joueur.js"), /totalMinuteur\(etat\.vue/);
});

test("dictée proposée seulement en contexte sécurisé avec reconnaissance vocale", () => {
  function Reco() {}
  assert.equal(dicteeDisponible({ isSecureContext: true, webkitSpeechRecognition: Reco }), true);
  assert.equal(dicteeDisponible({ isSecureContext: true, SpeechRecognition: Reco }), true);
  assert.equal(dicteeDisponible({ isSecureContext: false, webkitSpeechRecognition: Reco }), false, "http://<ip> : micro refusé d'office");
  assert.equal(dicteeDisponible({ isSecureContext: true }), false);
  assert.equal(dicteeDisponible(undefined), false);
  assert.match(lire("public/js/joueur.js"), /dicteeDisponible\(window\)/);
  assert.match(lire("public/js/outil.js"), /dicteeDisponible\(window\)/);
});

test("compétences en attente : listées hors problème en cours, message avec problemeIndex", () => {
  const competences = [
    comp({ code: "3E205", typePreuve: "vecu", problemeIndex: null, gardee: null }),
    comp({ code: "6B318", problemeIndex: 0, gardee: null }),
    comp({ code: "1D101", problemeIndex: 1, gardee: true }),
    comp({ code: "6D102", problemeIndex: 2, gardee: null }),
  ];
  const fin = competencesEnAttente({ phase: "fin", problemeIndex: 2, moi: { competences } });
  assert.deepEqual(fin.map((c) => c.code), ["6B318", "6D102"], "départ exclu, gardée exclue");
  const enCours = competencesEnAttente({ phase: "competences", problemeIndex: 2, moi: { competences } });
  assert.deepEqual(enCours.map((c) => c.code), ["6B318"], "celle du problème en cours est déjà affichée en grand");
  assert.deepEqual(competencesEnAttente({ phase: "fin", moi: null }), []);
  // Liste fournie par le serveur (moi.competencesEnAttente) : prioritaire.
  assert.deepEqual(competencesEnAttente({ phase: "fin", moi: { competences, competencesEnAttente: [competences[3]] } }).map((c) => c.code), ["6D102"]);
  assert.deepEqual(competencesEnAttente({ phase: "fin", moi: { competences, competencesEnAttente: [] } }), []);
  assert.deepEqual(messageGarder(true, 0), { t: "garder_competence", garder: true, problemeIndex: 0 });
  assert.deepEqual(messageGarder(false, undefined), { t: "garder_competence", garder: false });
  const js = lire("public/js/joueur.js");
  assert.match(js, /envoyer\(messageGarder\(/, "les boutons « Je la garde / Pas moi » envoient problemeIndex");
  assert.match(js, /<!--en-attente-->/, "bloc des compétences en attente sur l'écran de fin");
});

test("compétences de départ en attente (création close par l'animateur) : listées, message avec departIndex, fiche seulement une fois gardées", () => {
  const departA = comp({ code: "3E205", typePreuve: "vecu", problemeIndex: null, departIndex: 0, gardee: null });
  const departB = comp({ code: "6D116", typePreuve: "vecu", problemeIndex: null, departIndex: 1, gardee: null });
  const jeu0 = comp({ code: "6B318", problemeIndex: 0, gardee: null });
  const competences = [jeu0, departB, departA];
  // Pendant la partie et à la fin, celles de départ d'abord.
  for (const phase of ["presentation", "solution", "fin"]) {
    assert.deepEqual(competencesEnAttente({ phase, problemeIndex: 1, moi: { competences } }).map((c) => c.code), ["3E205", "6D116", "6B318"], phase);
  }
  // Même chose avec la liste envoyée par le serveur (moi.competencesEnAttente).
  assert.deepEqual(competencesEnAttente({ phase: "fin", moi: { competencesEnAttente: [departA, jeu0] } }).map((c) => c.code), ["3E205", "6B318"]);
  // Une compétence de départ déjà tranchée n'attend plus.
  assert.deepEqual(competencesEnAttente({ phase: "fin", moi: { competences: [{ ...departA, gardee: true }, { ...departB, gardee: false }] } }), []);
  assert.ok(estDepartEnAttente(departA));
  assert.ok(!estDepartEnAttente(jeu0));
  // Message : departIndex (et pas problemeIndex) pour une compétence de départ.
  assert.deepEqual(messageGarder(true, { departIndex: 1 }), { t: "garder_competence", garder: true, departIndex: 1 });
  assert.deepEqual(messageGarder(false, departA), { t: "garder_competence", garder: false, departIndex: 0 });
  assert.deepEqual(messageGarder(true, 2), { t: "garder_competence", garder: true, problemeIndex: 2 });

  // Fiche : une compétence de départ n'apparaît qu'une fois gardée.
  const avant = normaliserFiche({ pseudo: "Lina", competences });
  assert.deepEqual(avant.depart, [], "en attente : pas sur la fiche");
  const apres = normaliserFiche({ pseudo: "Lina", competences: [{ ...departA, gardee: true }, { ...departB, gardee: false }, jeu0] });
  assert.deepEqual(apres.depart.map((c) => c.code), ["3E205"]);
  // Format de GET /api/parties/:code/fiche/:joueurId (depart / jeu séparés) : même règle.
  assert.deepEqual(normaliserFiche({ joueur: { pseudo: "Lina" }, depart: [departA], jeu: [] }).depart, []);

  // Téléphone : même bloc « Cette compétence t'attend », boutons avec data-dep, surtitre « Ton histoire ».
  const js = lire("public/js/joueur.js");
  assert.match(js, /data-dep="\$\{c\.departIndex\}"/);
  assert.match(js, /departIndex: Number\(b\.dataset\.dep\)/);
  assert.match(js, /"Ton histoire"/);
});

test("validation des compétences de départ : le bouton dit combien de cartes restent à trancher", () => {
  assert.equal(libelleValiderDepart([null]), "Encore 1 carte à choisir");
  assert.equal(libelleValiderDepart([true, null, false]), "Encore 1 carte à choisir");
  assert.equal(libelleValiderDepart([null, null, null]), "Encore 3 cartes à choisir");
  assert.equal(libelleValiderDepart([true, false, true]), "Valider");
  assert.equal(libelleValiderDepart([]), "Valider", "aucune proposition : on valide directement");
  const js = lire("public/js/joueur.js");
  assert.match(js, /data-action="valider-depart" data-envoi>\$\{libelleValiderDepart\(etat\.choixDepart\)\}</, "libellé au premier affichage");
  assert.match(js, /valider\.textContent = libelleValiderDepart\(etat\.choixDepart\)/, "libellé mis à jour à chaque carte tranchée");
});

test("outil solo : pas de repli demo/*.json, URL relative, message clair sans serveur", async () => {
  const appels = [];
  const repondre = (rep) => async (url, init) => {
    appels.push({ url, init });
    if (rep instanceof Error) throw rep;
    return rep;
  };
  const json = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });
  for (const rep of [json(404, {}), json(405, {}), json(501, {}), new TypeError("Failed to fetch")]) {
    await assert.rejects(analyserRecit("j'ai réparé un vélo", repondre(rep)), { message: MESSAGE_SANS_SERVEUR });
  }
  assert.equal(appels.length, 4, "aucun fetch de demo/*.json en repli");
  assert.ok(appels.every((a) => a.url === "api/analyse" && a.init.method === "POST"), "URL relative");
  await assert.rejects(analyserRecit("x", repondre(json(500, { erreur: "Trop de demandes" }))), { message: "Trop de demandes" });
  const ok = { competences: [], pistes_entretien: [], a_approfondir: [] };
  assert.deepEqual(await analyserRecit("x", repondre(json(200, ok))), ok);
  const src = lire("public/js/outil.js");
  assert.ok(!/demo\/\$\{|"\/api\/analyse"/.test(src), "outil.js ne cherche plus demo/*.json ni /api/analyse absolu");
});

import { fermetureDefinitive, decalageServeur } from "../public/js/joueur-outils.js";
test("téléphone : pas de reconnexion après 4001/4002/4008/4009 ; décalage d'horloge depuis `serveur`", () => {
  for (const c of [4001, 4002, 4008, 4009]) assert.equal(fermetureDefinitive(c), true, String(c));
  for (const c of [1000, 1006, 4000]) assert.equal(fermetureDefinitive(c), false, String(c));
  // Téléphone en retard de 5 s sur le serveur.
  assert.equal(decalageServeur({ t: "etat", serveur: 105_000 }, 100_000), 5_000);
  assert.equal(decalageServeur({ t: "etat" }, 100_000, 42), 42);
  // Avec le décalage, le temps restant ne dépend plus de l'horloge du téléphone.
  const vue = { phase: "echange", minuteurFin: 220_000, minuteurDebut: 100_000, minuteurDuree: 120_000 };
  const maintenantServeur = 100_000 + 5_000 + 30_000; // Date.now() du téléphone + décalage
  assert.equal(totalMinuteur(vue, null, maintenantServeur), 120_000);
  assert.equal(vue.minuteurFin - maintenantServeur, 85_000);
});

test("metiersParZone : 5 zones du Rapport des Possibles, 3 métiers au plus par zone, triés par proximité", () => {
  const z = metiersParZone({ S: 4, A: 2 }, ONET.metiers);
  assert.deepEqual(Object.keys(z), ["1", "2", "3", "4", "5"]);
  for (const k of Object.keys(z)) {
    assert.ok(z[k].length <= 3);
    assert.ok(z[k].every((m) => Number(m.zone) === Number(k)), `zone ${k}`);
    assert.ok(z[k].every((m, i, a) => i === 0 || a[i - 1].proximite >= m.proximite));
  }
  assert.ok(Object.values(z).some((l) => l.length > 0));
  assert.equal(metiersParZone({}, ONET.metiers), null);
});

test("blocInteretsOrdonnes : types d'activités par ordre, activités (pas « tu aimes »), compétences, absents nommés", () => {
  const html = blocInteretsOrdonnes([comp({ code: "1D101" }), comp({ code: "1A102" }), comp({ code: "3E205" })], ROME);
  sansBalise(html);
  assert.ok(html.indexOf("Social") < html.indexOf("Réaliste"), "le plus présent en premier");
  assert.ok(html.includes(echapper(RIASEC.S.activites)));
  assert.ok(!html.includes(echapper(RIASEC.S.description)), "pas la description d'intérêt « Tu aimes… »");
  assert.ok(html.includes("Compétences montrées :"));
  assert.ok(html.includes("Ce n&#39;est pas ton profil d&#39;intérêts"));
  assert.ok(html.includes("Si les deux diffèrent, c&#39;est une bonne question pour ton entretien."));
  assert.ok(/Pas apparus pendant la partie/.test(html));
  assert.equal(blocInteretsOrdonnes([], ROME), "");
});

// ---------- Écran commun et téléphone : adaptations psy (21/11/2026) ----------

import * as E from "../public/js/ecran.js";
import {
  separerMots, texteAmorce, retourEpisode, texteMonIdee, texteEpisode, decouperPhrases,
  ANNONCE_CADRE, MJ_EST_UNE_IA, QUESTIONS_DEBRIEF, MESSAGE_PASSE, PROMESSE_COMPETENCE, RELAIS_ADULTE,
} from "../public/js/joueur-outils.js";

const INTERDITS = /\bfaux\b|\bfausse\b|mauvaise réponse|tu t'es trompé|\bscore\b|classement|undefined|\bnull\b/i;
const JS_JOUEUR = lire("public/js/joueur.js");
const JS_ECRAN = lire("public/js/ecran.js");

test("textes partagés : cadre « pas un test noté », MJ = IA, promesse et relais sans sur-promesse", () => {
  const cadre = ANNONCE_CADRE.join(" ");
  assert.match(cadre, /Ce n'est pas un test noté/, "critique psy point 28");
  assert.match(cadre, /lu par une IA/);
  assert.match(cadre, /ne voient pas ta réponse/);
  assert.match(MJ_EST_UNE_IA, /intelligence artificielle/);
  assert.match(MJ_EST_UNE_IA, /il propose/);
  assert.match(PROMESSE_COMPETENCE, /même chance/);
  assert.doesNotMatch(PROMESSE_COMPETENCE, /au moins une/, "jamais « chacun repart avec au moins une »");
  assert.match(RELAIS_ADULTE, /psychologue ou au conseiller/);
  assert.equal(QUESTIONS_DEBRIEF.length, 3);
  for (const t of [cadre, MJ_EST_UNE_IA, PROMESSE_COMPETENCE, RELAIS_ADULTE, MESSAGE_PASSE, ...QUESTIONS_DEBRIEF]) {
    assert.doesNotMatch(t, INTERDITS, t);
    assert.doesNotMatch(t, /\bvous\b/i, `tutoiement : ${t}`);
  }
});

test("carte : la phrase « Tu as proposé de … : c'est ce qu'on appelle « libellé » » ne répète pas le libellé", () => {
  const libelle = "Être force de proposition";
  assert.deepEqual(
    separerMots(`Tu as proposé de demander au boulanger : c'est ce qu'on appelle « ${libelle} ».`, libelle),
    { avant: "Tu as proposé de demander au boulanger : c'est ce qu'on appelle", apres: "" },
  );
  assert.equal(separerMots("Tu as pensé à compter le stock.", libelle), null, "ancienne phrase : affichée telle quelle");
  assert.equal(separerMots("", libelle), null);
  assert.equal(separerMots(`« ${libelle} »`, libelle), null, "rien avant le libellé");
  assert.match(JS_JOUEUR, /separerMots\(motsDe\(c\), libelle\)/);
  assert.match(JS_JOUEUR, /à vérifier avec ton psy/, "critique psy point 2");
  assert.match(JS_JOUEUR, /repérée hors scénario, à discuter avec ton psy/);
  assert.match(JS_JOUEUR, /Ta trace \(tes mots\)/, "« trace » plutôt que « preuve »");
  assert.doesNotMatch(JS_JOUEUR, /Ta preuve/);
});

test("« je ne sais pas » : amorces préremplies et « Je passe ce tour » dès le 1er refus", () => {
  assert.equal(texteAmorce("D'abord, je…"), "D'abord, je ");
  assert.equal(texteAmorce("Moi, je demanderais à…"), "Moi, je demanderais à ");
  assert.equal(texteAmorce("J'irais voir..."), "J'irais voir ");
  assert.match(JS_JOUEUR, /m\.code === "sans_reponse"/, "le code du refus déclenche l'aide");
  assert.match(JS_JOUEUR, /data-action="amorce"/);
  assert.match(JS_JOUEUR, /Je passe ce tour/);
  assert.match(JS_JOUEUR, /envoyerAvecAttente\(\{ t: "passer" \}\)/);
  assert.match(JS_JOUEUR, /moi\.jaiPasse/);
  assert.match(MESSAGE_PASSE, /Pas de souci, l'histoire continue/);
});

test("retour privé du téléphone en phase competences (idée du tour, compétence privée, reformulation, passe)", () => {
  const v = (moi, x = {}) => ({ phase: "competences", idee: { texte: "x" }, moi, ...x });
  assert.equal(retourEpisode({ phase: "reponse", moi: {} }), null);
  assert.equal(retourEpisode(v({}, { attenteIA: true })), "attente");
  assert.equal(retourEpisode(v({}, { idee: null })), "attente");
  assert.equal(retourEpisode(v({ monIdee: { accordPseudo: null }, competenceDuProbleme: { code: "A" } })), "mon-idee");
  assert.equal(retourEpisode(v({ jaiPasse: true, retourPrive: "idee" })), "passe");
  assert.equal(retourEpisode(v({ sansReponse: true, retourPrive: "idee" })), "passe");
  assert.equal(retourEpisode(v({ retourPrive: "competence", competenceDuProbleme: { code: "A" } })), "competence");
  assert.equal(retourEpisode(v({ retourPrive: "idee", maReponse: "y" })), "idee");
  assert.equal(retourEpisode(v({ retourPrive: null, maReponse: "y" })), "attente-retour", "le MJ travaille encore");
  assert.equal(texteMonIdee({ maReformulation: "Ton idée : demander au coach" }), "Ton idée : demander au coach.");
  assert.equal(texteMonIdee({ maReformulation: null, maReponse: "je demande au coach" }), "Ton idée : « je demande au coach »");
  assert.equal(texteMonIdee({}), "");
  // Le téléphone : « Ce que ta réponse montre » sans 🎉, accord pour le pseudo, promesse.
  assert.match(JS_JOUEUR, /Ce que ta réponse montre/);
  assert.doesNotMatch(JS_JOUEUR, /🎉 Ton idée est retenue/);
  assert.match(JS_JOUEUR, /On affiche ton pseudo sur l'écran \?/);
  assert.match(JS_JOUEUR, /Non, reste discret/);
  assert.match(JS_JOUEUR, /t: "afficher_pseudo", accord:/);
  assert.match(JS_JOUEUR, /PROMESSE_COMPETENCE/);
});

test("téléphone : réflexion (note privée), préférence, débrief, réécouter, dictée, relais adulte", () => {
  assert.match(JS_JOUEUR, /case "reflexion":/);
  assert.match(JS_JOUEUR, /envoyerAvecAttente\(\{ t: "note", texte \}\)/);
  assert.match(JS_JOUEUR, /Personne ne la verra/);
  assert.match(JS_JOUEUR, /Ce genre de situation, tu aimerais en vivre dans un travail \?/);
  assert.match(JS_JOUEUR, /t: "preference", valeur:/);
  assert.match(JS_JOUEUR, /case "debrief":/);
  assert.match(JS_JOUEUR, /envoyerAvecAttente\(\{ t: "debrief", texte \}\)/);
  assert.match(JS_JOUEUR, /🔊 Réécouter l'épisode/);
  assert.match(JS_JOUEUR, /Et toi, que fais-tu \?/, "consigne de réponse au tutoiement");
  assert.match(JS_JOUEUR, /Déclic ne garde pas ta voix/);
  assert.match(JS_JOUEUR, /processLocally/);
  assert.match(JS_JOUEUR, /RELAIS_ADULTE/);
  assert.match(JS_JOUEUR, /Un mot-clé suffit/, "recopie allégée sur la fiche papier");
  assert.doesNotMatch(JS_JOUEUR, /tu vas en gagner pendant le jeu/, "plus de promesse non tenue");
  assert.match(lire("public/confidentialite.html"), /dictée vocale/i);
  assert.match(lire("public/confidentialite.html"), /ne garde pas ta voix/);
});

test("lecture à voix haute : liaison avant la situation, cadre rappelé avant le 1er épisode", () => {
  const p = { titre: "Le titre", situation: "La situation.", question: "Que faites-vous ?" };
  assert.equal(texteEpisode({ probleme: p }), "Le titre. La situation. Que faites-vous ?");
  assert.equal(texteEpisode({ probleme: p, liaison: "Le budget est bouclé." }), "Le budget est bouclé. Le titre. La situation. Que faites-vous ?");
  assert.equal(texteEpisode({ probleme: null }), "");
  assert.match(E.texteALire({ phase: "presentation", problemeIndex: 0, probleme: p }), /^Ce n'est pas un test noté\./);
  assert.doesNotMatch(E.texteALire({ phase: "presentation", problemeIndex: 1, probleme: p }), /test noté/);
  assert.match(E.texteALire({ phase: "creation" }), /Ce n'est pas un test noté/);
  assert.match(E.texteALire({ phase: "debrief" }), /Quel moment de l'histoire/);
  assert.ok(decouperPhrases(E.texteALire({ phase: "creation" })).every((m) => m.length <= 160));
});

test("écran : l'idée du tour s'affiche sans pseudo tant que son auteur n'a pas dit oui", () => {
  const idee = { texte: "on compare les prix", competence: { libelle: "Élaborer un budget", riasec: ["C"] }, notee: false };
  const sans = E.rendreScene({ phase: "competences", problemeIndex: 0, idee: { ...idee, pseudo: null, avatar: null, accordPseudo: null }, joueurs: [] });
  assert.match(sans, /Cette idée fait avancer l'histoire/);
  assert.match(sans, /Son auteur l'écrit sur sa fiche papier/);
  assert.match(sans, /chacun retrouve ce que sa réponse montre/);
  assert.doesNotMatch(sans, /L'idée de /);
  assert.doesNotMatch(sans, INTERDITS);
  const avec = E.rendreScene({ phase: "competences", problemeIndex: 0, idee: { ...idee, pseudo: "Lina", avatar: "🦊", accordPseudo: true, notee: true } });
  assert.match(avec, /L'idée de Lina/);
  assert.match(avec, /Notée sur la fiche papier/);
  // La clé de scène change quand le pseudo apparaît ou que la compétence est notée.
  const v1 = { phase: "competences", problemeIndex: 0, idee: { ...idee, pseudo: null } };
  assert.notEqual(E.cleScene(v1), E.cleScene({ ...v1, idee: { ...idee, pseudo: "Lina", accordPseudo: true } }));
  assert.notEqual(E.cleScene(v1), E.cleScene({ ...v1, idee: { ...idee, pseudo: null, notee: true } }));
  // Attente : le MJ est une IA, il propose, l'animateur valide.
  assert.match(E.rendreScene({ phase: "competences", attenteIA: true }), /Le MJ est une IA : il propose/);
});

test("écran : bouton animateur « Choisir une autre idée » ; débrief avant la fin si réglé", () => {
  const sansAutre = E.commandesPour({ phase: "competences", problemeIndex: 0, nbProblemes: 3, idee: {} });
  assert.deepEqual(sansAutre.map((c) => c.id), ["suivant"]);
  const avec = E.commandesPour({ phase: "competences", problemeIndex: 0, nbProblemes: 3, autreIdeePossible: true });
  const autre = avec.find((c) => c.id === "autre_idee");
  assert.ok(autre && !autre.principal, "bouton secondaire, jamais l'action principale de la télécommande");
  assert.deepEqual(autre.message, { t: "autre_idee" });
  assert.equal(E.commandesPour({ phase: "competences", problemeIndex: 2, nbProblemes: 3, reglages: { debrief: true } })[0].libelle, "Passer au débrief");
  assert.equal(E.commandesPour({ phase: "debrief" })[0].message.t, "suivant");
  assert.equal(E.commandesPour({ phase: "reflexion" })[0].libelle, "Lancer la discussion");
  assert.equal(E.commandesPour({ phase: "presentation", reglages: { dureeReflexion: 30 } })[0].libelle, "Lancer la réflexion");
  assert.equal(E.commandesPour({ phase: "presentation", reglages: { dureeReflexion: 0 } })[0].libelle, "Lancer la discussion");
  assert.match(E.commandesPour({ phase: "echange" })[0].aide, /au moins une phrase/);
  assert.match(E.commandesPour({ phase: "reponse" })[0].aide, /peut montrer une compétence/);
  assert.doesNotMatch(E.commandesPour({ phase: "reponse" })[0].aide, /auront quand même une compétence/, "aide périmée retirée");
});

test("écran : réflexion silencieuse, tour de table, seul avec l'animateur, transparence IA", () => {
  const reflexion = E.rendreScene({ phase: "reflexion", problemeIndex: 0, probleme: { titre: "T", question: "Q" }, minuteurDuree: 30_000 });
  assert.match(reflexion, /30 secondes en silence : chacun réfléchit à ce qu&#39;il ferait|30 secondes en silence : chacun réfléchit à ce qu'il ferait/);
  assert.match(reflexion, /On en parle juste après/);
  assert.match(E.rendreScene({ phase: "reflexion", reglages: { dureeReflexion: 45 } }), /45 secondes en silence/);
  assert.equal(E.dureePhase("reflexion", { dureeReflexion: 20 }), 20);
  const groupe = E.rendreScene({ phase: "echange", joueurs: [{}, {}, {}] });
  assert.match(groupe, /Tour de table/);
  assert.match(groupe, /chacun dit son idée en une phrase, sans être coupé/i);
  const seul = E.rendreScene({ phase: "echange", joueurs: [{}] });
  assert.match(seul, /Réfléchis à voix haute avec l'animateur/);
  assert.doesNotMatch(seul, /Tour de table/);
  const reponse = E.rendreScene({ phase: "reponse" });
  assert.match(reponse, /les autres joueurs ne la voient pas/);
  assert.match(reponse, /Le maître du jeu est une IA : il propose, tu décides/);
  assert.doesNotMatch(reponse, /seul le MJ la lit/);
  const creation = E.rendreScene({ phase: "creation" });
  assert.match(creation, /Ce n(&#39;|')est pas un test noté/);
  assert.match(creation, /Le maître du jeu est une IA/);
  assert.match(E.rendreScene({ phase: "presentation", problemeIndex: 0, probleme: {} }), /Ce n(&#39;|')est pas un test noté/);
  const ep2 = E.rendreScene({ phase: "presentation", problemeIndex: 1, probleme: {}, liaison: "Le budget est bouclé <b>" });
  assert.match(ep2, /class="liaison">Le budget est bouclé &lt;b&gt;/, "liaison affichée et échappée");
  assert.doesNotMatch(ep2, /test noté/);
});

test("écran : avancement neutre (ordre d'arrivée, « ✍️ écrit… », personne mis en avant)", () => {
  const vue = { phase: "reponse", compte: { repondu: 1, total: 3 }, joueurs: [
    { pseudo: "Lina", avatar: "🦊", aFini: false }, { pseudo: "Sam", avatar: "🐼", aFini: true }, { pseudo: "Noa", avatar: "🦉", aFini: false },
  ] };
  const html = E.BLOCS.compte(vue);
  assert.ok(html.indexOf("Lina") < html.indexOf("Sam") && html.indexOf("Sam") < html.indexOf("Noa"), "ordre d'arrivée conservé");
  assert.equal((html.match(/✍️ écrit…/g) || []).length, 2);
  assert.equal((html.match(/>✓</g) || []).length, 1);
  assert.doesNotMatch(html, /class="attente"|dernier/);
  assert.match(E.BLOCS.compte({ ...vue, phase: "competences" }), /ont fait leur choix/);
  assert.match(lire("public/jeu.css"), /\.statuts-joueurs li\.en-cours \{/);
});

test("écran : accueil (3 à 5 joueurs conseillés, tablette de secours) et fin collective sans éloge général", () => {
  const accueil = E.rendreScene({ phase: "accueil", code: "KDMZ", joueurs: [{ pseudo: "Lina", avatar: "🦊" }] }, { origine: "http://192.168.1.20:8787" });
  assert.match(accueil, /Souvent recommandé : 3 à 5 joueurs \(6 maximum\)/);
  assert.doesNotMatch(accueil, /2 ou plus, c'est mieux/);
  assert.match(accueil, /tablette du Centre/);
  assert.match(E.rendreScene({ phase: "accueil", code: "KDMZ", joueurs: [] }, { origine: "" }), /3 à 5 joueurs/);
  const fin = E.rendreScene({ phase: "fin", fin: { nbCompetencesTotal: 7 } });
  assert.match(fin, /Bravo l'équipe/);
  assert.match(fin, /<strong>7<\/strong> compétences/);
  assert.match(fin, /trace de vos propres mots/);
  assert.doesNotMatch(fin, /Chacun a des talents/);
  const debrief = E.rendreScene({ phase: "debrief" });
  for (const q of QUESTIONS_DEBRIEF) assert.ok(debrief.includes(q.replace(/'/g, "&#39;")), q);
  assert.doesNotMatch(JS_ECRAN, /bravo\. Mais/i, "plus de « bravo » dans la transition copiée");
});

test("réglages de l'écran : épisodes et discussion automatiques, réflexion, débrief ; un seul champ envoyé", () => {
  const html = E.reglagesHtml({ nbProblemes: 4, nbProblemesAuto: true, dureeEchange: 120, dureeEchangeAuto: true, dureeReponse: 90, dureeReflexion: 30, debrief: false }, 4);
  assert.match(html, /<option value="auto" selected>Auto : 4 \(1 par joueur, 3 à 6\)/);
  assert.match(html, /<option value="auto" selected>Auto : 2 min \(selon le groupe\)/);
  assert.match(html, /<option value="0" >Sans<\/option>/);
  assert.match(html, /<option value="30" selected>30 s/);
  assert.match(html, /<option value="90" selected>1 min 30 \(2-3 phrases\)/);
  assert.match(html, /data-reglage="debrief" >/, "débrief décoché");
  const manuel = E.reglagesHtml({ nbProblemes: 2, nbProblemesAuto: false, dureeEchange: 150, dureeEchangeAuto: false, debrief: true }, 5);
  assert.match(manuel, /<option value="2" selected>2 épisodes/);
  assert.doesNotMatch(manuel, /Auto : 2 min/);
  assert.match(manuel, /<option value="150" selected>2 min 30/);
  assert.match(manuel, /data-reglage="debrief" checked/);
  assert.match(E.reglagesHtml({}, 1), /Auto : 3 /, "1 joueur → 3 épisodes");
  assert.match(E.reglagesHtml({}, 8), /Auto : 6 /);
  assert.deepEqual(E.messageReglage("nbProblemes", "auto"), { t: "reglages", nbProblemes: null });
  assert.deepEqual(E.messageReglage("nbProblemes", "5"), { t: "reglages", nbProblemes: 5 });
  assert.deepEqual(E.messageReglage("dureeReflexion", "0"), { t: "reglages", dureeReflexion: 0 });
  assert.deepEqual(E.messageReglage("dureeEchange", "150"), { t: "reglages", dureeEchange: 150 });
  assert.equal(E.messageReglage("dureeEchange", "auto"), null, "l'automatique est déjà actif");
  assert.deepEqual(E.messageReglage("debrief", true), { t: "reglages", debrief: true });
  assert.equal(E.messageReglage("inconnu", 1), null);
  assert.doesNotMatch(JS_ECRAN, /envoyer\(\{ t: "reglages", dureeEchange, dureeReponse \}\)/, "on n'écrase plus la discussion automatique");
});

test("démo de l'écran et du téléphone : nouvelles scènes (réflexion, idée sans nom, autre idée, liaison, débrief)", () => {
  const vues = E.vuesDemo(0);
  for (const p of ["reflexion", "debrief"]) assert.ok(vues.some((v) => v.phase === p), p);
  assert.ok(vues.some((v) => v.phase === "competences" && v.idee && v.idee.pseudo === null && v.autreIdeePossible));
  assert.ok(vues.some((v) => v.phase === "presentation" && v.liaison));
  assert.ok(vues.some((v) => v.phase === "echange" && v.joueurs.length === 1));
  for (const v of vues) assert.doesNotMatch(E.rendreScene(v, { origine: "http://x" }), INTERDITS, v.phase);
  assert.match(JS_JOUEUR, /\["Réflexion en silence"/);
  assert.match(JS_JOUEUR, /\["C'est ton idée : pseudo \?"/);
  assert.match(JS_JOUEUR, /\["Ce que ta réponse montre"/);
  assert.match(JS_JOUEUR, /\["Réponse : « je ne sais pas »"/);
  assert.match(JS_JOUEUR, /\["Débrief"/);
});

test("index.html : épisodes automatiques par défaut (nbProblemes omis), débrief proposé, pas de durée inventée", () => {
  const index = lire("public/index.html");
  assert.match(index, /<option value="auto" selected>Auto : 1 par joueur \(3 à 6\)<\/option>/);
  assert.doesNotMatch(index, /≈ \d+ min|≈ 1 h/, "durées par épisode non mesurées retirées");
  assert.match(index, /if \(choixEpisodes !== "auto"\) reglages\.nbProblemes = Number\(choixEpisodes\)/);
  assert.doesNotMatch(index, /dureeEchange/, "la discussion reste automatique");
  assert.match(index, /id="debrief" name="debrief" checked/);
  assert.match(index, /3 à 5 joueurs \(6 maximum\)/);
  assert.match(index, /tablette du Centre/);
});

// ---------- Fiche finale, fiche papier, confidentialité : adaptations psy (21/11/2026) ----------

import { cartesVisibles } from "../public/js/joueur-outils.js";

// Partie à 3 épisodes (E, A, R), au format de Partie.fiche().
const PROBLEMES_EAR = [
  { index: 0, titre: "Le budget du tournoi", riasec: "E", questionVecu: "Ça t'est déjà arrivé de gérer un budget pour un projet avec d'autres ?" },
  { index: 1, titre: "L'affiche du tournoi", riasec: "A", questionVecu: "Ça t'est déjà arrivé de créer un visuel ?" },
  { index: 2, titre: "Le jour J", riasec: "R", questionVecu: "Ça t'est déjà arrivé de réparer quelque chose ?" },
];
const ficheEAR = (x = {}) => ({
  code: "BCDF",
  joueur: { id: "j1", pseudo: "Lina", avatar: "🦊" },
  problemes: PROBLEMES_EAR,
  competences: [
    comp({ code: "1D101", typePreuve: "vecu", problemeIndex: null, preuve: "j'aide mon voisin", riasec: ["S"] }),
    // 4C101 a le code ROME « C », mais il a été repéré dans l'épisode E.
    comp({ code: "4C101", libelle: "Élaborer, suivre et piloter un budget", problemeIndex: 0, idee: true, riasec: ["C"],
      mots: "Tu as proposé de comparer les prix : c'est ce qu'on appelle « Élaborer, suivre et piloter un budget ».",
      preuve: "on compare les prix sur internet" }),
    comp({ code: "6D108", libelle: "Faire preuve d'autonomie", problemeIndex: 1, horsScenario: true, riasec: [], preuve: "je vais voir le boulanger" }),
    comp({ code: "3E202", problemeIndex: 2, riasec: ["I", "R"], preuve: "je vérifie la bougie" }),
  ],
  passes: [],
  preferences: [],
  debrief: null,
  ...x,
});
const texteVisible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("fiche : le type RIASEC vient de l'épisode, pas du code ROME (critique psy point 8)", () => {
  const f = normaliserFiche(ficheEAR());
  assert.equal(lettreEpisode({ problemeIndex: 0 }, PROBLEMES_EAR), "E");
  assert.equal(lettreEpisode({ problemeIndex: null }, PROBLEMES_EAR), null);
  assert.equal(lettreEpisode({ problemeIndex: 0 }, [{ riasec: "<b>" }]), null);
  const { parEpisode, liste, joues } = competencesTypees(f);
  assert.equal(parEpisode, true);
  assert.deepEqual(joues, ["E", "A", "R"]);
  assert.deepEqual(liste.map((c) => [c.code, c.riasec]), [["4C101", ["E"]], ["3E202", ["R"]]],
    "ni le récit, ni la participation, ni un savoir-être hors scénario");
  // Sans épisodes connus (fiche du téléphone) : comportement d'avant, codes du ROME.
  const sans = competencesTypees(normaliserFiche({ ...ficheEAR(), problemes: [] }));
  assert.equal(sans.parEpisode, false);
  assert.equal(sans.joues, null);
  assert.equal(sans.liste.length, 4);
});

test("fiche : partie 2 renommée, types non joués non classés, « X sur 6 »", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  const t = texteVisible(html);
  assert.match(t, /2\. Les types d&#39;activités où tu as montré des compétences pendant le jeu/);
  assert.match(t, /Ce n&#39;est pas ton profil d&#39;intérêts : celui-là est dans ton Rapport des Possibles\. Si les deux diffèrent, c&#39;est une bonne question pour ton entretien\./);
  assert.match(t, /Types d'activités explorés dans cette partie : 3 sur 6\./);
  assert.match(t, /Pas apparus pendant la partie, ce qui ne veut pas dire absents : Artistique\./);
  assert.match(t, /Pas d'épisode de ce type dans cette partie : Investigateur, Social, Conventionnel\./);
  const debut = html.indexOf("bloc-interets");
  const bloc = html.slice(debut, html.indexOf("</section>", debut));
  assert.ok(bloc.includes("Entreprenant") && bloc.includes("Réaliste"));
  assert.ok(!/<strong>Conventionnel<\/strong>/.test(bloc), "4C101 compte pour l'épisode E, pas pour son code ROME C");
  assert.match(t, /Cette partie a exploré 3 types d'activités sur 6/);
});

test("fiche : vocabulaire « repérées » et « trace », pied « pas un diplôme », jamais validé/certifié/mesure", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  // Le texte de licence O*NET/ESCO (source) est cité tel quel : on le retire.
  const t = texteVisible(html.replace(/<p class="discret source">[\s\S]*?<\/p>/g, ""));
  assert.match(t, /1\. Tes compétences repérées/);
  assert.match(t, /Ta trace :/);
  assert.match(t, /Chaque compétence est à vérifier avec ton psy\./);
  assert.match(t, /Ces compétences ont été repérées pendant un jeu, à partir de tes mots\. Elles ne sont pas un diplôme : parles-en avec ton psy\./);
  // « Faire preuve de… » est un libellé du ROME : seul le mot « preuve » employé seul est exclu.
  assert.doesNotMatch(t, /validée?s?\b|certifiée?s?\b|\bmesure|révélée|(?<!Faire )\bpreuve\b|classement/i);
  assert.doesNotMatch(t, /Tes intérêts/, "l'ancien titre « Tes intérêts, classés par ordre »");
  assert.match(t, /Compétences montrées : Réaliser un diagnostic technique/, "libellé retrouvé dans rome.json");
  assert.doesNotMatch(t, /15 min|quinze minutes/i, "pas de durée d'entretien inventée");
});

test("fiche : phrase « Tu as proposé de … » sans répéter le libellé, idée du tour, hors scénario", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  const t = texteVisible(html);
  assert.equal(t.split("Élaborer, suivre et piloter un budget").length - 1, 2, "une fois dans la phrase, une fois dans « Compétences montrées »");
  assert.match(t, /ton idée a fait avancer l&#39;histoire/);
  assert.match(t, /\(repérée hors scénario, à discuter avec ton psy\)/);
});

test("fiche : question sur le vécu imprimée sous la compétence de chaque épisode, une fois", () => {
  const html = rendreFiche(ficheEAR({
    competences: [...ficheEAR().competences, comp({ code: "2A304", problemeIndex: 0, preuve: "on fait un tournoi" })],
  }), { rome: ROME });
  for (const p of PROBLEMES_EAR) {
    const q = `Question pour ton entretien :</strong> ${echapper(p.questionVecu)}`;
    assert.equal(html.split(q).length - 1, 1, p.titre);
  }
});

test("fiche : métiers indicatifs, sans étiquette de proximité, zones avec le niveau du guide", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  const metiers = html.slice(html.indexOf("bloc-metiers"));
  assert.match(metiers, /3\. Des métiers à explorer, par zone <span class="discret">\(indicatif\)<\/span>/);
  const sansSource = texteVisible(metiers.replace(/<p class="discret source">[\s\S]*?<\/p>/g, ""));
  assert.doesNotMatch(sansSource, /très proche|\(proche\)|r ?≥|0[,.]\d{2}|%/i);
  assert.match(metiers, /Seulement 2 pistes par zone/);
  assert.match(metiers, /Durées : Rapport des Possibles ; niveaux : guide du Centre\./);
  for (const z of [1, 2, 3, 4, 5]) {
    assert.match(ZONES_METIERS[z].texte, /^Niveau : /);
    assert.ok(metiers.includes(echapper(ZONES_METIERS[z].texte)), `zone ${z}`);
  }
  assert.match(ZONES_METIERS[3].texte, /BTS ou licence professionnelle/);
  assert.match(ZONES_METIERS[4].texte, /master, ou licence avec un concours/);
  // 6 types joués : pas de phrase « X types sur 6 ».
  const six = blocChampDesPossibles([comp({ code: "1D101", riasec: ["S"] })], ONET, ROME, { explores: 6 });
  assert.doesNotMatch(six, /types d'activités sur 6/);
});

test("fiche : notice « Comment lire cette fiche » et encart psy en reflets et relances (sans durée)", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  const t = texteVisible(html);
  assert.match(t, /Pour le psychologue — Comment lire cette fiche/);
  assert.match(t, /citation exacte comme trace/);
  assert.match(t, /ne remplacent pas l'IPH du Rapport des Possibles/);
  assert.match(t, /tâche d'évocation/);
  assert.doesNotMatch(t, /4e temps/);
  assert.match(t, /Amorces de reflet \(à reformuler sur le moment\)/);
  assert.match(t, /Relances ouvertes/);
  assert.match(t, /Des pistes, pas un questionnaire à dérouler\./);
  assert.match(t, /Qu'as-tu écrit dans “Un premier pas” sur ta fiche papier \?/);
  const relances = html.match(/<ol class="relances-psy">(.*?)<\/ol>/s)[1];
  assert.ok((relances.match(/<li>/g) || []).length <= 4);
  const f = normaliserFiche(ficheEAR());
  const reflets = refletsPsy([...f.depart, ...f.jeu], ROME);
  assert.equal(reflets.length, 2);
  assert.equal(reflets[0], "Quand tu dis « j'aide mon voisin », on dirait que « Conseiller, accompagner une personne » compte pour toi.");
  assert.equal(reflets[1], "Tu as trouvé « on compare les prix sur internet » devant le groupe : c'est une ressource.");
  const qs = relancesPsy([...f.depart, ...f.jeu], ROME, competencesTypees(f).liste);
  assert.equal(qs.length, 4);
  assert.match(qs[0], /raconte-moi une autre fois/);
  assert.match(qs[1], /compte le plus pour toi/);
  assert.match(qs[2], /Rapport des Possibles/);
  assert.equal(qs[3], RIASEC.R.question, "question du type qui ressort (R avant E à égalité, ordre RIASEC)");
  // Téléphone (psy:false) : ni notice ni encart.
  const tel = rendreFiche(ficheEAR(), { rome: ROME, psy: false });
  assert.doesNotMatch(tel, /Comment lire cette fiche|Pour le psy|Amorces de reflet/);
});

test("fiche : « a préféré passer » au psy seulement, avis par épisode, débrief", () => {
  const brut = ficheEAR({
    passes: [{ index: 1, titre: INJECTION }, { index: "x" }],
    preferences: [
      { index: 0, titre: "Le budget du tournoi", valeur: "oui" },
      { index: 1, titre: "L'affiche du tournoi", valeur: "non" },
      { index: 2, titre: "Le jour J", valeur: "un_peu" },
      { index: 2, valeur: "<b>" },
    ],
    debrief: INJECTION,
  });
  const html = rendreFiche(brut, { rome: ROME });
  sansBalise(html);
  assert.match(html, /A préféré passer à l'épisode 2 \(&lt;script&gt;.*\) : à explorer en entretien\./);
  assert.equal((html.match(/A préféré passer/g) || []).length, 1, "index invalide ignoré");
  assert.match(html, /Ce jour-là, ces situations t'ont plu : Le budget du tournoi, Le jour J \(un peu\)\./);
  assert.match(html, /Le budget du tournoi : oui · L&#39;affiche du tournoi : non · Le jour J : un peu\./);
  assert.match(html, /À reprendre avec le psychologue/);
  const tel = rendreFiche(brut, { rome: ROME, psy: false });
  assert.doesNotMatch(tel, /préféré passer|À reprendre avec le psychologue/, "jamais sur la fiche du téléphone");
});

test("fiche : plan d'action à la main et ligne vers un adulte sur la fiche imprimable seulement", () => {
  const html = rendreFiche(ficheEAR(), { rome: ROME, onet: ONET });
  const t = texteVisible(html);
  assert.match(t, /4\. Mes prochains pas \(à écrire à la main\)/);
  assert.match(t, /Ce que je vais chercher à l'Agora/);
  assert.equal((t.match(/Métier ou mot-clé :/g) || []).length, 2);
  assert.match(t, /Avec qui j&#39;en parle ensuite :/);
  assert.match(t, /En complément des recommandations de ton psychologue\./);
  assert.ok(html.includes(echapper(RELAIS_ADULTE)));
  assert.ok(html.indexOf("bloc-metiers") < html.indexOf("plan-action"), "après la partie 3");
  assert.ok(html.indexOf("plan-action") < html.indexOf("encart-psy"), "avant l'encart psy");
  const tel = rendreFiche(ficheEAR(), { rome: ROME, psy: false });
  assert.doesNotMatch(tel, /plan-action|Si quelque chose te pèse/, "le téléphone affiche déjà la ligne sous la fiche");
});

test("fiche-papier.html : sous-titre, « Et maintenant ? » à la main, pied « pas un diplôme », CSS sans bloc orphelin", () => {
  const html = lire("public/fiche-papier.html");
  assert.match(html, /Écris avec tes mots : un mot-clé suffit\. C'est toi qui décides de ce que tu gardes\./);
  assert.match(html, /Compétences repérées pendant le jeu/);
  for (const l of ["Ce qui m'a surpris sur moi :", "Une piste qui me tente :", "Un premier pas pour l'explorer"]) assert.ok(html.includes(l), l);
  assert.match(html, /Elles ne sont pas un diplôme : parles-en avec ton psy\./);
  assert.match(html, /Si quelque chose te pèse, parles-en au psychologue ou au conseiller du Centre/);
  assert.doesNotMatch(html, /trouvée|validé|certifié/i);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
  assert.ok(!/\}\s*\n\s*width:/.test(css), "plus de déclaration orpheline (elle avalait la règle .pied)");
});

test("confidentialite.html : dictée, pseudo avec accord, ce que voit le psy", () => {
  const html = lire("public/confidentialite.html");
  assert.match(html, /La dictée vocale/);
  assert.match(html, /ne garde pas ta voix/);
  assert.match(html, /Tu peux toujours écrire au clavier/);
  assert.match(html, /d'abord sans nom ; le pseudo de son auteur n'apparaît que s'il dit oui/);
  assert.match(html, /préféré passer son tour\. Le groupe ne voit jamais ces informations\./);
  assert.doesNotMatch(html, /avec le pseudo de son auteur\./);
});

test("outil solo : 4 propositions au plus à la fois, vocabulaire aligné, pas de « 15 min »", () => {
  assert.deepEqual([...cartesVisibles([null, null, null, null, null, null])], [0, 1, 2, 3]);
  assert.deepEqual([...cartesVisibles(["garde", null, null, null, null, null])], [0, 1, 2, 3, 4]);
  assert.deepEqual([...cartesVisibles([null, "retire", null, null, null, null])], [0, 1, 2, 3, 4]);
  assert.deepEqual([...cartesVisibles([null, null])], [0, 1], "aucun minimum");
  assert.deepEqual([...cartesVisibles(null)], []);
  const js = lire("public/js/outil.js");
  const page = lire("public/outil.html");
  assert.match(js, /cartesVisibles\(choix\)/);
  assert.match(js, /majCartesVisibles\(\);\r?\n\s*majBoutonFiche\(\);/);
  assert.match(page, /id="suite"/);
  assert.match(page, /4 propositions au plus à la fois/);
  assert.match(lire("public/style.css"), /\.carte\[hidden\] \{ display: none; \}/);
  assert.doesNotMatch(js + page, /\(15 min\)|validée|Révéler|Preuve —|France Travail attribue/);
  assert.match(js, /pas un diplôme/);
  assert.match(js, /RELAIS_ADULTE/);
});
