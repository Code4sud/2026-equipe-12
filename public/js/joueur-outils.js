// Fonctions pures du téléphone du joueur (joueur.js), testables sous Node.
// Aucune logique de jeu : seulement de la mise en forme à partir de la vue.

/** Phases où un minuteur tourne (SPEC §3.1). */
const PHASES_MINUTEUR = new Set(["echange", "echange2", "reponse", "choix"]);

/** Durée nominale (s) du minuteur d'une phase d'après les réglages ; null si inconnue. */
export function dureePhase(phase, reglages) {
  if (!reglages || typeof reglages !== "object") return null;
  const s = phase === "echange" || phase === "echange2" ? reglages.dureeEchange
    : phase === "reponse" || phase === "choix" ? reglages.dureeReponse
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
