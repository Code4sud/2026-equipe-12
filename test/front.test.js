// Tests des fonctions pures du front : riasec.js, fiche.js, metiers-proches.js.
// node --test test/front.test.js (aucune dépendance de test).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RIASEC, ORDRE_RIASEC, SANS_TYPE, echapper, riasecDe, typeDe, reperesRiasec, poidsRiasec,
  blocRiasec, legendeRiasec, puceRiasec,
} from "../public/js/riasec.js";
import {
  rendreFiche, normaliserFiche, blocMetiers, blocEsco, lienEsco, questionsPsy, ligneCompetence,
} from "../public/js/fiche.js";
import { metiersProches, typesDominants } from "../public/js/metiers-proches.js";

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
    assert.ok(RIASEC[k].nom && RIASEC[k].verbe && RIASEC[k].question && RIASEC[k].gommette);
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

test("typeDe : couleur et gommette du code majeur, savoir-être sinon", () => {
  const t = typeDe({ code: "3E205" }, ROME);
  assert.equal(t.lettre, "R");
  assert.equal(t.couleur, RIASEC.R.couleur);
  assert.equal(t.gommette, "orange");
  const s = typeDe({ code: "6D102", riasec: [] }, ROME);
  assert.equal(s.lettre, null);
  assert.equal(s.gommette, SANS_TYPE.gommette);
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
  assert.ok(html.includes("Métiers à découvrir"));
  assert.ok(html.includes("gommette blanche"), "savoir-être sans RIASEC → gommette blanche");
  assert.ok(!/\bfaux\b|mauvaise réponse/i.test(html));
});

test("rendreFiche : fonctionne sans données (rome/onet absents, aucune compétence)", () => {
  const html = rendreFiche({ pseudo: "Sam", competences: [] });
  assert.ok(html.includes("Sam"));
  assert.ok(!html.includes("Métiers à découvrir"));
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

test("questionsPsy et ligneCompetence", () => {
  const cs = [comp({ code: "1A102", libelle: "Assurer l'encadrement" }), comp({ code: "1D101" })];
  const qs = questionsPsy(cs, ROME);
  assert.ok(qs.length >= 3 && qs.length <= 6);
  assert.ok(qs[0].includes("Assurer l'encadrement"));
  const li = ligneCompetence(comp({ code: "1D101", preuve: INJECTION }), ROME, INJECTION);
  sansBalise(li);
  assert.ok(li.includes("Conseiller, accompagner une personne"), "libellé retrouvé dans rome.json");
});

// ---------- Pages ----------

test("fiche-papier.html : légende avec les 6 couleurs RIASEC et 6 cases « Compétence gagnée »", () => {
  const html = lire("public/fiche-papier.html");
  for (const k of ORDRE_RIASEC) assert.ok(html.includes(RIASEC[k].couleur), `couleur ${k}`);
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
  assert.equal(totalMinuteur({ phase: "echange2", minuteurFin: fin, reglages: { dureeEchange: 120, dureeReponse: 90 } }, maintenant, maintenant), 120_000);
  assert.equal(dureePhase("choix", { dureeReponse: 45 }), 45);
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
