// Écran commun (animateur / projecteur) — owner E.
//
// Principe : l'écran n'a AUCUNE logique de jeu. Il se connecte en WebSocket
// (/api/parties/<code>/ws?role=ecran), reçoit après chaque changement une vue
// complète { t:"etat", vue } (SPEC §3.3) et l'affiche telle quelle.
// Les boutons de l'animateur envoient seulement { t:"demarrer" | "suivant" |
// "fin_minuteur" | "autre_idee" | "reglages" } ; c'est le serveur qui décide.
//
// Accès animateur : l'accueil ouvre ecran.html?code=XXXX#cle=<cleEcran>. La clé
// (fragment : jamais envoyé au serveur) est rangée dans sessionStorage sous
// "pc-ecran-<code>", effacée de la barre d'adresse, puis jointe à la connexion
// (?role=ecran&cle=…). Sans la bonne clé, le serveur ferme en 4003 : message
// clair, pas de reconnexion.
//
// Mode démo : ecran.html?demo=1 fait défiler des vues factices de chaque phase
// sans backend (mise au point, captures). Options : &auto=0 (pas de défilement
// automatique), &etape=N (aller directement à l'étape N), &phase=<phase>.
//
// Les fonctions pures sont exportées (tests `node --test`) ; le code qui touche
// au DOM ne s'exécute que dans un navigateur.

import { decouperPhrases, texteEpisode, ANNONCE_CADRE, QUESTIONS_DEBRIEF } from "./joueur-outils.js";

export { decouperPhrases };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const LIBELLES_PHASES = {
  accueil: "Accueil",
  creation: "Création des personnages",
  presentation: "Présentation de l'épisode",
  reflexion: "Réflexion en silence",
  echange: "Discussion",
  reponse: "Réponses sur les téléphones",
  competences: "Compétences",
  debrief: "Débrief",
  fin: "Fin de la partie",
};

export const RIASEC = {
  R: { nom: "Réaliste", verbe: "Faire, réparer, construire" },
  I: { nom: "Investigateur", verbe: "Chercher, comprendre" },
  A: { nom: "Artistique", verbe: "Créer, imaginer" },
  S: { nom: "Social", verbe: "Aider, accompagner" },
  E: { nom: "Entreprenant", verbe: "Convaincre, organiser" },
  C: { nom: "Conventionnel", verbe: "Gérer, être précis" },
};

// Valeurs de repli seulement : les vraies durées arrivent dans vue.reglages
// (discussion automatique selon le nombre de joueurs, SPEC §1).
const DUREES_DEFAUT = { dureeEchange: 120, dureeReponse: 90, dureeReflexion: 30 };
const OPTIONS_ECHANGE = [60, 90, 120, 150, 180, 240, 300];
const OPTIONS_REPONSE = [45, 60, 90, 120, 180];
// Réflexion silencieuse : 0 la désactive (adaptation « nouveau-temps-de-reflexion-individuel »).
const OPTIONS_REFLEXION = [0, 20, 30, 45];
const PHASES_MINUTEUR = new Set(["reflexion", "echange", "reponse"]);

/** Taille de groupe conseillée (adaptation « taille-groupe-1-a-6 »). */
export const TAILLE_CONSEILLEE = "Souvent recommandé : 3 à 5 joueurs (6 maximum).";
/** Aide animateur : un joueur sans téléphone (adaptation « telephone-sans-installation »). */
export const AIDE_TABLETTE = "Un joueur sans téléphone, sans batterie ou sans données ? Donne-lui une tablette du Centre : même QR code ou même code, aucune installation.";

/** Nombre d'épisodes automatique (copie de nbEpisodesParDefaut, src/jeu.js) : 1 par joueur, entre 3 et 6. */
export const episodesAuto = (nbJoueurs) => Math.min(6, Math.max(3, Number(nbJoueurs) || 0));

// ---------------------------------------------------------------------------
// Fonctions pures (testables sous Node)
// ---------------------------------------------------------------------------

export function echapper(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** 83 500 ms → "1:24" (arrondi au-dessus, jamais négatif). */
export function formaterDuree(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 90 → "1 min 30" ; 45 → "45 s" ; 120 → "2 min". */
export function libelleDuree(secondes) {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}

/** Fermeture du serveur quand la clé animateur manque ou est fausse (SPEC §2.3). */
export const CODE_ACCES_REFUSE = 4003;
export const MESSAGE_ACCES_REFUSE = "Cette page animateur n'est accessible que depuis l'ordinateur qui a créé la partie.";

/**
 * Fermetures après lesquelles l'écran NE se reconnecte PAS (SPEC §2.3) :
 * 4001 partie effacée, 4002 écran ouvert ailleurs, 4003 accès animateur refusé,
 * 4008 trop de messages, 4009.
 */
export function fermetureDefinitive(code) {
  return code === 4001 || code === 4002 || code === CODE_ACCES_REFUSE || code === 4008 || code === 4009;
}

const CLE_ECRAN_VALIDE = /^[A-Za-z0-9-]{8,128}$/;

/** Nom de la clé animateur dans sessionStorage. */
export function cleStockageEcran(code) {
  return `pc-ecran-${code}`;
}

/**
 * Lit la clé animateur dans le fragment (« #cle=… »).
 * @returns {{ cle: string|null, present: boolean, reste: string }} `reste` = fragment
 *   à remettre dans l'adresse une fois la clé retirée ("" s'il ne reste rien).
 */
export function lireFragmentCle(hash) {
  const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const present = params.has("cle");
  const cle = params.get("cle");
  params.delete("cle");
  const reste = params.toString();
  return { cle: cle && CLE_ECRAN_VALIDE.test(cle) ? cle : null, present, reste: reste ? `#${reste}` : "" };
}

/**
 * Clé animateur de la partie `code` : celle du fragment (rangée dans `stockage`),
 * sinon celle déjà rangée (rechargement de la page), sinon null.
 * Un stockage indisponible (navigation privée, bloqué) n'empêche pas d'utiliser le fragment.
 */
export function obtenirCleEcran(code, hash, stockage) {
  const nom = cleStockageEcran(code);
  const { cle } = lireFragmentCle(hash);
  if (cle) {
    try { stockage?.setItem(nom, cle); } catch { /* stockage indisponible */ }
    return cle;
  }
  try {
    const rangee = stockage?.getItem(nom);
    return typeof rangee === "string" && CLE_ECRAN_VALIDE.test(rangee) ? rangee : null;
  } catch {
    return null;
  }
}

/** Adresse WebSocket de l'écran, clé animateur comprise. */
export function urlWebSocketEcran(protocole, hote, code, cle) {
  const proto = protocole === "https:" ? "wss:" : "ws:";
  return `${proto}//${hote}/api/parties/${encodeURIComponent(code)}/ws?role=ecran&cle=${encodeURIComponent(cle ?? "")}`;
}

/** Page affichée quand l'accès animateur est refusé (pas de clé, mauvaise clé). */
export function rendreAccesRefuse(code) {
  return `<div class="pile centre large message-plein">
    <h1>Accès animateur refusé</h1>
    <p class="situation">${MESSAGE_ACCES_REFUSE}</p>
    <p class="situation">Tu es joueur ? Rejoins la partie ${echapper(code)} depuis ton téléphone, avec le QR code ou le code.</p>
    <p class="rangee" style="justify-content:center">
      <a class="bouton principal grand" href="index.html">Aller à l'accueil</a>
    </p>
  </div>`;
}

/**
 * Total (ms) de l'anneau du minuteur : vue.minuteurDuree (ou fin - minuteurDebut)
 * envoyé par le serveur, juste même après un rechargement ; sinon la durée nominale.
 */
export function totalMinuteurEcran(vue, nominalMs, maintenant) {
  const fin = vue?.minuteurFin;
  if (!Number.isFinite(fin)) return null;
  let total = null;
  if (Number.isFinite(vue.minuteurDuree) && vue.minuteurDuree > 0) total = vue.minuteurDuree;
  else if (Number.isFinite(vue.minuteurDebut) && vue.minuteurDebut < fin) total = fin - vue.minuteurDebut;
  else total = nominalMs;
  return Math.max(total ?? 0, fin - maintenant, 1000);
}

/** Délai de reconnexion (backoff exponentiel plafonné) pour la n-ième tentative (n ≥ 1). */
export function delaiReconnexion(n) {
  return Math.min(15000, 500 * 2 ** Math.max(1, n));
}

export function codeValide(code) {
  return typeof code === "string" && /^[A-Z]{4}$/.test(code);
}

/**
 * Compteur anonyme { repondu, total } : vue.compte s'il existe, sinon les drapeaux
 * aRepondu des joueurs ; null si la vue ne donne aucun des deux (rien à afficher).
 */
export function compteReponses(vue) {
  const c = vue?.compte;
  if (c && Number.isFinite(c.total)) return { repondu: Math.min(c.repondu ?? 0, c.total), total: c.total };
  const joueurs = Array.isArray(vue?.joueurs) ? vue.joueurs : [];
  const fini = (j) => (typeof j?.aFini === "boolean" ? j.aFini : j?.aRepondu);
  if (!joueurs.length || !joueurs.every((j) => typeof fini(j) === "boolean")) return null;
  return { repondu: joueurs.filter(fini).length, total: joueurs.length };
}

/** Durée nominale (s) du minuteur de la phase, d'après les réglages connus. */
export function dureePhase(phase, reglages = {}) {
  const r = { ...DUREES_DEFAUT, ...reglages };
  if (phase === "echange") return r.dureeEchange;
  if (phase === "reponse") return r.dureeReponse;
  if (phase === "reflexion") return r.dureeReflexion;
  return null;
}

/** 30 → "30 secondes" ; 90 → "1 min 30" (à lire au groupe). */
export function dureeEnClair(secondes) {
  const s = Math.round(Number(secondes) || 0);
  return s < 60 ? `${s} secondes` : libelleDuree(s);
}

/** Progression du minuteur entre 1 (plein) et 0 (fini). */
export function progressionMinuteur(fin, total, maintenant) {
  if (!fin || !total) return 0;
  return Math.max(0, Math.min(1, (fin - maintenant) / total));
}


/**
 * Texte lu par la synthèse vocale : l'annonce du cadre pendant la création, la
 * situation (précédée de la liaison) pendant la présentation, et avant le 1er
 * épisode un rappel court du cadre (« Ce n'est pas un test noté… », lu à voix
 * haute) ; les questions pendant le débrief.
 */
export function texteALire(vue) {
  if (vue?.phase === "creation") return ANNONCE_CADRE.join(" ");
  if (vue?.phase === "debrief") return QUESTIONS_DEBRIEF.join(" ");
  const texte = texteEpisode(vue);
  if (!texte) return "";
  return vue.problemeIndex === 0 ? `${ANNONCE_CADRE.slice(0, 2).join(" ")} ${texte}` : texte;
}

/** Adresse que les téléphones ne peuvent pas joindre (le PC lui-même). */
export function estAdresseLocale(hote) {
  const h = String(hote ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
}

/**
 * Origine utilisée pour le QR code et l'adresse affichée. Par défaut celle de
 * la page ; `?hote=192.168.1.20:8787` (ou une URL http(s) complète) la force,
 * pour un écran ouvert sur localhost. Une valeur invalide est ignorée.
 */
export function origineQR(origine, hote) {
  const brut = String(hote ?? "").trim();
  if (brut) {
    try {
      const u = new URL(/^https?:\/\//i.test(brut) ? brut : `${String(origine).startsWith("https:") ? "https" : "http"}://${brut}`);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname && !u.username && !u.password) return u.origin;
    } catch { /* ignoré */ }
  }
  return String(origine ?? "");
}

/**
 * Raccourci de la télécommande de présentation (→ / Page suivante) : faut-il
 * déclencher l'action principale ? Oui même si le focus est sur un bouton ou un
 * lien de la barre (après un clic, il y reste) ; non dans un champ de saisie.
 */
export function estRaccourciSuivant(e) {
  if (!e || e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.key !== "ArrowRight" && e.key !== "PageDown") return false;
  return !e.target?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}

/**
 * Clé de scène : tant qu'elle ne change pas, on met seulement à jour les parties
 * dynamiques (joueurs, compteur, minuteur) au lieu de tout reconstruire.
 */
export function cleScene(vue) {
  const i = vue?.phase === "competences" ? vue.idee : null;
  return JSON.stringify([
    vue?.phase, vue?.problemeIndex ?? null, vue?.probleme?.id ?? null,
    vue?.fin ?? null,
    vue?.phase === "competences" ? !!vue.attenteIA : null,
    // L'idée du tour : le pseudo apparaît (accord), la compétence est notée.
    i ? [!!i.aucune, i.texte ?? "", i.pseudo ?? "", i.accordPseudo ?? "", !!i.notee] : null,
    vue?.phase === "presentation" ? vue.liaison ?? "" : null,
    vue?.phase === "echange" ? (Array.isArray(vue.joueurs) && vue.joueurs.length === 1) : null,
  ]);
}

/** Boutons de l'animateur pour la phase courante. */
export function commandesPour(vue) {
  const nbJoueurs = Array.isArray(vue?.joueurs) ? vue.joueurs.length : 0;
  switch (vue?.phase) {
    case "accueil":
      return [{ id: "demarrer", libelle: "Commencer", message: { t: "demarrer" }, principal: true,
        desactive: nbJoueurs < 1,
        aide: nbJoueurs < 1 ? "Il faut au moins 1 joueur."
          : nbJoueurs === 1 ? "Un seul joueur : il réfléchit à voix haute avec toi pendant la discussion." : "" }];
    case "creation":
      return [{ id: "suivant", libelle: "Suivant", message: { t: "suivant" }, principal: true,
        aide: "Passe au premier épisode (ceux qui n'ont pas fini commencent sans compétence de départ)." }];
    case "presentation": {
      const sansReflexion = vue.reglages?.dureeReflexion === 0;
      return [{ id: "suivant", libelle: sansReflexion ? "Lancer la discussion" : "Lancer la réflexion", message: { t: "suivant" }, principal: true,
        aide: `${sansReflexion ? "La discussion" : "La réflexion en silence"} démarre seule quand tout le monde a appuyé sur « J'ai lu ». Ce bouton n'attend pas.` }];
    }
    case "reflexion":
      return [{ id: "suivant", libelle: "Lancer la discussion", message: { t: "suivant" }, principal: true,
        aide: "La discussion démarre seule à la fin du temps de réflexion. Ce bouton n'attend pas." }];
    // À la fin du minuteur, la partie N'AVANCE PAS seule : c'est l'animateur qui
    // lance la suite (ou, pour les réponses, le dernier joueur qui répond).
    case "echange":
      return [{ id: "fin_minuteur", libelle: "Passer aux réponses",
        message: { t: "fin_minuteur" }, principal: true,
        aide: vue.tempsEcoule ? "Le temps est écoulé : lance la suite quand le groupe est prêt."
          : "Invite chacun à dire au moins une phrase. Ce bouton arrête la discussion maintenant." }];
    case "reponse":
      return [{ id: "fin_minuteur", libelle: "Continuer sans attendre", message: { t: "fin_minuteur" }, principal: true,
        aide: "La suite démarre seule quand tout le monde a répondu. Chaque réponse écrite peut montrer une compétence : ceux qui n'ont pas encore répondu peuvent le faire jusqu'à la fin du minuteur." }];
    case "competences": {
      const dernier = Number.isFinite(vue.nbProblemes) && vue.problemeIndex >= vue.nbProblemes - 1;
      const liste = [{ id: "suivant", libelle: dernier ? (vue.reglages?.debrief ? "Passer au débrief" : "Voir la fin") : "Épisode suivant",
        message: { t: "suivant" }, principal: true,
        aide: vue.attenteIA ? "Le MJ met du temps : ce bouton relance l'étape avec le MJ de secours."
          : "L'histoire continue seule quand chacun a fait son choix sur son téléphone." }];
      // Le MJ propose, l'animateur valide (adaptation « mj-ia-bienveillant »).
      if (vue.autreIdeePossible) {
        liste.push({ id: "autre_idee", libelle: "Choisir une autre idée", message: { t: "autre_idee" }, principal: false,
          aide: "Le MJ propose, tu valides : cette idée est écartée pour cet épisode et le MJ en choisit une autre parmi les réponses." });
      }
      return liste;
    }
    case "debrief":
      return [{ id: "suivant", libelle: "Voir la fin", message: { t: "suivant" }, principal: true,
        aide: "Termine le débrief : chacun voit sa fiche sur son téléphone." }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Réglages de l'animateur (phase accueil)
// ---------------------------------------------------------------------------

function options(valeurs, actuelle, libelle) {
  const liste = valeurs.includes(actuelle) || !Number.isFinite(actuelle) ? valeurs : [...valeurs, actuelle].sort((a, b) => a - b);
  return liste.map((v) => `<option value="${v}" ${v === actuelle ? "selected" : ""}>${echapper(libelle(v))}</option>`).join("");
}

/**
 * Réglages de la partie, avant de commencer : nombre d'épisodes (automatique =
 * 1 par joueur, entre 3 et 6), réflexion en silence, discussion (automatique
 * selon le nombre de joueurs), réponse, débrief. Chaque champ porte
 * `data-reglage` : on n'envoie que le réglage changé (messageReglage).
 */
export function reglagesHtml(reglages = {}, nbJoueurs = 0) {
  const r = { ...DUREES_DEFAUT, ...reglages };
  const autoEp = r.nbProblemesAuto !== false;
  const nbAuto = autoEp && Number.isFinite(r.nbProblemes) ? r.nbProblemes : episodesAuto(nbJoueurs);
  const episodes = `<option value="auto" ${autoEp ? "selected" : ""}>Auto : ${nbAuto} (1 par joueur, 3 à 6)</option>`
    + [1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${!autoEp && r.nbProblemes === n ? "selected" : ""}>${n} épisode${n > 1 ? "s" : ""}</option>`).join("");
  const autoEch = r.dureeEchangeAuto === true;
  const echange = (autoEch ? `<option value="auto" selected>Auto : ${libelleDuree(r.dureeEchange)} (selon le groupe)</option>` : "")
    + options(OPTIONS_ECHANGE, autoEch ? NaN : r.dureeEchange, libelleDuree);
  const reponse = options(OPTIONS_REPONSE, r.dureeReponse, (v) => (v === 90 ? `${libelleDuree(v)} (2-3 phrases)` : libelleDuree(v)));
  const reflexion = options(OPTIONS_REFLEXION, r.dureeReflexion, (v) => (v === 0 ? "Sans" : libelleDuree(v)));
  return `<div class="reglages" role="group" aria-label="Réglages de la partie">
    <label for="reglage-episodes" title="3 épisodes : 3 types d'activités très différents. 6 épisodes : les 6 types.">Épisodes <select id="reglage-episodes" data-reglage="nbProblemes">${episodes}</select></label>
    <label for="reglage-reflexion" title="Temps de réflexion en silence avant la discussion.">Réflexion <select id="reglage-reflexion" data-reglage="dureeReflexion">${reflexion}</select></label>
    <label for="reglage-echange" title="Par défaut : 1 min 30 jusqu'à 3 joueurs, puis 30 s de plus par joueur.">Discussion <select id="reglage-echange" data-reglage="dureeEchange">${echange}</select></label>
    <label for="reglage-reponse">Réponse <select id="reglage-reponse" data-reglage="dureeReponse">${reponse}</select></label>
    <label for="reglage-debrief"><input type="checkbox" id="reglage-debrief" data-reglage="debrief" ${r.debrief ? "checked" : ""}> Débrief à la fin</label>
  </div>`;
}

/** Message { t:"reglages" } pour UN réglage changé ; null s'il n'y a rien à envoyer. */
export function messageReglage(champ, valeur) {
  switch (champ) {
    case "nbProblemes":
      return { t: "reglages", nbProblemes: valeur === "auto" ? null : Number(valeur) };
    case "debrief":
      return { t: "reglages", debrief: valeur === true || valeur === "true" };
    case "dureeEchange":
    case "dureeReponse":
    case "dureeReflexion": {
      if (valeur === "auto") return null; // l'automatique est déjà actif
      const n = Number(valeur);
      return Number.isInteger(n) ? { t: "reglages", [champ]: n } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Rendu HTML (pur : vue → chaîne)
// ---------------------------------------------------------------------------

function pointsAttente() {
  return '<span class="points-attente" aria-hidden="true"><span></span><span></span><span></span></span>';
}

function blocMinuteur() {
  return `<div class="minuteur" id="minuteur" role="timer" aria-label="Temps restant">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="minuteur-fond" cx="50" cy="50" r="45"></circle>
      <circle class="minuteur-arc" cx="50" cy="50" r="45" pathLength="100"></circle>
    </svg>
    <span class="minuteur-texte" id="minuteur-texte">–:––</span>
  </div>`;
}

function rappelProbleme(vue) {
  const p = vue.probleme;
  if (!p) return "";
  return `<p class="rappel-probleme"><strong>${echapper(p.titre)}</strong>${p.question ? ` · ${echapper(p.question)}` : ""}</p>`;
}

function illustration(p) {
  if (!p?.illustration) return '<div class="illustration-repli" aria-hidden="true">🧩</div>';
  return `<img class="illustration" src="${echapper(p.illustration)}" alt="" data-repli="🧩">`;
}

function boutonLire() {
  return '<div><button type="button" class="bouton discret bouton-lire" id="bouton-lire" aria-pressed="false">🔊 Lire à voix haute</button></div>';
}

/** Blocs mis à jour sans reconstruire la scène. */
export const BLOCS = {
  joueurs(vue) {
    const joueurs = Array.isArray(vue.joueurs) ? vue.joueurs : [];
    if (!joueurs.length) return `<p class="discret">En attente des joueurs ${pointsAttente()}</p><p class="discret">${TAILLE_CONSEILLEE}</p>`;
    const items = joueurs.map((j) => `<li class="${j.connecte === false ? "deconnecte" : ""}">
        <span class="avatar" aria-hidden="true">${echapper(j.avatar)}</span>${echapper(j.pseudo)}${j.connecte === false ? '<span class="visuellement-cache"> (déconnecté)</span>' : ""}
      </li>`).join("");
    const n = joueurs.length;
    return `<p><strong>${n}</strong> joueur${n > 1 ? "s" : ""} ${n === 1 ? "est là" : "sont là"} · <span class="discret">${TAILLE_CONSEILLEE}</span></p>
      <ul class="liste-joueurs">${items}</ul>`;
  },
  avatars(vue) {
    const joueurs = Array.isArray(vue.joueurs) ? vue.joueurs : [];
    return `<ul class="liste-joueurs anonyme" aria-hidden="true">${joueurs.map((j) => `<li><span class="avatar">${echapper(j.avatar)}</span></li>`).join("")}</ul>`;
  },
  // Qui a fini (lu, répondu, fait son choix…) : l'animateur sait qui attendre.
  // Affichage neutre (adaptation « ecran-montre-qui-a-repondu ») : les joueurs
  // restent dans l'ordre d'arrivée dans la partie, jamais dans l'ordre de réponse,
  // « ✓ » pour qui a fini et « ✍️ écrit… » pour les autres, personne n'est mis en
  // avant comme le dernier. Jamais le contenu d'une réponse, jamais qui a passé son tour.
  compte(vue) {
    const c = compteReponses(vue);
    if (!c) return "";
    const { repondu, total } = c;
    const verbe = verbeCompte(vue.phase);
    const enCours = enCoursCompte(vue.phase);
    const joueurs = (Array.isArray(vue.joueurs) ? vue.joueurs : []).filter((j) => typeof j?.aFini === "boolean");
    const detail = joueurs.length
      ? `<ul class="statuts-joueurs">${joueurs.map((j) => `<li class="${j.aFini ? "fait" : "en-cours"}${j.connecte === false ? " deconnecte" : ""}">
            <span class="avatar" aria-hidden="true">${echapper(j.avatar)}</span><span class="pseudo">${echapper(j.pseudo)}</span>
            <span class="marque" aria-hidden="true">${j.aFini ? "✓" : enCours}</span>
            <span class="visuellement-cache">${j.aFini ? "a fini" : "en cours"}${j.connecte === false ? ", déconnecté" : ""}</span>
          </li>`).join("")}</ul>`
      : `<div class="points-anonymes" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="${i < repondu ? "plein" : ""}"></span>`).join("")}</div>`;
    return `<div class="rangee bloc-compte" style="gap:1.2em">
        <span class="compteur" aria-hidden="true">${repondu}/${total}</span>
        <div class="pile serre"><span>${verbe}</span>${detail}</div>
      </div>
      <p class="visuellement-cache">${repondu} sur ${total} ${verbe}</p>`;
  },
  // Minuteur à 0 : la partie attend (pas d'enchaînement automatique).
  temps(vue) {
    if (!vue.tempsEcoule) return "";
    const attente = vue.phase === "reponse"
      ? "On attend ceux qui n'ont pas fini, ou l'animateur passe à la suite."
      : "L'animateur lance la suite quand vous êtes prêts.";
    return `<p class="temps-ecoule" role="status">⏰ Temps écoulé · ${attente}</p>`;
  },
};

function verbeCompte(phase) {
  switch (phase) {
    case "presentation": return "ont lu";
    case "creation": return "sont prêts";
    case "competences": return "ont fait leur choix";
    default: return "ont répondu";
  }
}

function enCoursCompte(phase) {
  switch (phase) {
    case "creation":
    case "reponse": return "✍️ écrit…";
    case "presentation": return "👀 lit…";
    default: return "…";
  }
}

function bloc(nom, vue) {
  return `<div data-bloc="${nom}">${BLOCS[nom](vue)}</div>`;
}

export const SCENES = {
  accueil(vue, ctx) {
    const lien = `${ctx.origine}/p/${vue.code}`;
    const adresse = lien.replace(/^https?:\/\//, "");
    let hote = "";
    try { hote = new URL(ctx.origine).hostname; } catch { /* origine vide (tests) */ }
    // Un téléphone ne peut pas joindre « localhost » : le QR serait inutilisable.
    const alerte = estAdresseLocale(hote)
      ? `<p class="alerte-locale" role="alert"><strong>Animateur :</strong> cet écran est ouvert sur « ${echapper(hote)} », que les téléphones ne peuvent pas joindre. Ouvre l'écran avec l'adresse IP du PC (ex. http://192.168.1.20:8787, serveur lancé avec <code>npx wrangler dev --ip 0.0.0.0</code>), ou ajoute <code>&amp;hote=192.168.1.20:8787</code> à l'adresse de cette page.</p>`
      : "";
    return `<div class="accueil-grille apparition">
      <div class="qr-boite" id="qr" data-lien="${echapper(lien)}"><div class="qr-repli">${echapper(adresse)}</div></div>
      <div class="pile large">
        ${alerte}
        <div class="pile serre">
          <p class="surtitre">Rejoins la partie avec ton téléphone</p>
          <h1>Scanne le QR code</h1>
          <p class="adresse-rejoindre">ou va sur <strong>${echapper(adresse.replace(/\/p\/.*/, ""))}</strong> et tape le code :</p>
        </div>
        <p class="code-geant" aria-label="Code de la partie : ${echapper(String(vue.code).split("").join(" "))}">${echapper(vue.code)}</p>
        ${bloc("joueurs", vue)}
        <p class="discret aide-animateur">${echapper(AIDE_TABLETTE)}</p>
      </div>
    </div>`;
  },

  // Avant le 1er épisode : le cadre, à lire à voix haute (adaptation
  // « nouveau-annonce-pas-un-test », critique psy point 28) et le MJ est une IA
  // (adaptation « nouveau-transparence-ia »).
  creation(vue) {
    return `<div class="pile centre large apparition message-plein">
      <p class="surtitre">Étape 1 · Ton personnage</p>
      <h1>Chacun crée son personnage sur son téléphone</h1>
      <p class="situation">Raconte 1 ou 2 choses que tu as déjà faites dans la vraie vie. Le maître du jeu est une IA : il te propose des compétences, et c'est toi qui décides de les garder ou non.</p>
      <div class="annonce-cadre pile serre">
        <p class="surtitre">Avant de jouer</p>
        ${ANNONCE_CADRE.map((ph) => `<p>${echapper(ph)}</p>`).join("")}
      </div>
      ${boutonLire()}
      ${bloc("compte", vue)}
    </div>`;
  },

  presentation(vue) {
    const p = vue.probleme ?? {};
    const premier = vue.problemeIndex === 0;
    return `<div class="probleme-grille apparition">
      ${illustration(p)}
      <div class="pile large">
        ${vue.liaison ? `<p class="liaison">${echapper(vue.liaison)}</p>` : ""}
        ${premier ? `<p class="annonce-cadre courte">${echapper(ANNONCE_CADRE[0])} ${echapper(ANNONCE_CADRE[1])}</p>` : ""}
        <div class="pile serre">
          <p class="surtitre">Le tournoi du quartier · Épisode ${(vue.problemeIndex ?? 0) + 1}${vue.nbProblemes ? ` sur ${vue.nbProblemes}` : ""}</p>
          <h1>${echapper(p.titre)}</h1>
        </div>
        <p class="situation">${echapper(p.situation)}</p>
        <p class="question">${echapper(p.question)}</p>
        ${boutonLire()}
        <p class="discret">Quand tu as lu, appuie sur « J'ai lu » sur ton téléphone.</p>
        ${bloc("compte", vue)}
      </div>
    </div>`;
  },

  // Réflexion silencieuse avant l'oral (adaptations « ordre-oral-puis-ecrit »,
  // « nouveau-temps-de-reflexion-individuel »).
  reflexion(vue) {
    const s = Number.isFinite(vue.minuteurDuree) && vue.minuteurDuree > 0
      ? Math.round(vue.minuteurDuree / 1000)
      : dureePhase("reflexion", vue.reglages);
    return `<div class="minuteur-grille apparition">
      ${blocMinuteur()}
      <div class="pile large">
        <p class="surtitre">Chacun pour soi</p>
        <p class="consigne-geante">Réfléchis en silence</p>
        <p class="situation">${echapper(dureeEnClair(s))} en silence : chacun réfléchit à ce qu'il ferait. On en parle juste après.</p>
        <p class="discret">Tu peux noter un mot sur ton téléphone pour ne pas l'oublier : personne ne le verra.</p>
        ${rappelProbleme(vue)}
      </div>
    </div>`;
  },

  // Tour de table puis discussion libre (adaptation « nouveau-relance-equite-de-parole ») ;
  // seul, on réfléchit à voix haute avec l'animateur (adaptation « taille-groupe-1-a-6 »).
  echange(vue) {
    const seul = Array.isArray(vue.joueurs) && vue.joueurs.length === 1;
    return `<div class="minuteur-grille apparition">
      ${blocMinuteur()}
      <div class="pile large">
        <p class="surtitre">À vous de jouer</p>
        ${seul
          ? `<p class="consigne-geante">Réfléchis à voix haute avec l'animateur</p>
             <p class="situation">Dis ce que tu ferais, comme ça te vient. Rien à écrire pour l'instant.</p>`
          : `<p class="consigne-geante">Tour de table&nbsp;!</p>
             <p class="situation">Chacun dit son idée en une phrase, sans être coupé. Ensuite, discussion libre. Rien à écrire pour l'instant.</p>`}
        ${bloc("temps", vue)}
        ${rappelProbleme(vue)}
      </div>
    </div>`;
  },

  reponse(vue) {
    return `<div class="minuteur-grille apparition">
      ${blocMinuteur()}
      <div class="pile large">
        <p class="surtitre">Chacun pour soi</p>
        <p class="consigne-geante">Écrivez votre réponse sur votre téléphone</p>
        <p class="situation">Toutes les idées comptent. Chaque réponse est privée : les autres joueurs ne la voient pas. Le maître du jeu est une IA : il propose, tu décides.</p>
        ${bloc("temps", vue)}
        ${bloc("compte", vue)}
        ${rappelProbleme(vue)}
      </div>
    </div>`;
  },

  // L'idée du tour : d'abord sans nom ; le pseudo n'apparaît que si son auteur
  // accepte sur son téléphone (décision de Pierre §2). Les compétences privées
  // restent sur les téléphones.
  competences(vue) {
    if (vue.attenteIA || !vue.idee) {
      return `<div class="pile centre large mj-reflechit apparition">
        <div class="bulle" aria-hidden="true">💡</div>
        <h1>Le MJ lit vos idées ${pointsAttente()}</h1>
        <p class="situation discret">Le MJ est une IA : il propose une idée qui fait avancer l'histoire, l'animateur valide.</p>
      </div>`;
    }
    if (vue.idee.aucune) {
      return `<div class="pile centre large apparition message-plein">
        <p class="surtitre">L'idée du tour</p>
        <h1>Pas d'idée retenue cette fois</h1>
        <p class="situation">L'histoire continue : à vous de jouer au prochain épisode !</p>
      </div>`;
    }
    const i = vue.idee;
    const k = Array.isArray(i.competence?.riasec) ? i.competence.riasec.find((x) => RIASEC[x]) : null;
    const auteur = i.pseudo
      ? `<p class="idee-auteur"><span class="avatar grand" aria-hidden="true">${echapper(i.avatar ?? "")}</span> L'idée de ${echapper(i.pseudo)}</p>`
      : "";
    const statut = i.notee
      ? "✓ Notée sur la fiche papier. L'histoire continue…"
      : `${i.pseudo ? echapper(i.pseudo) : "Son auteur"} l'écrit sur sa fiche papier…`;
    return `<div class="pile centre large apparition message-plein idee-du-tour" style="max-width:1300px">
      <p class="surtitre">L'idée du tour</p>
      <h1>Cette idée fait avancer l'histoire&nbsp;:</h1>
      <blockquote class="idee-texte">« ${echapper(i.texte ?? "")} »</blockquote>
      ${auteur}
      <div class="idee-competence${k ? ` riasec-${k}` : ""}">
        <p class="discret">Compétence repérée</p>
        <p class="idee-libelle">${k ? `<span class="puce-riasec" aria-hidden="true">${k}</span> ` : ""}${echapper(i.competence?.libelle ?? "")}</p>
      </div>
      <p class="situation discret">${statut}</p>
      <p class="situation">Regardez vos téléphones : chacun retrouve ce que sa réponse montre.</p>
      ${bloc("compte", vue)}
    </div>`;
  },

  // Court débrief collectif avant la fiche (adaptation « nouveau-debriefing »).
  debrief() {
    return `<div class="pile centre large apparition message-plein" style="max-width:1300px">
      <p class="surtitre">Avant la fiche · Débrief</p>
      <h1>On en parle ensemble</h1>
      <ol class="questions-debrief">${QUESTIONS_DEBRIEF.map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
      <p class="situation discret">La dernière question, tu peux y répondre par écrit sur ton téléphone : personne d'autre ne le voit, et ça ira sur ta fiche pour en parler avec le psy.</p>
      ${boutonLire()}
    </div>`;
  },

  // Fin collective, sans éloge général (adaptation « fin-collective ») : on renvoie
  // aux traces écrites (« trace », pas « preuve » : critique psy point 2).
  fin(vue) {
    const n = vue.fin?.nbCompetencesTotal;
    return `<div class="pile centre large apparition message-plein" style="max-width:1300px">
      <div class="palette-riasec" aria-hidden="true">${Object.keys(RIASEC).map((k) => `<span class="riasec-${k}"></span>`).join("")}</div>
      <h1 class="fin-titre">Bravo l'équipe&nbsp;!</h1>
      ${Number.isFinite(n) && n > 0 ? `<p class="fin-chiffre">Ensemble, vous avez fait apparaître <strong>${n}</strong> compétence${n > 1 ? "s" : ""}.</p>` : ""}
      <p class="situation">Vos idées ont fait avancer l'histoire. Chaque compétence repérée garde la trace de vos propres mots. Ta fiche t'attend sur ton téléphone : tu peux l'imprimer et en parler avec le psy ou le conseiller.</p>
      <p class="discret">Merci d'avoir joué. Rien n'est gardé après la partie.</p>
    </div>`;
  },
};

/** HTML complet de la scène pour une vue. */
export function rendreScene(vue, ctx = { origine: "" }) {
  const scene = SCENES[vue?.phase];
  if (!scene) {
    return `<div class="pile centre"><h1>Un instant ${pointsAttente()}</h1></div>`;
  }
  return scene(vue, ctx);
}

// ---------------------------------------------------------------------------
// Mode démo : vues factices (données inventées)
// ---------------------------------------------------------------------------

const DEMO_PROBLEMES = [
  {
    id: "budget-tournoi",
    titre: "Le budget du tournoi",
    illustration: "illustrations/budget-tournoi.svg",
    situation: "Le club de foot du quartier vous confie l'organisation de son premier tournoi des jeunes, dans un mois. Huit équipes sont attendues, et le club vous donne 150 euros pour tout : ballons, goûter, coupe et récompenses. À vous de décider comment utiliser cet argent.",
    question: "Que faites-vous ?"
  },
  {
    id: "affiche-tournoi",
    titre: "L'affiche du tournoi",
    illustration: "illustrations/affiche-tournoi.svg",
    situation: "Le budget est bouclé. Mais à trois semaines du tournoi, presque personne dans le quartier n'est au courant, et il manque encore des équipes. Le club vous demande de faire l'affiche et de faire venir des joueurs et du public.",
    question: "Que faites-vous ?"
  }
];

/** Phrase de liaison factice (écrite par le MJ, sans pseudo ni jugement). */
const DEMO_LIAISON = "La liste des achats et les prix comparés ont permis de boucler le budget. Reste à faire connaître le tournoi.";

const DEMO_JOUEURS = [
  { pseudo: "Lina", avatar: "🦊", connecte: true },
  { pseudo: "Sam", avatar: "🐼", connecte: true },
  { pseudo: "Noa", avatar: "🦉", connecte: false },
  { pseudo: "Yanis", avatar: "🐸", connecte: true },
];

const DEMO_REGLAGES = { nbProblemes: 4, nbProblemesAuto: true, dureeEchange: 120, dureeEchangeAuto: true, dureeReponse: 90, dureeReflexion: 30, debrief: true };

/** Liste des vues factices (une par étape du défilement), dépend de l'heure `maintenant`. */
export function vuesDemo(maintenant = Date.now(), code = "KDMZ") {
  const base = { code, nbProblemes: 2, minuteurFin: null, fin: null, reglages: { ...DEMO_REGLAGES, nbProblemes: 2, nbProblemesAuto: false } };
  const joueurs = (n, repondu = 0) => DEMO_JOUEURS.slice(0, n).map((j, i) => ({ ...j, aFini: i < repondu }));
  const pb = (i, phase, extra = {}) => ({ ...base, phase, problemeIndex: i, probleme: DEMO_PROBLEMES[i], liaison: i > 0 ? DEMO_LIAISON : null, joueurs: joueurs(4), compte: null, ...extra });
  const minuteur = (s) => ({ minuteurFin: maintenant + s * 1000, minuteurDebut: maintenant, minuteurDuree: s * 1000 });
  const ideeLina = { texte: "On fait la liste de ce qu'il faut et on compare les prix avant d'acheter", competence: { code: "4C101", libelle: "Élaborer, suivre et piloter un budget", riasec: ["C"] } };
  // En `competences`, le compte ne porte que sur ceux qui ont quelque chose à trancher.
  const choix = (n) => DEMO_JOUEURS.map((j, i) => ({ ...j, aFini: i === 2 ? null : i < n }));
  const accueil = (n, reglages = DEMO_REGLAGES) => ({ ...base, phase: "accueil", problemeIndex: null, probleme: null, joueurs: joueurs(n), compte: null, reglages: { ...reglages } });
  return [
    accueil(0, { ...DEMO_REGLAGES, nbProblemes: 3, dureeEchange: 90 }),
    accueil(1, { ...DEMO_REGLAGES, nbProblemes: 3, dureeEchange: 90 }),
    accueil(4),
    { ...base, phase: "creation", problemeIndex: null, probleme: null, joueurs: joueurs(4), compte: { repondu: 1, total: 4 } },
    { ...base, phase: "creation", problemeIndex: null, probleme: null, joueurs: joueurs(4, 3), compte: { repondu: 3, total: 4 } },
    pb(0, "presentation", { joueurs: joueurs(4, 2), compte: { repondu: 2, total: 4 } }),
    pb(0, "reflexion", minuteur(30)),
    pb(0, "echange", minuteur(120)),
    pb(0, "echange", { ...minuteur(90), joueurs: joueurs(1) }),
    pb(0, "reponse", { ...minuteur(90), joueurs: joueurs(4, 1), compte: { repondu: 1, total: 4 } }),
    pb(0, "reponse", { minuteurFin: maintenant + 12_000, minuteurDebut: maintenant - 78_000, minuteurDuree: 90_000, joueurs: joueurs(4, 3), compte: { repondu: 3, total: 4 } }),
    pb(0, "competences", { attenteIA: true }),
    // L'idée s'affiche d'abord sans nom ; son auteur décide sur son téléphone.
    pb(0, "competences", { idee: { pseudo: null, avatar: null, accordPseudo: null, ...ideeLina, notee: false }, autreIdeePossible: true, joueurs: choix(1), compte: { repondu: 1, total: 3 } }),
    pb(0, "competences", { idee: { pseudo: "Lina", avatar: "🦊", accordPseudo: true, ...ideeLina, notee: true }, autreIdeePossible: true, joueurs: choix(2), compte: { repondu: 2, total: 3 } }),
    pb(1, "presentation"),
    pb(1, "reflexion", minuteur(30)),
    pb(1, "echange", minuteur(120)),
    pb(1, "reponse", { ...minuteur(90), compte: { repondu: 2, total: 4 } }),
    pb(1, "competences", { attenteIA: true }),
    pb(1, "competences", { idee: { pseudo: null, avatar: null, accordPseudo: false, texte: "on poste l'affiche en story et on la colle à la boulangerie et au lycée", competence: { code: "6A107", libelle: "Utiliser les réseaux sociaux", riasec: ["C", "S"] }, notee: true }, autreIdeePossible: true }),
    { ...base, phase: "debrief", problemeIndex: 1, probleme: null, joueurs: joueurs(4), compte: null },
    { ...base, phase: "fin", problemeIndex: 1, probleme: null, joueurs: joueurs(4), compte: null, fin: { nbCompetencesTotal: 15 } },
  ];
}

// ---------------------------------------------------------------------------
// Navigateur
// ---------------------------------------------------------------------------

if (typeof window !== "undefined" && typeof document !== "undefined") {
  demarrerEcran();
}

function demarrerEcran() {
  const params = new URLSearchParams(location.search);
  const demo = params.get("demo") === "1";
  const code = demo ? "KDMZ" : (params.get("code") ?? "").trim().toUpperCase();
  // Clé animateur (pas en démo) : fragment → sessionStorage, puis fragment effacé.
  let stockageSession = null;
  try { stockageSession = window.sessionStorage; } catch { /* bloqué */ }
  const cleEcran = !demo && codeValide(code) ? obtenirCleEcran(code, location.hash, stockageSession) : null;
  const fragment = lireFragmentCle(location.hash);
  if (fragment.present) {
    try {
      history.replaceState(history.state, "", `${location.pathname}${location.search}${fragment.reste}`);
    } catch { /* pas grave : la clé reste seulement visible dans la barre d'adresse */ }
  }

  const $ = (id) => document.getElementById(id);
  const scene = $("scene");
  const commandes = $("commandes");
  const statut = $("statut");
  const annonce = $("annonce");
  const toastEl = $("toast");

  const local = {
    vue: null,
    cle: null,
    signatureCommandes: null,
    ws: null,
    tentatives: 0,
    minuteur: { fin: null, total: null },
    reglages: { ...DUREES_DEFAUT },
    reconnexion: null,
    decalage: 0, // heure du serveur - heure locale (ms), SPEC §2.3
    definitif: false, // fermeture 4001/4002/4003/4008/4009 : pas de reconnexion
    derniereErreur: "",
  };

  // ---- Utilitaires d'interface ----
  let toastTimer = null;
  function toast(message, duree = 4000) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, duree);
  }

  function majStatut(etatConnexion, texte) {
    statut.dataset.etat = etatConnexion;
    statut.textContent = texte;
  }

  // ---- Affichage d'une vue ----
  function afficher(vue) {
    if (!vue || typeof vue !== "object") return;
    local.vue = vue;
    if (vue.reglages) Object.assign(local.reglages, vue.reglages);

    $("code-entete").textContent = vue.code ?? code ?? "····";
    majProgression(vue);

    const cle = cleScene(vue);
    if (cle !== local.cle) {
      const anciennePhase = local.vue && local.cle ? JSON.parse(local.cle)[0] : null;
      local.cle = cle;
      arreterLecture();
      scene.innerHTML = rendreScene(vue, { origine: origineQR(location.origin, params.get("hote")) });
      apresRendu(vue);
      const titre = vue.probleme?.titre ? ` : ${vue.probleme.titre}` : "";
      annonce.textContent = `${LIBELLES_PHASES[vue.phase] ?? vue.phase}${titre}`;
      if (vue.phase === "presentation" && anciennePhase !== "presentation" && !demo) {
        setTimeout(() => lire(texteALire(vue)), 700);
      }
    } else {
      majBlocs(vue);
    }
    majMinuteur(vue);
    majCommandes(vue);
  }

  function majBlocs(vue) {
    for (const el of scene.querySelectorAll("[data-bloc]")) {
      const html = BLOCS[el.dataset.bloc]?.(vue);
      if (html != null && html !== el.dataset.html) {
        el.innerHTML = html;
        el.dataset.html = html;
      }
    }
  }

  function apresRendu(vue) {
    for (const el of scene.querySelectorAll("[data-bloc]")) el.dataset.html = el.innerHTML;
    // Illustration manquante → emoji de repli.
    for (const img of scene.querySelectorAll("img[data-repli]")) {
      img.addEventListener("error", () => {
        const repli = document.createElement("div");
        repli.className = "illustration-repli";
        repli.setAttribute("aria-hidden", "true");
        repli.textContent = img.dataset.repli;
        img.replaceWith(repli);
      }, { once: true });
    }
    // QR code.
    const qr = scene.querySelector("#qr");
    if (qr) dessinerQR(qr, qr.dataset.lien);
    // Bouton 🔊.
    const boutonLire = scene.querySelector("#bouton-lire");
    if (boutonLire) {
      if (!("speechSynthesis" in window)) boutonLire.hidden = true;
      boutonLire.addEventListener("click", () => {
        if (speechSynthesis.speaking || speechSynthesis.pending) arreterLecture();
        else lire(texteALire(vue));
      });
    }
  }

  function dessinerQR(conteneur, lien) {
    if (typeof window.qrcode !== "function") return; // repli : l'adresse en texte reste affichée
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(lien);
      qr.make();
      conteneur.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: `QR code pour rejoindre : ${lien}` });
    } catch (err) {
      console.warn("QR code impossible", err);
    }
  }

  function majProgression(vue) {
    const el = $("progression");
    const n = vue.nbProblemes;
    const enJeu = !["accueil", "creation"].includes(vue.phase);
    if (!Number.isFinite(n) || n < 1 || !enJeu) {
      el.innerHTML = "";
      el.removeAttribute("aria-label");
      return;
    }
    const toutFait = vue.phase === "fin" || vue.phase === "debrief";
    const i = toutFait ? n : vue.problemeIndex ?? 0;
    el.setAttribute("aria-label", toutFait ? "Tous les épisodes sont faits" : `Épisode ${i + 1} sur ${n}`);
    el.innerHTML = Array.from({ length: n }, (_, k) =>
      `<span class="etape-pb${k < i ? " faite" : k === i ? " en-cours" : ""}"></span>`).join("");
  }

  // ---- Minuteur (calculé depuis vue.minuteurFin et l'horloge locale) ----
  function majMinuteur(vue) {
    const fin = PHASES_MINUTEUR.has(vue.phase) ? vue.minuteurFin : null;
    const nominal = (dureePhase(vue.phase, local.reglages) ?? 0) * 1000;
    local.minuteur = { fin, total: fin ? totalMinuteurEcran(vue, nominal, Date.now() + local.decalage) : null };
    tic();
  }

  function tic() {
    const el = document.getElementById("minuteur");
    if (!el) return;
    const { fin, total } = local.minuteur;
    const texte = document.getElementById("minuteur-texte");
    if (!fin) {
      el.style.setProperty("--progression", "0");
      texte.textContent = "–:––";
      return;
    }
    const maintenant = Date.now() + local.decalage; // heure du serveur
    const restant = fin - maintenant;
    el.style.setProperty("--progression", String(progressionMinuteur(fin, total, maintenant)));
    texte.textContent = formaterDuree(restant);
    el.classList.toggle("bientot", restant > 0 && restant <= 10_000);
    el.classList.toggle("fini", restant <= 0);
    el.setAttribute("aria-label", restant > 0 ? `Temps restant : ${formaterDuree(restant)}` : "Temps écoulé");
  }
  setInterval(tic, 250);

  // ---- Synthèse vocale (fr-FR) ----
  let voixFr = null;
  function choisirVoix() {
    if (!("speechSynthesis" in window)) return;
    const voix = speechSynthesis.getVoices();
    voixFr = voix.find((v) => v.lang === "fr-FR" && /natural|google|online/i.test(v.name))
      ?? voix.find((v) => v.lang === "fr-FR")
      ?? voix.find((v) => v.lang?.toLowerCase().startsWith("fr"))
      ?? null;
  }
  if ("speechSynthesis" in window) {
    choisirVoix();
    speechSynthesis.addEventListener?.("voiceschanged", choisirVoix);
  }

  // Une utterance par phrase (decouperPhrases) : un seul long énoncé est coupé
  // en silence au bout de ~15 s par Chrome avec les voix réseau.
  let lectureEnCours = 0;
  const etatBouton = (actif) => {
    const b = document.getElementById("bouton-lire");
    if (!b) return;
    b.setAttribute("aria-pressed", String(actif));
    b.textContent = actif ? "⏹ Arrêter la lecture" : "🔊 Lire à voix haute";
  };

  function lire(texte) {
    if (!texte || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const phrases = decouperPhrases(texte);
    if (!phrases.length) return;
    const lecture = ++lectureEnCours; // ignore les événements d'une lecture annulée
    phrases.forEach((phrase, i) => {
      const u = new SpeechSynthesisUtterance(phrase);
      u.lang = "fr-FR";
      if (voixFr) u.voice = voixFr;
      u.rate = 0.95;
      if (i === 0) u.onstart = () => { if (lecture === lectureEnCours) etatBouton(true); };
      if (i === phrases.length - 1) u.onend = () => { if (lecture === lectureEnCours) etatBouton(false); };
      u.onerror = () => { if (lecture === lectureEnCours) etatBouton(false); };
      speechSynthesis.speak(u);
    });
    etatBouton(true);
  }

  function arreterLecture() {
    lectureEnCours++;
    etatBouton(false);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  // ---- Commandes de l'animateur ----
  function majCommandes(vue) {
    const liste = commandesPour(vue);
    const reglages = vue.phase === "accueil";
    const nbJoueurs = Array.isArray(vue.joueurs) ? vue.joueurs.length : 0;
    const signature = JSON.stringify([liste, reglages && local.reglages, reglages && nbJoueurs, vue.phase]);
    if (signature === local.signatureCommandes) return;
    local.signatureCommandes = signature;

    const focusId = document.activeElement?.closest?.("#commandes") ? document.activeElement.id : null;

    let html = liste.map((c) => `<button type="button" class="bouton ${c.principal ? "principal" : "discret"}"
        id="cmd-${c.id}" data-cmd="${c.id}" ${c.desactive ? "disabled" : ""}
        ${c.aide ? `title="${echapper(c.aide)}"` : ""}>${echapper(c.libelle)}</button>`).join("");
    if (reglages) html += reglagesHtml(local.reglages, nbJoueurs);
    if (vue.phase === "fin") {
      html += '<a class="bouton principal" id="cmd-nouvelle" href="index.html">Nouvelle partie</a>';
    }
    commandes.innerHTML = html;
    $("raccourcis").hidden = !liste.some((c) => c.principal);

    for (const b of commandes.querySelectorAll("[data-cmd]")) {
      const c = liste.find((x) => x.id === b.dataset.cmd);
      b.addEventListener("click", () => envoyer(c.message));
    }
    // Un seul réglage envoyé à la fois : la discussion et le nombre d'épisodes
    // restent automatiques tant que l'animateur n'y touche pas.
    for (const champ of commandes.querySelectorAll("[data-reglage]")) {
      champ.addEventListener("change", () => {
        const valeur = champ.type === "checkbox" ? champ.checked : champ.value;
        const message = messageReglage(champ.dataset.reglage, valeur);
        if (message) envoyer(message);
      });
    }
    if (focusId) {
      const cible = document.getElementById(focusId) ?? commandes.querySelector(".bouton.principal");
      cible?.focus();
    }
  }

  // Raccourci clavier (télécommande de présentation) : → / Page suivante = action principale.
  // Marche aussi quand le focus est resté sur un bouton (après un clic à la souris,
  // majCommandes le remet sur le bouton principal) ; pas dans un champ de saisie.
  document.addEventListener("keydown", (e) => {
    if (!estRaccourciSuivant(e)) return;
    const b = commandes.querySelector("button.principal:not(:disabled)");
    if (b) { e.preventDefault(); b.click(); }
  });

  // Plein écran.
  const boutonPleinEcran = $("bouton-plein-ecran");
  if (!document.documentElement.requestFullscreen) boutonPleinEcran.hidden = true;
  boutonPleinEcran.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => {
    boutonPleinEcran.textContent = document.fullscreenElement ? "Quitter le plein écran" : "Plein écran";
  });

  // Garder l'écran allumé pendant la partie (si le navigateur le permet).
  let verrou = null;
  async function garderEveille() {
    try { verrou = await navigator.wakeLock?.request("screen"); } catch { /* pas grave */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!verrou || verrou.released)) garderEveille();
    if (document.visibilityState === "visible" && !demo && !local.ws) reconnecterMaintenant();
  });
  garderEveille();

  // ---- Envoi ----
  let envoyerDemo = null;
  function envoyer(message) {
    if (envoyerDemo) return envoyerDemo(message);
    const ws = local.ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    else toast("Connexion perdue : nouvelle tentative en cours…");
  }

  // ---- WebSocket + reconnexion automatique ----
  function connecter() {
    if (local.definitif) return;
    clearTimeout(local.reconnexion);
    local.reconnexion = null;
    const url = urlWebSocketEcran(location.protocol, location.host, code, cleEcran);
    majStatut("attente", "Connexion…");
    let ws;
    try { ws = new WebSocket(url); } catch { planifierReconnexion(); return; }
    local.ws = ws;
    ws.addEventListener("open", () => {
      local.tentatives = 0;
      majStatut("ok", "Connecté");
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg?.t === "etat") {
        if (Number.isFinite(msg.serveur)) local.decalage = msg.serveur - Date.now();
        afficher(msg.vue);
      } else if (msg?.t === "erreur") {
        local.derniereErreur = msg.message || "";
        // Refus animateur : on l'affiche tout de suite, sans attendre l'événement close
        // (qui peut arriver plusieurs secondes plus tard selon le client WebSocket).
        if (/^Accès animateur refusé/.test(local.derniereErreur)) {
          local.definitif = true;
          local.ws = null;
          try { stockageSession?.removeItem(cleStockageEcran(code)); } catch { /* bloqué */ }
          try { ws.close(); } catch { /* déjà fermée */ }
          accesRefuse();
          return;
        }
        toast(msg.message || "Action impossible pour l'instant.");
      }
    });
    ws.addEventListener("close", (ev) => {
      if (local.ws !== ws) return;
      local.ws = null;
      if (ev.code === CODE_ACCES_REFUSE) {
        local.definitif = true;
        try { stockageSession?.removeItem(cleStockageEcran(code)); } catch { /* bloqué */ }
        accesRefuse();
        return;
      }
      if (fermetureDefinitive(ev.code)) {
        // Partie effacée, écran ouvert ailleurs… : pas de reconnexion (SPEC §2.3).
        local.definitif = true;
        majStatut("erreur", local.derniereErreur || "Déconnecté");
        if (local.derniereErreur) toast(local.derniereErreur, 15000);
        return;
      }
      planifierReconnexion();
    });
  }

  function planifierReconnexion() {
    local.tentatives += 1;
    const delai = delaiReconnexion(local.tentatives);
    majStatut("erreur", `Hors ligne · nouvelle tentative dans ${Math.round(delai / 1000)} s`);
    if (!local.vue && local.tentatives >= 4) {
      scene.innerHTML = `<div class="pile centre large message-plein">
        <h1>Impossible de joindre la partie ${echapper(code)}</h1>
        <p class="situation">Vérifie la connexion, ou que la partie existe encore. On réessaie tout seul.</p>
        <p><a class="bouton principal" href="index.html">Créer une nouvelle partie</a></p>
      </div>`;
    }
    local.reconnexion = setTimeout(connecter, delai);
  }

  /** Pas de clé ou mauvaise clé : message clair, aucune commande, pas de reconnexion. */
  function accesRefuse() {
    local.definitif = true;
    clearTimeout(local.reconnexion);
    local.reconnexion = null;
    toastEl.hidden = true;
    majStatut("erreur", "Accès animateur refusé");
    commandes.innerHTML = "";
    scene.innerHTML = rendreAccesRefuse(code);
    annonce.textContent = "Accès animateur refusé";
  }

  function reconnecterMaintenant() {
    if (local.ws || local.definitif) return;
    local.tentatives = 0;
    connecter();
  }
  window.addEventListener("online", reconnecterMaintenant);

  // ---- Démarrage ----
  if (demo) {
    demarrerDemo();
  } else if (!codeValide(code)) {
    majStatut("erreur", "Pas de partie");
    scene.innerHTML = `<div class="pile centre large message-plein">
      <h1>Aucune partie ouverte</h1>
      <p class="situation">L'écran commun s'ouvre depuis l'accueil, avec « Créer une partie ».</p>
      <p class="rangee" style="justify-content:center">
        <a class="bouton principal grand" href="index.html">Aller à l'accueil</a>
        <a class="bouton secondaire grand" href="ecran.html?demo=1">Voir la démo</a>
      </p>
    </div>`;
  } else if (!cleEcran) {
    // Lien partagé ou recopié (sans clé) : inutile de demander au serveur.
    accesRefuse();
  } else {
    document.title = `Partie ${code} — Déclic`;
    connecter();
  }

  // ---- Mode démo (?demo=1) ----
  function demarrerDemo() {
    const auto = params.get("auto") !== "0";
    const PAS_MS = 6000;
    let vues = vuesDemo();
    let i = 0;
    const phaseDemandee = params.get("phase");
    const etapeDemandee = Number(params.get("etape"));
    if (phaseDemandee) i = Math.max(0, vues.findIndex((v) => v.phase === phaseDemandee));
    else if (Number.isInteger(etapeDemandee)) i = Math.min(Math.max(0, etapeDemandee), vues.length - 1);

    majStatut("ok", `Mode démo · vues factices${auto ? " · défilement auto" : ""}`);
    document.title = "Démo — écran commun";

    let minuterie = null;
    const montrer = () => {
      vues = vuesDemo(); // minuteurs frais à chaque étape
      afficher(structuredClone(vues[i]));
      clearTimeout(minuterie);
      if (auto) minuterie = setTimeout(() => { i = (i + 1) % vues.length; montrer(); }, PAS_MS);
    };
    envoyerDemo = (message) => {
      if (message.t === "reglages") {
        toast("Mode démo : le réglage n'est pas envoyé.");
        return;
      }
      if (message.t === "autre_idee") {
        toast("Mode démo : le MJ choisirait une autre idée parmi les réponses.");
        return;
      }
      // demarrer / suivant / fin_minuteur : on passe à l'étape suivante (en sautant
      // les sous-étapes de la même phase).
      const phase = vues[i].phase;
      do { i = (i + 1) % vues.length; } while (vues[i].phase === phase && i !== 0);
      montrer();
    };
    montrer();
  }
}
