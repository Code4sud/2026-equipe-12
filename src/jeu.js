// Logique de jeu PURE (SPEC §3) : aucune I/O, aucune horloge système, aucun
// aléatoire non injecté. Le Durable Object appelle `appliquer`, persiste le
// nouvel état, exécute les `effets`, puis envoie `vue(...)` à chaque socket.
//
// Contrat de retour de `appliquer` :
//   succès → { etat: <nouvel état (copie)>, effets: [...] }
//   refus  → { etat: <le MÊME objet état, inchangé>, effets: [], erreur: "message en français", code? }
//   (`code` : raison du refus lisible par le front, ex. "sans_reponse" pour
//   proposer des débuts de phrase et le bouton « Je passe ce tour ».)

import {
  citationTrouvee,
  clePseudo,
  estRemplissage,
  estSansReponse,
  lettresRiasec,
  nbMotsCitation,
  normCitation,
  normaliserPseudo,
  refusReponse,
} from "./texte.js";

export const AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦉", "🐢", "🐝", "🦄", "🐧", "🐯", "🐨"];

export const MAX_JOUEURS = 6;
export const DUREE_MIN = 10; // secondes
export const DUREE_MAX = 600;
export const DELAI_NETTOYAGE_MS = 60 * 60 * 1000;
const MAX_DEPART = 3;

// Temps de réflexion silencieuse avant la discussion (adaptation
// « nouveau-temps-de-reflexion-individuel ») : 30 s par défaut, 0 le désactive.
// Les 30 s sont un choix de conception, à chronométrer en séance.
export const DUREE_REFLEXION_DEFAUT = 30;
export const DUREE_REFLEXION_MAX = 120;
export const DUREE_REPONSE_DEFAUT = 90;
export const NOTE_MAX = 200;
export const DEBRIEF_MAX = 500;
/** Réponses possibles à « Ce genre de situation, tu aimerais en vivre dans un travail ? ». */
export const PREFERENCES = ["oui", "un_peu", "non"];
/** Une compétence privée n'est donnée que si la citation compte au moins 3 mots (sauf réponse entière). */
const CITATION_MIN_MOTS = 3;

/**
 * Durée de discussion par défaut selon la taille du groupe (adaptation
 * « duree-discussion-120s ») : max(90, 30 × nombre de joueurs) secondes, soit
 * 90 s jusqu'à 3 joueurs, 120 s à 4, 150 s à 5, 180 s à 6. Heuristique à
 * valider au chronomètre ; l'animateur peut la changer.
 */
export const dureeEchangeParDefaut = (nbJoueurs) => Math.max(90, 30 * (Number(nbJoueurs) || 0));

/**
 * Nombre d'épisodes par défaut (décision de Pierre §4) : autant que de joueurs,
 * entre 3 et 6, pour que chacun puisse voir son idée retenue une fois.
 */
export const nbEpisodesParDefaut = (nbJoueurs) => Math.min(6, Math.max(3, Number(nbJoueurs) || 0));

/**
 * Types RIASEC joués selon le nombre d'épisodes (décision de Pierre §4, adaptation
 * « defaut-3-episodes-couverture-riasec ») : des types éloignés sur l'hexagone.
 * 1 et 2 épisodes (choix de l'animateur) : les premiers types de la liste à 3.
 */
export const TYPES_PAR_NB = {
  1: ["E"],
  2: ["E", "A"],
  3: ["E", "A", "R"],
  4: ["E", "A", "I", "C"],
  5: ["E", "A", "I", "R", "C"],
  6: ["R", "I", "A", "S", "E", "C"],
};

// Événements produits par le serveur lui-même : un client ne peut pas les envoyer
// (le DO enrichit chaque message client avec `role`, ce qui les fait refuser).
const INTERNES = new Set([
  "minuteur_fini",
  "analyse_faite",
  "attribution_faite",
  "competences_privees",
  "erreur_ia",
  "connexion",
  "deconnexion",
]);

const PHASES_MINUTEUR = new Set(["reflexion", "echange", "reponse"]);

// ───────────────────────── Épisodes de l'histoire ─────────────────────────

const ordreEpisode = (p, i) => (Number.isFinite(p?.episode) ? p.episode : i + 1);
const typeDominant = (p) => String(p?.riasec ?? "").trim().charAt(0).toUpperCase();

/**
 * Une histoire : `nb` épisodes aux types RIASEC éloignés (TYPES_PAR_NB, d'après le
 * type dominant `riasec`), joués dans l'ordre de l'histoire (champ `episode`). Si
 * un type manque, on complète avec les premiers épisodes restants. `graine` est
 * gardée pour la compatibilité, elle ne sert pas.
 */
export function tirerProblemes(problemes, nb, _graine) {
  const tries = problemes.map((p, i) => ({ p, ordre: ordreEpisode(p, i) })).sort((a, b) => a.ordre - b.ordre);
  const n = Math.max(0, Math.min(Math.round(Number(nb)) || 0, tries.length));
  const choisis = [];
  for (const type of TYPES_PAR_NB[n] ?? []) {
    const x = tries.find((t) => !choisis.includes(t) && typeDominant(t.p) === type);
    if (x && choisis.length < n) choisis.push(x);
  }
  for (const t of tries) if (choisis.length < n && !choisis.includes(t)) choisis.push(t);
  return choisis.sort((a, b) => a.ordre - b.ordre).map(({ p }) => p);
}

// ───────────────────────── Tirage au hasard (injecté, vérifiable) ─────────────────────────

/** Graine 32 bits tirée d'éléments quelconques (FNV-1a) : même entrée, même graine. */
export function graineDe(...parts) {
  let h = 2166136261;
  for (const ch of parts.map((x) => String(x)).join(":")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32), dans [0, 1). */
export function aleaDepuis(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mélange de Fisher-Yates (copie) avec un aléa injecté. */
export function melangerFisherYates(liste, alea) {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// ───────────────────────── Création ─────────────────────────

const entierBorne = (v, min, max, defaut) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const absent = (v) => v === undefined || v === null;

/** Durée de réflexion valide : 0 (désactivée) ou entre DUREE_MIN et DUREE_REFLEXION_MAX secondes. */
export const reflexionValide = (n) => Number.isInteger(n) && (n === 0 || (n >= DUREE_MIN && n <= DUREE_REFLEXION_MAX));

/**
 * `nbProblemes` et `dureeEchange` absents = automatiques : recalculés selon le
 * nombre de joueurs jusqu'au démarrage (nbEpisodesParDefaut, dureeEchangeParDefaut).
 */
export function creerEtat({
  code,
  problemes,
  nbProblemes,
  dureeEchange,
  dureeReponse = DUREE_REPONSE_DEFAUT,
  dureeReflexion = DUREE_REFLEXION_DEFAUT,
  debrief = false,
  graine = 0,
  maintenant = null,
} = {}) {
  const liste = Array.isArray(problemes) ? problemes : problemes?.problemes ?? [];
  if (liste.length === 0) throw new Error("Aucun problème disponible pour créer la partie.");
  const nbAuto = absent(nbProblemes);
  const nb = Math.min(nbAuto ? nbEpisodesParDefaut(0) : entierBorne(nbProblemes, 1, 6, 3), liste.length);
  const tires = tirerProblemes(liste, nb, graine);
  const echangeAuto = absent(dureeEchange);
  const reflexion = Number(dureeReflexion);
  return {
    code,
    phase: "accueil",
    creeA: maintenant,
    graine,
    reglages: {
      nbProblemes: nb,
      nbProblemesAuto: nbAuto,
      dureeEchange: echangeAuto ? dureeEchangeParDefaut(0) : entierBorne(dureeEchange, DUREE_MIN, DUREE_MAX, 120),
      dureeEchangeAuto: echangeAuto,
      dureeReponse: entierBorne(dureeReponse, DUREE_MIN, DUREE_MAX, DUREE_REPONSE_DEFAUT),
      dureeReflexion: reflexionValide(reflexion) ? reflexion : DUREE_REFLEXION_DEFAUT,
      debrief: debrief === true,
    },
    problemes: tires.map((p) => p.id),
    // Données complètes de TOUS les épisodes disponibles : la vue et les effets en
    // ont besoin (jeu.js ne lit aucun fichier), et le nombre d'épisodes peut
    // encore changer avant le démarrage (automatique selon le nombre de joueurs).
    catalogue: Object.fromEntries(liste.map((p) => [p.id, p])),
    problemeIndex: null,
    tour: null,
    tourId: null,
    minuteurFin: null,
    minuteurDebut: null,
    // Minuteur arrivé à 0 : la partie N'AVANCE PAS toute seule (sauf la
    // réflexion silencieuse). On attend que tout le monde ait répondu, ou que
    // l'animateur passe à la suite.
    tempsEcoule: false,
    joueurs: {},
    attribution: null,
    idee: null,
    // Par épisode : ordre de présentation des réponses au MJ (mélange de
    // Fisher-Yates enregistré), essais du choix, joueurs écartés par l'animateur
    // (« Choisir une autre idée »), état des compétences privées.
    tirages: {},
    essaisChoix: {},
    exclus: {},
    privees: {},
    finA: null,
  };
}

// ───────────────────────── Aides internes ─────────────────────────

const longueur = (s) => [...s].length;
const listeJoueurs = (e) => Object.values(e.joueurs);
const problemeCourant = (e) => (e.problemeIndex === null ? null : e.catalogue[e.problemes[e.problemeIndex]] ?? null);
const nouvelleReponse = () => ({ tour1: null, lu: false });
const reponseCourante = (j, e) => j.reponses[e.problemeIndex] ?? (j.reponses[e.problemeIndex] = nouvelleReponse());
const texteReponse = (j, index) => (typeof j.reponses?.[index]?.tour1 === "string" ? j.reponses[index].tour1.trim() : "");

/** Mots-clés du problème (compétences et solution) : une réponse courte qui en contient un n'est pas du remplissage. */
const motsClesDuProbleme = (p) => [
  ...(p?.competences ?? []).flatMap((c) => c?.motsCles ?? []),
  ...(p?.solution?.motsCles ?? []),
];

/** Réglages automatiques (nombre d'épisodes, durée de discussion) selon le nombre de joueurs. */
function majReglagesAuto(e) {
  const n = listeJoueurs(e).length;
  if (e.reglages.dureeEchangeAuto) e.reglages.dureeEchange = dureeEchangeParDefaut(n);
  if (e.reglages.nbProblemesAuto) choisirEpisodes(e, nbEpisodesParDefaut(n));
}

function choisirEpisodes(e, nb) {
  const liste = Object.values(e.catalogue);
  const tires = tirerProblemes(liste, Math.min(nb, liste.length), e.graine);
  e.problemes = tires.map((p) => p.id);
  e.reglages.nbProblemes = e.problemes.length;
}

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

// Après la présentation : la réflexion silencieuse (si elle n'est pas désactivée),
// puis la discussion.
function apresPresentation(e, maintenant) {
  const d = Number(e.reglages.dureeReflexion) || 0;
  if (d > 0) return lancerMinuteur(e, "reflexion", d, maintenant);
  return lancerMinuteur(e, "echange", e.reglages.dureeEchange, maintenant);
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
  e.idee = null;
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

// L'idée de ce joueur a-t-elle déjà été retenue dans un AUTRE épisode ? (Les
// compétences privées ne comptent pas : seules les idées du tour.)
const dejaRetenu = (e, j) => j.competences.some((c) => c.idee === true && c.problemeIndex !== null && c.problemeIndex !== e.problemeIndex);

/** Réponses écrites de l'épisode en cours, hors joueurs écartés par l'animateur. */
function reponsesEcrites(e) {
  const exclus = e.exclus?.[e.problemeIndex] ?? [];
  const out = [];
  for (const j of listeJoueurs(e)) {
    const t = texteReponse(j, e.problemeIndex);
    if (t && !exclus.includes(j.id)) out.push({ joueurId: j.id, texte: t, dejaRetenu: dejaRetenu(e, j) });
  }
  return out;
}

/**
 * Rotation stricte (adaptation « rotation-joueurs-retenus ») : si au moins un
 * joueur pas encore retenu a écrit une vraie réponse (pas du remplissage), le MJ
 * doit choisir parmi eux. Liste vide = choix libre.
 */
function obligatoiresDe(e, reponses) {
  const mots = motsClesDuProbleme(problemeCourant(e));
  return reponses.filter((r) => !r.dejaRetenu && !estRemplissage(r.texte, mots)).map((r) => r.joueurId);
}

const essaiCourant = (e) => e.essaisChoix?.[e.problemeIndex] ?? 0;

/**
 * Effet `choisir` : les réponses sont mélangées (Fisher-Yates) AVANT que le MJ les
 * étiquette J1, J2… ; le tirage (graine + ordre obtenu) est enregistré dans
 * `etat.tirages` pour pouvoir le vérifier. Le même état redonne le même ordre.
 */
function effetChoisir(e) {
  const essai = essaiCourant(e);
  const ecrites = reponsesEcrites(e);
  const graine = graineDe(e.graine, e.code, e.problemeIndex, essai);
  const melange = melangerFisherYates(ecrites, aleaDepuis(graine));
  e.tirages = e.tirages ?? {};
  e.tirages[e.problemeIndex] = { essai, graine, ordre: melange.map((r) => r.joueurId) };
  return {
    type: "choisir",
    problemeIndex: e.problemeIndex,
    essai,
    probleme: problemeCourant(e),
    reponses: melange,
    obligatoires: obligatoiresDe(e, melange),
  };
}

/** Effet `attribuer` : une compétence privée possible pour chaque réponse écrite (hors idée du tour). */
function effetAttribuer(e, index = e.problemeIndex) {
  const idee = index === e.problemeIndex ? e.idee?.joueurId ?? null : null;
  const reponses = [];
  for (const j of listeJoueurs(e)) {
    const t = texteReponse(j, index);
    const aIdee = j.competences.some((c) => c.problemeIndex === index && c.idee === true);
    if (t && j.id !== idee && !aIdee) reponses.push({ joueurId: j.id, texte: t });
  }
  return { type: "attribuer", problemeIndex: index, probleme: e.catalogue[e.problemes[index]] ?? null, reponses };
}

// Toutes les réponses sont là (ou l'animateur passe) : le MJ choisit l'idée du tour,
// celle qui fait avancer l'histoire. Personne n'a rien écrit : pas d'idée retenue.
function finReponse(e, parMinuteur) {
  const effets = arreterMinuteur(e, parMinuteur);
  for (const j of listeJoueurs(e)) {
    const r = reponseCourante(j, e);
    if (r.tour1 === null) r.tour1 = ""; // pas de réponse (animateur passé) = réponse vide
  }
  e.phase = "competences";
  e.attribution = null;
  e.idee = null;
  const choisir = effetChoisir(e);
  if (!choisir.reponses.length) {
    e.attribution = {};
    e.idee = { joueurId: null, accordPseudo: null };
    return effets;
  }
  effets.push(choisir);
  return effets;
}

/**
 * Effets IA que l'état attend encore (appel en cours, ou perdu si le Durable
 * Object a redémarré) : choisir (l'idée du tour) en `competences` sans attribution,
 * attribuer (compétences privées) tant qu'elles sont attendues, analyser_recit
 * pour chaque joueur en `analyse`. Le DO s'en sert pour son chien de garde.
 */
export function effetsIAEnAttente(etat) {
  if (!etat) return [];
  const e = structuredClone(etat);
  const effets = [];
  if (e.phase === "competences" && !e.attribution) effets.push(effetChoisir(e));
  for (const [index, st] of Object.entries(e.privees ?? {})) {
    if (st === "attente") effets.push(effetAttribuer(e, Number(index)));
  }
  // Analyse du récit : pendant la création, et après si l'animateur a clos la
  // création pendant l'analyse (le résultat deviendra des compétences en attente).
  for (const j of listeJoueurs(e)) {
    if (j.depart?.etat === "analyse") effets.push({ type: "analyser_recit", joueurId: j.id, texte: j.recit ?? "" });
  }
  return effets;
}

function problemeSuivant(e, maintenant) {
  if (e.problemeIndex + 1 < e.problemes.length) return entrerProbleme(e, e.problemeIndex + 1);
  if (e.reglages.debrief && e.phase !== "debrief") {
    // Court débrief collectif avant la fiche (adaptation « nouveau-debriefing »).
    e.phase = "debrief";
    e.minuteurFin = null;
    e.minuteurDebut = null;
    e.tempsEcoule = false;
    e.attribution = null;
    e.idee = null;
    return [];
  }
  return terminer(e, maintenant);
}

function terminer(e, maintenant) {
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

function competenceJeu(c, problemeIndex, { idee }) {
  return {
    code: c.code,
    libelle: c.libelle ?? null,
    mots: c.mots ?? "",
    preuve: c.preuve ?? "",
    typePreuve: c.typePreuve === "participation" ? "participation" : "jeu",
    riasec: lettresRiasec(c.riasec),
    problemeIndex,
    // idee:true = l'idée du tour (publique) ; false = compétence privée, montrée
    // seulement sur le téléphone de son auteur.
    idee: idee === true,
    gardee: null,
  };
}

/**
 * Une compétence privée n'est donnée que si la réponse contient une action
 * précise et citable (critique point 3, décision de Pierre §1) : code présent,
 * pas la carte « participation », citation exacte de la réponse d'au moins 3
 * mots (ou la réponse entière). Sinon : pas de compétence, juste son idée.
 */
function competenceCitable(c, texte) {
  if (!c || typeof c.code !== "string" || !c.code || c.typePreuve === "participation") return false;
  const preuve = typeof c.preuve === "string" ? c.preuve.trim() : "";
  if (!preuve || !texte || !citationTrouvee(preuve, [texte])) return false;
  return nbMotsCitation(preuve) >= CITATION_MIN_MOTS || normCitation(preuve) === normCitation(texte);
}

/**
 * L'épisode est-il bouclé ? L'auteur de l'idée a dit s'il garde sa compétence et
 * s'il veut afficher son pseudo, les compétences privées sont arrivées et chacun
 * a dit s'il garde la sienne. Sans idée retenue, c'est l'animateur qui passe.
 */
function episodeBoucle(e) {
  const id = e.idee?.joueurId;
  if (!e.attribution || !id || !e.joueurs[id]) return false;
  const pi = e.problemeIndex;
  const c = e.joueurs[id].competences.find((x) => x.problemeIndex === pi);
  if (!c || c.gardee === null || e.idee.accordPseudo === null || e.idee.accordPseudo === undefined) return false;
  if (e.privees?.[pi] === "attente") return false;
  return listeJoueurs(e).every((j) => j.competences.every((x) => x.problemeIndex !== pi || x.gardee !== null));
}

// ───────────────────────── Gestionnaires ─────────────────────────
// Chaque gestionnaire modifie la COPIE `e` et renvoie la liste d'effets, ou une
// chaîne = message d'erreur, ou { erreur, code } (l'état d'origine est alors
// renvoyé tel quel).

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
    debrief: null,
  };
  majReglagesAuto(e);
  return [];
} };

H.reglages = { role: "ecran", f(e, ev) {
  if (e.phase !== "accueil") return "Les réglages ne se changent qu'avant le début de la partie.";
  for (const cle of ["dureeEchange", "dureeReponse"]) {
    if (ev[cle] === undefined) continue;
    const n = Number(ev[cle]);
    if (!Number.isInteger(n) || n < DUREE_MIN || n > DUREE_MAX) return `Durée invalide : entre ${DUREE_MIN} et ${DUREE_MAX} secondes.`;
  }
  if (ev.dureeReflexion !== undefined && !reflexionValide(Number(ev.dureeReflexion))) {
    return `Temps de réflexion invalide : 0 (sans réflexion) ou entre ${DUREE_MIN} et ${DUREE_REFLEXION_MAX} secondes.`;
  }
  if (ev.nbProblemes !== undefined && ev.nbProblemes !== null) {
    const n = Number(ev.nbProblemes);
    if (!Number.isInteger(n) || n < 1 || n > 6) return "Nombre d'épisodes invalide : entre 1 et 6.";
  }
  if (ev.debrief !== undefined && typeof ev.debrief !== "boolean") return "Réglage du débrief invalide.";
  if (ev.dureeEchange !== undefined) {
    e.reglages.dureeEchange = Number(ev.dureeEchange);
    e.reglages.dureeEchangeAuto = false;
  }
  if (ev.dureeReponse !== undefined) e.reglages.dureeReponse = Number(ev.dureeReponse);
  if (ev.dureeReflexion !== undefined) e.reglages.dureeReflexion = Number(ev.dureeReflexion);
  if (ev.debrief !== undefined) e.reglages.debrief = ev.debrief;
  // nbProblemes: null = revenir au nombre automatique (selon le nombre de joueurs).
  if (ev.nbProblemes === null) {
    e.reglages.nbProblemesAuto = true;
    majReglagesAuto(e);
  } else if (ev.nbProblemes !== undefined) {
    e.reglages.nbProblemesAuto = false;
    choisirEpisodes(e, Number(ev.nbProblemes));
  }
  return [];
} };

H.demarrer = { role: "ecran", f(e) {
  if (e.phase !== "accueil") return "La partie a déjà commencé.";
  if (listeJoueurs(e).length < 1) return "Il faut au moins un joueur pour commencer.";
  majReglagesAuto(e);
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
// à la réflexion silencieuse (puis à la discussion) ; l'animateur peut aussi passer.
H.lu = { role: "joueur", f(e, ev) {
  if (e.phase !== "presentation") return "Il n'y a rien à lire pour l'instant.";
  const r = reponseCourante(e.joueurs[ev.joueurId], e);
  if (r.lu) return [];
  r.lu = true;
  if (!listeJoueurs(e).every((x) => reponseCourante(x, e).lu)) return [];
  return apresPresentation(e, ev.__maintenant);
} };

// Note privée pendant la réflexion (et la discussion) : facultative, jamais
// évaluée, jamais envoyée au MJ ni à l'écran. Seul son auteur la revoit.
H.note = { role: "joueur", f(e, ev) {
  if (!["reflexion", "echange"].includes(e.phase)) return "Ce n'est pas le moment de prendre une note.";
  if (typeof ev.texte !== "string") return "Note invalide.";
  const texte = ev.texte.trim();
  if (longueur(texte) > NOTE_MAX) return `Ta note est trop longue (${NOTE_MAX} caractères maximum).`;
  reponseCourante(e.joueurs[ev.joueurId], e).note = texte;
  return [];
} };

H.reponse = { role: "joueur", f(e, ev) {
  if (e.phase !== "reponse") return "Ce n'est pas le moment de répondre.";
  if (typeof ev.texte !== "string") return "Réponse invalide.";
  const texte = ev.texte.trim();
  if (longueur(texte) > 500) return "Ta réponse est trop longue (500 caractères maximum).";
  // « Je ne sais pas » ou violence : refusée, le joueur réécrit ou passe son tour.
  // Code "sans_reponse" : le téléphone propose dès le 1er refus des débuts de
  // phrase et le bouton « Je passe ce tour » (décision de Pierre §3).
  const refus = refusReponse(texte);
  if (refus) return { erreur: refus, code: estSansReponse(texte) ? "sans_reponse" : "violence" };
  const j = e.joueurs[ev.joueurId];
  const r = reponseCourante(j, e);
  r.tour1 = texte;
  delete r.passe;
  if (listeJoueurs(e).every((x) => reponseCourante(x, e).tour1 !== null)) return finReponse(e, false);
  return [];
} };

// « Je passe ce tour », sans reproche : réponse vide, comme un absent. Le joueur
// peut encore écrire une vraie réponse tant que la phase n'est pas finie. Signalé
// au psychologue sur la fiche, jamais au groupe.
H.passer = { role: "joueur", f(e, ev) {
  if (e.phase !== "reponse") return "Ce n'est pas le moment de passer ton tour.";
  const r = reponseCourante(e.joueurs[ev.joueurId], e);
  if (r.passe === true && r.tour1 === "") return [];
  r.tour1 = "";
  r.passe = true;
  if (listeJoueurs(e).every((x) => reponseCourante(x, e).tour1 !== null)) return finReponse(e, false);
  return [];
} };

// Préférence facultative, après sa réponse : « Ce genre de situation, tu aimerais
// en vivre dans un travail ? » (oui / un peu / non). Aucun score, ne fait jamais
// avancer la partie. Sans problemeIndex : l'épisode en cours.
H.preference = { role: "joueur", f(e, ev) {
  if (!PREFERENCES.includes(ev.valeur)) return "Réponse invalide : oui, un peu ou non.";
  if (["accueil", "creation"].includes(e.phase) || e.problemeIndex === null) return "Ce n'est pas le moment.";
  const index = ev.problemeIndex === undefined || ev.problemeIndex === null ? e.problemeIndex : ev.problemeIndex;
  if (!Number.isInteger(index) || index < 0 || index > e.problemeIndex) return "Épisode inconnu.";
  const r = e.joueurs[ev.joueurId].reponses[index];
  if (!r) return "Épisode inconnu.";
  const enCours = index === e.problemeIndex && !["competences", "debrief", "fin"].includes(e.phase);
  if (enCours && r.tour1 === null) return "Réponds d'abord à la situation.";
  if (r.preference === ev.valeur) return [];
  r.preference = ev.valeur;
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
  if (e.phase === "competences" && index === e.problemeIndex && episodeBoucle(e)) return problemeSuivant(e, ev.__maintenant);
  return [];
} };

// L'auteur de l'idée du tour dit s'il veut voir son pseudo à l'écran (décision de
// Pierre §2). L'écran montre d'abord l'idée sans nom ; le pseudo n'apparaît que
// sur « Oui ». Il peut changer d'avis tant que l'épisode est affiché.
H.afficher_pseudo = { role: "joueur", f(e, ev) {
  if (typeof ev.accord !== "boolean") return "Réponse invalide.";
  if (e.phase !== "competences" || !e.attribution || !e.idee?.joueurId) return "Ce n'est pas le moment.";
  if (e.idee.joueurId !== ev.joueurId) return "Ce n'est pas ton idée qui est affichée.";
  if (e.idee.accordPseudo === ev.accord) return [];
  e.idee.accordPseudo = ev.accord;
  if (episodeBoucle(e)) return problemeSuivant(e, ev.__maintenant);
  return [];
} };

// Débrief : réponse privée à « Raconte une fois, dans ta vraie vie, où tu l'as
// déjà utilisée » (facultative, imprimée sur la fiche pour le psychologue).
H.debrief = { role: "joueur", f(e, ev) {
  if (e.phase !== "debrief") return "Ce n'est pas le moment du débrief.";
  if (typeof ev.texte !== "string") return "Réponse invalide.";
  const texte = ev.texte.trim();
  if (longueur(texte) > DEBRIEF_MAX) return `Ta réponse est trop longue (${DEBRIEF_MAX} caractères maximum).`;
  e.joueurs[ev.joueurId].debrief = texte || null;
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
// répondu, ou quand l'animateur passe (fin_minuteur / suivant). Seule la
// réflexion silencieuse enchaîne d'elle-même sur la discussion (rien n'est coupé).
function minuteurEchu(e, maintenant) {
  if (!PHASES_MINUTEUR.has(e.phase) || !Number.isFinite(e.minuteurFin)) return "Pas de minuteur en cours.";
  if (e.tempsEcoule) return "Le temps est déjà écoulé.";
  if (e.phase === "reflexion") return lancerMinuteur(e, "echange", e.reglages.dureeEchange, maintenant);
  e.tempsEcoule = true;
  return [];
}

function finMinuteur(e, parMinuteur, maintenant) {
  switch (e.phase) {
    case "reflexion": return lancerMinuteur(e, "echange", e.reglages.dureeEchange, maintenant);
    case "echange": return lancerMinuteur(e, "reponse", e.reglages.dureeReponse, maintenant);
    case "reponse": return finReponse(e, parMinuteur);
    default: return "Pas de minuteur en cours.";
  }
}

H.fin_minuteur = { role: "ecran", f: (e, ev) => finMinuteur(e, false, ev.__maintenant) };
H.minuteur_fini = { f: (e, ev) => minuteurEchu(e, ev.__maintenant) };

H.suivant = { role: "ecran", f(e, ev) {
  const maintenant = ev.__maintenant;
  switch (e.phase) {
    case "creation": return finCreation(e);
    case "presentation": return apresPresentation(e, maintenant);
    case "reflexion": return lancerMinuteur(e, "echange", e.reglages.dureeEchange, maintenant);
    case "echange": return lancerMinuteur(e, "reponse", e.reglages.dureeReponse, maintenant);
    case "reponse": return finReponse(e, false);
    // Le MJ IA ne répond pas (appel perdu, réseau lent) : l'animateur relance
    // l'étape avec le MJ de secours (mock), immédiat. Un résultat en double est
    // refusé par les gardes de problemeIndex / attribution déjà présente.
    // Les compétences privées encore attendues arriveront plus tard (le joueur les
    // retrouve dans competencesEnAttente) ; le chien de garde les relance si besoin.
    case "competences":
      if (!e.attribution) return [{ ...effetChoisir(e), secours: true }];
      return problemeSuivant(e, maintenant);
    case "debrief": return terminer(e, maintenant);
    case "accueil": return "Pour commencer, utilise « Démarrer ».";
    default: return "Impossible de passer à l'étape suivante maintenant.";
  }
} };

// « Choisir une autre idée » (adaptation « mj-ia-bienveillant ») : le MJ propose,
// l'animateur valide. Le joueur retenu est écarté pour cet épisode et le MJ choisit
// parmi les autres réponses ; sa compétence lui reste, en privé.
H.autre_idee = { role: "ecran", f(e) {
  if (e.phase !== "competences" || !e.attribution) return "Il n'y a pas d'idée à changer pour l'instant.";
  const id = e.idee?.joueurId;
  if (!id || !e.joueurs[id]) return "Aucune idée n'est affichée.";
  const pi = e.problemeIndex;
  e.exclus[pi] = [...(e.exclus[pi] ?? []), id];
  for (const c of e.joueurs[id].competences) if (c.problemeIndex === pi) c.idee = false;
  if (e.joueurs[id].reponses[pi]) e.joueurs[id].reponses[pi].retour = "competence";
  e.essaisChoix[pi] = essaiCourant(e) + 1;
  e.attribution = null;
  e.idee = null;
  const choisir = effetChoisir(e);
  if (!choisir.reponses.length) {
    e.attribution = {};
    e.idee = { joueurId: null, accordPseudo: null };
    return [];
  }
  return [choisir];
} };

// L'idée du tour : { problemeIndex, joueurId, competence, essai? }. Sa compétence
// est publique (ses propres mots, sans pseudo tant qu'il n'a pas dit oui). Puis
// chaque autre réponse peut recevoir une compétence privée (effet `attribuer`).
H.attribution_faite = { f(e, ev) {
  if (e.phase !== "competences") return "Attribution reçue hors phase.";
  if (ev.problemeIndex !== e.problemeIndex) return "Attribution périmée.";
  if (ev.essai !== undefined && ev.essai !== essaiCourant(e)) return "Attribution périmée.";
  if (e.attribution) return "L'idée de cet épisode est déjà choisie.";
  const pi = e.problemeIndex;
  const exclus = e.exclus?.[pi] ?? [];
  const j = typeof ev.joueurId === "string" && !exclus.includes(ev.joueurId) ? e.joueurs[ev.joueurId] : null;
  const c = ev.competence;
  const texte = j ? texteReponse(j, pi) : "";
  // Rotation stricte, contrôlée ici aussi : un joueur déjà retenu ne peut pas
  // l'être alors qu'un joueur pas encore retenu a écrit une vraie réponse.
  if (j && texte && c?.code) {
    const obligatoires = obligatoiresDe(e, reponsesEcrites(e));
    if (obligatoires.length && !obligatoires.includes(j.id)) return "Rotation non respectée.";
  }
  e.attribution = {};
  const effets = [];
  if (!j || !texte || !c || !c.code) {
    e.idee = { joueurId: null, accordPseudo: null };
  } else {
    const comp = competenceJeu(c, pi, { idee: true });
    j.competences = j.competences.filter((x) => x.problemeIndex !== pi).concat([comp]);
    e.attribution[j.id] = { ...comp };
    e.idee = { joueurId: j.id, accordPseudo: null };
  }
  // Compétences privées : une seule fois par épisode.
  if (e.privees[pi] === undefined) {
    const attribuer = effetAttribuer(e);
    if (attribuer.reponses.length) {
      e.privees[pi] = "attente";
      effets.push(attribuer);
    } else e.privees[pi] = "fait";
  }
  return effets;
} };

// Compétences privées : { problemeIndex, competences: { [joueurId]: competence } }.
// Acceptées même si l'écran est passé à l'épisode suivant (le joueur la retrouve
// dans competencesEnAttente). Jamais montrées à l'écran ni aux autres joueurs.
H.competences_privees = { f(e, ev) {
  const pi = ev.problemeIndex;
  if (!Number.isInteger(pi) || e.privees?.[pi] !== "attente") return "Compétences privées inattendues.";
  const liste = ev.competences && typeof ev.competences === "object" ? ev.competences : {};
  for (const j of listeJoueurs(e)) {
    const texte = texteReponse(j, pi);
    if (!texte) continue;
    if (j.competences.some((x) => x.problemeIndex === pi && x.idee === true)) continue;
    const r = j.reponses[pi];
    const c = Object.hasOwn(liste, j.id) ? liste[j.id] : null;
    if (competenceCitable(c, texte)) {
      j.competences = j.competences.filter((x) => x.problemeIndex !== pi).concat([competenceJeu(c, pi, { idee: false })]);
      r.retour = "competence";
    } else {
      r.retour = "idee"; // pas d'action citable : on lui rappelle simplement son idée
    }
  }
  e.privees[pi] = "fait";
  if (e.phase === "competences" && pi === e.problemeIndex && episodeBoucle(e)) return problemeSuivant(e, ev.__maintenant);
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
  if (ev.tache === "attribuer") {
    const pi = ev.problemeIndex;
    if (!Number.isInteger(pi) || e.privees?.[pi] !== "attente") return "Erreur IA hors contexte.";
    for (const j of listeJoueurs(e)) {
      const r = j.reponses[pi];
      if (r && texteReponse(j, pi) && !j.competences.some((x) => x.problemeIndex === pi)) r.retour = "idee";
    }
    e.privees[pi] = "fait";
    if (e.phase === "competences" && pi === e.problemeIndex && episodeBoucle(e)) return problemeSuivant(e, ev.__maintenant);
    return [];
  }
  // L'IA et le MJ de secours ont échoué : pas d'idée retenue cette fois, l'histoire continue.
  if (e.phase === "competences" && !e.attribution) {
    e.attribution = {};
    e.idee = { joueurId: null, accordPseudo: null };
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
  const refus = (erreur, code) => (code ? { etat, effets: [], erreur, code } : { etat, effets: [], erreur });
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
  // États créés avant ces champs (partie en cours pendant une mise à jour).
  e.tirages ??= {};
  e.essaisChoix ??= {};
  e.exclus ??= {};
  e.privees ??= {};
  const r = h.f(e, { ...evenement, __maintenant: Number(maintenant) || 0 });
  if (typeof r === "string") return refus(r);
  if (r && !Array.isArray(r)) return refus(r.erreur, r.code);
  return { etat: e, effets: r };
}

// ───────────────────────── Vues ─────────────────────────

function vueProbleme(p) {
  if (!p) return null;
  return { id: p.id, titre: p.titre, situation: p.situation, question: p.question, illustration: p.illustration };
}

// Ce joueur a-t-il fait ce qu'on attend de lui dans cette phase (lu, répondu,
// gardé sa compétence…) ? null si la phase n'attend rien de lui.
function aFini(e, j) {
  const r = e.problemeIndex !== null ? j.reponses[e.problemeIndex] : null;
  switch (e.phase) {
    case "creation": return j.depart.etat === "valide";
    case "presentation": return !!r?.lu;
    case "reponse": return r?.tour1 != null;
    case "competences": {
      if (!e.attribution) return null;
      const c = j.competences.find((x) => x.problemeIndex === e.problemeIndex);
      if (!c) return null; // rien à faire (pas de compétence cette fois)
      const accord = e.idee?.joueurId === j.id ? e.idee.accordPseudo !== null && e.idee.accordPseudo !== undefined : true;
      return c.gardee !== null && accord;
    }
    case "debrief": return typeof j.debrief === "string" && j.debrief.length > 0;
    default: return null;
  }
}

function compte(e) {
  const js = listeJoueurs(e);
  const etats = js.map((j) => aFini(e, j)).filter((x) => x !== null);
  if (!js.length || !etats.length) return null;
  // Compétences : seuls ceux qui ont quelque chose à faire comptent.
  if (e.phase !== "competences" && etats.length !== js.length) return null;
  return { repondu: etats.filter(Boolean).length, total: etats.length };
}

function partiesCommunes(e) {
  const p = problemeCourant(e);
  const avecProbleme = !["accueil", "creation", "debrief", "fin"].includes(e.phase);
  const avecMinuteur = PHASES_MINUTEUR.has(e.phase) && Number.isFinite(e.minuteurFin) && Number.isFinite(e.minuteurDebut);
  return {
    code: e.code,
    phase: e.phase,
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
    // L'idée du tour, montrée à tout le monde (écran et téléphones) : ses propres
    // mots et la compétence ; le pseudo seulement si l'auteur a dit oui.
    idee: vueIdee(e),
  };
}

function vueIdee(e) {
  if (e.phase !== "competences" || !e.attribution || !e.idee) return null;
  const j = e.idee.joueurId ? e.joueurs[e.idee.joueurId] : null;
  const c = j ? j.competences.find((x) => x.problemeIndex === e.problemeIndex) : null;
  if (!j || !c) return { aucune: true };
  const accord = e.idee.accordPseudo ?? null;
  return {
    // Décision de Pierre §2 : l'idée s'affiche d'abord sans nom.
    pseudo: accord === true ? j.pseudo : null,
    avatar: accord === true ? j.avatar : null,
    accordPseudo: accord,
    texte: c.preuve,
    competence: { code: c.code, libelle: c.libelle, riasec: c.riasec, mots: c.mots },
    notee: c.gardee !== null,
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
      // attendre. JAMAIS le contenu d'une réponse ni d'un choix, jamais qui a passé son tour.
      joueurs: js.map((j) => ({ pseudo: j.pseudo, avatar: j.avatar, connecte: j.connecte, aFini: aFini(etat, j) })),
      attenteIA: etat.phase === "competences" && !etat.attribution,
      // L'animateur peut demander une autre idée (le MJ propose, l'animateur valide).
      autreIdeePossible: etat.phase === "competences" && !!etat.attribution && !!etat.idee?.joueurId,
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
  // Sa compétence de l'épisode (idée du tour ou compétence privée), montrée
  // seulement une fois l'idée du tour affichée.
  const competenceDuProbleme = etat.phase === "competences" && etat.problemeIndex !== null && etat.attribution
    ? j.competences.find((c) => c.problemeIndex === etat.problemeIndex) ?? null
    : null;
  const monIdee = etat.phase === "competences" && !!etat.attribution && etat.idee?.joueurId === j.id;
  const apresReponse = ["competences", "debrief", "fin"].includes(etat.phase) || (etat.phase === "reponse" && r?.tour1 != null);
  return {
    ...base,
    moi: {
      id: j.id,
      pseudo: j.pseudo,
      avatar: j.avatar,
      depart: structuredClone(j.depart),
      aLu: !!r?.lu,
      maNote: r?.note ?? null,
      maReponse: r?.tour1 ?? null,
      // A passé son tour (bouton « Je passe ce tour ») / l'animateur est passé sans sa réponse.
      jaiPasse: r?.passe === true,
      sansReponse: r?.tour1 === "" && r?.passe !== true,
      maPreference: r?.preference ?? null,
      // « C'est ton idée ! On affiche ton pseudo ? » : null tant qu'il n'a pas répondu.
      monIdee: monIdee ? { accordPseudo: etat.idee.accordPseudo ?? null } : null,
      // Retour privé de l'épisode : "competence" (ce que ta réponse montre) ou
      // "idee" (pas de compétence cette fois : on lui rappelle son idée) ; null = en attente.
      retourPrive: etat.attribution && !monIdee ? r?.retour ?? null : null,
      peutDonnerPreference: apresReponse && etat.problemeIndex !== null,
      competenceDuProbleme: competenceDuProbleme ? { ...competenceDuProbleme } : null,
      // Compétences encore sans réponse (gardee: null), hors celle du problème en
      // cours déjà montrée dans competenceDuProbleme : compétences de jeu (le
      // joueur répond avec { t:"garder_competence", garder, problemeIndex }) et
      // compétences de départ restées en attente quand l'animateur a clos la
      // création (avec { t:"garder_competence", garder, departIndex }), en premier.
      // Une compétence de l'épisode en cours n'y figure qu'après l'idée du tour.
      competencesEnAttente: j.competences
        .filter((c) => c.gardee === null && c !== competenceDuProbleme
          && (c.problemeIndex !== null || Number.isInteger(c.departIndex))
          && !(c.problemeIndex === etat.problemeIndex && etat.phase === "competences" && !etat.attribution))
        .map((c) => ({ ...c }))
        .sort((a, b) => (a.problemeIndex ?? -1) - (b.problemeIndex ?? -1) || (a.departIndex ?? 0) - (b.departIndex ?? 0)),
      competences: structuredClone(j.competences),
      monDebrief: j.debrief ?? null,
    },
    attenteIA: (etat.phase === "competences" && !etat.attribution) || j.depart.etat === "analyse",
    fin: etat.phase === "fin"
      ? { lienFiche: `/fiche.html?code=${encodeURIComponent(etat.code)}&joueur=${encodeURIComponent(j.id)}` }
      : null,
  };
}
