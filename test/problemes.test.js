// Vérifie public/data/problemes.json : schéma, codes ROME, illustrations, une situation
// par profil RIASEC, et absence de sujets sensibles (SPEC §4.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import data from "../public/data/problemes.json" with { type: "json" };
import rome from "../public/data/rome.json" with { type: "json" };
import { compterMots, contientMotInterdit } from "../src/texte.js";
import { mjMock, motsValides } from "../src/mj.js";

const PUBLIC = new URL("../public/", import.meta.url);
const MACROS = new Map(rome.macros.map((m) => [m.code, m]));
// « Le tournoi du quartier » : 6 épisodes qui s'enchaînent, un par profil RIASEC,
// tirés des exemples de compétences cachées du sujet 4.
const IDS_ATTENDUS = [
  "budget-tournoi",
  "affiche-tournoi",
  "embrouille-equipe",
  "telephone-mystere",
  "jour-j-scooter",
  "caisse-buvette",
];
const MOTS_INTERDITS = [
  "mère", "père", "parent", "maman", "papa", "frère", "sœur", "soeur", "famille",
  "religion", "dieu", "police", "malade", "maladie", "hôpital", "médecin", "permis",
];

const problemes = data.problemes;
const estTexte = (s) => typeof s === "string" && s.trim().length > 0;
// Mots-clés pour le MJ mock : minuscules, sans accents, sans apostrophe.
const MOT_CLE = /^[a-z0-9]+(?:[ -][a-z0-9]+)*$/;

// Découpe en mots (lettres Unicode) pour ne pas confondre « parent » et « transparent ».
const mots = (s) => s.toLowerCase().normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean);
const formes = (mot) => [mot, `${mot}s`, `${mot}x`, mot.replace(/al$/, "aux")];
const INTERDITS = new Set(MOTS_INTERDITS.flatMap(formes));

function textesSensibles(p) {
  return [
    p.titre,
    p.situation,
    p.question,
    p.questionVecu,
    p.solution.resume,
    ...p.solution.motsCles,
    ...p.competences.map((c) => c.mots ?? ""),
  ];
}

test("structure générale", () => {
  assert.equal(data.version, 1);
  assert.ok(Array.isArray(problemes));
});

test("les ids attendus, sans doublon", () => {
  assert.deepEqual([...problemes.map((p) => p.id)].sort(), [...IDS_ATTENDUS].sort());
});

test("une histoire : épisodes numérotés de 1 à 6, dans l'ordre", () => {
  assert.equal(data.histoire?.titre, "Le tournoi du quartier");
  assert.deepEqual(problemes.map((p) => p.episode), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(problemes.map((p) => p.id), IDS_ATTENDUS);
});

test("les 6 profils RIASEC du Centre sont couverts", () => {
  assert.deepEqual([...new Set(problemes.map((p) => p.riasec))].sort(), ["A", "C", "E", "I", "R", "S"]);
});

test("plus de champs de l'ancien jeu (critères, indices, 4 propositions)", () => {
  for (const p of problemes) {
    assert.ok(!("indices" in p) && !("choix" in p), p.id);
    assert.ok(!("criteres" in p.solution), p.id);
  }
});

for (const p of problemes) {
  test(`${p.id} : schéma complet`, () => {
    for (const champ of ["id", "titre", "illustration", "situation", "question", "riasec", "competenceParticipation", "questionVecu"]) {
      assert.ok(estTexte(p[champ]), `champ « ${champ} » manquant ou vide`);
    }
    assert.equal(p.illustration, `illustrations/${p.id}.svg`);
    assert.match(p.riasec, /^[RIASEC]$/, "riasec : une lettre R, I, A, S, E ou C");
    assert.match(p.situation, /\bvous\b/i, "situation à la 2e personne du pluriel");
    assert.ok(p.situation.length <= 400, "situation trop longue (2 à 4 phrases)");
    assert.ok(p.question.trim().endsWith("?"));

    assert.ok(p.solution && typeof p.solution === "object");
    assert.ok(estTexte(p.solution.resume));
    const mc = p.solution.motsCles;
    // Jusqu'à 30 : le MJ mock doit reconnaître le vocabulaire courant (mon tel, gmail, pote…).
    assert.ok(Array.isArray(mc) && mc.length >= 8 && mc.length <= 30, `8 à 30 motsCles (${mc?.length})`);
    for (const m of mc) assert.match(m, MOT_CLE, `motCle « ${m} » : minuscules sans accents`);
    assert.equal(new Set(mc).size, mc.length, "motsCles en double");

    assert.match(p.questionVecu, /\b(tu|t'|t’|ton|ta|tes)/i, "questionVecu au tutoiement");
    assert.ok(p.questionVecu.includes("?"));
  });

  test(`${p.id} : 4 à 6 compétences ROME existantes (savoir-faire + savoir-être)`, () => {
    const comp = p.competences;
    assert.ok(Array.isArray(comp) && comp.length >= 4 && comp.length <= 6, `4 à 6 compétences (${comp?.length})`);
    const codes = comp.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length, "code en double");
    for (const c of comp) {
      assert.ok(MACROS.has(c.code), `code ${c.code} absent de rome.json`);
      assert.ok(estTexte(c.pourquoi), `${c.code} : « pourquoi » vide`);
      assert.ok(Array.isArray(c.motsCles) && c.motsCles.length >= 3, `${c.code} : au moins 3 motsCles`);
      for (const m of c.motsCles) assert.match(m, MOT_CLE, `${c.code} : motCle « ${m} »`);
    }
    assert.ok(codes.some((c) => /^6D1\d\d$/.test(c)), "au moins un savoir-être 6D1xx");
    assert.ok(codes.some((c) => !/^6D1\d\d$/.test(c)), "au moins un savoir-faire");
  });

  test(`${p.id} : competenceParticipation existante et en 6D1xx`, () => {
    assert.match(p.competenceParticipation, /^6D1\d\d$/);
    assert.ok(MACROS.has(p.competenceParticipation), `${p.competenceParticipation} absent de rome.json`);
  });

  test(`${p.id} : aucun mot interdit`, () => {
    for (const texte of textesSensibles(p)) {
      const trouves = mots(texte).filter((m) => INTERDITS.has(m));
      assert.deepEqual(trouves, [], `mot interdit dans : « ${texte} »`);
    }
  });

  const svg = fileURLToPath(new URL(p.illustration, PUBLIC));
  test(
    `${p.id} : illustration présente`,
    { skip: existsSync(svg) ? false : `public/${p.illustration} pas encore créé (owner A2)` },
    () => {
      assert.ok(existsSync(svg));
    },
  );
}

test("le détecteur de mots interdits fonctionne (témoin)", () => {
  const trouve = (t) => mots(t).some((m) => INTERDITS.has(m));
  assert.ok(trouve("Ta mère t'appelle."));
  assert.ok(trouve("Vos parents arrivent."));
  assert.ok(trouve("Il va à l'hôpital."));
  assert.ok(trouve("Pas de permis."));
  assert.ok(!trouve("Un écran transparent."));
});

// ───────────── Mots-clés du MJ mock : racines, pas d'infinitifs ─────────────
// contientMot (src/texte.js) cherche le mot-clé en DÉBUT de mot : « appeler » ne
// reconnaît pas « j'appelle ». On écrit donc des racines (« appel », « preven »).
// Liste blanche : noms, adjectifs ou racines qui finissent par -er, -ir, -re.
const PAS_INFINITIF = new Set([
  "autre", "cher", "cyber", "uber", "soir", "heure", "entre", "ordre", "neutre", "titre", "capture",
  "papier", "formulaire", "trottoir", "danger", "flyer", "quartier", "gare", "commer", "respir", "sugger", "separe",
  "cadre", "cahier",
]);
const ressembleInfinitif = (motCle) =>
  motCle.split(/[ -]/).filter((t) => /(er|ir|re)$/.test(t) && !PAS_INFINITIF.has(t));

const tousLesMotsCles = (p) => [
  ...p.solution.motsCles.map((m) => ["solution", m]),
  ...p.competences.flatMap((c) => c.motsCles.map((m) => [c.code, m])),
];

for (const p of problemes) {
  test(`${p.id} : mots-clés en racines, aucun infinitif`, () => {
    const fautifs = tousLesMotsCles(p).filter(([, m]) => ressembleInfinitif(m).length).map(([o, m]) => `${o} « ${m} »`);
    assert.deepEqual(fautifs, [], "infinitif : les formes conjuguées ne seront pas reconnues");
  });
}

test("le détecteur d'infinitifs fonctionne (témoin)", () => {
  for (const m of ["appeler", "prevenir", "comprendre", "garder pour elle"]) assert.ok(ressembleInfinitif(m).length, m);
  for (const m of ["appel", "preven", "compren", "pas cher", "papier"]) assert.deepEqual(ressembleInfinitif(m), [], m);
});

test("les formes conjuguées sont reconnues par les mots-clés", () => {
  const P = Object.fromEntries(problemes.map((p) => [p.id, p]));
  const comp = (id, code) => P[id].competences.find((c) => c.code === code).motsCles;
  const cas = [
    ["telephone-mystere", "6B201", "J'appelle le club"],
    ["telephone-mystere", "6B201", "On prévient le coach"],
    ["telephone-mystere", "6B201", "Je demande à un pote"],
    ["telephone-mystere", "6B201", "Il lui explique la situation"],
    ["embrouille-equipe", "1B105", "On organise qui fait quoi le jour J"],
    ["embrouille-equipe", "6D101", "Je leur demande ce qui se passe"],
    ["caisse-buvette", "4A201", "Je recompte la caisse"],
    ["caisse-buvette", "6B201", "On prévient la trésorière"],
    ["jour-j-scooter", "2D313", "On comprend d'où vient la panne"],
    ["jour-j-scooter", "3F203", "Elle gare le scooter et l'attache"],
    ["jour-j-scooter", "3E205", "On change la bougie"],
    ["budget-tournoi", "6D115", "On demande un sponsor au commerçant"],
    ["budget-tournoi", "4C101", "On compare les prix"],
  ];
  for (const [id, code, phrase] of cas) assert.ok(compterMots(phrase, comp(id, code)) > 0, `${id} ${code} : « ${phrase} »`);
});

// ───────────── MJ mock : la compétence attendue sur des réponses réalistes ─────────────
const mj = mjMock({ rome });
const attribuer = async (id, texte) =>
  (await mj.attribuer({ probleme: problemes.find((p) => p.id === id), historique: { j1: { reponses: [texte], choix: null } } })).j1.code;

test("MJ mock : demander de l'aide au présent donne la compétence d'aide, pas la participation", async () => {
  assert.equal(await attribuer("jour-j-scooter", "On appelle un pote qui s'y connaît en mécanique"), "6B201");
  assert.equal(await attribuer("telephone-mystere", "Je demande conseil à quelqu'un de confiance"), "6B201");
});

test("MJ mock : les épisodes donnent la compétence attendue", async () => {
  assert.equal(await attribuer("telephone-mystere", "Il vibre donc la cause vient sans doute de l'écran"), "2D313");
  assert.equal(await attribuer("embrouille-equipe", "Je me mets entre eux, je reste neutre et j'écoute leur version"), "1D302");
  assert.equal(await attribuer("budget-tournoi", "On compare les prix et on répartit le budget"), "4C101");
  assert.equal(await attribuer("caisse-buvette", "Je recompte la caisse et la monnaie rendue"), "4A201");
});

// ───────────── Champs optionnels lus par le MJ (SPEC §4.1) ─────────────
// competenceParDefaut, competences[i].mots : src/mj.js les
// lit tels quels (le mock les donne au joueur, l'IA les reçoit en suggestion).
const MOTS_LONGUEUR_MAX = 140;

/** Liste des écarts au schéma des champs du MJ pour un problème ([] = conforme). */
function ecartsChampsMJ(p) {
  const ecarts = [];
  const codes = new Set((p.competences ?? []).map((c) => c.code));
  if (typeof p.competenceParDefaut !== "string" || !codes.has(p.competenceParDefaut)) {
    ecarts.push(`competenceParDefaut « ${p.competenceParDefaut} » absente de competences`);
  }
  for (const c of p.competences ?? []) {
    const m = c.mots;
    if (!estTexte(m)) {
      ecarts.push(`${c.code} : « mots » vide`);
      continue;
    }
    if (m !== m.trim()) ecarts.push(`${c.code} : espaces autour de « mots »`);
    if (!/^Tu /.test(m)) ecarts.push(`${c.code} : « mots » ne commence pas par « Tu »`);
    if (m.length > MOTS_LONGUEUR_MAX) ecarts.push(`${c.code} : « mots » de ${m.length} caractères (> ${MOTS_LONGUEUR_MAX})`);
    if (contientMotInterdit(m)) ecarts.push(`${c.code} : « mots » contient un mot interdit au MJ (faux, tromper, même si…)`);
    const sensibles = mots(m).filter((x) => INTERDITS.has(x));
    if (sensibles.length) ecarts.push(`${c.code} : « mots » touche un sujet sensible (${sensibles.join(", ")})`);
    // Même contrôle que pour les « mots » de l'IA : une seule phrase, forme « Tu … ».
    if (!motsValides(m)) ecarts.push(`${c.code} : « mots » refusés par motsValides`);
  }
  return ecarts;
}

for (const p of problemes) {
  test(`${p.id} : champs du MJ (competenceParDefaut, competences[i].mots)`, () => {
    assert.deepEqual(ecartsChampsMJ(p), []);
  });
}

test("le contrôle des champs du MJ détecte les écarts (témoin)", () => {
  const base = problemes[0];
  const fautif = {
    ...base,
    competenceParDefaut: "9Z999",
    competences: base.competences.map((c, i) => [
      { ...c, mots: "" },
      { ...c, mots: "Bravo, tu as bien réagi." },
      { ...c, mots: `Tu as ${"vraiment ".repeat(20)}bien réagi.` },
      { ...c, mots: "Tu as bien réagi, même si tu t'es trompé." },
      { ...c, mots: "Tu as pensé à prévenir ta mère." },
      { ...c, mots: "Tu as réagi. Tu as aidé." },
    ][i] ?? c),
  };
  const ecarts = ecartsChampsMJ(fautif).join("\n");
  for (const attendu of [
    "competenceParDefaut « 9Z999 »",
    "« mots » vide",
    "ne commence pas par « Tu »",
    `> ${MOTS_LONGUEUR_MAX}`,
    "mot interdit au MJ",
    "sujet sensible (mère)",
    "refusés par motsValides",
  ]) assert.ok(ecarts.includes(attendu), `écart non détecté : ${attendu}\n${ecarts}`);
});

test("MJ mock : une réponse sérieuse sans mot-clé reçoit competenceParDefaut et sa phrase", async () => {
  // Aucun mot-clé de compétence ni de solution dans aucune des situations.
  const texte = "Je prends un moment pour réfléchir puis je décide";
  for (const p of problemes) {
    assert.equal(p.competences.some((c) => compterMots(texte, c.motsCles) > 0) || compterMots(texte, p.solution.motsCles) > 0, false, `${p.id} : la phrase témoin contient un mot-clé`);
    const { j } = await mj.attribuer({ probleme: p, historique: { j: { reponses: [texte], choix: null } } });
    assert.equal(j.code, p.competenceParDefaut, p.id);
    assert.equal(j.mots, p.competences.find((x) => x.code === p.competenceParDefaut).mots, p.id);
  }
});
