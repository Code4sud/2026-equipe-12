// Petites fonctions de texte PURES, partagées par le jeu et le MJ.
// Aucune I/O : utilisables dans le Worker, le Durable Object et les tests.

// Normalisation tolérante (casse, apostrophes, espaces) pour vérifier qu'une
// citation figure bien dans un texte. Copie EXACTE de celle de src/analyse.js.
export const normCitation = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/[.…,;:!?"]+$/g, "")
    .replace(/^["]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Vrai si `citation` (normalisée) est une sous-chaîne d'au moins un des textes.
export function citationTrouvee(citation, textes) {
  const c = normCitation(citation);
  if (!c) return false;
  return textes.some((t) => normCitation(t).includes(c));
}

// Minuscules, sans accents, apostrophes droites, espaces simples : pour les mots-clés.
export const sansAccents = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// Le mot-clé (une racine, ex. « repar ») apparaît-il en DÉBUT de mot dans le texte ?
// `texteNorm` doit déjà être passé par sansAccents.
export function contientMot(texteNorm, mot) {
  const m = sansAccents(mot);
  if (!m) return false;
  let i = texteNorm.indexOf(m);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(texteNorm[i - 1])) return true;
    i = texteNorm.indexOf(m, i + 1);
  }
  return false;
}

// Nombre de mots-clés DISTINCTS présents dans le texte.
export function compterMots(texte, mots) {
  const n = sansAccents(texte);
  const vus = new Set();
  for (const mot of mots || []) {
    const m = sansAccents(mot);
    if (m && !vus.has(m) && contientMot(n, m)) vus.add(m);
  }
  return vus.size;
}

// "C", "C/R", "CR", ["C","R"] → ["C","R"]
export function lettresRiasec(r) {
  if (Array.isArray(r)) return r.filter((x) => typeof x === "string" && /^[RIASEC]$/.test(x));
  return String(r ?? "").toUpperCase().match(/[RIASEC]/g) ?? [];
}

// Mots qui ne doivent JAMAIS apparaître dans ce que le MJ dit aux joueurs.
export const MOTS_INTERDITS = /\b(faux|fausses?|mauvaise?s?|tromp|erron)/i;

// Jugements sur la PERSONNE (filet secondaire derrière le prompt, adaptations
// « aucune-deduction-sensible » et « phrase-mots-valorisante ») : le MJ décrit ce
// que le joueur SAIT FAIRE, jamais ce qu'il EST. Racines sans accents : elles
// couvrent le genre et le nombre (« anxieux », « anxieuse », « anxieuses »).
// Superlatifs (« génial », « incroyable », « parfait ») : un compliment vide, pas
// un retour sur une action (Kluger & DeNisi 1996 ; Hattie & Timperley 2007).
const JUGEMENTS = new RegExp(
  `\\b(${[
    "timide", "timidit", "anxieu", "anxiet", "angoiss", "stresse", "intelligen", "emotif", "emotive", "emotionnel", "emotions?\\b",
    "depress", "deprim", "fragile", "introverti", "extraverti", "personnalite", "surdoue", "douee?s?\\b",
    "talentueu", "genia(l|le|les|ux)\\b", "incroyable", "parfaite?s?\\b", "extraordinaire",
    "exceptionnel", "brillant", "idiot", "stupide", "paresseu", "feignant",
  ].join("|")})`,
);
/** « tu es / t'es + adjectif » : une phrase sur la personne, pas sur une action. */
const SUR_LA_PERSONNE = /\b(tu es|t'es|tu etais)\b/;

/** Vrai si le texte porte un jugement sur la personne (personnalité, émotions, intelligence, superlatif). */
export function contientJugement(s) {
  const t = sansAccents(s);
  return JUGEMENTS.test(t) || SUR_LA_PERSONNE.test(t);
}

export const contientMotInterdit = (s) =>
  MOTS_INTERDITS.test(sansAccents(s)) || /m[eê]me si/i.test(String(s ?? "")) || contientJugement(s);

// Sujets sensibles (RGPD art. 9, situation familiale ou financière) : jamais dans
// une phrase écrite par le MJ pour le groupe ou le joueur (liaison entre épisodes,
// reformulation, « mots »). Le prompt l'interdit ; ce contrôle est le filet côté serveur.
const SENSIBLES = new RegExp(
  `\\b(${[
    "mere", "pere", "maman", "papa", "parents?\\b", "famille", "familial", "frere", "soeur", "oncle", "tante",
    "religi", "musulman", "chretien", "juif", "juive", "islam", "eglise", "mosquee", "priere", "ramadan",
    "origine", "nationalit", "immigr", "etranger", "sante", "malad", "handicap", "medicament", "hopital",
    "therap", "sexu", "politique", "syndica", "pauvre", "pauvrete", "chomage", "dette",
  ].join("|")})`,
);
export const contientSujetSensible = (s) => SENSIBLES.test(sansAccents(s));

// Les `n` premiers mots du texte, en SOUS-CHAÎNE EXACTE (aucune retouche).
export function premiersMots(texte, n = 20) {
  const t = String(texte ?? "");
  const m = t.match(new RegExp(`\\S+(?:\\s+\\S+){0,${n - 1}}`));
  return m ? m[0] : "";
}

// ───────────────────────── Libellés ROME ─────────────────────────

// Le ROME écrit les majuscules initiales sans accent (« Elaborer », « Etre ») et
// « oeuvre » sans ligature. On rétablit l'orthographe pour l'affichage (titre de
// carte, fiche papier). « Exécuter », « Expliquer », « Estimer »… sont déjà justes.
const E_ACCENT = { tre: "Être", crire: "Écrire", duquer: "Éduquer", laborer: "Élaborer", quiper: "Équiper", tablir: "Établir", vacuer: "Évacuer", valuer: "Évaluer", couter: "Écouter", changer: "Échanger", mettre: "Émettre", liminer: "Éliminer", lever: "Élever", conomiser: "Économiser", tudier: "Étudier", tiqueter: "Étiqueter" };
const RE_E_ACCENT = new RegExp(`(?<![\\p{L}\\p{N}])E(${Object.keys(E_ACCENT).join("|")})(?![\\p{L}\\p{N}])`, "gu");

export function accentuerLibelle(libelle) {
  if (typeof libelle !== "string") return libelle;
  return libelle
    .replace(RE_E_ACCENT, (_, suite) => E_ACCENT[suite])
    .replace(/\b([Oo])euvre/g, (_, o) => (o === "O" ? "Œuvre" : "œuvre"));
}

// ───────────────────────── Réponse « sérieuse » ─────────────────────────

// Mots vides et remplissage : ils ne comptent pas pour juger qu'une réponse est sérieuse.
const MOTS_VIDES = new Set((
  "le la les l un une des du de d et ou a au aux en dans sur sous par pour avec sans chez ce ca cela c " +
  "je j tu il elle on nous vous ils elles me m te t se s lui leur moi toi y ne n pas plus que qu qui quoi " +
  "est es suis sont va vais vas fait fais faire etre avoir ai as mon ma mes ton ta tes son sa ses " +
  "jsp jsais chais sais savais connais lol mdr ptdr xd rien ok okay oui non euh bah ben bof idk osef " +
  "aucune aucun idee nul nulle bla truc trucs machin chose choses jaime aime aimes j'aime"
).split(" "));

/** Mots porteurs de sens d'un texte (minuscules, sans accents, hors mots vides et remplissage). */
export function motsSignificatifs(texte) {
  return sansAccents(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 2 && !MOTS_VIDES.has(m) && !/^(.)\1+$/.test(m));
}

/** Vrai si la réponse est sérieuse : au moins `min` mots porteurs de sens. */
export const estSerieuse = (texte, min = 3) => motsSignificatifs(texte).length >= min;

// ───────────────────────── Pseudos et contrôles de sortie ─────────────────────────

/**
 * Pseudo nettoyé : NFC, sans caractères de contrôle ni de format (U+200B, U+202E…),
 * espaces réduits. Renvoie "" si le pseudo n'a ni lettre ni chiffre.
 */
export function normaliserPseudo(brut) {
  if (typeof brut !== "string") return "";
  const p = brut
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(p) ? p : "";
}

/** Forme de comparaison de deux pseudos (unicité) : minuscules, sans accents. */
export const clePseudo = (p) => sansAccents(normaliserPseudo(p)).replace(/[^\p{L}\p{N}]+/gu, "");

const motsNormalises = (s) => sansAccents(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Vrai si un des pseudos (≥ 2 caractères) apparaît comme mot entier dans le texte. */
export function contientPseudo(texte, pseudos) {
  const t = ` ${motsNormalises(texte).join(" ")} `;
  return (pseudos ?? []).some((p) => {
    const m = motsNormalises(p).join(" ");
    return m.length >= 2 && t.includes(` ${m} `);
  });
}

/** Vrai si le texte reprend `n` mots consécutifs d'une des sources (normalisés). */
export function reprendSuiteDeMots(texte, sources, n = 5) {
  const suites = new Set();
  for (const s of sources ?? []) {
    const m = motsNormalises(s);
    for (let i = 0; i + n <= m.length; i++) suites.add(m.slice(i, i + n).join(" "));
  }
  if (suites.size === 0) return false;
  const t = motsNormalises(texte);
  for (let i = 0; i + n <= t.length; i++) if (suites.has(t.slice(i, i + n).join(" "))) return true;
  return false;
}

/** Nombre de mots d'une citation normalisée. */
export const nbMotsCitation = (c) => {
  const n = normCitation(c);
  return n ? n.split(" ").length : 0;
};

// ───────────────────────── Remplissage et hésitation ─────────────────────────

// Mots d'une réponse de remplissage ou d'hésitation (« je sais pas trop, on
// attend de voir », « jsp », « bof », « euh… », « ? ») : ils ne disent rien de
// ce que le joueur ferait. Retirés avant de compter les mots utiles.
const MOTS_HESITATION = new Set((
  "sais sait savoir savais jsp jsais chais sai jss idk dunno aucune aucun idee idees vois voit voir " +
  "attend attends attendre attendons attendrait attendrais verra verrai verrons rien bof euh heu hum hmm " +
  "bah ben beh trop peut etre peutetre comme ca jamais genre bref enfin voila quoi " +
  "osef lol mdr ptdr xd ok okay oui non nan nope pas ne bien"
).split(" "));

/**
 * Vrai si la réponse est du remplissage ou de l'hésitation : une fois retirés
 * les mots d'hésitation (« je sais pas », « on attend », « aucune idée »,
 * « bof », « euh »…), il reste moins de 3 mots porteurs de sens ET aucun des
 * `motsCles` donnés (mots-clés du problème : une réponse courte mais sur le
 * sujet, comme « je préviens le coach », n'est pas du remplissage).
 */
export function estRemplissage(texte, motsCles = []) {
  const reste = sansAccents(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !MOTS_HESITATION.has(m) && !/^(.)\1*$/.test(m) && !/^(e+u+h+|h+e+u+|h+m+)$/.test(m))
    .join(" ");
  if (!reste) return true;
  if (compterMots(reste, motsCles) > 0) return false;
  return motsSignificatifs(reste).length < 3;
}

// ───────────────────────── Réponses refusées ─────────────────────────
// Il n'y a ni bonne ni mauvaise réponse. Seules deux réponses sont refusées, et le
// joueur réécrit la sienne : « je ne sais pas » (rien d'autre que de l'hésitation)
// et la violence.

/** Vrai si, une fois retirés les mots d'hésitation, il ne reste AUCUN mot porteur de sens. */
export function estSansReponse(texte) {
  // Une amorce seule (« D'abord, je… ») ou suivie d'une hésitation n'est pas une réponse.
  const reste = sansAmorce(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !MOTS_HESITATION.has(m) && !/^(.)\1*$/.test(m) && !/^(e+u+h+|h+e+u+|h+m+)$/.test(m))
    .join(" ");
  return motsSignificatifs(reste).length === 0;
}

// Violence physique ou menace d'arme. Volontairement étroit : « frapper à la
// porte », « taper un message », « signaler les insultes » restent acceptés.
const VIOLENCE = [
  /\bfrapp\w*\b(?!\s+(a|chez|au|aux)\b)/,
  /\b(le|la|les|lui|leur)\s+(tape|taper|tapes|tapent|cogne|cogner|frappe|tue|tuer|bute|buter|plante|planter)\b/,
  /\b(cogn|tabass|poignard|flingu|gifl|baffe|bagarr)\w*/,
  /\b(tuer|buter)\b/,
  /\b(cass|pet|explos|niqu|eclat|defonc)\w*\s+(la|sa|ta|leur|les)\s+(gueule|gueules|tronche|tete|face|figure|bouche)\b/,
  /\bcoups?\s+de\s+(poing|pied|boule|tete|couteau)\b/,
  /\b(couteau|arme|flingue|pistolet)\b/,
  /\bse\s+battre\b|\bon\s+se\s+bat\b|\bje\s+me\s+bats?\b/,
];
export const estViolente = (texte) => {
  const t = sansAccents(texte);
  return VIOLENCE.some((r) => r.test(t));
};

// « Je ne sais pas » (décision de Pierre §3 ; Waterman & Blades 2011 ; étayage,
// Wood, Bruner & Ross 1976) : dès le 1er « je ne sais pas », le téléphone propose
// ces débuts de phrase (préremplis quand on les touche) et le bouton « Je passe ce
// tour », sans reproche. Une amorce envoyée seule, sans suite, n'est pas une réponse.
export const AMORCES = ["Moi, je demanderais à…", "D'abord, je…", "J'irais voir…"];
export const MESSAGE_SANS_REPONSE = "Toutes les idées comptent ! Pas facile ? Commence par un de ces débuts de phrase, ou passe ce tour.";
export const MESSAGE_PASSE = "Pas de souci, l'histoire continue. Tu pourras proposer ton idée au prochain épisode.";
// Au dernier épisode : plus de « prochain épisode » à promettre.
export const MESSAGE_PASSE_DERNIER = "Pas de souci, l'histoire continue.";
export const MESSAGE_VIOLENCE = "Ici, on cherche une solution sans violence. Qu'est-ce que tu pourrais faire d'autre ?";

// Forme de comparaison : sans accents ni ponctuation (« Moi, je demanderais à… » = « moi je demanderais a »).
const sansPonctuation = (s) => sansAccents(s).replace(/[^a-z0-9']+/g, " ").replace(/\s+/g, " ").trim();
const AMORCES_NORM = AMORCES.map(sansPonctuation);

/** Retire une amorce en tête de réponse (« D'abord, je sais pas » → « sais pas »). */
export function sansAmorce(texte) {
  const t = sansPonctuation(texte);
  for (const a of AMORCES_NORM) if (t === a || t.startsWith(`${a} `)) return t.slice(a.length);
  return t;
}

/** Message à renvoyer au joueur si sa réponse est refusée, sinon null. */
export function refusReponse(texte) {
  if (estSansReponse(texte)) return MESSAGE_SANS_REPONSE;
  if (estViolente(texte)) return MESSAGE_VIOLENCE;
  return null;
}

// ───────────────────────── Preuve : une proposition entière ─────────────────────────

// Mots sur lesquels une preuve ne doit JAMAIS finir (article, préposition,
// pronom ou conjonction laissés seuls : « … je compare les »).
export const MOTS_SANS_FIN = new Set((
  "le la les l un une des du de d a au aux pour par sur sous dans en avec sans chez vers entre contre " +
  "et ou mais puis donc car ni que qu qui dont ce cet cette ces c mon ma mes ton ta tes son sa ses " +
  "notre nos votre vos leur leurs je j tu il elle on nous vous ils elles me m te t se s ne n y si tres"
).split(" "));
// Conjonctions retirées en tête de preuve (« et ce soir je compare… » → « ce soir je compare… »).
const CONJONCTIONS_TETE = new Set(["et", "puis", "mais", "alors", "donc", "ou"]);
// Découpe secondaire d'une proposition trop longue.
const COUPURES = new Set(["et", "puis"]);
const PONCTUATION_SEULE = /^[.!?;,:…\-–—"«»“”()]+$/u;
const FIN_DE_PROPOSITION = /[.!?;,:…]+["»”)]*$/u;

function jetons(texte) {
  return [...texte.matchAll(/\S+/g)].map((m) => ({
    debut: m.index,
    fin: m.index + m[0].length,
    brut: m[0],
    n: sansAccents(m[0]).replace(/[^a-z0-9']+/g, ""),
  }));
}

/** Vrai si ce mot ne peut pas terminer une preuve (« les », « de », « d'un », « qu' », ponctuation seule). */
export function finDePreuveInterdite(mot) {
  const n = sansAccents(mot).replace(/[^a-z0-9']+/g, "");
  if (!n || /'$/.test(n)) return true;
  return MOTS_SANS_FIN.has(n.includes("'") ? n.slice(n.lastIndexOf("'") + 1) : n);
}
const finInterdite = (jeton) => finDePreuveInterdite(jeton.brut);

// Propositions : plages [a, b] de jetons séparées par . ! ? ; , : … ou un retour à la ligne.
function propositions(texte, toks) {
  const res = [];
  let a = null;
  toks.forEach((t, i) => {
    if (PONCTUATION_SEULE.test(t.brut)) {
      if (a !== null) res.push([a, i - 1]);
      a = null;
      return;
    }
    if (a === null) a = i;
    const suivant = toks[i + 1];
    const saut = suivant && /\n/.test(texte.slice(t.fin, suivant.debut));
    if (FIN_DE_PROPOSITION.test(t.brut) || saut || !suivant) {
      res.push([a, i]);
      a = null;
    }
  });
  return res;
}

// Occurrences des mots-clés (en début de mot, comme compterMots) : { cle, k1, k2 } en indices de jetons.
function occurrences(toks, motsCles) {
  let s = "";
  const offsets = [];
  toks.forEach((t, i) => {
    if (i) s += " ";
    offsets.push(s.length);
    s += t.n;
  });
  const jetonA = (o) => {
    let i = 0;
    while (i + 1 < offsets.length && offsets[i + 1] <= o) i++;
    return i;
  };
  const res = [];
  for (const mot of new Set((motsCles ?? []).map((m) => sansAccents(m)).filter(Boolean))) {
    let o = s.indexOf(mot);
    while (o !== -1) {
      if (o === 0 || !/[a-z0-9]/.test(s[o - 1])) res.push({ cle: mot, k1: jetonA(o), k2: jetonA(o + mot.length - 1) });
      o = s.indexOf(mot, o + 1);
    }
  }
  return res.sort((x, y) => x.k1 - y.k1 || x.k2 - y.k2);
}

/**
 * Découpe une preuve dans `texte` : la proposition [a, b] (indices de jetons),
 * ramenée à `max` mots autour de l'ancre [k1, k2] (le mot-clé), sans finir sur
 * un article ou une préposition seule, et d'au moins `min` mots si le texte le
 * permet. Renvoie une SOUS-CHAÎNE EXACTE du texte.
 */
function decouper(texte, toks, a, b, k1, k2, { max, min }) {
  if (k1 === null) k1 = k2 = a;
  // Conjonction en tête : « et ce soir… » → « ce soir… ».
  while (a < b && a < k1 && CONJONCTIONS_TETE.has(toks[a].n)) a++;
  if (b - a + 1 > max) {
    // Trop long : sous-propositions sur « et » / « puis », on garde celle du mot-clé.
    const sous = [];
    let s = a;
    for (let i = a + 1; i <= b; i++) {
      if (COUPURES.has(toks[i].n)) {
        if (i - 1 >= s) sous.push([s, i - 1]);
        s = i + 1;
      }
    }
    if (s <= b) sous.push([s, b]);
    const cible = sous.find(([x, y]) => k1 >= x && k2 <= y);
    if (cible && cible[1] - cible[0] + 1 >= min) [a, b] = cible;
  }
  if (b - a + 1 > max) {
    // Toujours trop long : fenêtre de `max` mots autour du mot-clé (un peu de contexte avant).
    a = Math.max(a, Math.min(k1 - 4, b - max + 1));
    b = a + max - 1;
  }
  // Jamais de fin sur « les », « de », « pour »… (sans couper le mot-clé).
  while (b > a && b > k2 && finInterdite(toks[b])) b--;
  // Trop court : on élargit dans le texte (à droite d'abord), sans finir sur un mot vide.
  while ((b - a + 1 < min || finInterdite(toks[b])) && b + 1 < toks.length && b - a + 1 < max) b++;
  while (b - a + 1 < min && a > 0) a--;
  while (b - a + 1 > min && b > k2 && finInterdite(toks[b])) b--;
  return texte.slice(toks[a].debut, toks[b].fin).replace(/[\s,;:]+$/u, "");
}

/**
 * Preuve d'une compétence : la PROPOSITION (découpée sur . ! ? ; , : et, si
 * elle dépasse `max` mots, sur « et » / « puis ») qui contient le plus de
 * `motsCles` parmi les `textes` du joueur (égalité → la première). Sans
 * mot-clé, la proposition la plus riche en mots porteurs de sens. Toujours une
 * SOUS-CHAÎNE EXACTE d'un des textes, de `min` à `max` mots (moins seulement si
 * la réponse entière est plus courte), qui ne finit jamais sur un article ou
 * une préposition seule.
 */
export function propositionPreuve(textes, motsCles = [], { max = 20, min = 3 } = {}) {
  const liste = (Array.isArray(textes) ? textes : [textes]).filter((t) => typeof t === "string" && t.trim());
  let meilleure = null;
  for (const texte of liste) {
    const toks = jetons(texte);
    const occ = occurrences(toks, motsCles);
    for (const [a, b] of propositions(texte, toks)) {
      const dedans = occ.filter((o) => o.k1 >= a && o.k1 <= b);
      const score = new Set(dedans.map((o) => o.cle)).size;
      const sens = motsSignificatifs(toks.slice(a, b + 1).map((t) => t.brut).join(" ")).length;
      if (!meilleure || score > meilleure.score || (score === meilleure.score && score === 0 && sens > meilleure.sens)) {
        meilleure = { texte, toks, a, b, score, sens, dedans };
      }
    }
  }
  if (!meilleure) return "";
  const { texte, toks, a, b, dedans } = meilleure;
  let k1 = null;
  let k2 = null;
  if (dedans.length) {
    k1 = dedans[0].k1;
    k2 = Math.min(b, dedans[0].k2);
    // Tous les mots-clés de la proposition s'ils tiennent dans `max` mots.
    const dernier = Math.min(b, Math.max(...dedans.map((o) => o.k2)));
    if (dernier - k1 + 1 <= max) k2 = dernier;
  }
  return decouper(texte, toks, a, b, k1, k2, { max, min });
}

/**
 * Preuve autour du mot d'indice `i` (mots séparés par des espaces) de `texte` :
 * la proposition qui le contient, mêmes règles que propositionPreuve.
 * Sert à l'analyse mock du récit (src/analyse.js).
 */
export function propositionAutour(texte, i, { max = 25, min = 3 } = {}) {
  const t = String(texte ?? "");
  const toks = jetons(t);
  if (!toks.length || !Number.isInteger(i) || i < 0 || i >= toks.length) return "";
  const prop = propositions(t, toks).find(([a, b]) => i >= a && i <= b) ?? [i, i];
  return decouper(t, toks, prop[0], prop[1], i, i, { max, min });
}

// ───────────────────────── Liaison entre épisodes ─────────────────────────

/** Repli quand le MJ n'a pas écrit de phrase de liaison (adaptation « histoire-tournoi-du-quartier »). */
export const TRANSITION_PAR_DEFAUT = "L'histoire continue.";

/**
 * Transition fixe vers un épisode : son champ `transition` (neutre, valable même
 * quand on a sauté des épisodes), sinon TRANSITION_PAR_DEFAUT.
 */
export function transitionFixe(probleme) {
  const t = probleme?.transition;
  return typeof t === "string" && t.trim() ? t.trim() : TRANSITION_PAR_DEFAUT;
}
