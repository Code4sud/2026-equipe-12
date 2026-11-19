// Logique de jeu PURE (SPEC §3) : aucune I/O, aucune horloge système, aucun
// aléatoire non injecté. Le Durable Object appelle `appliquer`, persiste le
// nouvel état, exécute les `effets`, puis envoie `vue(...)` à chaque socket.
//
// Contrat de retour de `appliquer` :
//   succès → { etat: <nouvel état (copie)>, effets: [...] }
//   refus  → { etat: <le MÊME objet état, inchangé>, effets: [], erreur: "message en français" }

import { clePseudo, lettresRiasec, normaliserPseudo, refusReponse } from "./texte.js";

export const AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦉", "🐢", "🐝", "🦄", "🐧", "🐯", "🐨"];

export const MAX_JOUEURS = 6;
export const DUREE_MIN = 10; // secondes
export const DUREE_MAX = 600;
export const DELAI_NETTOYAGE_MS = 60 * 60 * 1000;
const MAX_DEPART = 3;

// Événements produits par le serveur lui-même : un client ne peut pas les envoyer
// (le DO enrichit chaque message client avec `role`, ce qui les fait refuser).
const INTERNES = new Set([
  "minuteur_fini",
  "analyse_faite",
  "attribution_faite",
  "erreur_ia",
  "connexion",
  "deconnexion",
]);

const PHASES_MINUTEUR = new Set(["echange", "reponse"]);

// ───────────────────────── Tirage déterministe ─────────────────────────

function hacherGraine(g) {
  if (typeof g === "number" && Number.isFinite(g)) return g >>> 0;
  const s = String(g ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dominant = (p) => lettresRiasec(p.riasec)[0] ?? "?";

// Mélange (graine) puis privilégie des types RIASEC dominants différents.
export function tirerProblemes(problemes, nb, graine) {
  const alea = mulberry32(hacherGraine(graine));
  const melange = problemes.slice();
  for (let i = melange.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [melange[i], melange[j]] = [melange[j], melange[i]];
  }
  const choisis = [];
  const types = new Set();
  for (const p of melange) {
    if (choisis.length >= nb) break;
    if (!types.has(dominant(p))) {
      choisis.push(p);
      types.add(dominant(p));
    }
  }
  for (const p of melange) {
    if (choisis.length >= nb) break;
    if (!choisis.includes(p)) choisis.push(p);
  }
  return choisis;
}

// ───────────────────────── Création ─────────────────────────

const entierBorne = (v, min, max, defaut) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function creerEtat({ code, problemes, nbProblemes = 3, dureeEchange = 120, dureeReponse = 90, graine = 0, maintenant = null, solo = false } = {}) {
  const liste = Array.isArray(problemes) ? problemes : problemes?.problemes ?? [];
  if (liste.length === 0) throw new Error("Aucun problème disponible pour créer la partie.");
  const nb = Math.min(entierBorne(nbProblemes, 1, 6, 3), liste.length);
  const tires = tirerProblemes(liste, nb, graine);
  return {
    code,
    phase: "accueil",
    // Mode solo : un seul joueur, tout sur son appareil, sans écran commun ni
    // animateur. La partie démarre dès qu'il a rejoint ; pas de discussion ni de minuteur.
    solo: solo === true,
    creeA: maintenant,
    graine,
    reglages: {
      nbProblemes: nb,
      dureeEchange: entierBorne(dureeEchange, DUREE_MIN, DUREE_MAX, 120),
      dureeReponse: entierBorne(dureeReponse, DUREE_MIN, DUREE_MAX, 90),
    },
    problemes: tires.map((p) => p.id),
    // Données complètes des problèmes tirés : la vue et les effets en ont besoin
    // (jeu.js ne lit aucun fichier).
    catalogue: Object.fromEntries(tires.map((p) => [p.id, p])),
    problemeIndex: null,
    tour: null,
    tourId: null,
    minuteurFin: null,
    minuteurDebut: null,
    // Minuteur arrivé à 0 : la partie N'AVANCE PAS toute seule. On attend que
    // tout le monde ait répondu, ou que l'animateur passe à la suite.
    tempsEcoule: false,
    joueurs: {},
    attribution: null,
    finA: null,
  };
}

// ───────────────────────── Aides internes ─────────────────────────

const longueur = (s) => [...s].length;
const listeJoueurs = (e) => Object.values(e.joueurs);
const problemeCourant = (e) => (e.problemeIndex === null ? null : e.catalogue[e.problemes[e.problemeIndex]] ?? null);
const nouvelleReponse = () => ({ tour1: null, lu: false });
const reponseCourante = (j, e) => j.reponses[e.problemeIndex] ?? (j.reponses[e.problemeIndex] = nouvelleReponse());

function lancerMinuteur(e, phase, dureeS, maintenant) {
  e.phase = phase;
  e.minuteurDebut = maintenant;
  e.minuteurFin = maintenant + dureeS * 1000;
  e.tempsEcoule = false;
  return [{ type: "minuteur", fin: e.minuteurFin }];
}

function arreterMinuteur(e, parMinuteur) {
  e.minuteurFin = null;
  e.minuteurDebut = null;
  e.tempsEcoule = false;
  return parMinuteur ? [] : [{ type: "annuler_minuteur" }];
}

function entrerProbleme(e, index) {
  e.problemeIndex = index;
  e.tour = 1;
  e.tourId = `${e.code}-${index}-1`;
  e.phase = "presentation";
  e.minuteurFin = null;
  e.minuteurDebut = null;
  e.tempsEcoule = false;
  e.attribution = null;
  for (const j of listeJoueurs(e)) j.reponses[index] = nouvelleReponse();
  return [];
}

// Création close par l'animateur (écran `suivant`) : un joueur dont l'analyse
// est prête mais qui n'a pas encore validé ne perd rien, ses propositions
// deviennent des compétences de départ EN ATTENTE (gardee:null), qu'il garde
// ou retire plus tard avec { t:"garder_competence", garder, departIndex }.
function finCreation(e) {
  for (const j of listeJoueurs(e)) if (j.depart.etat === "a_valider") departEnAttente(j);
  return entrerProbleme(e, 0);
}

// Propositions de départ → compétences en attente (création close sans validation).
function departEnAttente(j) {
  const propositions = (j.depart.propositions ?? []).map((c, i) => ({
    ...c,
    departIndex: Number.isInteger(c.departIndex) ? c.departIndex : i,
    problemeIndex: null,
    gardee: null,
  }));
  j.depart = { etat: "valide", propositions, gardees: [] };
  j.competences = j.competences.filter((c) => c.problemeIndex !== null).concat(propositions.map((c) => ({ ...c })));
}

function effetAttribuer(e) {
  const historique = {};
  for (const j of listeJoueurs(e)) {
    const r = reponseCourante(j, e);
    const t = typeof r.tour1 === "string" ? r.tour1.trim() : "";
    historique[j.id] = { reponses: t ? [t] : [], choix: null };
  }
  return { type: "attribuer", problemeIndex: e.problemeIndex, probleme: problemeCourant(e), historique };
}

// Toutes les réponses sont là (ou l'animateur passe) : pas de « bonne réponse »
// à chercher, le MJ donne directement une compétence à chacun.
function finReponse(e, parMinuteur) {
  const effets = arreterMinuteur(e, parMinuteur);
  for (const j of listeJoueurs(e)) {
    const r = reponseCourante(j, e);
    if (r.tour1 === null) r.tour1 = ""; // pas de réponse (animateur passé) = réponse vide
  }
  e.phase = "competences";
  e.attribution = null;
  effets.push(effetAttribuer(e));
  return effets;
}

/**
 * Effets IA que l'état attend encore (appel en cours, ou perdu si le Durable
 * Object a redémarré) : attribuer en `competences` sans attribution,
 * analyser_recit pour chaque joueur en `analyse` pendant la création.
 * Le DO s'en sert pour son chien de garde (repli sur le mock à l'échéance).
 */
export function effetsIAEnAttente(etat) {
  if (!etat) return [];
  const e = structuredClone(etat);
  const effets = [];
  if (e.phase === "competences" && !e.attribution) effets.push(effetAttribuer(e));
  // Analyse du récit : pendant la création, et après si l'animateur a clos la
  // création pendant l'analyse (le résultat deviendra des compétences en attente).
  for (const j of listeJoueurs(e)) {
    if (j.depart?.etat === "analyse") effets.push({ type: "analyser_recit", joueurId: j.id, texte: j.recit ?? "" });
  }
  return effets;
}

function problemeSuivant(e, maintenant) {
  if (e.problemeIndex + 1 < e.problemes.length) return entrerProbleme(e, e.problemeIndex + 1);
  e.phase = "fin";
  e.minuteurFin = null;
  e.minuteurDebut = null;
  e.tempsEcoule = false;
  e.finA = maintenant;
  e.tourId = null;
  return [{ type: "nettoyer", fin: maintenant + DELAI_NETTOYAGE_MS }];
}

// Normalise une compétence de départ (accepte le format commun §4.2 ou celui
// de src/analyse.js : code_rome, libelle_rome, mots_du_jeune, citation).
function competenceDepart(c, departIndex) {
  return {
    code: c.code ?? c.code_rome,
    libelle: c.libelle ?? c.libelle_rome ?? null,
    mots: c.mots ?? c.mots_du_jeune ?? "",
    preuve: c.preuve ?? c.citation ?? "",
    typePreuve: "vecu",
    riasec: lettresRiasec(c.riasec),
    problemeIndex: null,
    // Identifiant stable d'une compétence de départ (sa position dans
    // depart.propositions) : à renvoyer dans { t:"garder_competence", garder, departIndex }.
    departIndex,
    gardee: null,
  };
}

function competenceJeu(c, problemeIndex) {
  return {
    code: c.code,
    libelle: c.libelle ?? null,
    mots: c.mots ?? "",
    preuve: c.preuve ?? "",
    typePreuve: c.typePreuve === "participation" ? "participation" : "jeu",
    riasec: lettresRiasec(c.riasec),
    problemeIndex,
    gardee: null,
  };
}

// Dernier recours si l'IA ET le mock échouent : chaque joueur reçoit au moins la
// compétence de participation du problème (jamais bloqué, jamais sans compétence).
const LIBELLES_PARTICIPATION = { "6D102": "Avoir l'esprit d'équipe" };
function competenceParticipation(e) {
  const p = problemeCourant(e);
  const code = p?.competenceParticipation || "6D102";
  return {
    code,
    libelle: LIBELLES_PARTICIPATION[code] ?? null,
    mots: "Tu as pris part à la réflexion du groupe, et ça compte.",
    preuve: "A participé à la discussion de groupe",
    typePreuve: "participation",
    riasec: lettresRiasec(p?.riasec).slice(0, 2),
  };
}

function tousLesJoueursOntGarde(e) {
  const js = listeJoueurs(e);
  if (js.length === 0 || !e.attribution) return false;
  return js.every((j) => {
    if (!e.attribution[j.id]) return false;
    const c = j.competences.find((x) => x.problemeIndex === e.problemeIndex);
    return c && c.gardee !== null;
  });
}

// ───────────────────────── Gestionnaires ─────────────────────────
// Chaque gestionnaire modifie la COPIE `e` et renvoie la liste d'effets,
// ou une chaîne = message d'erreur (l'état d'origine est alors renvoyé tel quel).

const H = {};

H.rejoindre = { role: "joueur", f(e, ev) {
  const id = ev.joueurId;
  if (typeof id !== "string" || !id) return "Identifiant de joueur manquant.";
  const existant = e.joueurs[id];
  if (existant) {
    existant.connecte = true; // reconnexion
    return [];
  }
  if (e.phase !== "accueil") return "La partie a déjà commencé.";
  // Sans caractères invisibles ni de contrôle (U+200B, U+202E…), au moins une lettre ou un chiffre.
  const pseudo = normaliserPseudo(ev.pseudo);
  if (longueur(pseudo) < 1 || longueur(pseudo) > 20) return "Choisis un pseudo de 1 à 20 caractères, avec au moins une lettre ou un chiffre.";
  if (!AVATARS.includes(ev.avatar)) return "Choisis un avatar dans la liste.";
  const js = listeJoueurs(e);
  if (e.solo && js.length >= 1) return "Cette partie se joue en solo.";
  if (js.length >= MAX_JOUEURS) return `La partie est complète (${MAX_JOUEURS} joueurs maximum).`;
  if (js.some((j) => clePseudo(j.pseudo) === clePseudo(pseudo))) return "Ce pseudo est déjà pris. Choisis-en un autre.";
  if (js.some((j) => j.avatar === ev.avatar)) return "Cet avatar est déjà pris. Choisis-en un autre.";
  e.joueurs[id] = {
    id,
    pseudo,
    avatar: ev.avatar,
    connecte: true,
    recit: null,
    depart: { etat: "attente", propositions: [], gardees: [] },
    reponses: {},
    competences: [],
  };
  // Solo : pas d'animateur pour « Démarrer », la création du personnage commence tout de suite.
  if (e.solo) e.phase = "creation";
  return [];
} };

H.reglages = { role: "ecran", f(e, ev) {
  if (e.phase !== "accueil") return "Les réglages ne se changent qu'avant le début de la partie.";
  for (const cle of ["dureeEchange", "dureeReponse"]) {
    if (ev[cle] === undefined) continue;
    const n = Number(ev[cle]);
    if (!Number.isInteger(n) || n < DUREE_MIN || n > DUREE_MAX) return `Durée invalide : entre ${DUREE_MIN} et ${DUREE_MAX} secondes.`;
  }
  if (ev.dureeEchange !== undefined) e.reglages.dureeEchange = Number(ev.dureeEchange);
  if (ev.dureeReponse !== undefined) e.reglages.dureeReponse = Number(ev.dureeReponse);
  return [];
} };

H.demarrer = { role: "ecran", f(e) {
  if (e.phase !== "accueil") return "La partie a déjà commencé.";
  if (listeJoueurs(e).length < 1) return "Il faut au moins un joueur pour commencer.";
  e.phase = "creation";
  return [];
} };

H.recit = { role: "joueur", f(e, ev) {
  if (e.phase !== "creation") return "Ce n'est pas le moment de raconter ton histoire.";
  const j = e.joueurs[ev.joueurId];
  if (!["attente", "a_valider"].includes(j.depart.etat)) return "Ton histoire est déjà en cours d'analyse ou validée.";
  const texte = typeof ev.texte === "string" ? ev.texte.trim() : "";
  if (longueur(texte) < 10 || longueur(texte) > 1000) return "Écris entre 10 et 1000 caractères.";
  j.recit = texte;
  j.depart = { etat: "analyse", propositions: [], gardees: [] };
  return [{ type: "analyser_recit", joueurId: j.id, texte }];
} };

// Hors phase `creation` (l'animateur a clos la création pendant l'analyse), les
// propositions deviennent directement des compétences de départ en attente.
H.analyse_faite = { f(e, ev) {
  if (e.phase === "accueil") return "Analyse reçue hors de la création du personnage.";
  const j = e.joueurs[ev.joueurId];
  if (!j) return "Joueur inconnu.";
  if (j.depart.etat !== "analyse") return "Aucune analyse en attente pour ce joueur.";
  const liste = Array.isArray(ev.competences) ? ev.competences : [];
  j.depart.propositions = liste.filter((c) => c && (c.code || c.code_rome)).slice(0, MAX_DEPART).map((c, i) => competenceDepart(c, i));
  j.depart.etat = "a_valider";
  if (e.phase !== "creation") departEnAttente(j);
  return [];
} };

H.valider_depart = { role: "joueur", f(e, ev) {
  if (e.phase !== "creation") return "Ce n'est pas le moment de valider tes compétences.";
  const j = e.joueurs[ev.joueurId];
  if (j.depart.etat !== "a_valider") return "Tes compétences de départ ne sont pas prêtes à valider.";
  const g = ev.garder;
  if (!Array.isArray(g) || g.length !== j.depart.propositions.length || !g.every((x) => typeof x === "boolean")) {
    return "Réponse invalide : dis pour chaque compétence si c'est toi ou pas.";
  }
  j.depart.propositions = j.depart.propositions.map((c, i) => ({ ...c, gardee: g[i] }));
  j.depart.gardees = j.depart.propositions.filter((c) => c.gardee);
  j.depart.etat = "valide";
  j.competences = j.competences.filter((c) => c.problemeIndex !== null).concat(j.depart.propositions);
  if (listeJoueurs(e).every((x) => x.depart.etat === "valide")) return finCreation(e);
  return [];
} };

// « J'ai lu » : quand TOUT le monde a lu la situation, la partie passe d'elle-même
// à la discussion ; l'animateur peut aussi passer.
H.lu = { role: "joueur", f(e, ev) {
  if (e.phase !== "presentation") return "Il n'y a rien à lire pour l'instant.";
  const r = reponseCourante(e.joueurs[ev.joueurId], e);
  if (r.lu) return [];
  r.lu = true;
  if (!listeJoueurs(e).every((x) => reponseCourante(x, e).lu)) return [];
  // Solo : personne avec qui discuter, on passe directement à la réponse, sans minuteur.
  if (e.solo) {
    e.phase = "reponse";
    return arreterMinuteur(e, true);
  }
  return lancerMinuteur(e, "echange", e.reglages.dureeEchange, ev.__maintenant);
} };

H.reponse = { role: "joueur", f(e, ev) {
  if (e.phase !== "reponse") return "Ce n'est pas le moment de répondre.";
  if (typeof ev.texte !== "string") return "Réponse invalide.";
  const texte = ev.texte.trim();
  if (longueur(texte) > 500) return "Ta réponse est trop longue (500 caractères maximum).";
  // « Je ne sais pas » ou violence : refusée, le joueur réécrit (on boucle tant
  // que tout le monde n'a pas donné une vraie réponse).
  const refus = refusReponse(texte);
  if (refus) return refus;
  const j = e.joueurs[ev.joueurId];
  reponseCourante(j, e).tour1 = texte;
  if (listeJoueurs(e).every((x) => reponseCourante(x, e).tour1 !== null)) return finReponse(e, false);
  return [];
} };

// Sans `problemeIndex` : la compétence du problème en cours (phase `competences`).
// Avec `problemeIndex` : n'importe quelle compétence de jeu déjà reçue, à tout
// moment jusqu'à la fin (phase `fin` comprise), par exemple une compétence restée
// sans réponse quand l'écran est passé au problème suivant.
H.garder_competence = { role: "joueur", f(e, ev) {
  if (typeof ev.garder !== "boolean") return "Réponse invalide.";
  const j = e.joueurs[ev.joueurId];
  if (ev.departIndex !== undefined && ev.departIndex !== null) return garderDepart(j, ev);
  let index = e.problemeIndex;
  if (ev.problemeIndex !== undefined && ev.problemeIndex !== null) {
    if (!Number.isInteger(ev.problemeIndex) || ev.problemeIndex < 0 || ev.problemeIndex >= e.problemes.length) {
      return "Compétence inconnue.";
    }
    index = ev.problemeIndex;
  } else {
    if (e.phase !== "competences") return "Ce n'est pas le moment de garder une compétence.";
    if (!e.attribution) return "Le MJ prépare encore ta compétence.";
  }
  if (index === e.problemeIndex && e.phase === "competences" && !e.attribution) return "Le MJ prépare encore ta compétence.";
  const c = index === null ? null : j.competences.find((x) => x.problemeIndex === index);
  if (!c) return "Tu n'as pas de compétence à garder pour ce problème.";
  if (c.gardee === ev.garder) return [];
  c.gardee = ev.garder;
  if (e.phase === "competences" && index === e.problemeIndex && tousLesJoueursOntGarde(e)) return problemeSuivant(e, ev.__maintenant);
  return [];
} };

// Compétence de DÉPART (problemeIndex null) désignée par son departIndex : à tout
// moment une fois dans j.competences (validée, ou mise en attente quand
// l'animateur a clos la création). Ne fait jamais avancer la partie.
function garderDepart(j, ev) {
  if (ev.problemeIndex !== undefined && ev.problemeIndex !== null) return "Réponse invalide.";
  if (!Number.isInteger(ev.departIndex)) return "Compétence inconnue.";
  const c = j.competences.find((x) => x.problemeIndex === null && x.departIndex === ev.departIndex);
  if (!c) return "Tu n'as pas de compétence de départ à garder ici.";
  if (c.gardee === ev.garder) return [];
  c.gardee = ev.garder;
  j.depart.propositions = (j.depart.propositions ?? []).map((x) => (x.departIndex === ev.departIndex ? { ...x, gardee: ev.garder } : x));
  j.depart.gardees = j.depart.propositions.filter((x) => x.gardee === true);
  return [];
}

// Fin du temps venue de l'ALARME : on le signale (tempsEcoule) sans avancer. Les
// joueurs peuvent encore répondre ; la partie avance quand tout le monde a
// répondu, ou quand l'animateur passe (fin_minuteur / suivant).
function minuteurEchu(e) {
  if (!PHASES_MINUTEUR.has(e.phase) || !Number.isFinite(e.minuteurFin)) return "Pas de minuteur en cours.";
  if (e.tempsEcoule) return "Le temps est déjà écoulé.";
  e.tempsEcoule = true;
  return [];
}

function finMinuteur(e, parMinuteur, maintenant) {
  switch (e.phase) {
    case "echange": return lancerMinuteur(e, "reponse", e.reglages.dureeReponse, maintenant);
    case "reponse": return finReponse(e, parMinuteur);
    default: return "Pas de minuteur en cours.";
  }
}

H.fin_minuteur = { role: "ecran", f: (e, ev) => finMinuteur(e, false, ev.__maintenant) };
H.minuteur_fini = { f: (e) => minuteurEchu(e) };

H.suivant = { role: "ecran", f(e, ev) {
  const maintenant = ev.__maintenant;
  switch (e.phase) {
    case "creation": return finCreation(e);
    case "presentation": return lancerMinuteur(e, "echange", e.reglages.dureeEchange, maintenant);
    case "echange": return lancerMinuteur(e, "reponse", e.reglages.dureeReponse, maintenant);
    case "reponse": return finReponse(e, false);
    // Le MJ IA ne répond pas (appel perdu, réseau lent) : l'animateur relance
    // l'étape avec le MJ de secours (mock), immédiat. Un résultat en double est
    // refusé par les gardes de problemeIndex / attribution déjà présente.
    case "competences":
      if (!e.attribution) return [{ ...effetAttribuer(e), secours: true }];
      return problemeSuivant(e, maintenant);
    case "accueil": return "Pour commencer, utilise « Démarrer ».";
    default: return "Impossible de passer à l'étape suivante maintenant.";
  }
} };

H.attribution_faite = { f(e, ev) {
  if (e.phase !== "competences") return "Attribution reçue hors phase.";
  if (ev.problemeIndex !== e.problemeIndex) return "Attribution périmée.";
  if (e.attribution) return "Les compétences de ce problème sont déjà attribuées.";
  const recues = ev.competences && typeof ev.competences === "object" ? ev.competences : {};
  e.attribution = {};
  for (const j of listeJoueurs(e)) {
    const c = recues[j.id];
    if (!c || !c.code) continue;
    const comp = competenceJeu(c, e.problemeIndex);
    // UNE seule compétence par joueur et par problème.
    j.competences = j.competences.filter((x) => x.problemeIndex !== e.problemeIndex).concat([comp]);
    e.attribution[j.id] = { ...comp };
  }
  return [];
} };

// Échec de l'IA, y compris du mock : le jeu ne doit jamais bloquer.
H.erreur_ia = { f(e, ev) {
  if (ev.joueurId !== undefined) {
    const j = e.joueurs[ev.joueurId];
    if (!j || j.depart.etat !== "analyse") return "Erreur IA hors contexte.";
    // Pendant la création, le joueur peut valider (0 proposition) ; après, la création est close.
    j.depart = { etat: e.phase === "creation" ? "a_valider" : "valide", propositions: [], gardees: [] };
    return [];
  }
  if (e.phase === "competences" && !e.attribution) {
    e.attribution = {};
    for (const j of listeJoueurs(e)) {
      const comp = competenceJeu(competenceParticipation(e), e.problemeIndex);
      j.competences = j.competences.filter((x) => x.problemeIndex !== e.problemeIndex).concat([comp]);
      e.attribution[j.id] = { ...comp };
    }
    return [];
  }
  return "Erreur IA hors contexte.";
} };

H.connexion = { f(e, ev) {
  const j = e.joueurs[ev.joueurId];
  if (!j) return "Joueur inconnu.";
  j.connecte = true;
  return [];
} };

H.deconnexion = { f(e, ev) {
  const j = e.joueurs[ev.joueurId];
  if (!j) return "Joueur inconnu.";
  j.connecte = false;
  return [];
} };

// ───────────────────────── appliquer ─────────────────────────

export function appliquer(etat, evenement, maintenant) {
  const refus = (erreur) => ({ etat, effets: [], erreur });
  if (!evenement || typeof evenement.t !== "string") return refus("Message invalide.");
  const h = Object.hasOwn(H, evenement.t) ? H[evenement.t] : null;
  if (!h) return refus("Message inconnu.");
  if (INTERNES.has(evenement.t)) {
    if (evenement.role !== undefined) return refus("Message non autorisé.");
  } else {
    if (evenement.role !== h.role) return refus("Ce message n'est pas autorisé pour toi.");
    if (h.role === "joueur" && evenement.t !== "rejoindre" && !etat.joueurs[evenement.joueurId]) {
      return refus("Tu ne fais pas partie de cette partie.");
    }
  }
  const e = structuredClone(etat);
  const r = h.f(e, { ...evenement, __maintenant: Number(maintenant) || 0 });
  if (typeof r === "string") return refus(r);
  return { etat: e, effets: r };
}

// ───────────────────────── Vues ─────────────────────────

function vueProbleme(p) {
  if (!p) return null;
  return { id: p.id, titre: p.titre, situation: p.situation, question: p.question, illustration: p.illustration };
}

// Ce joueur a-t-il fait ce qu'on attend de lui dans cette phase (lu, répondu,
// gardé sa compétence…) ? null si la phase n'attend rien des joueurs.
function aFini(e, j) {
  const r = e.problemeIndex !== null ? j.reponses[e.problemeIndex] : null;
  switch (e.phase) {
    case "creation": return j.depart.etat === "valide";
    case "presentation": return !!r?.lu;
    case "reponse": return r?.tour1 != null;
    case "competences":
      return e.attribution ? j.competences.some((c) => c.problemeIndex === e.problemeIndex && c.gardee !== null) : null;
    default: return null;
  }
}

function compte(e) {
  const js = listeJoueurs(e);
  const etats = js.map((j) => aFini(e, j));
  if (!js.length || etats.some((x) => x === null)) return null;
  return { repondu: etats.filter(Boolean).length, total: js.length };
}

function partiesCommunes(e) {
  const p = problemeCourant(e);
  const avecProbleme = !["accueil", "creation", "fin"].includes(e.phase);
  const avecMinuteur = PHASES_MINUTEUR.has(e.phase) && Number.isFinite(e.minuteurFin) && Number.isFinite(e.minuteurDebut);
  return {
    code: e.code,
    phase: e.phase,
    solo: !!e.solo,
    problemeIndex: e.problemeIndex,
    nbProblemes: e.problemes.length,
    probleme: avecProbleme ? vueProbleme(p) : null,
    minuteurFin: PHASES_MINUTEUR.has(e.phase) ? e.minuteurFin : null,
    // Début et durée totale du minuteur (ms) : le cercle reste juste après une
    // reconnexion. Le client corrige son horloge avec `serveur` (heure du serveur
    // envoyée avec chaque message { t:"etat" }).
    minuteurDebut: avecMinuteur ? e.minuteurDebut : null,
    minuteurDuree: avecMinuteur ? e.minuteurFin - e.minuteurDebut : null,
    tempsEcoule: avecMinuteur && !!e.tempsEcoule,
    compte: compte(e),
  };
}

export function vue(etat, role, joueurId) {
  const base = partiesCommunes(etat);
  if (role === "ecran") {
    const js = listeJoueurs(etat);
    return {
      ...base,
      reglages: { ...etat.reglages },
      // `aFini` : qui a lu / répondu / gardé sa compétence, pour que l'animateur sache qui
      // attendre. JAMAIS le contenu d'une réponse ni d'un choix.
      joueurs: js.map((j) => ({ pseudo: j.pseudo, avatar: j.avatar, connecte: j.connecte, aFini: aFini(etat, j) })),
      attenteIA: etat.phase === "competences" && !etat.attribution,
      fin: etat.phase === "fin"
        ? { nbCompetencesTotal: js.reduce((n, j) => n + j.competences.filter((c) => c.gardee !== false).length, 0) }
        : null,
    };
  }

  const j = etat.joueurs[joueurId];
  if (!j) {
    return {
      ...base,
      moi: null,
      avatarsPris: listeJoueurs(etat).map((x) => x.avatar),
      fin: null,
    };
  }
  const r = etat.problemeIndex !== null ? j.reponses[etat.problemeIndex] : null;
  const competenceDuProbleme = etat.phase === "competences" && etat.problemeIndex !== null
    ? j.competences.find((c) => c.problemeIndex === etat.problemeIndex) ?? null
    : null;
  return {
    ...base,
    moi: {
      id: j.id,
      pseudo: j.pseudo,
      avatar: j.avatar,
      depart: structuredClone(j.depart),
      aLu: !!r?.lu,
      maReponse: r?.tour1 ?? null,
      competenceDuProbleme: competenceDuProbleme ? { ...competenceDuProbleme } : null,
      // Compétences encore sans réponse (gardee: null), hors celle du problème en
      // cours déjà montrée dans competenceDuProbleme : compétences de jeu (le
      // joueur répond avec { t:"garder_competence", garder, problemeIndex }) et
      // compétences de départ restées en attente quand l'animateur a clos la
      // création (avec { t:"garder_competence", garder, departIndex }), en premier.
      competencesEnAttente: j.competences
        .filter((c) => c.gardee === null && c !== competenceDuProbleme
          && (c.problemeIndex !== null || Number.isInteger(c.departIndex)))
        .map((c) => ({ ...c }))
        .sort((a, b) => (a.problemeIndex ?? -1) - (b.problemeIndex ?? -1) || (a.departIndex ?? 0) - (b.departIndex ?? 0)),
      competences: structuredClone(j.competences),
    },
    attenteIA: (etat.phase === "competences" && !etat.attribution) || j.depart.etat === "analyse",
    fin: etat.phase === "fin"
      ? { lienFiche: `/fiche.html?code=${encodeURIComponent(etat.code)}&joueur=${encodeURIComponent(j.id)}` }
      : null,
  };
}
