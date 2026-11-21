// Typologie RIASEC (Holland) : constantes, calculs et blocs HTML partagés entre
// l'outil solo (outil.js), la fiche personnage (fiche.js) et le téléphone (joueur.js).
// Le fichier des compétences du ROME 4.0 (France Travail, feuille « REF - Macro »)
// contient un code RIASEC majeur et parfois un mineur pour 357 macro-compétences
// sur 506. L'origine et la méthode de ces codes ne sont pas documentées
// publiquement (critique psy, point 8) : la fiche du jeu ne s'en sert donc pas,
// elle prend le type RIASEC de l'épisode (voir fiche.js). L'outil solo, qui n'a
// pas d'épisode, les garde comme simple repère, en le disant. Jamais de score,
// jamais de pourcentage.
// Fonctions pures, utilisables dans le navigateur et dans Node.

export const ORDRE_RIASEC = ["R", "I", "A", "S", "E", "C"];

export const RIASEC = {
  R: { nom: "Réaliste", verbe: "Faire, réparer, construire", couleur: "#c8743a",
       activites: "Des activités concrètes et pratiques : se servir de ses mains, d'outils ou de machines, souvent dehors.",
       description: "Tu aimes les activités concrètes et pratiques : te servir de tes mains, d'outils ou de machines, souvent dehors. Tu préfères faire plutôt que réfléchir longtemps.",
       question: "Qu'est-ce qui te plaît quand tu fais quelque chose de tes mains ? Tu te verrais plutôt en atelier, dehors, sur un chantier ?" },
  I: { nom: "Investigateur", verbe: "Chercher, comprendre", couleur: "#3a7bc8",
       activites: "Des activités où l'on observe, cherche et comprend comment les choses marchent.",
       description: "Tu aimes observer, chercher et comprendre comment les choses marchent, et résoudre des problèmes.",
       question: "Quand tu ne sais pas faire un truc, comment tu t'y prends pour trouver ? Qu'est-ce que tu aimes comprendre ?" },
  A: { nom: "Artistique", verbe: "Créer, imaginer, s'exprimer", couleur: "#a24fc0",
       activites: "Des activités où l'on crée, imagine et s'exprime : dessin, musique, écriture, vidéo…",
       description: "Tu aimes créer, imaginer et t'exprimer avec de la liberté : dessin, musique, écriture, vidéo…",
       question: "Qu'est-ce que tu as déjà créé dont tu es fier ou fière ? Tu aimerais que ton travail laisse de la place à ton style ?" },
  S: { nom: "Social", verbe: "Aider, accompagner, transmettre", couleur: "#2e9b6a",
       activites: "Des activités avec et pour les autres : aider, écouter, expliquer, prendre soin.",
       description: "Tu aimes être avec les autres et pour les autres : aider, écouter, expliquer, prendre soin.",
       question: "Qu'est-ce que tu ressens quand tu aides quelqu'un ? Tu préfères aider des enfants, des jeunes, des adultes, des personnes âgées ?" },
  E: { nom: "Entreprenant", verbe: "Convaincre, organiser, mener", couleur: "#d8a019",
       activites: "Des activités où l'on prend des initiatives, convainc, organise et entraîne les autres vers un but.",
       description: "Tu aimes prendre des initiatives, convaincre, organiser et entraîner les autres vers un but.",
       question: "Quand tu organises un truc ou que tu convaincs quelqu'un, qu'est-ce qui te motive ? Tu aimes prendre des décisions ?" },
  C: { nom: "Conventionnel", verbe: "Gérer, classer, être précis", couleur: "#5f6b85",
       activites: "Des activités organisées et précises : ranger, compter, suivre une méthode, éviter les erreurs.",
       description: "Tu aimes quand c'est organisé et précis : ranger, compter, suivre une méthode, ne pas faire d'erreur.",
       question: "Ça te plaît quand les choses sont bien rangées, comptées, sans erreur ? Dans quelles situations tu aimes que tout soit carré ?" },
};

/** Texte d'origine des codes RIASEC du ROME (outil solo) : source réelle, méthode non vérifiée. */
export const INTRO_RIASEC_ROME =
  "Le fichier des compétences du ROME 4.0 (France Travail) donne un code RIASEC à 357 compétences sur 506. On ne sait pas comment ces codes ont été établis : c'est un simple repère, à croiser avec le profil d'intérêts du questionnaire du Centre, pas un résultat de test.";

// Savoir-être du ROME sans code RIASEC (ex. 6D102 « Avoir l'esprit d'équipe ») :
// ils servent dans tous les métiers.
export const SANS_TYPE = { nom: "Savoir-être", verbe: "Utile dans tous les métiers", couleur: "#8a8f99" };

export function echapper(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Index des macro-compétences de rome.json (mis en cache par objet).
const caches = new WeakMap();
export function indexMacros(rome) {
  if (!rome?.macros) return new Map();
  if (!caches.has(rome)) caches.set(rome, new Map(rome.macros.map((m) => [m.code, m])));
  return caches.get(rome);
}

// Code ROME d'une compétence : format du jeu (`code`) ou de l'outil solo (`code_rome`).
export const codeDe = (c) => c?.code ?? c?.code_rome ?? null;

/** Codes RIASEC [majeur, mineur?] d'une compétence : son champ `riasec`, sinon rome.json. */
export function riasecDe(c, rome) {
  const propre = Array.isArray(c?.riasec) ? c.riasec.filter((k) => RIASEC[k]) : null;
  if (propre?.length) return propre;
  const m = indexMacros(rome).get(codeDe(c));
  return (m?.riasec ?? []).filter((k) => RIASEC[k]);
}

/** Type affiché pour une compétence (couleur de carte) : le majeur, ou SANS_TYPE. */
export function typeDe(c, rome) {
  const k = riasecDe(c, rome)[0];
  return k ? { lettre: k, ...RIASEC[k] } : { lettre: null, ...SANS_TYPE };
}

/**
 * Pour chaque type : les compétences qui le mobilisent (majeur ou mineur),
 * et les 2 types les plus présents (dominants). Aucun score n'est affiché.
 */
export function reperesRiasec(competences, rome) {
  const parType = Object.fromEntries(ORDRE_RIASEC.map((k) => [k, { majeur: [], mineur: [] }]));
  for (const c of competences ?? []) {
    const [maj, min] = riasecDe(c, rome);
    if (maj) parType[maj].majeur.push(c);
    if (min && min !== maj) parType[min].mineur.push(c);
  }
  const ordre = ORDRE_RIASEC
    .filter((k) => parType[k].majeur.length || parType[k].mineur.length)
    .sort((a, b) => parType[b].majeur.length - parType[a].majeur.length || parType[b].mineur.length - parType[a].mineur.length);
  return { parType, dominants: ordre.slice(0, 2) };
}

/** Poids pour metiersProches : majeur = 2, mineur = 1 (calcul interne, jamais affiché). */
export function poidsRiasec(parType) {
  return Object.fromEntries(ORDRE_RIASEC.map((k) => [k, 2 * parType[k].majeur.length + parType[k].mineur.length]));
}

// ---------- Contrastes (WCAG 2.x) ----------

const TEXTE_SOMBRE = "#1f2430";

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs #rrggbb (1 à 21), 1 si une couleur est invalide. */
export function contraste(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 1;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mélange une couleur #rrggbb avec du noir (part = 0..1 de noir). */
function assombrir(hex, part) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  return `#${[0, 2, 4].map((i) => Math.round(parseInt(m[1].slice(i, i + 2), 16) * (1 - part)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Fond + texte lisibles (contraste AA ≥ 4,5:1 pour du petit texte) pour un
 * bandeau ou une puce de la couleur `couleur` : on garde la couleur SPEC si le
 * texte blanc y est lisible ; une couleur claire (E, jaune) prend un texte
 * sombre ; sinon on assombrit juste assez le fond pour le texte blanc.
 */
export function couleursLisibles(couleur) {
  if (luminance(couleur) === null) return { fond: couleur, texte: "#ffffff" };
  if (contraste(couleur, "#ffffff") >= 4.5) return { fond: couleur, texte: "#ffffff" };
  if (contraste(couleur, "#ffffff") < 3 && contraste(couleur, TEXTE_SOMBRE) >= 4.5) return { fond: couleur, texte: TEXTE_SOMBRE };
  for (let part = 0.02; part < 1; part += 0.02) {
    const fond = assombrir(couleur, part);
    if (contraste(fond, "#ffffff") >= 4.6) return { fond, texte: "#ffffff" };
  }
  return { fond: "#000000", texte: "#ffffff" };
}

/** Petite puce colorée « S » (types dominants d'un métier, etc.). */
export function puceRiasec(k) {
  const t = RIASEC[k];
  if (!t) return "";
  const { fond, texte } = couleursLisibles(t.couleur);
  return `<span class="puce" style="--type:${t.couleur};--fond-puce:${fond};--sur-puce:${texte}" title="${t.nom}">${k}</span>`;
}

/**
 * Bloc « Repères d'intérêts (RIASEC) » : 6 tuiles colorées + questions pour en parler.
 * @param {Array} competences  compétences retenues
 * @param {object} rome        data/rome.json (pour retrouver le code RIASEC)
 * @param {object} [o]
 * @param {(c) => string} [o.libelle]  texte d'une compétence dans une tuile (non échappé)
 * @param {string} [o.titre] [o.intro] [o.absent] [o.dominantsIntro]  textes (non échappés en entrée : échappés ici)
 */
export function blocRiasec(competences, rome, o = {}) {
  const libelle = o.libelle ?? ((c) => c.libelle ?? c.libelle_rome ?? codeDe(c));
  const titre = o.titre ?? "Repères d'intérêts (RIASEC)";
  const intro = o.intro ??
    INTRO_RIASEC_ROME;
  const absent = o.absent ?? "Pas encore apparu, ce qui ne veut pas dire absent.";
  const dominantsIntro = o.dominantsIntro ?? "Ce qui ressort surtout :";
  const { parType, dominants } = reperesRiasec(competences, rome);
  const tuiles = ORDRE_RIASEC.map((k) => {
    const t = RIASEC[k];
    const { majeur, mineur } = parType[k];
    const liste = [
      ...majeur.map((c) => `<li>${echapper(libelle(c))}</li>`),
      ...mineur.map((c) => `<li class="mineur">${echapper(libelle(c))} <span class="discret">(en partie)</span></li>`),
    ].join("");
    return `<div class="tuile-riasec${dominants.includes(k) ? " dominant" : ""}${liste ? "" : " absent"}" style="--type:${t.couleur}">
        <p class="lettre">${k}</p>
        <p class="nom">${t.nom}<br><span class="discret">${t.verbe}</span></p>
        ${liste ? `<ul>${liste}</ul>` : `<p class="discret">${echapper(absent)}</p>`}
      </div>`;
  }).join("");
  const questions = dominants.map((k) => `<li><strong>${RIASEC[k].nom}</strong> : ${echapper(RIASEC[k].question)}</li>`).join("");
  return `<section class="bloc bloc-riasec">
    <h3>${echapper(titre)}</h3>
    ${intro ? `<p class="discret">${echapper(intro)}</p>` : ""}
    <div class="riasec-grille">${tuiles}</div>
    ${questions && o.questions !== false ? `<p><strong>${echapper(dominantsIntro)}</strong> ${dominants.map((k) => RIASEC[k].nom).join(" et ")}. Pour en parler :</p><ul>${questions}</ul>` : ""}
  </section>`;
}

/**
 * Partie 2 de la fiche : les types d'activités (RIASEC) où le jeune a montré des
 * compétences pendant le jeu, du plus présent au moins présent, avec les
 * compétences qui les montrent. Ce n'est PAS un profil d'intérêts (adaptation
 * `interets-classes-par-ordre`, critique psy points 4 et 6) : ce sont des
 * activités, décrites sans « tu aimes ». Aucun score affiché.
 * @param {object} [o]
 * @param {string[]|null} [o.joues]  types des épisodes joués : les types non joués
 *   ne sont pas classés (« pas d'épisode de ce type »), et la fiche dit
 *   « X types sur 6 » (adaptation `defaut-3-episodes-couverture-riasec`).
 * @param {string} [o.titre] [o.intro]  textes (échappés ici)
 */
export function blocInteretsOrdonnes(competences, rome, o = {}) {
  const libelle = o.libelle ?? ((c) => c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle ?? codeDe(c));
  const { parType } = reperesRiasec(competences, rome);
  const presents = ORDRE_RIASEC
    .filter((k) => parType[k].majeur.length || parType[k].mineur.length)
    .sort((a, b) => parType[b].majeur.length - parType[a].majeur.length || parType[b].mineur.length - parType[a].mineur.length);
  if (!presents.length) return "";
  const joues = Array.isArray(o.joues) ? ORDRE_RIASEC.filter((k) => o.joues.includes(k) || presents.includes(k)) : null;
  const absents = ORDRE_RIASEC.filter((k) => !presents.includes(k) && (!joues || joues.includes(k)));
  const nonJoues = joues ? ORDRE_RIASEC.filter((k) => !joues.includes(k)) : [];
  const items = presents.map((k) => {
    const t = RIASEC[k];
    const comps = [...parType[k].majeur, ...parType[k].mineur].map((c) => echapper(libelle(c)));
    return `<li class="interet" style="--type:${t.couleur}">
        <p><span class="puce-type" aria-hidden="true">${k}</span> <strong>${t.nom}</strong> <span class="discret">· ${t.verbe}</span></p>
        <p>${echapper(t.activites)}</p>
        <p class="discret">Compétences repérées : ${comps.join(" · ")}</p>
      </li>`;
  }).join("");
  const intro = o.intro ??
    "Les mêmes six types (RIASEC) que dans ton Rapport des Possibles. Cet ordre vient des compétences repérées pendant la partie, pas de tes goûts. Ce n'est pas ton profil d'intérêts : celui-là est dans ton Rapport des Possibles. Si les deux diffèrent, c'est une bonne question pour ton entretien.";
  return `<section class="bloc bloc-interets">
    <h3>${echapper(o.titre ?? "Les types d'activités où tu as montré des compétences pendant le jeu")}</h3>
    <p class="discret">${echapper(intro)}</p>
    ${joues ? `<p class="discret">Types d'activités explorés dans cette partie : ${joues.length} sur 6.</p>` : ""}
    <ol class="interets">${items}</ol>
    ${absents.length ? `<p class="discret">Pas apparus pendant la partie, ce qui ne veut pas dire absents : ${absents.map((k) => RIASEC[k].nom).join(", ")}.</p>` : ""}
    ${nonJoues.length ? `<p class="discret">Pas d'épisode de ce type dans cette partie : ${nonJoues.map((k) => RIASEC[k].nom).join(", ")}.</p>` : ""}
  </section>`;
}

/** Légende des couleurs (fiche papier, fiche imprimable). */
export function legendeRiasec({ avecSansType = true } = {}) {
  const items = ORDRE_RIASEC.map((k) => {
    const t = RIASEC[k];
    return `<li><span class="pastille" style="--type:${t.couleur}" aria-hidden="true"></span><strong>${k} · ${t.nom}</strong> <span class="discret">${t.verbe}</span></li>`;
  });
  if (avecSansType) {
    items.push(`<li><span class="pastille pastille-blanche" style="--type:${SANS_TYPE.couleur}" aria-hidden="true"></span><strong>${SANS_TYPE.nom}</strong> <span class="discret">${SANS_TYPE.verbe}</span></li>`);
  }
  return `<ul class="legende-riasec">${items.join("")}</ul>`;
}
