// Tests de la machine à états PURE (src/jeu.js) — SPEC §3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { creerEtat, appliquer, vue, AVATARS, tirerProblemes, effetsIAEnAttente } from "../src/jeu.js";

// ───────── Problèmes FACTICES (codes ROME réels, vérifiés dans public/data/rome.json) ─────────
const PROBLEMES = [
  {
    id: "test-telephone",
    titre: "Téléphone tombé",
    illustration: "illustrations/test.svg",
    situation: "Vous êtes au parc. Le téléphone de votre pote tombe dans une flaque.",
    question: "Que faites-vous ?",
    riasec: "C/R",
    solution: {
      resume: "Éteindre le téléphone tout de suite, le sécher, puis demander conseil à une boutique de réparation.",
      criteres: ["éteindre le téléphone", "le faire sécher ou demander conseil"],
      motsCles: ["etein", "sech", "repar", "boutique"],
    },
    indices: ["Pensez d'abord à l'électricité.", "Un appareil allumé dans l'eau risque plus."],
    choix: [
      { texte: "Le mettre à charger pour voir s'il marche.", correct: false },
      { texte: "L'éteindre et le faire sécher.", correct: true },
      { texte: "Attendre qu'il sèche tout seul allumé.", correct: false },
      { texte: "Appeler un ami pour avoir son avis.", correct: false },
    ],
    competences: [
      { code: "6D111", pourquoi: "agit vite", motsCles: ["vite", "tout de suite", "etein"] },
      { code: "6D101", pourquoi: "rassure le pote", motsCles: ["rassur", "calme", "ecout"] },
      { code: "6D102", pourquoi: "cherche de l'aide", motsCles: ["aide", "ensemble", "demand"] },
      { code: "6D110", pourquoi: "procède avec soin", motsCles: ["sech", "doucement"] },
    ],
    competenceParticipation: "6D102",
    questionVecu: "Ça t'est déjà arrivé de réparer un objet ?",
  },
  {
    id: "test-anniversaire",
    titre: "Anniversaire à 20 euros",
    illustration: "illustrations/test2.svg",
    situation: "Vous organisez l'anniversaire d'un pote du club avec 20 euros pour tout le groupe.",
    question: "Comment faites-vous ?",
    riasec: "E/C",
    solution: {
      resume: "Faire une liste des dépenses, partager les tâches et cuisiner ensemble plutôt qu'acheter.",
      criteres: ["faire un budget ou une liste", "répartir les tâches"],
      motsCles: ["liste", "budget", "partag", "cuisin"],
    },
    indices: ["Que pouvez-vous fabriquer vous-mêmes ?", "Qui peut apporter quoi ?"],
    choix: [
      { texte: "Tout dépenser dans un gros gâteau.", correct: false },
      { texte: "Demander à chacun d'apporter quelque chose.", correct: false },
      { texte: "Faire une liste, répartir les tâches et cuisiner ensemble.", correct: true },
      { texte: "Reporter la fête à plus tard.", correct: false },
    ],
    competences: [
      { code: "4A201", pourquoi: "gère l'argent", motsCles: ["budget", "compt", "euro"] },
      { code: "6D107", pourquoi: "organise", motsCles: ["liste", "organis", "plan"] },
      { code: "1A102", pourquoi: "encadre le groupe", motsCles: ["groupe", "enfant"] },
      { code: "6D102", pourquoi: "travaille en équipe", motsCles: ["ensemble", "partag"] },
    ],
    competenceParticipation: "6D102",
    questionVecu: "Tu as déjà organisé une fête ?",
  },
  {
    id: "test-discord",
    titre: "Dispute sur Discord",
    illustration: "illustrations/test3.svg",
    situation: "Deux membres de votre serveur se disputent.",
    question: "Que faites-vous ?",
    riasec: "S/E",
    solution: { resume: "Calmer le jeu en privé.", criteres: ["parler en privé"], motsCles: ["prive", "calm"] },
    indices: ["Et en privé ?"],
    choix: [
      { texte: "A", correct: true },
      { texte: "B", correct: false },
      { texte: "C", correct: false },
      { texte: "D", correct: false },
    ],
    competences: [{ code: "6D101", pourquoi: "écoute", motsCles: ["ecout"] }],
    competenceParticipation: "6D102",
  },
];

const T0 = 1_700_000_000_000;

// Applique un événement et vérifie qu'il est accepté.
function ok(etat, ev, t = T0) {
  const r = appliquer(etat, ev, t);
  assert.equal(r.erreur, undefined, `refus inattendu pour ${ev?.t} : ${r.erreur}`);
  return r;
}
// Applique un événement et vérifie qu'il est REFUSÉ sans changer l'état.
function ko(etat, ev, t = T0) {
  const avant = JSON.stringify(etat);
  const r = appliquer(etat, ev, t);
  assert.equal(typeof r.erreur, "string", `${ev?.t} aurait dû être refusé`);
  assert.ok(r.erreur.length > 0);
  assert.equal(r.etat, etat, "l'état renvoyé doit être le même objet");
  assert.deepEqual(r.effets, []);
  assert.equal(JSON.stringify(r.etat), avant, "l'état ne doit pas changer");
  return r;
}

const J = (joueurId, msg) => ({ ...msg, role: "joueur", joueurId });
const E = (msg) => ({ ...msg, role: "ecran" });

function nouvellePartie(opts = {}) {
  return creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 2, graine: 42, ...opts });
}

// Partie avec 2 joueurs (a, b), démarrée, personnages validés → presentation du problème 0.
function partieEnPresentation(opts) {
  let e = nouvellePartie(opts);
  e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  e = ok(e, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🐼" })).etat;
  e = ok(e, E({ t: "demarrer" })).etat;
  e = ok(e, E({ t: "suivant" })).etat; // personne n'a fini : 0 compétence de départ
  assert.equal(e.phase, "presentation");
  return e;
}

// Avance jusqu'à la phase `reponse` du problème courant.
function jusquaReponse(e, t = T0) {
  e = ok(e, E({ t: "suivant" }), t).etat; // → echange
  e = ok(e, E({ t: "fin_minuteur" }), t).etat; // → reponse
  assert.equal(e.phase, "reponse");
  return e;
}

// ───────────────────────── Création ─────────────────────────

test("creerEtat : phase accueil, réglages, tirage déterministe et varié", () => {
  const e = nouvellePartie();
  assert.equal(e.phase, "accueil");
  assert.equal(e.code, "BCDF");
  assert.deepEqual(e.reglages, { nbProblemes: 2, dureeEchange: 120, dureeReponse: 90 });
  assert.equal(e.problemes.length, 2);
  assert.deepEqual(nouvellePartie().problemes, e.problemes, "même graine → même tirage");
  // Types RIASEC dominants différents quand c'est possible.
  const doms = e.problemes.map((id) => PROBLEMES.find((p) => p.id === id).riasec[0]);
  assert.equal(new Set(doms).size, doms.length);
  // nbProblemes borné par le nombre de problèmes disponibles.
  assert.equal(creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 6, graine: 1 }).problemes.length, 3);
  // Accepte aussi le format { version, problemes }.
  assert.equal(creerEtat({ code: "BCDF", problemes: { version: 1, problemes: PROBLEMES }, graine: "x" }).problemes.length, 3);
  // Le JSON doit survivre à la sérialisation (stockage DO).
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
});

test("tirage : couvre des types RIASEC différents pour plusieurs graines", () => {
  for (let g = 0; g < 30; g++) {
    const tires = tirerProblemes(PROBLEMES, 3, g);
    assert.equal(new Set(tires.map((p) => p.riasec[0])).size, 3);
  }
});

test("AVATARS : 12 emojis", () => {
  assert.equal(AVATARS.length, 12);
});

// ───────────────────────── Accueil ─────────────────────────

test("rejoindre : validation du pseudo et de l'avatar", () => {
  const e = nouvellePartie();
  ko(e, J("a", { t: "rejoindre", pseudo: "", avatar: "🦊" }));
  ko(e, J("a", { t: "rejoindre", pseudo: "   ", avatar: "🦊" }));
  ko(e, J("a", { t: "rejoindre", pseudo: "x".repeat(21), avatar: "🦊" }));
  ko(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🚗" }));
  ko(e, J("a", { t: "rejoindre", pseudo: 12, avatar: "🦊" }));
  ko(e, { t: "rejoindre", pseudo: "Lina", avatar: "🦊", role: "joueur" }); // pas d'id
  ko(e, E({ t: "rejoindre", pseudo: "Lina", avatar: "🦊" })); // pas un joueur
  const r = ok(e, J("a", { t: "rejoindre", pseudo: "x".repeat(20), avatar: "🦊" }));
  assert.equal(r.etat.joueurs.a.pseudo, "x".repeat(20));
  assert.equal(r.etat.joueurs.a.connecte, true);
  assert.deepEqual(r.effets, []);
  assert.equal(e.joueurs.a, undefined, "l'état d'origine n'est pas modifié");
  // Pseudo et avatar déjà pris.
  ko(r.etat, J("b", { t: "rejoindre", pseudo: "X".repeat(20), avatar: "🐼" }));
  ko(r.etat, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🦊" }));
});

test("rejoindre : 6 joueurs maximum", () => {
  let e = nouvellePartie();
  for (let i = 0; i < 6; i++) e = ok(e, J(`j${i}`, { t: "rejoindre", pseudo: `P${i}`, avatar: AVATARS[i] })).etat;
  ko(e, J("j7", { t: "rejoindre", pseudo: "P7", avatar: AVATARS[7] }));
});

test("rejoindre : refusé après le démarrage, sauf reconnexion", () => {
  let e = nouvellePartie();
  e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  e = ok(e, { t: "deconnexion", joueurId: "a" }).etat;
  assert.equal(e.joueurs.a.connecte, false);
  e = ok(e, E({ t: "demarrer" })).etat;
  const r = ko(e, J("z", { t: "rejoindre", pseudo: "Zoé", avatar: "🐸" }));
  assert.match(r.erreur, /déjà commencé/);
  const r2 = ok(e, J("a", { t: "rejoindre", pseudo: "Autre", avatar: "🐸" }));
  assert.equal(r2.etat.joueurs.a.connecte, true);
  assert.equal(r2.etat.joueurs.a.pseudo, "Lina", "la reconnexion ne change pas le pseudo");
});

test("reglages : écran, accueil seulement, bornes", () => {
  const e = nouvellePartie();
  ko(e, J("a", { t: "reglages", dureeEchange: 60 }));
  ko(e, E({ t: "reglages", dureeEchange: 5 }));
  ko(e, E({ t: "reglages", dureeReponse: "abc" }));
  const r = ok(e, E({ t: "reglages", dureeEchange: 60, dureeReponse: 45 }));
  assert.equal(r.etat.reglages.dureeEchange, 60);
  assert.equal(r.etat.reglages.dureeReponse, 45);
  let d = ok(r.etat, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  d = ok(d, E({ t: "demarrer" })).etat;
  ko(d, E({ t: "reglages", dureeEchange: 60 }));
});

test("demarrer : écran seulement, au moins 1 joueur", () => {
  const e = nouvellePartie();
  ko(e, E({ t: "demarrer" }));
  const e1 = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  ko(e1, J("a", { t: "demarrer" }));
  const r = ok(e1, E({ t: "demarrer" }));
  assert.equal(r.etat.phase, "creation");
  ko(r.etat, E({ t: "demarrer" }));
});

// ───────────────────────── Création du personnage ─────────────────────────

test("creation : récit → analyser_recit → analyse_faite → valider_depart → passage auto", () => {
  let e = nouvellePartie();
  e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  e = ok(e, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🐼" })).etat;
  ko(e, J("a", { t: "recit", texte: "Je garde mes voisins." })); // hors phase
  e = ok(e, E({ t: "demarrer" })).etat;

  ko(e, J("a", { t: "recit", texte: "court" }));
  ko(e, J("a", { t: "recit", texte: "x".repeat(1001) }));
  ko(e, J("a", { t: "valider_depart", garder: [] })); // pas encore analysé

  const recit = "Je répare les vélos des voisins le samedi.";
  let r = ok(e, J("a", { t: "recit", texte: recit }));
  assert.deepEqual(r.effets, [{ type: "analyser_recit", joueurId: "a", texte: recit }]);
  e = r.etat;
  assert.equal(e.joueurs.a.depart.etat, "analyse");
  ko(e, J("a", { t: "recit", texte: recit })); // analyse en cours

  // Un client ne peut pas forger un événement interne.
  ko(e, J("a", { t: "analyse_faite", joueurId: "a", competences: [] }));

  const comps = ["6D101", "6D102", "6D103", "6D104"].map((code) => ({
    code, libelle: code, mots: "Tu sais faire ça.", preuve: "Je répare les vélos", riasec: ["R"],
  }));
  e = ok(e, { t: "analyse_faite", joueurId: "a", competences: comps }).etat;
  assert.equal(e.joueurs.a.depart.etat, "a_valider");
  assert.equal(e.joueurs.a.depart.propositions.length, 3, "au maximum 3 compétences de départ");
  assert.equal(e.joueurs.a.depart.propositions[0].typePreuve, "vecu");
  assert.equal(e.joueurs.a.depart.propositions[0].problemeIndex, null);

  ko(e, J("a", { t: "valider_depart", garder: [true, false] })); // mauvaise longueur
  ko(e, J("a", { t: "valider_depart", garder: [true, "oui", false] }));
  e = ok(e, J("a", { t: "valider_depart", garder: [true, false, true] })).etat;
  assert.equal(e.joueurs.a.depart.etat, "valide");
  assert.deepEqual(e.joueurs.a.depart.gardees.map((c) => c.code), ["6D101", "6D103"]);
  assert.equal(e.phase, "creation", "b n'a pas encore validé");

  // b : l'IA a échoué → 0 proposition, il valide quand même.
  e = ok(e, J("b", { t: "recit", texte: "Je fais les courses pour la voisine." })).etat;
  e = ok(e, { t: "erreur_ia", joueurId: "b" }).etat;
  assert.equal(e.joueurs.b.depart.etat, "a_valider");
  r = ok(e, J("b", { t: "valider_depart", garder: [] }));
  assert.equal(r.etat.phase, "presentation", "tous ont validé → premier problème");
  assert.equal(r.etat.problemeIndex, 0);
});

const DEPART = (code) => ({ code, libelle: code, mots: "Tu sais faire ça.", preuve: "Je répare les vélos", riasec: ["R"] });

test("creation forcée par l'écran : analyse prête mais pas validée → compétences de départ EN ATTENTE, pas perdues", () => {
  let e = nouvellePartie();
  e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  e = ok(e, J("c", { t: "rejoindre", pseudo: "Noa", avatar: "🐸" })).etat;
  e = ok(e, E({ t: "demarrer" })).etat;
  e = ok(e, J("a", { t: "recit", texte: "Je répare les vélos des voisins." })).etat;
  e = ok(e, { t: "analyse_faite", joueurId: "a", competences: [DEPART("3E205"), DEPART("6D116")] }).etat;
  assert.equal(e.joueurs.a.depart.etat, "a_valider");
  assert.deepEqual(e.joueurs.a.depart.propositions.map((c) => c.departIndex), [0, 1], "identifiant stable par compétence de départ");

  e = ok(e, E({ t: "suivant" })).etat; // l'animateur n'attend pas : a n'a pas validé, c n'a rien écrit
  assert.equal(e.phase, "presentation");
  const a = e.joueurs.a;
  assert.equal(a.depart.etat, "valide", "la création est close");
  assert.deepEqual(a.competences.map((c) => [c.code, c.problemeIndex, c.gardee, c.departIndex, c.typePreuve]), [
    ["3E205", null, null, 0, "vecu"],
    ["6D116", null, null, 1, "vecu"],
  ], "ses propositions deviennent des compétences de départ en attente");
  assert.deepEqual(e.joueurs.c.competences, [], "rien écrit : rien à garder");

  // Le téléphone les propose comme les compétences de jeu en attente.
  let va = vue(e, "joueur", "a");
  assert.deepEqual(va.moi.competencesEnAttente.map((c) => [c.code, c.departIndex, c.problemeIndex]), [["3E205", 0, null], ["6D116", 1, null]]);
  assert.deepEqual(vue(e, "joueur", "c").moi.competencesEnAttente, []);

  // Garder / refuser plus tard, par departIndex, sans faire avancer la partie.
  ko(e, J("a", { t: "garder_competence", garder: true, departIndex: 5 }));
  ko(e, J("a", { t: "garder_competence", garder: true, departIndex: "0" }));
  ko(e, J("a", { t: "garder_competence", garder: true, departIndex: 0, problemeIndex: 0 }));
  ko(e, J("c", { t: "garder_competence", garder: true, departIndex: 0 }));
  e = ok(e, J("a", { t: "garder_competence", garder: true, departIndex: 0 })).etat;
  assert.equal(e.phase, "presentation", "aucun effet sur la phase");
  assert.equal(e.joueurs.a.competences[0].gardee, true);
  assert.deepEqual(e.joueurs.a.depart.gardees.map((c) => c.code), ["3E205"]);
  va = vue(e, "joueur", "a");
  assert.deepEqual(va.moi.competencesEnAttente.map((c) => c.departIndex), [1]);

  // Toujours possible plus loin dans la partie, y compris en phase fin.
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "garder_competence", garder: false, departIndex: 1 })).etat;
  assert.equal(e.phase, "reponse");
  assert.equal(e.joueurs.a.competences[1].gardee, false);
  assert.deepEqual(vue(e, "joueur", "a").moi.competencesEnAttente, []);
  e = ok(e, J("a", { t: "garder_competence", garder: true, departIndex: 1 })).etat; // il change d'avis
  assert.deepEqual(e.joueurs.a.depart.gardees.map((c) => c.code), ["3E205", "6D116"]);
  const fin = structuredClone(e);
  fin.phase = "fin";
  assert.equal(ok(fin, J("a", { t: "garder_competence", garder: false, departIndex: 0 })).etat.joueurs.a.competences[0].gardee, false);
});

test("creation forcée pendant l'analyse : le résultat qui arrive après devient des compétences en attente", () => {
  let e = nouvellePartie();
  e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  e = ok(e, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🐼" })).etat;
  e = ok(e, E({ t: "demarrer" })).etat;
  e = ok(e, J("a", { t: "recit", texte: "Je répare les vélos des voisins." })).etat;
  e = ok(e, J("b", { t: "recit", texte: "Je garde mon petit frère le mercredi." })).etat;
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.phase, "presentation");
  assert.equal(e.joueurs.a.depart.etat, "analyse", "l'analyse est toujours attendue");
  assert.deepEqual(e.joueurs.a.competences, []);
  // Le chien de garde du DO la relance encore si l'appel est perdu.
  assert.deepEqual(effetsIAEnAttente(e).map((x) => [x.type, x.joueurId]), [["analyser_recit", "a"], ["analyser_recit", "b"]]);

  // L'analyse arrive hors phase creation : acceptée, propositions → compétences en attente.
  e = ok(e, { t: "analyse_faite", joueurId: "a", competences: [DEPART("3E205")] }).etat;
  assert.equal(e.joueurs.a.depart.etat, "valide");
  assert.deepEqual(e.joueurs.a.competences.map((c) => [c.code, c.problemeIndex, c.gardee, c.departIndex]), [["3E205", null, null, 0]]);
  assert.deepEqual(vue(e, "joueur", "a").moi.competencesEnAttente.map((c) => c.code), ["3E205"]);
  ko(e, { t: "analyse_faite", joueurId: "a", competences: [DEPART("6D101")] }); // doublon refusé
  e = ok(e, J("a", { t: "garder_competence", garder: true, departIndex: 0 })).etat;
  assert.equal(e.joueurs.a.competences[0].gardee, true);

  // Échec de l'IA hors création : la création est close, 0 compétence, plus rien en attente.
  e = ok(e, { t: "erreur_ia", joueurId: "b" }).etat;
  assert.equal(e.joueurs.b.depart.etat, "valide");
  assert.deepEqual(e.joueurs.b.competences, []);
  assert.deepEqual(effetsIAEnAttente(e), []);
  ko(e, { t: "erreur_ia", joueurId: "b" });
});

// ───────────────────────── Problème ─────────────────────────
// Pas de bonne ni de mauvaise réponse : après les réponses, le MJ donne
// directement une compétence à chacun (pas d'évaluation, d'indice ni de choix).

test("problème : presentation → echange → reponse → competences → suivant", () => {
  let e = partieEnPresentation();
  const p0 = e.problemes[0];

  let r = ok(e, E({ t: "suivant" }), T0);
  assert.equal(r.etat.phase, "echange");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 120 * 1000 }]);
  assert.equal(r.etat.minuteurFin, T0 + 120000);
  e = r.etat;

  ko(e, J("a", { t: "reponse", texte: "trop tôt" }));

  r = ok(e, E({ t: "fin_minuteur" }), T0 + 120000);
  assert.equal(r.etat.phase, "reponse");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 120000 + 90 * 1000 }]);
  e = r.etat;

  ko(e, J("a", { t: "reponse", texte: "x".repeat(501) }));
  ko(e, J("a", { t: "reponse" }));
  e = ok(e, J("a", { t: "reponse", texte: "première idée" })).etat;
  r = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite et je le fais sécher" }));
  assert.deepEqual(r.effets, [], "renvoyer remplace la réponse");
  e = r.etat;
  assert.equal(e.joueurs.a.reponses[0].tour1, "Je l'éteins tout de suite et je le fais sécher");

  r = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote" }));
  assert.equal(r.etat.phase, "competences", "tous ont répondu : directement les compétences");
  assert.equal(r.etat.attribution, null);
  assert.ok(r.effets.some((x) => x.type === "annuler_minuteur"));
  assert.ok(!r.effets.some((x) => x.type === "evaluer"), "plus d'évaluation résolu / pas résolu");
  const attribuer = r.effets.find((x) => x.type === "attribuer");
  assert.deepEqual(attribuer.historique, {
    a: { reponses: ["Je l'éteins tout de suite et je le fais sécher"], choix: null },
    b: { reponses: ["Je rassure mon pote"], choix: null },
  });
  assert.equal(attribuer.problemeIndex, 0);
  assert.equal(attribuer.probleme.id, p0);
  e = r.etat;
  const ve = vue(e, "ecran");
  for (const cle of ["evaluation", "indice", "choix", "solution"]) assert.ok(!(cle in ve), `plus de « ${cle} » dans la vue`);
  // Le MJ prépare les compétences : « Suivant » relance l'attribution avec le MJ de secours.
  const relanceAtt = ok(e, E({ t: "suivant" }));
  assert.equal(relanceAtt.etat.phase, "competences");
  assert.deepEqual(relanceAtt.effets, [{ ...attribuer, secours: true }]);
  ko(e, J("a", { t: "garder_competence", garder: true }));

  const comp = (code, preuve) => ({ code, libelle: code, mots: "Tu as agi vite.", preuve, typePreuve: "jeu", riasec: ["E"] });
  ko(e, { t: "attribution_faite", problemeIndex: 1, competences: {} }); // périmé
  r = ok(e, { t: "attribution_faite", problemeIndex: 0, competences: { a: comp("6D111", "tout de suite"), b: comp("6D101", "Je rassure") } });
  e = r.etat;
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme.code, "6D111");
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme.problemeIndex, 0);
  ko(e, { t: "attribution_faite", problemeIndex: 0, competences: { a: comp("6D101", "x") } }); // déjà attribué

  ko(e, J("a", { t: "garder_competence", garder: "oui" }));
  e = ok(e, J("a", { t: "garder_competence", garder: true })).etat;
  assert.equal(e.phase, "competences");
  r = ok(e, J("b", { t: "garder_competence", garder: false }), T0 + 1);
  assert.equal(r.etat.phase, "presentation", "tous ont choisi → problème suivant");
  assert.equal(r.etat.problemeIndex, 1);
  assert.equal(r.etat.joueurs.a.competences.find((c) => c.problemeIndex === 0).gardee, true);
  assert.equal(r.etat.joueurs.b.competences.find((c) => c.problemeIndex === 0).gardee, false);
});

test("reponse : « je ne sais pas » et violence refusées pour CE joueur seulement, qui réécrit", () => {
  let e = jusquaReponse(partieEnPresentation());
  // a donne une vraie réponse : acceptée tout de suite, on ne lui redemande rien.
  e = ok(e, J("a", { t: "reponse", texte: "J'appelle un réparateur" })).etat;
  for (const texte of ["", "Je ne sais pas", "jsp", "aucune idée", "bof je sais pas trop", "???", "euh..."]) {
    const r = ko(e, J("b", { t: "reponse", texte }));
    assert.match(r.erreur, /Toutes les idées comptent/);
  }
  for (const texte of ["Je le frappe", "je lui casse la gueule", "On se bat", "je sors un couteau", "je le tabasse"]) {
    const r = ko(e, J("b", { t: "reponse", texte }));
    assert.match(r.erreur, /sans violence/);
  }
  // Le refus ne touche que b : a reste « a répondu », rien n'est montré à l'écran.
  assert.deepEqual(vue(e, "ecran").joueurs.map((j) => j.aFini), [true, false]);
  assert.equal(e.phase, "reponse");
  // Réponses courtes mais vraies : acceptées (il n'y a pas de mauvaise réponse).
  for (const texte of ["je l'aide", "Je frappe à la porte de la voisine", "Je tape un message au coach", "je signale les insultes"]) {
    ok(e, J("b", { t: "reponse", texte }));
  }
  const r = ok(e, J("b", { t: "reponse", texte: "Je demande à quelqu'un de lui prêter un téléphone" }));
  assert.equal(r.etat.phase, "competences");
});

test("reponse : à la fin du minuteur, la partie attend (pas d'enchaînement automatique)", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "J'appelle un réparateur" })).etat;
  const r = ok(e, { t: "minuteur_fini" });
  assert.equal(r.etat.phase, "reponse", "on attend encore b");
  assert.equal(r.etat.tempsEcoule, true);
  assert.deepEqual(r.effets, []);
  assert.equal(vue(r.etat, "ecran").tempsEcoule, true);
  assert.equal(vue(r.etat, "joueur", "b").tempsEcoule, true);
  assert.deepEqual(vue(r.etat, "ecran").joueurs.map((j) => j.aFini), [true, false]);
  ko(r.etat, { t: "minuteur_fini" }); // l'alarme ne sonne qu'une fois
  // b répond après la fin du temps : tout le monde a répondu → compétences.
  const r2 = ok(r.etat, J("b", { t: "reponse", texte: "Je compare les prix" }));
  assert.equal(r2.etat.phase, "competences");
  assert.equal(r2.etat.tempsEcoule, false);
});

test("reponse : l'animateur passe sans attendre → les absents ont une réponse vide", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "J'appelle un réparateur" })).etat;
  e = ok(e, { t: "minuteur_fini" }).etat;
  const r = ok(e, E({ t: "suivant" }));
  assert.equal(r.etat.phase, "competences");
  const att = r.effets.find((x) => x.type === "attribuer");
  assert.deepEqual(att.historique, { a: { reponses: ["J'appelle un réparateur"], choix: null }, b: { reponses: [], choix: null } });
  assert.equal(r.etat.joueurs.b.reponses[0].tour1, "");
});

test("lecture : chacun valide « J'ai lu » ; la discussion démarre quand tout le monde a lu", () => {
  let e = partieEnPresentation();
  ko(e, E({ t: "lu" })); // réservé aux joueurs
  let r = ok(e, J("a", { t: "lu" }), T0);
  assert.equal(r.etat.phase, "presentation");
  assert.deepEqual(r.etat.joueurs.a.reponses[0].lu, true);
  assert.deepEqual(vue(r.etat, "ecran").compte, { repondu: 1, total: 2 });
  assert.deepEqual(vue(r.etat, "ecran").joueurs.map((j) => j.aFini), [true, false]);
  assert.equal(vue(r.etat, "joueur", "a").moi.aLu, true);
  assert.equal(vue(r.etat, "joueur", "b").moi.aLu, false);
  assert.deepEqual(ok(r.etat, J("a", { t: "lu" })).effets, []); // deux fois : sans effet
  r = ok(r.etat, J("b", { t: "lu" }), T0);
  assert.equal(r.etat.phase, "echange");
  assert.ok(r.effets.some((x) => x.type === "minuteur"));
  ko(r.etat, J("a", { t: "lu" })); // plus rien à lire
});

test("fin_minuteur de l'écran : coupe le temps et annule l'alarme", () => {
  let e = partieEnPresentation();
  e = ok(e, E({ t: "suivant" })).etat;
  ko(e, J("a", { t: "fin_minuteur" }));
  let r = ok(e, E({ t: "fin_minuteur" }), T0 + 5000);
  assert.equal(r.etat.phase, "reponse");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 5000 + 90000 }]);
  r = ok(r.etat, E({ t: "fin_minuteur" }));
  assert.equal(r.etat.phase, "competences");
  assert.ok(r.effets.some((x) => x.type === "annuler_minuteur"));
  assert.ok(r.effets.some((x) => x.type === "attribuer"));
  ko(r.etat, E({ t: "fin_minuteur" })); // plus de minuteur
  ko(r.etat, { t: "minuteur_fini" });
});

test("anciens messages du choix parmi 4 et de l'évaluation : refusés", () => {
  let e = jusquaReponse(partieEnPresentation());
  ko(e, J("a", { t: "choix", index: 1 }));
  ko(e, { t: "evaluation_faite", tourId: e.tourId, resultat: { resolu: true } });
});

// ───────────────────────── Compétences et fin ─────────────────────────

// Joue un problème complet et renvoie l'état après attribution.
function jouerProbleme(e, t = T0) {
  e = jusquaReponse(e, t);
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" }), t).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je demande de l'aide" }), t).etat;
  assert.equal(e.phase, "competences");
  const c = { code: "6D102", libelle: "Avoir l'esprit d'équipe", mots: "Tu as cherché de l'aide.", preuve: "Je demande", typePreuve: "jeu", riasec: [] };
  return ok(e, { t: "attribution_faite", problemeIndex: e.problemeIndex, competences: { a: c, b: c } }, t).etat;
}

test("une seule compétence par joueur et par problème ; fin → nettoyer", () => {
  let e = partieEnPresentation();
  e = jouerProbleme(e);
  // L'écran passe sans attendre les joueurs : leur compétence reste gardee:null.
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.problemeIndex, 1);
  e = jouerProbleme(e);
  e = ok(e, J("a", { t: "garder_competence", garder: true })).etat;
  e = ok(e, J("a", { t: "garder_competence", garder: false })).etat; // change d'avis
  const tFin = T0 + 999;
  const r = ok(e, J("b", { t: "garder_competence", garder: true }), tFin);
  assert.equal(r.etat.phase, "fin");
  assert.deepEqual(r.effets, [{ type: "nettoyer", fin: tFin + 60 * 60 * 1000 }]);
  e = r.etat;

  for (const id of ["a", "b"]) {
    const jeu = e.joueurs[id].competences.filter((c) => c.problemeIndex !== null);
    assert.equal(jeu.length, 2, "2 problèmes → 2 compétences de jeu");
    assert.deepEqual(jeu.map((c) => c.problemeIndex), [0, 1]);
  }
  assert.equal(e.joueurs.a.competences[1].gardee, false);
  assert.equal(e.joueurs.a.competences[0].gardee, null);

  const ve = vue(e, "ecran");
  assert.equal(ve.phase, "fin");
  assert.equal(ve.fin.nbCompetencesTotal, 3); // tout sauf la compétence retirée par a
  assert.equal(ve.probleme, null);
  const vj = vue(e, "joueur", "a");
  assert.equal(vj.fin.lienFiche, "/fiche.html?code=BCDF&joueur=a");

  // Plus rien n'est accepté après la fin.
  ko(e, E({ t: "suivant" }));
  ko(e, J("a", { t: "reponse", texte: "x" }));
  ko(e, J("a", { t: "garder_competence", garder: true }));
});

test("erreur_ia pendant l'attribution : l'écran peut passer", () => {
  let e = partieEnPresentation();
  e = jusquaReponse(e);
  e = ok(e, E({ t: "fin_minuteur" })).etat;
  assert.equal(e.phase, "competences");
  e = ok(e, { t: "erreur_ia" }).etat;
  // IA et mock en échec : chacun reçoit quand même la compétence de participation.
  assert.deepEqual(Object.keys(e.attribution).sort(), ["a", "b"]);
  for (const id of ["a", "b"]) {
    const c = vue(e, "joueur", id).moi.competenceDuProbleme;
    assert.equal(c.code, "6D102");
    assert.equal(c.typePreuve, "participation");
    assert.equal(c.libelle, "Avoir l'esprit d'équipe");
    assert.equal(c.gardee, null);
  }
  const r = ok(e, E({ t: "suivant" }));
  assert.equal(r.etat.phase, "presentation");
});

// ───────────────────────── Messages invalides ─────────────────────────

test("messages invalides ou hors phase → erreur, état inchangé", () => {
  const e = partieEnPresentation();
  ko(e, null);
  ko(e, {});
  ko(e, E({ t: "inconnu" }));
  ko(e, E({ t: "toString" }));
  ko(e, E({ t: "__proto__" }));
  ko(e, J("a", { t: "reponse", texte: "x" }));
  ko(e, J("a", { t: "choix", index: 0 }));
  ko(e, J("a", { t: "garder_competence", garder: true }));
  ko(e, J("a", { t: "recit", texte: "Je répare les vélos." }));
  ko(e, J("inconnu", { t: "reponse", texte: "x" }));
  ko(e, J("a", { t: "suivant" })); // réservé à l'écran
  ko(e, E({ t: "reponse", texte: "x" })); // réservé aux joueurs
  ko(e, { t: "minuteur_fini" }); // pas de minuteur en présentation
  ko(e, { t: "evaluation_faite", tourId: e.tourId, resultat: { resolu: true } });
  ko(e, { t: "attribution_faite", problemeIndex: 0, competences: {} });
  // Événements internes forgés par un client.
  ko(e, J("a", { t: "minuteur_fini" }));
  ko(e, E({ t: "minuteur_fini" }));
  ko(e, E({ t: "evaluation_faite", tourId: e.tourId, resultat: { resolu: true } }));
});

// ───────────────────────── Confidentialité ─────────────────────────

const INTERDITS = /faux|fausse|mauvaise|tromp|"correct"/i;

test("confidentialité : l'écran ne voit jamais les réponses (seulement qui a fini)", () => {
  const SECRET_A = "Réponse secrète de Lina zorglub";
  const SECRET_B = "Proposition cachée de Sam blurp";
  const vues = [];
  const capter = (e) => {
    vues.push({ role: "ecran", v: vue(e, "ecran") });
    vues.push({ role: "a", v: vue(e, "joueur", "a") });
    vues.push({ role: "b", v: vue(e, "joueur", "b") });
    vues.push({ role: "inconnu", v: vue(e, "joueur", "zz") });
    return e;
  };

  let e = capter(nouvellePartie());
  e = capter(ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat);
  e = capter(ok(e, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🐼" })).etat);
  e = capter(ok(e, E({ t: "demarrer" })).etat);
  e = capter(ok(e, J("a", { t: "recit", texte: "Récit privé de Lina qwerty" })).etat);
  e = capter(ok(e, { t: "analyse_faite", joueurId: "a", competences: [{ code: "6D101", libelle: "Écoute", mots: "m", preuve: "privé de Lina qwerty", riasec: ["S"] }] }).etat);
  e = capter(ok(e, J("a", { t: "valider_depart", garder: [true] })).etat);
  e = capter(ok(e, E({ t: "suivant" })).etat);
  e = capter(ok(e, E({ t: "suivant" })).etat);
  e = capter(ok(e, E({ t: "fin_minuteur" })).etat);
  e = capter(ok(e, J("a", { t: "reponse", texte: SECRET_A })).etat);

  // Pendant la réponse : l'écran sait QUI a répondu (pour l'animateur), jamais quoi.
  const ve = vue(e, "ecran");
  assert.deepEqual(ve.compte, { repondu: 1, total: 2 });
  for (const j of ve.joueurs) assert.deepEqual(Object.keys(j).sort(), ["aFini", "avatar", "connecte", "pseudo"]);
  assert.deepEqual(ve.joueurs.map((j) => j.aFini), [true, false]);

  e = capter(ok(e, J("b", { t: "reponse", texte: SECRET_B })).etat);
  assert.equal(e.phase, "competences");
  const compA = { code: "6D111", libelle: "Réactivité", mots: "Tu agis vite.", preuve: "secrète de Lina zorglub", typePreuve: "jeu", riasec: ["E"] };
  const compB = { code: "6D102", libelle: "Esprit d'équipe", mots: "Tu proposes.", preuve: "cachée de Sam blurp", typePreuve: "jeu", riasec: [] };
  e = capter(ok(e, { t: "attribution_faite", problemeIndex: 0, competences: { a: compA, b: compB } }).etat);
  e = capter(ok(e, J("a", { t: "garder_competence", garder: true })).etat);
  e = capter(ok(e, J("b", { t: "garder_competence", garder: true })).etat);
  e = jouerProbleme(e);
  e = capter(ok(e, E({ t: "suivant" })).etat);
  assert.equal(e.phase, "fin");

  for (const { role, v } of vues) {
    const s = JSON.stringify(v);
    assert.doesNotMatch(s, INTERDITS, `mot interdit dans la vue ${role} (${v.phase})`);
    if (role !== "a") {
      assert.ok(!s.includes("zorglub"), `réponse de a visible par ${role} (${v.phase})`);
      assert.ok(!s.includes("qwerty"), `récit de a visible par ${role} (${v.phase})`);
      assert.ok(!s.includes("6D111") && !s.includes("Réactivité"), `compétence de a visible par ${role} (${v.phase})`);
    }
    if (role !== "b") {
      assert.ok(!s.includes("blurp"), `réponse de b visible par ${role} (${v.phase})`);
    }
    if (role === "ecran") {
      assert.ok(!("moi" in v));
      assert.ok(!s.includes("monChoix") && !s.includes("maReponse"));
      assert.ok(!s.includes('"preuve"') && !s.includes('"mots"'), `l'écran ne voit aucune compétence (${v.phase})`);
    }
    if (role === "b" || role === "inconnu") {
      assert.ok(!s.includes("Lina"), `pseudo de a visible par ${role}`);
    }
  }

  // Le joueur voit bien SES données.
  const va = vue(e, "joueur", "a");
  assert.equal(va.moi.pseudo, "Lina");
  assert.ok(va.moi.competences.some((c) => c.code === "6D111"));
  assert.ok(!JSON.stringify(vue(e, "joueur", "b")).includes("6D111"));
});

test("vue joueur : sa réponse seulement", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "ma réponse à moi" })).etat;
  const va = vue(e, "joueur", "a");
  const vb = vue(e, "joueur", "b");
  assert.equal(va.moi.maReponse, "ma réponse à moi");
  assert.equal(vb.moi.maReponse, null);
  assert.deepEqual(va.compte, { repondu: 1, total: 2 });
  assert.equal(typeof va.minuteurFin, "number");
  assert.equal(va.probleme.id, e.problemes[0]);
  assert.deepEqual(Object.keys(va.probleme).sort(), ["id", "illustration", "question", "situation", "titre"]);
  // Vue d'un joueur inconnu à l'accueil : avatars déjà pris (pour griser).
  const v0 = vue(ok(nouvellePartie(), J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat, "joueur", "x");
  assert.equal(v0.moi, null);
  assert.deepEqual(v0.avatarsPris, ["🦊"]);
});

// ───────────────────────── Non-régression (correctifs) ─────────────────────────

test("rejoindre : pseudo sans caractères invisibles ni de contrôle, unicité sans accents", () => {
  const e = nouvellePartie();
  ko(e, J("a", { t: "rejoindre", pseudo: "\u200b", avatar: "🦊" })); // espace sans chasse seul
  ko(e, J("a", { t: "rejoindre", pseudo: "\u2060\u0000", avatar: "🦊" }));
  ko(e, J("a", { t: "rejoindre", pseudo: "...", avatar: "🦊" })); // ni lettre ni chiffre
  let r = ok(e, J("a", { t: "rejoindre", pseudo: "\u202eanil", avatar: "🦊" }));
  assert.equal(r.etat.joueurs.a.pseudo, "anil", "inversion bidi retirée");
  r = ok(e, J("a", { t: "rejoindre", pseudo: "  Li\u200bna \u0007 ", avatar: "🦊" }));
  assert.equal(r.etat.joueurs.a.pseudo, "Lina");
  ko(r.etat, J("b", { t: "rejoindre", pseudo: "Lina\u200b", avatar: "🐼" })); // usurpation par caractère invisible
  ko(r.etat, J("b", { t: "rejoindre", pseudo: "LÏNA", avatar: "🐼" })); // même pseudo sans accents
  ok(r.etat, J("b", { t: "rejoindre", pseudo: "Lina2", avatar: "🐼" }));
});

test("minuteur : la vue expose son début et sa durée totale (cercle juste après reconnexion)", () => {
  let e = partieEnPresentation();
  assert.equal(vue(e, "joueur", "a").minuteurDuree, null);
  e = ok(e, E({ t: "suivant" }), T0).etat; // echange 120 s
  for (const v of [vue(e, "joueur", "a"), vue(e, "ecran")]) {
    assert.equal(v.minuteurFin, T0 + 120000);
    assert.equal(v.minuteurDebut, T0);
    assert.equal(v.minuteurDuree, 120000);
  }
  e = ok(e, E({ t: "fin_minuteur" }), T0 + 120000).etat; // reponse 90 s
  assert.equal(vue(e, "joueur", "b").minuteurDuree, 90000);
  assert.equal(vue(e, "joueur", "b").minuteurDebut, T0 + 120000);
  e = ok(e, E({ t: "fin_minuteur" }), T0 + 130000).etat; // compétences : plus de minuteur
  assert.equal(e.minuteurDebut, null);
  const v = vue(e, "ecran");
  assert.equal(v.minuteurFin, null);
  assert.equal(v.minuteurDebut, null);
  assert.equal(v.minuteurDuree, null);
});

test("phase bloquée : effetsIAEnAttente reconstruit l'effet perdu et « Suivant » relance avec le MJ de secours", () => {
  let e = partieEnPresentation();
  assert.deepEqual(effetsIAEnAttente(e), []);
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" })).etat;
  const att = ok(e, E({ t: "fin_minuteur" }));
  e = att.etat;
  assert.equal(e.phase, "competences");
  assert.deepEqual(effetsIAEnAttente(e), att.effets.filter((x) => x.type === "attribuer"), "même effet que celui perdu");
  const rel = ok(e, E({ t: "suivant" }));
  assert.equal(rel.effets[0].secours, true);
  assert.equal(rel.effets[0].problemeIndex, 0);
  // Le premier résultat gagne, le second (doublon) est refusé.
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, competences: { a: { code: "6D111", preuve: "Je l'éteins" } } }).etat;
  ko(e, { t: "attribution_faite", problemeIndex: 0, competences: {} }); // doublon refusé
  assert.deepEqual(effetsIAEnAttente(e), []);

  // Création : un joueur resté en « analyse ».
  let c = nouvellePartie();
  c = ok(c, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
  c = ok(c, E({ t: "demarrer" })).etat;
  c = ok(c, J("a", { t: "recit", texte: "Je garde mon petit frère le mercredi." })).etat;
  assert.deepEqual(effetsIAEnAttente(c), [{ type: "analyser_recit", joueurId: "a", texte: "Je garde mon petit frère le mercredi." }]);
  c = ok(c, { t: "erreur_ia", joueurId: "a" }).etat;
  assert.deepEqual(effetsIAEnAttente(c), []);
  assert.equal(c.joueurs.a.depart.etat, "a_valider", "le joueur peut à nouveau valider");
});

test("garder_competence : une compétence restée sans réponse reste modifiable jusqu'à la fin", () => {
  let e = partieEnPresentation(); // 2 problèmes
  const comp = (code) => ({ code, libelle: code, mots: "Tu as agi.", preuve: "x y z", typePreuve: "jeu", riasec: ["E"] });
  const jouerProbleme = (etat, index) => {
    let s = jusquaReponse(etat);
    s = ok(s, E({ t: "fin_minuteur" })).etat;
    return ok(s, { t: "attribution_faite", problemeIndex: index, competences: { a: comp("6D111"), b: comp("6D101") } }).etat;
  };
  e = jouerProbleme(e, 0);
  ko(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 5 }));
  ko(e, J("a", { t: "garder_competence", garder: true, problemeIndex: "0" }));
  e = ok(e, E({ t: "suivant" })).etat; // personne n'a répondu : problème suivant
  assert.equal(e.phase, "presentation");
  assert.equal(e.problemeIndex, 1);
  ko(e, J("a", { t: "garder_competence", garder: true })); // sans problemeIndex : seulement en phase competences
  let va = vue(e, "joueur", "a");
  assert.equal(va.moi.competencesEnAttente.length, 1);
  assert.equal(va.moi.competencesEnAttente[0].problemeIndex, 0);
  assert.equal(va.moi.competencesEnAttente[0].code, "6D111");
  e = ok(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 0 })).etat;
  assert.equal(e.phase, "presentation", "aucun effet sur la phase");
  assert.equal(e.joueurs.a.competences.find((c) => c.problemeIndex === 0).gardee, true);
  assert.deepEqual(vue(e, "joueur", "a").moi.competencesEnAttente, []);
  assert.equal(vue(e, "joueur", "b").moi.competencesEnAttente.length, 1, "b n'a pas encore répondu");
  ko(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 1 })); // pas encore de compétence pour ce problème

  // Problème 1 en phase competences : celle du problème en cours n'est pas en double dans la liste.
  e = jouerProbleme(e, 1);
  va = vue(e, "joueur", "b");
  assert.equal(va.moi.competenceDuProbleme.problemeIndex, 1);
  assert.deepEqual(va.moi.competencesEnAttente.map((c) => c.problemeIndex), [0]);
  // Répondre pour un ancien problème ne fait pas passer au suivant.
  e = ok(e, J("b", { t: "garder_competence", garder: false, problemeIndex: 0 })).etat;
  assert.equal(e.phase, "competences");
  e = ok(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 1 })).etat;
  e = ok(e, J("b", { t: "garder_competence", garder: true })).etat;
  assert.equal(e.phase, "fin", "tous ont répondu pour le problème en cours");

  // En phase fin : encore modifiable.
  e = ok(e, J("b", { t: "garder_competence", garder: true, problemeIndex: 0 })).etat;
  assert.equal(e.joueurs.b.competences.find((c) => c.problemeIndex === 0).gardee, true);
  ko(e, J("b", { t: "garder_competence", garder: true })); // en fin, problemeIndex obligatoire
});
