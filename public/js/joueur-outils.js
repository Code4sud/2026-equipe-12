// Fonctions pures du téléphone du joueur (joueur.js), testables sous Node.
// Aucune logique de jeu : seulement de la mise en forme à partir de la vue.

/** Phases où un minuteur tourne (SPEC §3.1). */
const PHASES_MINUTEUR = new Set(["reflexion", "echange", "reponse"]);

/** Durée nominale (s) du minuteur d'une phase d'après les réglages ; null si inconnue. */
export function dureePhase(phase, reglages) {
  if (!reglages || typeof reglages !== "object") return null;
  const s = phase === "echange" ? reglages.dureeEchange
    : phase === "reponse" ? reglages.dureeReponse
    : phase === "reflexion" ? reglages.dureeReflexion
    : null;
  return Number.isFinite(s) && s > 0 ? s : null;
}

/**
 * Durée totale (ms) de l'anneau du minuteur, pour que le cercle reste juste
 * même après un rechargement en cours de phase. Par ordre de préférence :
 *  1. vue.minuteurDebut (epoch ms, envoyé par src/jeu.js) → fin - début ;
 *  2. vue.minuteurDuree (ms, envoyé par src/jeu.js) ;
 *  3. vue.reglages (durée nominale de la phase) ;
 *  4. sinon `debutVu` : le moment où ce téléphone a vu ce minuteur pour la
 *     première fois (ancien comportement, inexact après un rechargement).
 * Le total n'est jamais inférieur au temps restant (l'anneau ne dépasse pas 1).
 */
export function totalMinuteur(vue, debutVu, maintenant) {
  const fin = vue?.minuteurFin;
  if (!Number.isFinite(fin)) return null;
  let total = null;
  if (Number.isFinite(vue.minuteurDebut) && vue.minuteurDebut < fin) total = fin - vue.minuteurDebut;
  else if (Number.isFinite(vue.minuteurDuree) && vue.minuteurDuree > 0) total = vue.minuteurDuree;
  else if (PHASES_MINUTEUR.has(vue.phase) && dureePhase(vue.phase, vue.reglages)) total = dureePhase(vue.phase, vue.reglages) * 1000;
  else if (Number.isFinite(debutVu)) total = fin - Math.min(debutVu, fin);
  return Math.max(1, total ?? 0, fin - maintenant);
}

/**
 * La dictée n'est proposée que si le navigateur a la reconnaissance vocale ET
 * que la page est dans un contexte sécurisé (https ou localhost) : sinon le
 * micro est refusé d'office (erreur not-allowed), sans rien que le joueur
 * puisse autoriser.
 */
export function dicteeDisponible(win) {
  if (!win || !win.isSecureContext) return false;
  return typeof (win.SpeechRecognition || win.webkitSpeechRecognition) === "function";
}

/** Vrai pour une compétence de DÉPART restée en attente (création close par l'animateur). */
export const estDepartEnAttente = (c) => !!c && c.problemeIndex == null && Number.isInteger(c.departIndex);

/**
 * Compétences sur lesquelles le joueur n'a pas encore dit « Je la garde /
 * Pas moi » (gardee === null) : compétences gagnées en jeu (l'animateur est
 * passé au problème suivant) et compétences de départ (l'animateur a clos la
 * création avant qu'il valide ; elles portent un `departIndex`), celles de
 * départ en premier. Celle du problème en cours, pendant la phase
 * `competences`, est déjà affichée en grand : on l'exclut. Si le serveur
 * envoie déjà la liste (vue.moi.competencesEnAttente), on la prend telle
 * quelle (mêmes filtres appliqués par sécurité).
 */
export function competencesEnAttente(vue) {
  const moi = vue?.moi;
  const cs = Array.isArray(moi?.competencesEnAttente) ? moi.competencesEnAttente
    : Array.isArray(moi?.competences) ? moi.competences : [];
  const enCours = vue?.phase === "competences" ? vue.problemeIndex : undefined;
  const rang = (c) => (estDepartEnAttente(c) ? -1 : c.problemeIndex);
  return cs
    .filter((c) => c && c.gardee === null && (estDepartEnAttente(c) || (Number.isInteger(c.problemeIndex) && c.problemeIndex !== enCours)))
    .sort((a, b) => rang(a) - rang(b) || (a.departIndex ?? 0) - (b.departIndex ?? 0));
}

/**
 * Message envoyé au serveur pour garder ou retirer une compétence.
 * `cible` : le problemeIndex d'une compétence de jeu (nombre), ou la compétence
 * de départ elle-même / { departIndex } pour une compétence de départ en attente.
 */
export function messageGarder(garder, cible) {
  const m = { t: "garder_competence", garder: !!garder };
  if (Number.isInteger(cible)) m.problemeIndex = cible;
  else if (cible && Number.isInteger(cible.departIndex)) m.departIndex = cible.departIndex;
  return m;
}

/**
 * Libellé du bouton Valider de l'écran « C'est moi / Pas moi » (création) :
 * tant qu'une carte n'est pas tranchée (null), il dit combien il en reste.
 */
export function libelleValiderDepart(choix) {
  const reste = (Array.isArray(choix) ? choix : []).filter((x) => x !== true && x !== false).length;
  if (reste === 0) return "Valider";
  return reste === 1 ? "Encore 1 carte à choisir" : `Encore ${reste} cartes à choisir`;
}

/**
 * Cartes à montrer dans l'outil solo (outil.js) : `max` propositions pas encore
 * tranchées au plus à la fois, les suivantes après décision ; une carte déjà
 * tranchée reste visible. `choix[i]` : null (pas tranché) ou une valeur.
 * Renvoie l'ensemble des index visibles (adaptation `max-3-competences-depart`).
 */
export function cartesVisibles(choix, max = 4) {
  const liste = Array.isArray(choix) ? choix : [];
  const visibles = new Set();
  let enAttente = 0;
  liste.forEach((v, i) => {
    if (v !== null && v !== undefined) visibles.add(i);
    else if (enAttente < max) {
      visibles.add(i);
      enAttente++;
    }
  });
  return visibles;
}

/**
 * Codes de fermeture après lesquels le téléphone NE se reconnecte PAS (SPEC §2.3) :
 * 4001 partie effacée, 4002 page ouverte ailleurs, 4008 trop de messages,
 * 4009 partie déjà commencée. Le message `erreur` reçu juste avant est affiché.
 */
export const FERMETURES_DEFINITIVES = new Set([4001, 4002, 4008, 4009]);
export function fermetureDefinitive(code) {
  return FERMETURES_DEFINITIVES.has(code);
}

/**
 * Décalage (ms) entre l'horloge du serveur et celle du téléphone, à partir du
 * champ `serveur` d'un message { t:"etat" } (SPEC §2.3). L'heure du serveur
 * vaut alors Date.now() + décalage. Sans champ valide : `ancien` (0 par défaut).
 */
export function decalageServeur(message, maintenant, ancien = 0) {
  const s = message?.serveur;
  return Number.isFinite(s) && Number.isFinite(maintenant) ? s - maintenant : ancien;
}

// ---------------------------------------------------------------------------
// Textes et mises en forme partagés par l'écran commun et le téléphone
// ---------------------------------------------------------------------------

/**
 * Annonce du cadre, avant de jouer (adaptation « nouveau-annonce-pas-un-test »,
 * formulation corrigée par la critique psy, point 28), sans les mots interdits
 * partout (SPEC §1).
 */
export const ANNONCE_CADRE = [
  "Ce n'est pas un test noté.",
  "Il n'y a pas de bonne réponse à trouver : on cherche ce que toi, tu ferais.",
  "Les autres joueurs ne voient pas ta réponse. Si elle devient l'idée du tour, un bout de ta phrase s'affiche sur l'écran, sans ton nom sauf si tu dis oui.",
  "Ce que tu écris est lu par une IA et sert à préparer ton entretien avec le psy.",
];

/** Le MJ est une IA (adaptation « nouveau-transparence-ia », AI Act art. 50). */
export const MJ_EST_UNE_IA = "Le maître du jeu (MJ) est une intelligence artificielle. Il ne te note pas : il propose, et c'est toi qui gardes ou refuses chaque compétence, puis tu en parles avec le psy.";

/** Les 3 questions du débrief (adaptation « nouveau-debriefing ») ; la 3e est écrite en privé. */
export const QUESTIONS_DEBRIEF = [
  "Quel moment de l'histoire t'a surpris ?",
  "Quelle idée ou quelle compétence de la partie te ressemble le plus ?",
  "Raconte une fois, dans ta vraie vie, où tu as fait quelque chose comme ça.",
];

/** Message après « Je passe ce tour » (copie de MESSAGE_PASSE, src/texte.js). */
export const MESSAGE_PASSE = "Pas de souci, l'histoire continue. Tu pourras proposer ton idée au prochain épisode.";
/** Au dernier épisode, il n'y a plus de « prochain épisode » (copie de MESSAGE_PASSE_DERNIER). */
export const MESSAGE_PASSE_DERNIER = "Pas de souci, l'histoire continue.";
/** Ce que devient « Je passe ce tour » : jamais dit au groupe, noté pour le psy (décision de Pierre §3). */
export const PASSE_POUR_LE_PSY = "Le groupe ne le saura pas. Ton psy le verra sur ta fiche, pour en parler avec toi s'il le faut.";

/** Message après « Je passe ce tour », selon qu'il reste un épisode ou non. */
export function messagePasse(vue) {
  const dernier = Number.isInteger(vue?.problemeIndex) && Number.isInteger(vue?.nbProblemes) && vue.problemeIndex >= vue.nbProblemes - 1;
  return dernier ? MESSAGE_PASSE_DERNIER : MESSAGE_PASSE;
}

/** Promesse sur les compétences privées (critique psy point 3) : jamais « au moins une ». */
export const PROMESSE_COMPETENCE = "À chaque épisode, chacun a la même chance d'en recevoir une.";

/** Ligne fixe vers un adulte, en fin de partie (adaptation « nouveau-relais-psychologue-fin-de-partie »). */
export const RELAIS_ADULTE = "Si quelque chose te pèse, parles-en au psychologue ou au conseiller du Centre : il est là pour ça.";
/** La même ligne, à la 3e personne, pour une page écrite pour le psychologue (outil solo). */
export const RELAIS_ADULTE_PSY = "Si quelque chose pèse au jeune, il peut en parler au psychologue ou au conseiller du Centre.";

/**
 * Découpe un texte en morceaux courts pour la synthèse vocale : une phrase par
 * morceau, et une phrase trop longue est recoupée aux virgules puis aux mots.
 * Chrome coupe en silence un énoncé de plus de ~15 s avec les voix réseau
 * (« Google français ») : on enchaîne donc plusieurs petits énoncés.
 */
export function decouperPhrases(texte, max = 160) {
  const regrouper = (morceaux, sep) => {
    const out = [];
    for (const m of morceaux) {
      const dernier = out[out.length - 1];
      if (dernier && (dernier + sep + m).length <= max) out[out.length - 1] = dernier + sep + m;
      else out.push(m);
    }
    return out;
  };
  const phrases = String(texte ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
  return phrases.flatMap((ph) => {
    if (ph.length <= max) return [ph];
    return regrouper(ph.split(/(?<=[,;:])\s+/), " ").flatMap((bout) =>
      bout.length <= max ? [bout] : regrouper(bout.split(" "), " "));
  });
}

/** Texte d'un épisode à lire à voix haute : liaison (à partir du 2e), titre, situation, question. */
export function texteEpisode(vue) {
  const p = vue?.probleme;
  if (!p) return "";
  return [vue.liaison, p.titre, p.situation, p.question].filter(Boolean).join(". ").replace(/([.!?…])\s*\./g, "$1");
}

/** Début de phrase (amorce) à préremplir : « D'abord, je… » → « D'abord, je ». */
export function texteAmorce(amorce) {
  return String(amorce ?? "").replace(/[\s.…]+$/u, "").trim() + " ";
}

/**
 * Phrase de la carte « Tu as proposé de … : c'est ce qu'on appelle « libellé ». »
 * Pour ne pas répéter le libellé, la carte coupe la phrase autour de « libellé » :
 * { avant: "Tu as proposé de … : c'est ce qu'on appelle", apres: "" }. null si la
 * phrase ne contient pas le libellé entre guillemets (on l'affiche alors telle quelle).
 */
export function separerMots(mots, libelle) {
  const m = String(mots ?? "");
  const l = String(libelle ?? "").trim();
  if (!m || !l) return null;
  const cible = `« ${l} »`;
  const i = m.indexOf(cible);
  if (i < 0) return null;
  const avant = m.slice(0, i).trim();
  const apres = m.slice(i + cible.length).replace(/^[\s.!…]+$/u, "").trim();
  return avant ? { avant, apres } : null;
}

/**
 * Ce que le téléphone montre en phase `competences` :
 *  - "attente"         : le MJ choisit encore l'idée du tour ;
 *  - "mon-idee"        : c'est son idée (accord pour le pseudo, puis sa compétence) ;
 *  - "passe"           : il a passé son tour (ou l'animateur est passé sans sa réponse) ;
 *  - "competence"      : une compétence privée repérée dans sa réponse ;
 *  - "idee"            : pas de compétence cette fois, on lui rappelle son idée ;
 *  - "attente-retour"  : le MJ lit encore sa réponse.
 */
export function retourEpisode(vue) {
  const moi = vue?.moi;
  if (!moi || vue.phase !== "competences") return null;
  if (vue.attenteIA || !vue.idee) return "attente";
  if (moi.monIdee) return "mon-idee";
  if (moi.jaiPasse || moi.sansReponse) return "passe";
  if (moi.competenceDuProbleme && moi.retourPrive !== "idee") return "competence";
  if (moi.retourPrive === "idee") return "idee";
  return "attente-retour";
}

/** « Ton idée : … » : la reformulation du MJ, sinon sa réponse telle quelle. */
export function texteMonIdee(moi) {
  const r = typeof moi?.maReformulation === "string" ? moi.maReformulation.trim() : "";
  if (r) return /[.!?…»]$/u.test(r) ? r : `${r}.`;
  const rep = typeof moi?.maReponse === "string" ? moi.maReponse.trim() : "";
  return rep ? `Ton idée : « ${rep} »` : "";
}
