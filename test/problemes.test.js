// Vérifie public/data/problemes.json : schéma, codes ROME, choix, illustrations,
// et absence de sujets sensibles (SPEC §4.1).
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
const IDS_ATTENDUS = [
  "telephone-casse",
  "anniversaire-20-euros",
  "conflit-discord",
  "scooter-panne",
  "voisine-formulaire",
  "affiche-evenement",
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
    ...p.solution.criteres,
    ...p.solution.motsCles,
    ...p.indices,
    ...p.choix.map((c) => c.texte),
    ...p.competences.map((c) => c.mots ?? ""),
  ];
}

test("structure générale", () => {
  assert.equal(data.version, 1);
  assert.ok(Array.isArray(problemes));
});

test("les 6 ids attendus, sans doublon", () => {
  assert.deepEqual([...problemes.map((p) => p.id)].sort(), [...IDS_ATTENDUS].sort());
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
    assert.ok(Array.isArray(p.solution.criteres) && p.solution.criteres.length >= 2);
    assert.ok(p.solution.criteres.every(estTexte));
    const mc = p.solution.motsCles;
    // Jusqu'à 30 : le MJ mock doit reconnaître le vocabulaire courant (mon tel, gmail, pote…).
    assert.ok(Array.isArray(mc) && mc.length >= 8 && mc.length <= 30, `8 à 30 motsCles (${mc?.length})`);
    for (const m of mc) assert.match(m, MOT_CLE, `motCle « ${m} » : minuscules sans accents`);
    assert.equal(new Set(mc).size, mc.length, "motsCles en double");

    assert.ok(Array.isArray(p.indices) && p.indices.length >= 2);
    assert.ok(p.indices.every(estTexte));

    assert.ok(Array.isArray(p.choix) && p.choix.length === 4, "exactement 4 choix");
    for (const c of p.choix) {
      assert.ok(estTexte(c.texte));
      assert.equal(typeof c.correct, "boolean");
    }

    assert.match(p.questionVecu, /\b(tu|t'|t’|ton|ta|tes)/i, "questionVecu au tutoiement");
    assert.ok(p.questionVecu.includes("?"));
  });

  test(`${p.id} : exactement 1 choix correct`, () => {
    assert.equal(p.choix.filter((c) => c.correct === true).length, 1);
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

test("la bonne réponse n'est pas toujours à la même position", () => {
  const positions = new Set(problemes.map((p) => p.choix.findIndex((c) => c.correct)));
  assert.ok(positions.size >= 3, `positions utilisées : ${[...positions].join(", ")}`);
});

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
    ["telephone-casse", "6B201", "J'appelle le snack"],
    ["telephone-casse", "6B201", "On prévient le patron"],
    ["telephone-casse", "6B201", "Je demande à un pote"],
    ["telephone-casse", "6B201", "Il lui explique la situation"],
    ["conflit-discord", "6D101", "Je leur demande ce qui se passe"],
    ["conflit-discord", "6D112", "On attend qu'ils se calment"],
    ["voisine-formulaire", "1D101", "Je l'aide et je lui montre"],
    ["voisine-formulaire", "6D116", "Je lui propose de passer"],
    ["scooter-panne", "2D313", "On comprend d'où vient la panne"],
    ["scooter-panne", "3F203", "Elle gare le scooter et l'attache"],
    ["scooter-panne", "3E205", "On change la bougie"],
    ["anniversaire-20-euros", "6D115", "On crée une vidéo"],
  ];
  for (const [id, code, phrase] of cas) assert.ok(compterMots(phrase, comp(id, code)) > 0, `${id} ${code} : « ${phrase} »`);
});

// ───────────── MJ mock : résolu / pas résolu sur des réponses réalistes ─────────────
const mj = mjMock({ rome });
const P_PAR_ID = Object.fromEntries(problemes.map((p) => [p.id, p]));
const evaluer = async (id, texte) =>
  (await mj.evaluer({ probleme: P_PAR_ID[id], reponses: [{ joueurId: "j1", texte }] })).resolu;
const attribuer = async (id, texte) =>
  (await mj.attribuer({ probleme: P_PAR_ID[id], historique: { j1: { reponses: [texte], choix: null } } })).j1.code;

const RESOLUES = {
  "telephone-casse": [
    "je lui prête mon portable, il récupère son CV sur Google Drive",
    "Sami emprunte mon téléphone pour envoyer son CV par mail",
    "il appelle le patron pour dire qu'il aura du retard",
  ],
  "anniversaire-20-euros": [
    "On fait une petite vidéo avec des messages de tout le monde",
    "On fait un gâteau nous-mêmes et on lui achète un maillot pas cher",
  ],
  "conflit-discord": ["On fait un vocal tous ensemble pour s'expliquer"],
  "scooter-panne": ["On regarde s'il reste de l'essence", "On appelle un pote qui s'y connaît en mécanique"],
  "voisine-formulaire": ["Je l'aide à remplir sur mon téléphone en lui expliquant"],
  "affiche-evenement": ["je colle des affiches dans le quartier et à la boulangerie"],
};
const NON_RESOLUES = {
  "telephone-casse": [
    "On l'emmène chez le réparateur et on compare les devis",
    "Je fais réparer son téléphone portable",
    "Il achète un nouveau téléphone",
  ],
  "anniversaire-20-euros": ["On lui achète un maillot de foot avec les 20 euros"],
  // Critère 3 : une belle affiche montrée nulle part ne résout pas le problème.
  "affiche-evenement": [
    "Je fais une belle affiche avec plein de couleurs et un gros titre",
    "Je dessine l'affiche avec la date et le lieu",
  ],
};

for (const p of problemes) {
  test(`${p.id} : MJ mock, réponses qui remplissent les critères → résolu`, async () => {
    for (const t of RESOLUES[p.id] ?? []) assert.equal(await evaluer(p.id, t), true, `« ${t} »`);
  });

  test(`${p.id} : MJ mock, réponses à côté → pas résolu`, async () => {
    for (const t of [...(NON_RESOLUES[p.id] ?? []), "Je sais pas trop, on verra bien", "Peut-être attendre un peu"]) {
      assert.equal(await evaluer(p.id, t), false, `« ${t} »`);
    }
  });

  test(`${p.id} : MJ mock, la bonne proposition résout, les 3 autres non`, async () => {
    for (const c of p.choix) assert.equal(await evaluer(p.id, c.texte), c.correct, `« ${c.texte} »`);
  });
}

test("MJ mock : demander de l'aide au présent donne la compétence d'aide, pas la participation", async () => {
  assert.equal(await attribuer("scooter-panne", "On appelle un pote qui s'y connaît en mécanique"), "6B201");
  assert.equal(await attribuer("telephone-casse", "Je demande conseil à quelqu'un de confiance"), "6B201");
});

// ───────────── Choix : la bonne réponse ne se repère pas à sa taille ─────────────
const nbMots = (s) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

for (const p of problemes) {
  test(`${p.id} : 4 choix de 12 à 18 mots, la bonne pas plus longue que 1,3 × la moyenne des autres`, () => {
    for (const c of p.choix) {
      const n = nbMots(c.texte);
      assert.ok(n >= 12 && n <= 18, `${n} mots : « ${c.texte} »`);
    }
    const bonne = p.choix.find((c) => c.correct).texte;
    const autres = p.choix.filter((c) => !c.correct).map((c) => c.texte);
    const moyenne = (f) => autres.reduce((a, t) => a + f(t), 0) / autres.length;
    assert.ok(bonne.length <= 1.3 * moyenne((t) => t.length), `caractères : ${bonne.length} vs moyenne ${moyenne((t) => t.length).toFixed(0)}`);
    assert.ok(nbMots(bonne) <= 1.3 * moyenne(nbMots), `mots : ${nbMots(bonne)} vs moyenne ${moyenne(nbMots).toFixed(1)}`);
  });
}

// ───────────── Champs optionnels lus par le MJ (SPEC §4.1) ─────────────
// competenceParDefaut, choix[i].competence, competences[i].mots : src/mj.js les
// lit tels quels (le mock les donne au joueur, Claude les reçoit en suggestion).
const MOTS_LONGUEUR_MAX = 140;

/** Liste des écarts au schéma des champs du MJ pour un problème ([] = conforme). */
function ecartsChampsMJ(p) {
  const ecarts = [];
  const codes = new Set((p.competences ?? []).map((c) => c.code));
  if (typeof p.competenceParDefaut !== "string" || !codes.has(p.competenceParDefaut)) {
    ecarts.push(`competenceParDefaut « ${p.competenceParDefaut} » absente de competences`);
  }
  (p.choix ?? []).forEach((c, i) => {
    if (typeof c.competence !== "string" || !codes.has(c.competence)) ecarts.push(`choix ${i} : competence « ${c.competence} » absente de competences`);
  });
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
    // Même contrôle que pour les « mots » de Claude : une seule phrase, forme « Tu … ».
    if (!motsValides(m)) ecarts.push(`${c.code} : « mots » refusés par motsValides`);
  }
  return ecarts;
}

for (const p of problemes) {
  test(`${p.id} : champs du MJ (competenceParDefaut, choix[i].competence, competences[i].mots)`, () => {
    assert.deepEqual(ecartsChampsMJ(p), []);
  });
}

test("le contrôle des champs du MJ détecte les écarts (témoin)", () => {
  const base = problemes[0];
  const fautif = {
    ...base,
    competenceParDefaut: "9Z999",
    choix: base.choix.map((c, i) => (i === 0 ? { ...c, competence: "9Z999" } : i === 1 ? { texte: c.texte, correct: c.correct } : c)),
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
    "choix 0 : competence « 9Z999 »",
    "choix 1 : competence « undefined »",
    "« mots » vide",
    "ne commence pas par « Tu »",
    `> ${MOTS_LONGUEUR_MAX}`,
    "mot interdit au MJ",
    "sujet sensible (mère)",
    "refusés par motsValides",
  ]) assert.ok(ecarts.includes(attendu), `écart non détecté : ${attendu}\n${ecarts}`);
});

test("MJ mock : un joueur qui n'a que choisi reçoit la compétence et la phrase prévues pour son choix", async () => {
  for (const p of problemes) {
    for (const [i, c] of p.choix.entries()) {
      const { j } = await mj.attribuer({ probleme: p, historique: { j: { reponses: [], choix: i } } });
      assert.equal(j.code, c.competence, `${p.id} choix ${i}`);
      assert.equal(j.mots, p.competences.find((x) => x.code === c.competence).mots, `${p.id} choix ${i}`);
      assert.equal(j.preuve, c.texte);
      assert.equal(j.typePreuve, "jeu");
    }
  }
});

test("MJ mock : une réponse sérieuse sans mot-clé reçoit competenceParDefaut et sa phrase", async () => {
  // Aucun mot-clé de compétence ni de solution dans aucun des 6 problèmes.
  const texte = "Je prends un moment pour réfléchir puis je décide";
  for (const p of problemes) {
    assert.equal(p.competences.some((c) => compterMots(texte, c.motsCles) > 0) || compterMots(texte, p.solution.motsCles) > 0, false, `${p.id} : la phrase témoin contient un mot-clé`);
    const { j } = await mj.attribuer({ probleme: p, historique: { j: { reponses: [texte], choix: null } } });
    assert.equal(j.code, p.competenceParDefaut, p.id);
    assert.equal(j.mots, p.competences.find((x) => x.code === p.competenceParDefaut).mots, p.id);
  }
});
