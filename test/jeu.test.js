// Tests de la machine à états PURE (src/jeu.js) — SPEC §3.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creerEtat, appliquer, vue, AVATARS, tirerProblemes, effetsIAEnAttente,
  TYPES_PAR_NB, dureeEchangeParDefaut, nbEpisodesParDefaut, melangerFisherYates, aleaDepuis, graineDe,
} from "../src/jeu.js";
import { readFileSync } from "node:fs";

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
  // Réglages fixés pour les tests du déroulé classique ; les valeurs par défaut
  // (réflexion silencieuse, durée et nombre d'épisodes automatiques) ont leurs propres tests.
  return creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 2, dureeEchange: 120, dureeReflexion: 0, graine: 42, ...opts });
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

test("creerEtat : phase accueil, réglages, les épisodes dans l'ordre", () => {
  const e = nouvellePartie();
  assert.equal(e.phase, "accueil");
  assert.equal(e.code, "BCDF");
  assert.deepEqual(e.reglages, {
    nbProblemes: 2, nbProblemesAuto: false, dureeEchange: 120, dureeEchangeAuto: false,
    dureeReponse: 90, dureeReflexion: 0, debrief: false,
  });
  assert.deepEqual(e.problemes, ["test-telephone", "test-anniversaire"], "les premiers épisodes, dans l'ordre");
  assert.deepEqual(nouvellePartie({ graine: 99 }).problemes, e.problemes, "la graine ne change plus rien");
  // nbProblemes borné par le nombre d'épisodes disponibles.
  assert.equal(creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 6, graine: 1 }).problemes.length, 3);
  // Accepte aussi le format { version, problemes }.
  assert.equal(creerEtat({ code: "BCDF", problemes: { version: 1, problemes: PROBLEMES }, graine: "x" }).problemes.length, 3);
  // Le JSON doit survivre à la sérialisation (stockage DO).
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
});

test("tirage : les épisodes suivent le champ « episode », en partant du début", () => {
  const histoire = PROBLEMES.map((p, i) => ({ ...p, episode: 3 - i }));
  assert.deepEqual(tirerProblemes(histoire, 2, 7).map((p) => p.id), ["test-discord", "test-anniversaire"]);
  assert.deepEqual(tirerProblemes(PROBLEMES, 3, 0).map((p) => p.id), PROBLEMES.map((p) => p.id));
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

const compJeu = (code, preuve) => ({ code, libelle: code, mots: "Tu as eu une bonne idée.", preuve, typePreuve: "jeu", riasec: ["E"] });

test("épisode : presentation → echange → reponse → l'idée du tour (sans pseudo, puis avec accord) → compétences privées → épisode suivant", () => {
  let e = partieEnPresentation();
  const p0 = e.problemes[0];

  let r = ok(e, E({ t: "suivant" }), T0);
  assert.equal(r.etat.phase, "echange");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 120 * 1000 }]);
  e = r.etat;
  ko(e, J("a", { t: "reponse", texte: "trop tôt" }));

  r = ok(e, E({ t: "fin_minuteur" }), T0 + 120000);
  assert.equal(r.etat.phase, "reponse");
  e = r.etat;
  ko(e, J("a", { t: "reponse", texte: "x".repeat(501) }));
  ko(e, J("a", { t: "reponse" }));
  e = ok(e, J("a", { t: "reponse", texte: "première idée" })).etat;
  r = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite et je le fais sécher" }));
  assert.deepEqual(r.effets, [], "renvoyer remplace la réponse");
  e = r.etat;

  r = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote" }));
  assert.equal(r.etat.phase, "competences", "tous ont répondu : le MJ choisit l'idée du tour");
  assert.equal(r.etat.attribution, null);
  const choisir = r.effets.find((x) => x.type === "choisir");
  // Réponses mélangées (Fisher-Yates) avant l'étiquetage J1, J2… ; tirage enregistré.
  assert.deepEqual([...choisir.reponses].sort((x, y) => x.joueurId.localeCompare(y.joueurId)), [
    { joueurId: "a", texte: "Je l'éteins tout de suite et je le fais sécher", dejaRetenu: false },
    { joueurId: "b", texte: "Je rassure mon pote", dejaRetenu: false },
  ]);
  assert.deepEqual(r.etat.tirages[0].ordre, choisir.reponses.map((x) => x.joueurId), "tirage enregistré");
  assert.deepEqual([...choisir.obligatoires].sort(), ["a", "b"], "personne n'a encore été retenu");
  assert.equal(choisir.essai, 0);
  assert.equal(choisir.problemeIndex, 0);
  assert.equal(choisir.probleme.id, p0);
  e = r.etat;
  assert.equal(vue(e, "ecran").attenteIA, true);
  assert.equal(vue(e, "ecran").idee, null);
  // Le MJ réfléchit : « Suivant » relance le choix avec le MJ de secours.
  const relance = ok(e, E({ t: "suivant" }));
  assert.deepEqual(relance.effets, [{ ...choisir, secours: true }]);
  ko(e, J("a", { t: "garder_competence", garder: true }));
  ko(e, { t: "attribution_faite", problemeIndex: 1, joueurId: "a", competence: compJeu("6D111", "tout de suite") }); // périmé

  ko(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins"), essai: 3 }); // autre essai
  r = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite"), essai: 0 });
  e = r.etat;
  assert.deepEqual(Object.keys(e.attribution), ["a"], "une seule idée du tour");
  // Puis une compétence privée possible pour chaque AUTRE réponse (effet attribuer).
  assert.deepEqual(r.effets.filter((x) => x.type === "attribuer"), [{ type: "attribuer", problemeIndex: 0, probleme: e.catalogue[p0], reponses: [{ joueurId: "b", texte: "Je rassure mon pote" }] }]);
  // Et la phrase de liaison vers l'épisode suivant, qui reprend l'idée du tour (src/mj.js, lier).
  const lier = r.effets.find((x) => x.type === "lier");
  assert.deepEqual([lier.problemeIndex, lier.essai, lier.idee], [1, 0, "Je l'éteins tout de suite"], "effet lier");
  assert.equal(e.privees[0], "attente");
  assert.equal(e.joueurs.b.competences.filter((c) => c.problemeIndex === 0).length, 0);
  // L'idée du tour est montrée à tout le monde, d'abord SANS pseudo (décision §2).
  const ideeSansNom = {
    pseudo: null, avatar: null, accordPseudo: null, texte: "Je l'éteins tout de suite",
    competence: { code: "6D111", libelle: "6D111", riasec: ["E"], mots: "Tu as eu une bonne idée." }, notee: false,
  };
  for (const v of [vue(e, "ecran"), vue(e, "joueur", "b"), vue(e, "joueur", "a")]) assert.deepEqual(v.idee, ideeSansNom);
  assert.equal(vue(e, "ecran").autreIdeePossible, true);
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme.code, "6D111");
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme.idee, true);
  assert.deepEqual(vue(e, "joueur", "a").moi.monIdee, { accordPseudo: null }, "« C'est ton idée ! On affiche ton pseudo ? »");
  assert.equal(vue(e, "joueur", "b").moi.monIdee, null);
  assert.equal(vue(e, "joueur", "b").moi.competenceDuProbleme, null);
  assert.equal(vue(e, "joueur", "b").moi.retourPrive, null, "en attente du MJ");
  ko(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "b", competence: compJeu("6D101", "x") }); // déjà choisie
  ko(e, J("b", { t: "garder_competence", garder: true })); // b n'a pas encore de compétence
  ko(e, J("b", { t: "afficher_pseudo", accord: true })); // ce n'est pas son idée
  ko(e, J("a", { t: "afficher_pseudo", accord: "oui" }));

  // L'auteur accepte d'afficher son pseudo, et garde sa compétence.
  e = ok(e, J("a", { t: "afficher_pseudo", accord: true })).etat;
  assert.equal(vue(e, "ecran").idee.pseudo, "Lina");
  assert.equal(vue(e, "ecran").idee.avatar, "🦊");
  e = ok(e, J("a", { t: "garder_competence", garder: true }), T0 + 1).etat;
  assert.equal(e.phase, "competences", "on attend encore la compétence privée de b");

  // Compétence privée de b : seulement sur SON téléphone, jamais à l'écran.
  r = ok(e, { t: "competences_privees", problemeIndex: 0, competences: { b: compJeu("6D101", "Je rassure mon pote") } }, T0 + 2);
  e = r.etat;
  ko(e, { t: "competences_privees", problemeIndex: 0, competences: {} }); // une seule fois
  const cb = vue(e, "joueur", "b").moi.competenceDuProbleme;
  assert.equal(cb.code, "6D101");
  assert.equal(cb.idee, false);
  assert.equal(vue(e, "joueur", "b").moi.retourPrive, "competence");
  assert.ok(!JSON.stringify(vue(e, "ecran")).includes("6D101"), "l'écran ne voit pas la compétence privée");
  assert.ok(!JSON.stringify(vue(e, "joueur", "a")).includes("6D101"), "les autres non plus");
  assert.deepEqual(vue(e, "ecran").compte, { repondu: 1, total: 2 }, "a a fini ; b doit encore dire s'il garde la sienne");

  // b dit s'il la garde : l'épisode est bouclé, l'histoire continue.
  r = ok(e, J("b", { t: "garder_competence", garder: true }), T0 + 3);
  assert.equal(r.etat.phase, "presentation", "épisode suivant");
  assert.equal(r.etat.problemeIndex, 1);
  assert.equal(r.etat.idee, null);
  assert.equal(r.etat.joueurs.a.competences.find((c) => c.problemeIndex === 0).gardee, true);
});

test("idée du tour : un joueur déjà retenu est signalé au MJ ; une idée inconnue ou vide n'est pas retenue", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je demande de l'aide" })).etat;
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins") }).etat;
  e = ok(e, E({ t: "suivant" })).etat; // épisode 2
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "reponse", texte: "On fait une liste" })).etat;
  const r = ok(e, J("b", { t: "reponse", texte: "On cuisine ensemble" }));
  const choisir = r.effets.find((x) => x.type === "choisir");
  assert.deepEqual(choisir.reponses.map((x) => [x.joueurId, x.dejaRetenu]).sort(), [["a", true], ["b", false]]);
  assert.deepEqual(choisir.obligatoires, ["b"], "rotation stricte : b n'a pas encore été retenu");
  // Joueur inconnu : pas d'idée retenue, l'histoire continue.
  const inconnu = ok(r.etat, { t: "attribution_faite", problemeIndex: 1, joueurId: "zz", competence: compJeu("6D102", "x") }).etat;
  assert.deepEqual(vue(inconnu, "ecran").idee, { aucune: true });
  assert.equal(ok(inconnu, E({ t: "suivant" })).etat.phase, "fin");
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

test("reponse : l'animateur passe sans attendre → seules les réponses écrites vont au MJ", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "J'appelle un réparateur" })).etat;
  e = ok(e, { t: "minuteur_fini" }).etat;
  const r = ok(e, E({ t: "suivant" }));
  assert.equal(r.etat.phase, "competences");
  const choisir = r.effets.find((x) => x.type === "choisir");
  assert.deepEqual(choisir.reponses, [{ joueurId: "a", texte: "J'appelle un réparateur", dejaRetenu: false }]);
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

test("fin_minuteur de l'écran : coupe le temps et annule l'alarme ; personne n'a écrit → pas d'idée retenue", () => {
  let e = partieEnPresentation();
  e = ok(e, E({ t: "suivant" })).etat;
  ko(e, J("a", { t: "fin_minuteur" }));
  let r = ok(e, E({ t: "fin_minuteur" }), T0 + 5000);
  assert.equal(r.etat.phase, "reponse");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 5000 + 90000 }]);
  r = ok(r.etat, E({ t: "fin_minuteur" }));
  assert.equal(r.etat.phase, "competences");
  assert.ok(r.effets.some((x) => x.type === "annuler_minuteur"));
  assert.ok(!r.effets.some((x) => x.type === "choisir"), "aucune réponse : pas d'appel au MJ");
  assert.deepEqual(vue(r.etat, "ecran").idee, { aucune: true });
  ko(r.etat, E({ t: "fin_minuteur" })); // plus de minuteur
  ko(r.etat, { t: "minuteur_fini" });
  assert.equal(ok(r.etat, E({ t: "suivant" })).etat.phase, "presentation", "l'histoire continue");
});

test("anciens messages du choix parmi 4 et de l'évaluation : refusés", () => {
  let e = jusquaReponse(partieEnPresentation());
  ko(e, J("a", { t: "choix", index: 1 }));
  ko(e, { t: "evaluation_faite", tourId: e.tourId, resultat: { resolu: true } });
});

// ───────────────────────── Compétences et fin ─────────────────────────

// Joue un épisode complet : a et b répondent, l'idée de `retenu` est choisie ;
// l'autre réponse ne contient pas d'action citable (pas de compétence privée).
function jouerProbleme(e, t = T0, retenu = "a") {
  e = jusquaReponse(e, t);
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" }), t).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je demande de l'aide" }), t).etat;
  assert.equal(e.phase, "competences");
  const c = { code: "6D102", libelle: "Avoir l'esprit d'équipe", mots: "Tu as cherché de l'aide.", preuve: retenu === "a" ? "Je l'éteins" : "Je demande", typePreuve: "jeu", riasec: [] };
  e = ok(e, { t: "attribution_faite", problemeIndex: e.problemeIndex, joueurId: retenu, competence: c }, t).etat;
  return ok(e, { t: "competences_privees", problemeIndex: e.problemeIndex, competences: {} }, t).etat;
}

test("une compétence par épisode, pour l'auteur de l'idée retenue ; fin → nettoyer", () => {
  let e = partieEnPresentation();
  e = jouerProbleme(e, T0, "a");
  // L'écran passe sans attendre : la compétence de a reste gardee:null.
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.problemeIndex, 1);
  e = jouerProbleme(e, T0, "b");
  const tFin = T0 + 999;
  e = ok(e, J("b", { t: "afficher_pseudo", accord: false }), tFin).etat; // « Non, reste discret »
  assert.equal(vue(e, "ecran").idee.pseudo, null);
  assert.equal(e.phase, "competences", "il doit encore dire s'il garde sa compétence");
  const r = ok(e, J("b", { t: "garder_competence", garder: true }), tFin);
  assert.equal(r.etat.phase, "fin");
  assert.deepEqual(r.effets, [{ type: "nettoyer", fin: tFin + 60 * 60 * 1000 }]);
  e = r.etat;
  assert.deepEqual(e.joueurs.a.competences.map((c) => c.problemeIndex), [0]);
  assert.deepEqual(e.joueurs.b.competences.map((c) => c.problemeIndex), [1]);
  assert.equal(e.joueurs.a.competences[0].gardee, null);
  const ve = vue(e, "ecran");
  assert.equal(ve.phase, "fin");
  assert.equal(ve.fin.nbCompetencesTotal, 2);
  assert.equal(ve.probleme, null);
  assert.equal(vue(e, "joueur", "a").fin.lienFiche, "/fiche.html?code=BCDF&joueur=a");
  // Plus rien n'est accepté après la fin.
  ko(e, E({ t: "suivant" }));
  ko(e, J("a", { t: "reponse", texte: "x" }));
  ko(e, J("a", { t: "garder_competence", garder: true }));
});

test("erreur_ia pendant le choix : pas d'idée retenue, l'écran peut passer", () => {
  let e = partieEnPresentation();
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" })).etat;
  e = ok(e, E({ t: "fin_minuteur" })).etat;
  assert.equal(e.phase, "competences");
  e = ok(e, { t: "erreur_ia" }).etat;
  assert.deepEqual(e.attribution, {});
  assert.deepEqual(vue(e, "ecran").idee, { aucune: true });
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme, null);
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
  ko(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: { code: "6D111" } });
  // Événements internes forgés par un client.
  ko(e, J("a", { t: "minuteur_fini" }));
  ko(e, E({ t: "minuteur_fini" }));
  ko(e, E({ t: "evaluation_faite", tourId: e.tourId, resultat: { resolu: true } }));
});

// ───────────────────────── Confidentialité ─────────────────────────

const INTERDITS = /faux|fausse|mauvaise|tromp|"correct"/i;

test("confidentialité : seule l'idée retenue est montrée ; les autres réponses et les récits restent privés", () => {
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

  e = capter(ok(e, J("b", { t: "reponse", texte: SECRET_B })).etat);
  // L'idée de a est retenue : son extrait (la preuve) est montré à tous, avec son pseudo.
  const compA = { code: "6D111", libelle: "Réactivité", mots: "Tu agis vite.", preuve: "secrète de Lina zorglub", typePreuve: "jeu", riasec: ["E"] };
  e = capter(ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compA }).etat);
  assert.equal(vue(e, "ecran").idee.texte, "secrète de Lina zorglub");
  e = capter(ok(e, J("a", { t: "afficher_pseudo", accord: true })).etat);
  e = capter(ok(e, J("a", { t: "garder_competence", garder: true })).etat);
  // Compétence privée de b (sa réponse contient une action citable) : sur SON téléphone seulement.
  const compB = { code: "6D101", libelle: "Écoute", mots: "Tu as proposé.", preuve: "cachée de Sam blurp", typePreuve: "jeu", riasec: ["S"] };
  e = capter(ok(e, { t: "competences_privees", problemeIndex: 0, competences: { b: compB, a: compB } }).etat);
  assert.equal(e.joueurs.a.competences.filter((c) => c.problemeIndex === 0).length, 1, "l'auteur de l'idée garde la sienne");
  e = capter(ok(e, J("b", { t: "garder_competence", garder: true })).etat);
  assert.equal(e.phase, "presentation");
  e = jouerProbleme(e, T0, "b");
  e = capter(ok(e, E({ t: "suivant" })).etat);
  assert.equal(e.phase, "fin");

  for (const { role, v } of vues) {
    const s = JSON.stringify(v);
    assert.doesNotMatch(s, INTERDITS, `mot interdit dans la vue ${role} (${v.phase})`);
    if (role !== "a") {
      assert.ok(!s.includes("qwerty"), `récit de a visible par ${role} (${v.phase})`);
      // La réponse ENTIÈRE de a n'est jamais montrée : seulement l'extrait retenu.
      assert.ok(!s.includes(SECRET_A), `réponse entière de a visible par ${role} (${v.phase})`);
      if (v.phase !== "competences") assert.ok(!s.includes("zorglub"), `réponse de a visible par ${role} hors idée du tour (${v.phase})`);
    }
    if (role !== "b") assert.ok(!s.includes("blurp"), `réponse non retenue de b visible par ${role} (${v.phase})`);
    if (role === "ecran") {
      assert.ok(!("moi" in v));
      assert.ok(!s.includes("maReponse"));
      assert.ok(!s.includes('"preuve"'), `l'écran ne voit aucune fiche (${v.phase})`);
    }
  }
  // Le joueur voit bien SES données ; b n'a pas de compétence de a.
  assert.ok(vue(e, "joueur", "a").moi.competences.some((c) => c.code === "6D111"));
  assert.ok(!JSON.stringify(vue(e, "joueur", "b").moi.competences).includes("6D111"));
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
  const r = ok(e, E({ t: "fin_minuteur" }));
  e = r.etat;
  assert.equal(e.phase, "competences");
  assert.deepEqual(effetsIAEnAttente(e), r.effets.filter((x) => x.type === "choisir"), "même effet que celui perdu");
  const rel = ok(e, E({ t: "suivant" }));
  assert.equal(rel.effets[0].secours, true);
  assert.equal(rel.effets[0].problemeIndex, 0);
  // Le premier résultat gagne, le second (doublon) est refusé.
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: { code: "6D111", preuve: "Je l'éteins" } }).etat;
  ko(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: { code: "6D111", preuve: "x" } });
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
  let e = partieEnPresentation(); // 2 épisodes
  e = jouerProbleme(e, T0, "a");
  ko(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 5 }));
  ko(e, J("a", { t: "garder_competence", garder: true, problemeIndex: "0" }));
  e = ok(e, E({ t: "suivant" })).etat; // a n'a pas répondu : épisode suivant
  assert.equal(e.phase, "presentation");
  assert.equal(e.problemeIndex, 1);
  ko(e, J("a", { t: "garder_competence", garder: true })); // sans problemeIndex : seulement en phase competences
  const va = vue(e, "joueur", "a");
  assert.equal(va.moi.competencesEnAttente.length, 1);
  assert.equal(va.moi.competencesEnAttente[0].problemeIndex, 0);
  e = ok(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 0 })).etat;
  assert.equal(e.phase, "presentation", "aucun effet sur la phase");
  assert.equal(e.joueurs.a.competences.find((c) => c.problemeIndex === 0).gardee, true);
  assert.deepEqual(vue(e, "joueur", "a").moi.competencesEnAttente, []);
  ko(e, J("b", { t: "garder_competence", garder: true, problemeIndex: 0 })); // b n'a pas été retenu

  // Épisode 2 : l'idée de b est retenue ; répondre pour un ancien épisode ne fait pas avancer.
  e = jouerProbleme(e, T0, "b");
  e = ok(e, J("a", { t: "garder_competence", garder: false, problemeIndex: 0 })).etat;
  assert.equal(e.phase, "competences");
  e = ok(e, J("b", { t: "afficher_pseudo", accord: true })).etat;
  e = ok(e, J("b", { t: "garder_competence", garder: true })).etat;
  assert.equal(e.phase, "fin", "l'auteur de l'idée a répondu");
  // En phase fin : encore modifiable.
  e = ok(e, J("a", { t: "garder_competence", garder: true, problemeIndex: 0 })).etat;
  assert.equal(e.joueurs.a.competences.find((c) => c.problemeIndex === 0).gardee, true);
  ko(e, J("a", { t: "garder_competence", garder: true })); // en fin, problemeIndex obligatoire
});

// ───────────────────────── Adaptations aux sources (21/11/2026) ─────────────────────────

const HISTOIRE = JSON.parse(readFileSync(new URL("../public/data/problemes.json", import.meta.url), "utf8")).problemes;
const typeDe = (id) => HISTOIRE.find((p) => p.id === id).riasec.charAt(0);

/** Partie aux réglages PAR DÉFAUT avec `n` joueurs (j0, j1…). */
function partieParDefaut(n, opts = {}) {
  let e = creerEtat({ code: "BCDF", problemes: HISTOIRE, graine: 42, ...opts });
  for (let i = 0; i < n; i++) e = ok(e, J(`j${i}`, { t: "rejoindre", pseudo: `P${i}`, avatar: AVATARS[i] })).etat;
  return e;
}

test("défauts : épisodes = nombre de joueurs (3 à 6), types RIASEC éloignés, dans l'ordre de l'histoire", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(nbEpisodesParDefaut), [3, 3, 3, 3, 4, 5, 6, 6]);
  for (const n of [3, 4, 5, 6]) {
    const ids = tirerProblemes(HISTOIRE, n).map((p) => p.id);
    assert.deepEqual(new Set(ids.map(typeDe)), new Set(TYPES_PAR_NB[n]), `${n} épisodes : types ${TYPES_PAR_NB[n]}`);
    const ordres = ids.map((id) => HISTOIRE.find((p) => p.id === id).episode);
    assert.deepEqual(ordres, [...ordres].sort((a, b) => a - b), "joués dans l'ordre de l'histoire");
  }
  assert.deepEqual(tirerProblemes(HISTOIRE, 3).map((p) => typeDe(p.id)), ["E", "A", "R"]);
  // Automatique : recalculé à chaque arrivée, figé au démarrage.
  let e = partieParDefaut(0);
  assert.equal(e.reglages.nbProblemesAuto, true);
  assert.equal(e.problemes.length, 3);
  e = partieParDefaut(5);
  assert.equal(e.problemes.length, 5);
  assert.deepEqual(new Set(e.problemes.map(typeDe)), new Set(["E", "A", "I", "R", "C"]));
  assert.equal(vue(e, "ecran").nbProblemes, 5);
  e = ok(e, E({ t: "demarrer" })).etat;
  assert.equal(e.reglages.nbProblemes, 5);
  // L'animateur peut toujours choisir un autre nombre (avant le début).
  let f = ok(partieParDefaut(2), E({ t: "reglages", nbProblemes: 6 })).etat;
  assert.equal(f.problemes.length, 6);
  assert.equal(f.reglages.nbProblemesAuto, false);
  f = ok(f, J("j5", { t: "rejoindre", pseudo: "P5", avatar: AVATARS[5] })).etat;
  assert.equal(f.problemes.length, 6, "un choix de l'animateur n'est plus recalculé");
  f = ok(f, E({ t: "reglages", nbProblemes: null })).etat;
  assert.equal(f.problemes.length, 3, "retour à l'automatique : 3 joueurs → 3 épisodes");
  ko(f, E({ t: "reglages", nbProblemes: 7 }));
  ko(f, E({ t: "reglages", nbProblemes: 0 }));
});

test("défauts : discussion de max(90, 30 × joueurs) s, réponse 90 s, réflexion 30 s, pas de débrief", () => {
  assert.deepEqual([1, 3, 4, 5, 6].map(dureeEchangeParDefaut), [90, 90, 120, 150, 180]);
  const e4 = partieParDefaut(4);
  assert.deepEqual(e4.reglages, {
    nbProblemes: 4, nbProblemesAuto: true, dureeEchange: 120, dureeEchangeAuto: true,
    dureeReponse: 90, dureeReflexion: 30, debrief: false,
  });
  assert.equal(partieParDefaut(6).reglages.dureeEchange, 180);
  // L'animateur peut la modifier : elle n'est plus recalculée.
  let e = ok(partieParDefaut(2), E({ t: "reglages", dureeEchange: 60, dureeReflexion: 0, debrief: true })).etat;
  e = ok(e, J("j2", { t: "rejoindre", pseudo: "P2", avatar: AVATARS[2] })).etat;
  e = ok(e, J("j3", { t: "rejoindre", pseudo: "P3", avatar: AVATARS[3] })).etat;
  assert.equal(e.reglages.dureeEchange, 60);
  assert.equal(e.reglages.dureeReflexion, 0);
  assert.equal(e.reglages.debrief, true);
  for (const d of [20, 30, 45, 0]) assert.equal(ok(e, E({ t: "reglages", dureeReflexion: d })).etat.reglages.dureeReflexion, d);
  ko(e, E({ t: "reglages", dureeReflexion: 5 }));
  ko(e, E({ t: "reglages", dureeReflexion: 121 }));
  ko(e, E({ t: "reglages", debrief: "oui" }));
  // Options passées à la création (POST /api/parties).
  const c = creerEtat({ code: "BCDF", problemes: HISTOIRE, dureeReflexion: 45, debrief: true });
  assert.equal(c.reglages.dureeReflexion, 45);
  assert.equal(c.reglages.debrief, true);
  assert.equal(creerEtat({ code: "BCDF", problemes: HISTOIRE, dureeReflexion: 7 }).reglages.dureeReflexion, 30, "valeur invalide → défaut");
});

test("réflexion silencieuse : presentation → reflexion (30 s, note privée) → echange tout seul à la fin du temps", () => {
  let e = partieParDefaut(2);
  e = ok(e, E({ t: "demarrer" })).etat;
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.phase, "presentation");
  e = ok(e, J("j0", { t: "lu" }), T0).etat;
  let r = ok(e, J("j1", { t: "lu" }), T0);
  assert.equal(r.etat.phase, "reflexion", "tout le monde a lu : réflexion silencieuse");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 30000 }]);
  e = r.etat;
  assert.equal(vue(e, "ecran").minuteurDuree, 30000);
  assert.equal(vue(e, "ecran").probleme.id, e.problemes[0], "la situation reste affichée");
  ko(e, J("j0", { t: "reponse", texte: "trop tôt" }));
  // Note facultative, privée : ni l'écran ni l'autre joueur ne la voient.
  ko(e, J("j0", { t: "note", texte: "x".repeat(201) }));
  e = ok(e, J("j0", { t: "note", texte: "budget zorglub" })).etat;
  assert.equal(vue(e, "joueur", "j0").moi.maNote, "budget zorglub");
  for (const v of [vue(e, "ecran"), vue(e, "joueur", "j1")]) assert.ok(!JSON.stringify(v).includes("zorglub"));
  // Fin des 30 s (alarme) : la discussion démarre d'elle-même, rien n'est coupé.
  r = ok(e, { t: "minuteur_fini" }, T0 + 30000);
  assert.equal(r.etat.phase, "echange");
  assert.deepEqual(r.effets, [{ type: "minuteur", fin: T0 + 30000 + 90000 }], "discussion de 90 s à 2 joueurs");
  e = ok(r.etat, J("j0", { t: "note", texte: "budget, sponsor" })).etat; // encore modifiable pendant la discussion
  e = ok(e, E({ t: "fin_minuteur" })).etat;
  assert.equal(e.phase, "reponse");
  ko(e, J("j0", { t: "note", texte: "trop tard" }));
  assert.ok(!effetsIAEnAttente(e).length);

  // L'animateur peut écourter la réflexion (suivant ou fin_minuteur).
  let f = partieParDefaut(1);
  f = ok(ok(f, E({ t: "demarrer" })).etat, E({ t: "suivant" })).etat;
  f = ok(f, E({ t: "suivant" })).etat;
  assert.equal(f.phase, "reflexion");
  assert.equal(ok(f, E({ t: "suivant" })).etat.phase, "echange");
  assert.equal(ok(f, E({ t: "fin_minuteur" })).etat.phase, "echange");
  // 0 la désactive : directement la discussion.
  let g = ok(partieParDefaut(1), E({ t: "reglages", dureeReflexion: 0 })).etat;
  g = ok(ok(g, E({ t: "demarrer" })).etat, E({ t: "suivant" })).etat;
  assert.equal(ok(g, J("j0", { t: "lu" })).etat.phase, "echange");
});

test("« Je passe ce tour » : réponse vide comme un absent, signalée seulement au joueur ; « je ne sais pas » renvoie un code", () => {
  let e = jusquaReponse(partieEnPresentation());
  const r0 = ko(e, J("b", { t: "reponse", texte: "je sais pas" }));
  assert.equal(r0.code, "sans_reponse", "le téléphone propose les débuts de phrase et le bouton « Je passe ce tour »");
  assert.equal(ko(e, J("b", { t: "reponse", texte: "je le frappe" })).code, "violence");
  ko(e, E({ t: "passer" })); // réservé aux joueurs
  e = ok(e, J("b", { t: "passer" })).etat;
  assert.equal(e.joueurs.b.reponses[0].tour1, "");
  assert.equal(vue(e, "joueur", "b").moi.jaiPasse, true);
  assert.deepEqual(vue(e, "ecran").joueurs.map((j) => j.aFini), [false, true], "l'écran le voit « fini », jamais « passé »");
  assert.ok(!JSON.stringify(vue(e, "ecran")).includes("passe"));
  assert.deepEqual(ok(e, J("b", { t: "passer" })).effets, []);
  // Il peut encore écrire une vraie réponse.
  const re = ok(e, J("b", { t: "reponse", texte: "Je demande de l'aide au coach" })).etat;
  assert.equal(re.joueurs.b.reponses[0].passe, undefined);
  // a répond : tout le monde a « répondu », b n'est pas proposé au MJ.
  const r = ok(e, J("a", { t: "reponse", texte: "J'appelle un réparateur" }));
  assert.equal(r.etat.phase, "competences");
  assert.deepEqual(r.effets.find((x) => x.type === "choisir").reponses.map((x) => x.joueurId), ["a"]);
  assert.equal(vue(r.etat, "joueur", "b").moi.jaiPasse, true);
  assert.equal(vue(r.etat, "joueur", "b").moi.sansReponse, false);
  ko(r.etat, J("b", { t: "passer" })); // hors phase
  // Joueur passé par l'animateur : sansReponse (message « Pas de souci, l'histoire continue »).
  let f = jusquaReponse(partieEnPresentation());
  f = ok(f, J("a", { t: "reponse", texte: "J'appelle un réparateur" })).etat;
  f = ok(f, E({ t: "suivant" })).etat;
  assert.equal(vue(f, "joueur", "b").moi.sansReponse, true);
  assert.equal(vue(f, "joueur", "b").moi.jaiPasse, false);
});

test("rotation stricte : un joueur déjà retenu est refusé tant qu'un autre a écrit une vraie réponse", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je demande de l'aide" })).etat;
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins") }).etat;
  e = ok(e, E({ t: "suivant" })).etat;
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "reponse", texte: "On fait une liste des courses" })).etat;
  const base = e;
  // b écrit une vraie réponse : a (déjà retenu) ne peut pas être choisi.
  e = ok(base, J("b", { t: "reponse", texte: "On cuisine ensemble le gâteau" })).etat;
  const r = ko(e, { t: "attribution_faite", problemeIndex: 1, joueurId: "a", competence: compJeu("6D107", "On fait une liste") });
  assert.match(r.erreur, /Rotation non respectée/);
  ok(e, { t: "attribution_faite", problemeIndex: 1, joueurId: "b", competence: compJeu("6D102", "On cuisine ensemble") });
  // b n'écrit que du remplissage : choix libre, a peut être retenu.
  e = ok(base, J("b", { t: "reponse", texte: "bof je regarde" })).etat;
  const ch = effetsIAEnAttente(e).find((x) => x.type === "choisir");
  assert.deepEqual(ch.obligatoires, []);
  ok(e, { t: "attribution_faite", problemeIndex: 1, joueurId: "a", competence: compJeu("6D107", "On fait une liste") });
});

test("Fisher-Yates : mélange déterministe, enregistré, rejoué à l'identique par le chien de garde", () => {
  const m = melangerFisherYates([1, 2, 3, 4, 5, 6], aleaDepuis(graineDe(42, "x")));
  assert.deepEqual([...m].sort(), [1, 2, 3, 4, 5, 6], "une permutation");
  assert.deepEqual(melangerFisherYates([1, 2, 3, 4, 5, 6], aleaDepuis(graineDe(42, "x"))), m, "même graine, même ordre");
  // Toutes les permutations de 3 apparaissent (pas d'ordre figé au profit du premier inscrit).
  const vues = new Set();
  for (let g = 0; g < 200; g++) vues.add(melangerFisherYates(["a", "b", "c"], aleaDepuis(graineDe(g))).join(""));
  assert.equal(vues.size, 6);
  // Dans la partie : 6 joueurs, l'ordre change selon la graine et reste vérifiable.
  const ordre = (graine) => {
    let e = partieParDefaut(6, { graine, dureeReflexion: 0 });
    e = ok(ok(e, E({ t: "demarrer" })).etat, E({ t: "suivant" })).etat;
    e = ok(ok(e, E({ t: "suivant" })).etat, E({ t: "fin_minuteur" })).etat;
    for (let i = 0; i < 6; i++) e = ok(e, J(`j${i}`, { t: "reponse", texte: `Je propose une idée numéro ${i}` })).etat;
    const ch = effetsIAEnAttente(e).find((x) => x.type === "choisir");
    assert.deepEqual(ch.reponses.map((x) => x.joueurId), e.tirages[0].ordre, "le chien de garde rejoue le même tirage");
    assert.equal(typeof e.tirages[0].graine, "number");
    return e.tirages[0].ordre.join(",");
  };
  assert.equal(ordre(1), ordre(1));
  assert.ok(new Set([1, 2, 3, 4, 5].map(ordre)).size > 1, "l'ordre dépend du tirage");
});

test("compétence privée : seulement si la réponse contient une action citable ; sinon son idée, sans compétence", () => {
  // 4 joueurs : a (idée du tour), b (action citable), c (participation), d (a passé son tour).
  let e = nouvellePartie();
  for (const [id, pseudo, av] of [["a", "Lina", "🦊"], ["b", "Sam", "🐼"], ["c", "Noa", "🐸"], ["d", "Eli", "🐙"]]) {
    e = ok(e, J(id, { t: "rejoindre", pseudo, avatar: av })).etat;
  }
  e = ok(ok(e, E({ t: "demarrer" })).etat, E({ t: "suivant" })).etat;
  e = jusquaReponse(e);
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote et je cherche un sac de riz" })).etat;
  e = ok(e, J("c", { t: "reponse", texte: "On demande au vendeur" })).etat;
  e = ok(e, J("d", { t: "passer" })).etat;
  let r = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") });
  const attribuer = r.effets[0];
  assert.deepEqual(attribuer.reponses.map((x) => x.joueurId).sort(), ["b", "c"], "ni l'auteur de l'idée, ni qui a passé");
  e = r.etat;
  assert.deepEqual(effetsIAEnAttente(e), [attribuer], "le chien de garde relance les compétences privées");
  r = ok(e, {
    t: "competences_privees",
    problemeIndex: 0,
    competences: {
      b: compJeu("6D101", "je rassure mon pote"),
      c: { ...compJeu("6D102", "A participé à la discussion de groupe"), typePreuve: "participation" },
      a: compJeu("6D102", "Je l'éteins"),
    },
  });
  e = r.etat;
  assert.equal(vue(e, "joueur", "b").moi.competenceDuProbleme.code, "6D101");
  assert.equal(vue(e, "joueur", "b").moi.retourPrive, "competence");
  assert.equal(vue(e, "joueur", "c").moi.competenceDuProbleme, null, "participation : pas de compétence");
  assert.equal(vue(e, "joueur", "c").moi.retourPrive, "idee", "il retrouve simplement son idée");
  assert.equal(vue(e, "joueur", "c").moi.maReponse, "On demande au vendeur");
  assert.equal(e.joueurs.a.competences.find((x) => x.problemeIndex === 0).code, "6D111", "l'idée du tour n'est pas remplacée");
  assert.equal(vue(e, "joueur", "d").moi.retourPrive, null);
  assert.deepEqual(effetsIAEnAttente(e), []);
  // Compte de l'écran : seuls ceux qui ont quelque chose à trancher (a et b).
  assert.deepEqual(vue(e, "ecran").compte, { repondu: 0, total: 2 });
  assert.deepEqual(vue(e, "ecran").joueurs.map((j) => j.aFini), [false, false, null, null]);

  // Citations refusées : absente de la réponse, trop courte, sans code.
  let f = jusquaReponse(partieEnPresentation());
  f = ok(f, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  f = ok(f, J("b", { t: "reponse", texte: "Je rassure mon pote ensuite" })).etat;
  f = ok(f, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") }).etat;
  for (const c of [compJeu("6D101", "j'appelle les pompiers"), compJeu("6D101", "mon pote"), { preuve: "Je rassure mon pote" }, null]) {
    const g = ok(f, { t: "competences_privees", problemeIndex: 0, competences: { b: c } }).etat;
    assert.equal(g.joueurs.b.competences.length, 0, JSON.stringify(c));
    assert.equal(g.joueurs.b.reponses[0].retour, "idee");
  }
  // La réponse entière, même courte, est citable.
  let h = jusquaReponse(partieEnPresentation());
  h = ok(h, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  h = ok(h, J("b", { t: "reponse", texte: "Je rassure" })).etat;
  h = ok(h, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") }).etat;
  assert.equal(ok(h, { t: "competences_privees", problemeIndex: 0, competences: { b: compJeu("6D101", "Je rassure") } }).etat.joueurs.b.competences.length, 1);
  // Échec de l'IA et du mock : chacun garde son idée, l'épisode peut se boucler.
  h = ok(h, J("a", { t: "afficher_pseudo", accord: true })).etat;
  h = ok(h, J("a", { t: "garder_competence", garder: false })).etat;
  assert.equal(h.phase, "competences");
  const fin = ok(h, { t: "erreur_ia", tache: "attribuer", problemeIndex: 0 });
  assert.equal(fin.etat.phase, "presentation", "rien d'autre à attendre : épisode suivant");
  assert.equal(fin.etat.joueurs.b.reponses[0].retour, "idee");
  ko(fin.etat, { t: "erreur_ia", tache: "attribuer", problemeIndex: 0 });
});

test("compétences privées arrivées après le passage de l'animateur : en attente, sans faire avancer", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote ensuite" })).etat;
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") }).etat;
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.phase, "presentation");
  assert.deepEqual(effetsIAEnAttente(e).map((x) => [x.type, x.problemeIndex]), [["attribuer", 0]]);
  e = ok(e, { t: "competences_privees", problemeIndex: 0, competences: { b: compJeu("6D101", "Je rassure mon pote") } }).etat;
  assert.equal(e.phase, "presentation");
  assert.equal(e.problemeIndex, 1);
  assert.deepEqual(vue(e, "joueur", "b").moi.competencesEnAttente.map((c) => [c.code, c.problemeIndex]), [["6D101", 0]]);
  e = ok(e, J("b", { t: "garder_competence", garder: true, problemeIndex: 0 })).etat;
  assert.equal(e.joueurs.b.competences[0].gardee, true);
});

test("« Choisir une autre idée » : l'animateur écarte l'idée proposée, le MJ choisit parmi les autres", () => {
  let e = jusquaReponse(partieEnPresentation());
  ko(e, E({ t: "autre_idee" }));
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote ensuite" })).etat;
  ko(e, E({ t: "autre_idee" })); // le MJ n'a pas encore proposé
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") }).etat;
  ko(e, J("a", { t: "autre_idee" })); // réservé à l'animateur
  const r = ok(e, E({ t: "autre_idee" }));
  e = r.etat;
  assert.equal(e.attribution, null);
  assert.equal(vue(e, "ecran").attenteIA, true);
  assert.deepEqual(r.effets.map((x) => [x.type, x.essai, x.reponses.map((y) => y.joueurId)]), [["choisir", 1, ["b"]]]);
  assert.deepEqual(effetsIAEnAttente(e).find((x) => x.type === "choisir").reponses.map((x) => x.joueurId), ["b"]);
  // Sa compétence reste à a, en privé.
  assert.equal(e.joueurs.a.competences.find((c) => c.problemeIndex === 0).idee, false);
  // Un résultat de l'essai précédent, ou désignant a, n'est pas retenu.
  ko(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "b", competence: compJeu("6D101", "Je rassure mon pote"), essai: 0 });
  const idemA = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins") }).etat;
  assert.deepEqual(vue(idemA, "ecran").idee, { aucune: true }, "le joueur écarté n'est jamais repris");
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, joueurId: "b", competence: compJeu("6D101", "Je rassure mon pote"), essai: 1 }).etat;
  assert.equal(vue(e, "ecran").idee.texte, "Je rassure mon pote");
  assert.equal(e.privees[0], "attente", "compétences privées demandées une seule fois");
  assert.equal(vue(e, "joueur", "a").moi.competenceDuProbleme.code, "6D111");
  assert.equal(vue(e, "joueur", "a").moi.retourPrive, "competence");
  // Plus aucune autre réponse : pas d'idée retenue.
  const r2 = ok(e, E({ t: "autre_idee" }));
  assert.deepEqual(r2.effets, []);
  assert.deepEqual(vue(r2.etat, "ecran").idee, { aucune: true });
});

test("préférence par épisode : facultative, après sa réponse, sans score ; ne fait jamais avancer", () => {
  let e = jusquaReponse(partieEnPresentation());
  ko(e, J("a", { t: "preference", valeur: "oui" })); // pas encore répondu
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  assert.equal(vue(e, "joueur", "a").moi.peutDonnerPreference, true);
  ko(e, J("a", { t: "preference", valeur: "beaucoup" }));
  ko(e, J("a", { t: "preference", valeur: "oui", problemeIndex: 1 })); // épisode pas encore joué
  e = ok(e, J("a", { t: "preference", valeur: "un_peu" })).etat;
  assert.equal(e.phase, "reponse");
  assert.equal(vue(e, "joueur", "a").moi.maPreference, "un_peu");
  assert.ok(!JSON.stringify(vue(e, "ecran")).includes("un_peu"));
  e = ok(e, J("b", { t: "reponse", texte: "Je rassure mon pote" })).etat;
  e = ok(e, J("b", { t: "preference", valeur: "non" })).etat;
  e = ok(e, { t: "erreur_ia" }).etat;
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.problemeIndex, 1);
  // Pour un épisode passé : toujours possible.
  e = ok(e, J("b", { t: "preference", valeur: "oui", problemeIndex: 0 })).etat;
  assert.equal(e.joueurs.b.reponses[0].preference, "oui");
});

test("débrief (réglage) : après le dernier épisode, réponse privée facultative, l'animateur termine", () => {
  const avecDeux = (opts) => {
    let e = nouvellePartie({ nbProblemes: 1, ...opts });
    e = ok(e, J("a", { t: "rejoindre", pseudo: "Lina", avatar: "🦊" })).etat;
    e = ok(e, J("b", { t: "rejoindre", pseudo: "Sam", avatar: "🐼" })).etat;
    return jouerProbleme(ok(ok(e, E({ t: "demarrer" })).etat, E({ t: "suivant" })).etat);
  };
  let e = avecDeux({ debrief: true });
  ko(e, J("a", { t: "debrief", texte: "trop tôt" }));
  e = ok(e, E({ t: "suivant" })).etat;
  assert.equal(e.phase, "debrief");
  assert.equal(vue(e, "ecran").probleme, null);
  assert.deepEqual(vue(e, "ecran").compte, { repondu: 0, total: 2 });
  ko(e, J("a", { t: "debrief", texte: "x".repeat(501) }));
  e = ok(e, J("a", { t: "debrief", texte: "J'ai déjà géré la caisse du club zorglub" })).etat;
  assert.equal(vue(e, "joueur", "a").moi.monDebrief, "J'ai déjà géré la caisse du club zorglub");
  for (const v of [vue(e, "ecran"), vue(e, "joueur", "b")]) assert.ok(!JSON.stringify(v).includes("zorglub"));
  assert.deepEqual(vue(e, "ecran").compte, { repondu: 1, total: 2 });
  const r = ok(e, E({ t: "suivant" }), T0 + 5);
  assert.equal(r.etat.phase, "fin");
  assert.deepEqual(r.effets, [{ type: "nettoyer", fin: T0 + 5 + 60 * 60 * 1000 }]);
  // Sans le réglage : directement la fin.
  assert.equal(ok(avecDeux({}), E({ t: "suivant" })).etat.phase, "fin");
});

// ───────────────────────── MJ IA : liaison, reformulation, savoir-être, départage ─────────────────────────

test("lot MJ : phrase de liaison vers l'épisode suivant (transition fixe en repli), reformulation privée, savoir-être hors scénario, départage enregistré", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je ferais un truc" })).etat;
  assert.equal(e.phase, "competences");
  // L'idée du tour : un savoir-être hors scénario, choisi par le MJ de secours après un tirage.
  const departage = { exAequo: ["a", "b"], graine: 7, tire: "a" };
  let r = ok(e, { t: "attribution_faite", problemeIndex: 0, essai: 0, joueurId: "a", competence: { ...compJeu("6D101", "Je l'éteins tout de suite"), horsScenario: true }, departage });
  e = r.etat;
  assert.equal(e.joueurs.a.competences.find((c) => c.problemeIndex === 0).horsScenario, true, "« repérée hors scénario » sur la fiche");
  assert.deepEqual(e.tirages[0].departage, departage, "tirage entre ex aequo enregistré");
  const lier = r.effets.find((x) => x.type === "lier");
  assert.deepEqual([lier.problemeIndex, lier.essai, lier.idee, lier.suivant.id], [1, 0, "Je l'éteins tout de suite", e.problemes[1]]);
  ko(e, { t: "liaison_faite", problemeIndex: 1, essai: 3, texte: "Liaison d'un autre essai." }); // périmée
  ko({ ...e, phase: "accueil" }, { t: "liaison_faite", problemeIndex: 1, essai: 0, texte: "x", role: "joueur" }); // interne : jamais d'un client
  e = ok(e, { t: "liaison_faite", problemeIndex: 1, essai: 0, texte: "Le téléphone est sauvé : place à la suite." }).etat;
  // Pas d'action citable pour b : « Ton idée : … » écrite par le MJ, montrée à lui seul.
  e = ok(e, { t: "competences_privees", problemeIndex: 0, competences: { b: { reformulation: "Ton idée : faire quelque chose" } } }).etat;
  assert.equal(vue(e, "joueur", "b").moi.retourPrive, "idee");
  assert.equal(vue(e, "joueur", "b").moi.maReformulation, "Ton idée : faire quelque chose");
  assert.equal(vue(e, "joueur", "a").moi.maReformulation, null);
  assert.ok(!JSON.stringify(vue(e, "ecran")).includes("Ton idée"), "jamais à l'écran");
  assert.equal(vue(e, "ecran").liaison, null, "pas de liaison au 1er épisode");
  e = ok(e, J("a", { t: "afficher_pseudo", accord: false })).etat;
  e = ok(e, J("a", { t: "garder_competence", garder: true })).etat;
  assert.equal(e.phase, "presentation");
  assert.equal(e.problemeIndex, 1);
  assert.equal(vue(e, "ecran").liaison, "Le téléphone est sauvé : place à la suite.");
  assert.equal(vue(e, "joueur", "b").liaison, "Le téléphone est sauvé : place à la suite.");
  ko(e, { t: "liaison_faite", problemeIndex: 1, essai: 0, texte: "Trop tard." }); // l'épisode est commencé
  // Sans phrase du MJ : la transition fixe de l'épisode, sinon « L'histoire continue. ».
  delete e.liaisons[1];
  assert.equal(vue(e, "ecran").liaison, e.catalogue[e.problemes[1]].transition?.trim() || "L'histoire continue.");
});

test("lot MJ : « Choisir une autre idée » efface la liaison préparée pour l'ancienne idée", () => {
  let e = jusquaReponse(partieEnPresentation());
  e = ok(e, J("a", { t: "reponse", texte: "Je l'éteins tout de suite" })).etat;
  e = ok(e, J("b", { t: "reponse", texte: "Je le mets dans le riz" })).etat;
  e = ok(e, { t: "attribution_faite", problemeIndex: 0, essai: 0, joueurId: "a", competence: compJeu("6D111", "Je l'éteins tout de suite") }).etat;
  assert.deepEqual(e.liaisons[1], { essai: 0, texte: null });
  e = ok(e, E({ t: "autre_idee" })).etat;
  assert.equal(e.liaisons[1], undefined);
  ko(e, { t: "liaison_faite", problemeIndex: 1, essai: 0, texte: "Reprend l'ancienne idée." });
  const r = ok(e, { t: "attribution_faite", problemeIndex: 0, essai: 1, joueurId: "b", competence: compJeu("6D111", "Je le mets dans le riz") });
  assert.equal(r.effets.find((x) => x.type === "lier").idee, "Je le mets dans le riz");
});
