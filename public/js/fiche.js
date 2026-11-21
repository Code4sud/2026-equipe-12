// Rendu HTML de la fiche personnage (fiche.html, fin de partie sur le téléphone)
// et du bloc « Métiers à découvrir » (aussi utilisé par l'outil solo).
// Fonctions PURES : elles renvoient des chaînes HTML où tout texte venant des
// données (pseudo, trace, mots…) est échappé. Utilisables dans Node pour les tests.
//
// Vocabulaire (critique psy, points 2 et 4 ; adaptation
// `nouveau-vocabulaire-reperage-pas-validation`) : compétences « repérées »,
// « trace » = les propres mots du jeune (elle montre ce qu'il a écrit, pas qu'il
// possède la compétence). Jamais « validé », « certifié », « mesure ».

import { metiersProches, metiersParZone, typesDominants } from "./metiers-proches.js";
import { RIASEC, SANS_TYPE, echapper, reperesRiasec, poidsRiasec, puceRiasec, blocInteretsOrdonnes, typeDe, codeDe, indexMacros } from "./riasec.js";
import { separerMots, RELAIS_ADULTE } from "./joueur-outils.js";

const TYPES_ESCO = {
  exactMatch: "correspondance exacte",
  closeMatch: "correspondance proche",
  narrowMatch: "métier plus précis",
  broadMatch: "métier plus large",
};

const TYPES_PREUVE = {
  vecu: "Ce que tu as déjà vécu",
  jeu: "Repérée pendant le jeu",
  participation: "Ta participation au groupe",
};

/** Lien vers la page ESCO d'un métier, seulement pour une URI ESCO officielle. */
export function lienEsco(uri) {
  if (typeof uri !== "string" || !/^https?:\/\/data\.europa\.eu\/esco\/occupation\/[A-Za-z0-9-]+$/.test(uri)) return null;
  return `https://esco.ec.europa.eu/fr/classification/occupation?uri=${encodeURIComponent(uri)}`;
}

/** Bloc ESCO d'un métier (champ `esco` ajouté par scripts/build-esco.mjs) ; "" si absent. */
export function blocEsco(m) {
  const entrees = Array.isArray(m?.esco) ? m.esco.filter((e) => e && e.titre).slice(0, 2) : [];
  if (!entrees.length) return "";
  return `<div class="esco">${entrees
    .map((e) => {
      const lien = lienEsco(e.uri);
      const titre = lien
        ? `<a href="${echapper(lien)}" target="_blank" rel="noopener">${echapper(e.titre)}</a>`
        : echapper(e.titre);
      const type = TYPES_ESCO[e.type] ? ` <span class="discret">(${TYPES_ESCO[e.type]})</span>` : "";
      const comps = Array.isArray(e.competences) ? e.competences.slice(0, 8) : [];
      return `<p class="esco-titre"><span class="esco-etiquette">ESCO</span> ${titre}${type}</p>
        ${comps.length ? `<p class="discret esco-sous">Compétences clés :</p><ul class="esco-competences">${comps.map((c) => `<li>${echapper(c)}</li>`).join("")}</ul>` : ""}`;
    })
    .join("")}</div>`;
}

/** Carte d'un métier : titre, types dominants, niveau de préparation, description, ESCO. */
export function carteMetier(m, onet, { ouvert = false } = {}) {
  const zone = onet?.zones?.[m.zone];
  const entete = `<strong>${echapper(m.titre)}</strong>
        <span class="puces">${(Array.isArray(m.riasec) ? typesDominants(m) : []).map(puceRiasec).join("")}</span>
        ${zone ? `<span class="discret">${echapper(zone)}${m.zoneCorrigee ? " (niveau corrigé d'après l'ONISEP)" : ""}</span>` : ""}`;
  const corps = `${m.description ? `<p>${echapper(m.description)}</p>` : ""}
      ${Array.isArray(m.domaines) && m.domaines.length ? `<p class="discret">Domaines : ${m.domaines.map(echapper).join(" · ")}</p>` : ""}
      ${blocEsco(m)}`;
  return ouvert
    ? `<article class="metier ouvert"><p class="metier-entete">${entete}</p>${corps}</article>`
    : `<details class="metier"><summary>${entete}</summary>${corps}</details>`;
}

/**
 * Bloc « Métiers à découvrir » : 5 accessibles + 3 avec études longues,
 * rapprochés par profil d'intérêts (calcul déterministe, sans IA). "" si aucun repère RIASEC.
 */
export function blocMetiers(competences, onet, rome, o = {}) {
  if (!onet?.metiers?.length) return "";
  const { parType } = reperesRiasec(competences, rome);
  const res = metiersProches(poidsRiasec(parType), onet.metiers);
  if (!res) return "";
  const intro = o.intro ??
    "Métiers dont le profil d'intérêts ressemble à celui que montrent ces compétences. Ce sont des idées à explorer, pas des recommandations.";
  const carte = (m) => carteMetier(m, onet, { ouvert: o.ouvert });
  const licence = typeof onet.licence === "string" && /^https:\/\//.test(onet.licence) ? onet.licence : null;
  return `<section class="bloc bloc-metiers">
    <h3>${echapper(o.titre ?? "Métiers à découvrir")}</h3>
    <p class="discret">${echapper(intro)}</p>
    <h4>Sans études longues (jusqu'à bac+2)</h4>
    <div class="metiers">${res.accessibles.map(carte).join("")}</div>
    ${res.plusLongs.length ? `<h4>Avec des études plus longues</h4><div class="metiers">${res.plusLongs.map(carte).join("")}</div>` : ""}
    <p class="discret source">${echapper(onet.source ?? "")}${licence ? ` <a href="${echapper(licence)}" target="_blank" rel="noopener">CC BY 4.0</a>` : ""}${
      res.accessibles.concat(res.plusLongs).some((m) => m.esco?.length) && !/ESCO/.test(onet.source ?? "")
        ? " ESCO : © Union européenne, CC BY 4.0."
        : ""
    }</p>
  </section>`;
}

// ---------- Données de la fiche ----------

/** Une compétence est retenue si le jeune l'a gardée (ou si le serveur n'envoie que les gardées). */
export const estRetenue = (c) => c && (c.gardee === true || c.gardee === undefined);

const texteOuNull = (x, max = 2000) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);

const VALEURS_PREFERENCE = { oui: "oui", un_peu: "un peu", non: "non" };

/**
 * Normalise la réponse de GET /api/parties/:code/fiche/:joueurId (ou la vue joueur de fin).
 * Formats acceptés : { pseudo, avatar, competences } | { joueur:{…} } | { moi:{…} },
 * avec éventuellement { depart:[…], jeu:[…] } au lieu de `competences`.
 * Champs pour le psychologue (Partie.fiche) : passes, preferences, debrief.
 */
export function normaliserFiche(brut) {
  const b = brut ?? {};
  const j = b.joueur ?? b.moi ?? b;
  let competences = Array.isArray(j.competences) ? j.competences : Array.isArray(b.competences) ? b.competences : null;
  if (!competences) {
    const depart = Array.isArray(j.depart) ? j.depart : Array.isArray(b.depart) ? b.depart : [];
    const jeu = Array.isArray(j.jeu) ? j.jeu : Array.isArray(b.jeu) ? b.jeu : [];
    competences = [...depart.map((c) => ({ typePreuve: "vecu", problemeIndex: null, ...c })), ...jeu];
  }
  const retenues = competences.filter(estRetenue);
  const estDepart = (c) => c.problemeIndex === null || c.problemeIndex === undefined || c.typePreuve === "vecu";
  const aIndex = (x) => Number.isInteger(x?.index) && x.index >= 0;
  return {
    code: b.code ?? j.code ?? null,
    pseudo: String(j.pseudo ?? b.pseudo ?? "").slice(0, 40),
    avatar: String(j.avatar ?? b.avatar ?? "").slice(0, 8),
    date: b.date ?? b.finA ?? null,
    problemes: Array.isArray(b.problemes) ? b.problemes : [],
    depart: retenues.filter(estDepart),
    jeu: retenues.filter((c) => !estDepart(c)).sort((a, b2) => (a.problemeIndex ?? 0) - (b2.problemeIndex ?? 0)),
    passes: (Array.isArray(b.passes) ? b.passes : []).filter(aIndex),
    preferences: (Array.isArray(b.preferences) ? b.preferences : []).filter((p) => aIndex(p) && Object.hasOwn(VALEURS_PREFERENCE, p.valeur)),
    debrief: texteOuNull(b.debrief ?? j.debrief),
  };
}

/** Titre d'un épisode (si connu), sinon « Épisode N ». */
function titreEpisode(problemes, index, titre) {
  if (typeof titre === "string" && titre) return titre;
  const p = problemes?.[index];
  if (typeof p === "string") return p;
  if (p?.titre) return p.titre;
  return Number.isInteger(index) ? `Épisode ${index + 1}` : "";
}

/** Titre du problème d'où vient une compétence (si connu). */
function titreProbleme(c, fiche) {
  return titreEpisode(fiche.problemes, c.problemeIndex, c.problemeTitre);
}

/**
 * Type RIASEC de l'épisode d'une compétence de jeu, ou null. Critique psy point 8 :
 * l'origine des codes RIASEC du ROME n'est pas vérifiable, la fiche du jeu ne
 * garde donc que le type de l'épisode où la compétence a été repérée.
 */
export function lettreEpisode(c, problemes) {
  if (!Number.isInteger(c?.problemeIndex)) return null;
  const r = problemes?.[c.problemeIndex]?.riasec;
  const k = String((Array.isArray(r) ? r[0] : r) ?? "").trim().toUpperCase();
  return Object.hasOwn(RIASEC, k) ? k : null;
}

/**
 * Compétences comptées dans la partie 2 (types d'activités) et pour les métiers.
 * Si la fiche connaît le type de ses épisodes : seulement les compétences repérées
 * en jeu (ni la participation, ni un savoir-être hors scénario, ni le récit de
 * départ), chacune avec le type de son épisode ; `joues` = types des épisodes de
 * la partie. Sinon (fiche du téléphone, qui n'a pas les épisodes) : toutes les
 * compétences, avec les codes du ROME, et `joues` = null.
 */
export function competencesTypees(f) {
  const types = f.problemes.map((_, i) => lettreEpisode({ problemeIndex: i }, f.problemes));
  const parEpisode = types.some(Boolean);
  if (!parEpisode) return { parEpisode, liste: [...f.depart, ...f.jeu], joues: null };
  const liste = f.jeu
    .filter((c) => c.typePreuve !== "participation" && c.horsScenario !== true)
    .map((c) => ({ ...c, riasec: [lettreEpisode(c, f.problemes)].filter(Boolean) }))
    .filter((c) => c.riasec.length);
  return { parEpisode, liste, joues: [...new Set(types.filter(Boolean))] };
}

// Pastille d'une compétence du récit quand la fiche suit le type des épisodes :
// pas d'épisode, donc pas de type RIASEC, couleur neutre.
const TYPE_RECIT = { lettre: null, nom: "", couleur: SANS_TYPE.couleur };

/**
 * Une compétence en ligne : pastille, phrase « Tu as proposé de … : c'est ce qu'on
 * appelle « libellé » » (le libellé n'est pas répété en dessous), trace, contexte.
 * @param {object} [o]
 * @param {object} [o.type]          type affiché (sinon typeDe : codes du ROME)
 * @param {string} [o.questionVecu]  « Question pour ton entretien » (adaptation `nouveau-question-vecu`)
 */
export function ligneCompetence(c, rome, contexte = "", o = {}) {
  const t = o.type ?? typeDe(c, rome);
  const libelle = c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle ?? codeDe(c) ?? "";
  const mots = c.mots ?? c.mots_du_jeune ?? "";
  const trace = c.preuve ?? c.citation ?? "";
  const typePreuve = TYPES_PREUVE[c.typePreuve] ?? "";
  const repere = [codeDe(c) ?? "", t.lettre ? `${t.lettre} ${t.nom}` : t.nom].filter(Boolean).join(" · ");
  const coupe = separerMots(mots, libelle);
  const phrase = coupe
    ? `<p class="competence-mots">${echapper(coupe.avant)} « <strong>${echapper(libelle)}</strong> »${coupe.apres ? ` ${echapper(coupe.apres)}` : "."}
          <span class="discret">${echapper(repere)}</span></p>`
    : `<p class="competence-libelle"><strong>${echapper(libelle)}</strong>
          <span class="discret">${echapper(repere)}</span></p>
        ${mots ? `<p class="competence-mots">${echapper(mots)}</p>` : ""}`;
  const ctx = [typePreuve, c.idee === true ? "ton idée a fait avancer l'histoire" : "", contexte].filter(Boolean).join(" · ");
  return `<li class="competence" style="--type:${t.couleur}">
      <span class="pastille${t.lettre ? "" : " pastille-blanche"}" title="${echapper(t.nom || "Ton récit")}" aria-hidden="true"></span>
      <div>
        ${phrase}
        ${trace ? `<blockquote class="preuve"><span class="discret">Ta trace :</span> « ${echapper(trace)} »</blockquote>` : ""}
        ${ctx ? `<p class="discret competence-contexte">${echapper(ctx)}</p>` : ""}
        ${c.horsScenario === true ? `<p class="discret">(repérée hors scénario, à discuter avec ton psy)</p>` : ""}
        ${o.questionVecu ? `<p class="question-vecu"><strong>Question pour ton entretien :</strong> ${echapper(o.questionVecu)}</p>` : ""}
      </div>
    </li>`;
}

// Les 5 zones de métiers du Rapport des Possibles (même base O*NET, mêmes zones) :
// les durées qu'il affiche (le jeune a son rapport en main) et le niveau indiqué
// par le guide du Centre, p. 10 (adaptation `fiche-finale-modele-rapport`).
export const ZONES_METIERS = {
  1: { titre: "1re zone · Métiers accessibles en 0 à 6 mois", texte: "Niveau : six mois de formation ou moins, le bac n'est pas obligatoire." },
  2: { titre: "2e zone · Métiers accessibles en 3 mois à 2 ans", texte: "Niveau : CAP ou BEP, souvent en alternance." },
  3: { titre: "3e zone · Métiers accessibles en 1 à 4 ans", texte: "Niveau : BTS ou licence professionnelle." },
  4: { titre: "4e zone · Métiers accessibles en 2 à 6 ans", texte: "Niveau : master, ou licence avec un concours." },
  5: { titre: "5e zone · Métiers accessibles en 4 à 10 ans", texte: "Niveau : doctorat ou spécialisation après le master." },
};

/** La première phrase d'une description (fiche courte, lisible). « etc. » ne coupe pas la phrase. */
export function resume(texte, max = 170) {
  const t = String(texte ?? "").trim().replace(/\betc\.\s*\)/g, "etc.)");
  // Fin de phrase : un point (ou ! ?) suivi d'une espace et d'une majuscule, sauf après « etc ».
  const m = t.match(/^.*?(?<!\betc)[.!?](?=\s+[A-ZÀ-Ý]|$)/s);
  const premiere = (m ? m[0] : t).trim();
  return premiere.length > max ? `${premiere.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:(]$/, "")}…` : premiere;
}

/** Carte courte d'un métier pour le champ des possibles : titre, types, deux phrases. */
function carteMetierCourte(m, { ouvert = true } = {}) {
  const entete = `<strong>${echapper(m.titre)}</strong>
        <span class="puces">${(Array.isArray(m.riasec) ? typesDominants(m) : []).map(puceRiasec).join("")}</span>`;
  const corps = m.description ? `<p>${echapper(resume(m.description))}</p>` : "";
  return ouvert
    ? `<article class="metier ouvert"><p class="metier-entete">${entete}</p>${corps}</article>`
    : `<details class="metier"><summary>${entete}</summary>${corps}</details>`;
}

/**
 * Partie 3 : des métiers à explorer, rangés par les 5 zones du Rapport des
 * Possibles. Indicatif : la proximité trie, elle n'est jamais affichée (ni chiffre
 * ni étiquette « très proche / proche » : critique psy point 4).
 * @param {object} [o]
 * @param {number|null} [o.explores]  nombre de types RIASEC joués dans la partie
 */
export function blocChampDesPossibles(competences, onet, rome, o = {}) {
  if (!onet?.metiers?.length) return "";
  const { parType } = reperesRiasec(competences, rome);
  const zones = metiersParZone(poidsRiasec(parType), onet.metiers, { parZone: o.parZone ?? 2 });
  if (!zones) return "";
  const licence = typeof onet.licence === "string" && /^https:\/\//.test(onet.licence) ? onet.licence : null;
  const sections = [1, 2, 3, 4, 5].map((z) => `<div class="zone">
      <h4>${echapper(ZONES_METIERS[z].titre)}</h4>
      <p class="discret">${echapper(ZONES_METIERS[z].texte)}</p>
      ${zones[z].length
        ? `<div class="metiers">${zones[z].map((m) => carteMetierCourte(m, { ouvert: o.ouvert ?? true })).join("")}</div>`
        : `<p class="discret">Pas de métier dans cette zone cette fois.</p>`}
    </div>`).join("");
  const explores = Number.isInteger(o.explores) && o.explores > 0 && o.explores < 6
    ? `<p class="discret">Cette partie a exploré ${o.explores} types d'activités sur 6 : des métiers d'autres types peuvent aussi te correspondre.</p>`
    : "";
  return `<section class="bloc bloc-metiers">
    <h3>3. Des métiers à explorer, par zone <span class="discret">(indicatif)</span></h3>
    <p class="discret">Des métiers qui demandent le même genre d'activités que celles de la partie 2, rangés par zones comme dans ton Rapport des Possibles. C'est indicatif : ce sont des pistes à explorer, pas des conseils.</p>
    ${explores}
    <p class="discret">Seulement 2 pistes par zone, pour ne pas te noyer. Ton Rapport des Possibles en propose d'autres, et le psy peut en ajouter : aucune porte n'est fermée.</p>
    <p class="encart-lien">Formations, salaires et débouchés près de chez toi : cherche ces métiers sur
      <a href="https://www.orientation-regionsud.fr/" target="_blank" rel="noopener">orientation-regionsud.fr</a> (la borne de l'Agora des métiers).</p>
    ${sections}
    <p class="discret source">Durées : Rapport des Possibles ; niveaux : guide du Centre. ${echapper(onet.source ?? "")}${licence ? ` <a href="${echapper(licence)}" target="_blank" rel="noopener">CC BY 4.0</a>` : ""}</p>
  </section>`;
}

// ---------- Pour le psychologue ----------

const libelleDe = (c, rome) => c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle ?? null;
const traceDe = (c) => {
  const t = c.preuve ?? c.citation;
  return typeof t === "string" ? t.trim() : "";
};

/**
 * Amorces de reflet (2 au plus, choix de conception ; adaptation `encart-psy-questions`) :
 * un reflet sur une trace, et une valorisation de l'idée du tour s'il y en a une.
 */
export function refletsPsy(competences, rome) {
  const out = [];
  const citable = competences.find((c) => c.idee !== true && c.typePreuve !== "participation" && traceDe(c) && libelleDe(c, rome));
  if (citable) out.push(`Quand tu dis « ${traceDe(citable)} », on dirait que « ${libelleDe(citable, rome)} » compte pour toi.`);
  const idee = competences.find((c) => c.idee === true && traceDe(c));
  if (idee) out.push(`Tu as trouvé « ${traceDe(idee)} » devant le groupe : c'est une ressource.`);
  return out.slice(0, 2);
}

/**
 * Relances ouvertes (4 au plus, choix de conception), dans cet ordre : récit,
 * valeurs, focalisation, une question sur le type d'activités qui ressort le plus.
 * @param {Array} competences  compétences gardées
 * @param {Array} [typees]     compétences typées (partie 2), pour la question RIASEC
 */
export function relancesPsy(competences, rome, typees = competences) {
  const qs = [];
  const premier = competences.map((c) => libelleDe(c, rome)).find(Boolean);
  qs.push(premier
    ? `Tu as gardé « ${premier} » : raconte-moi une autre fois où tu as fait ça.`
    : "Raconte-moi une fois où tu as fait quelque chose dont tu es fier·e.");
  qs.push("Qu'est-ce qui compte le plus pour toi dans un futur métier ?");
  qs.push("Parmi les métiers de ton Rapport des Possibles, lesquels demandent ces compétences ?");
  const [dominant] = reperesRiasec(typees, rome).dominants;
  if (dominant) qs.push(RIASEC[dominant].question);
  return qs.slice(0, 4);
}

/** Encadré « Pour le psychologue — Comment lire cette fiche » (adaptation `nouveau-notice-psy`). */
export function noticePsy({ parEpisode = true } = {}) {
  const origine = parEpisode
    ? "Les types d'activités (partie 2) viennent du type RIASEC des épisodes joués : ils dépendent des épisodes choisis pour la partie."
    : "Les types d'activités (partie 2) viennent des codes RIASEC du fichier ROME, dont la méthode n'est pas documentée.";
  return `<aside class="bloc notice-psy">
      <h3>Pour le psychologue — Comment lire cette fiche</h3>
      <p>Ces compétences ont été proposées par une IA pendant un jeu de rôle en groupe, à partir des réponses écrites du jeune. Seules des compétences d'une liste fermée (ROME 4.0) sont possibles, chacune avec une citation exacte comme trace : elle montre ce que le jeune a écrit, pas qu'il possède la compétence. Une compétence n'est proposée que si la réponse contient une action précise et citable.</p>
      <p>Ce n'est ni un test psychométrique ni une évaluation psychologique : c'est un matériau d'entretien. Vérifiez chaque trace avec le jeune ; il a gardé ou refusé chaque compétence, et il apporte cette fiche s'il le souhaite.</p>
      <p>${origine} Ce sont des repères qualitatifs, qui ne remplacent pas l'IPH du Rapport des Possibles : en cas d'écart, l'IPH fait référence, et l'écart est matière à discussion. Les métiers de la partie 3 sont indicatifs, sans seuil établi pour cet usage.</p>
    </aside>`;
}

/**
 * Encart « Pour le psy ou le conseiller » : cadre d'usage, épisodes passés (jamais
 * montrés au groupe), avis par épisode, débrief, amorces de reflet et relances.
 * Pas de durée d'entretien (critique psy : c'est le psychologue qui la fixe).
 */
export function encartPsy(f, competences, rome, typees = competences) {
  const passes = f.passes.map((p) =>
    `<li>A préféré passer à l'épisode ${p.index + 1} (${echapper(titreEpisode(f.problemes, p.index, p.titre))}) : à explorer en entretien.</li>`).join("");
  const avis = f.preferences.map((p) =>
    `${echapper(titreEpisode(f.problemes, p.index, p.titre))} : ${VALEURS_PREFERENCE[p.valeur]}`).join(" · ");
  const reflets = refletsPsy(competences, rome);
  return `<section class="bloc encart-psy">
      <h3>Pour le psy ou le conseiller</h3>
      <p>Ce document <strong>complète le Rapport des Possibles</strong> : le rapport présente les intérêts, les aptitudes et la personnalité ; ici, ce sont des <strong>compétences repérées pendant un jeu</strong>. À utiliser quand vous reliez les résultats à la situation concrète, aux valeurs et aux ressources du jeune (guide du Centre, p. 11). En entretien motivationnel, cela s'inscrit dans la tâche d'évocation : faire parler le jeune de ses raisons et de ses ressources, avec ses mots.</p>
      ${passes ? `<p><strong>À explorer en entretien :</strong></p><ul class="passes">${passes}</ul>` : ""}
      ${avis ? `<p><strong>Avis donnés pendant la partie</strong> <span class="discret">(« Ce genre de situation, tu aimerais en vivre dans un travail ? »)</span> : ${avis}.</p>` : ""}
      ${f.debrief ? `<p><strong>À reprendre avec le psychologue</strong> <span class="discret">(débrief : « Raconte une fois, dans ta vraie vie, où tu l'as déjà utilisée. »)</span></p><blockquote class="preuve">« ${echapper(f.debrief)} »</blockquote>` : ""}
      ${reflets.length ? `<p><strong>Amorces de reflet</strong> <span class="discret">(à reformuler sur le moment)</span></p><ul class="reflets">${reflets.map((q) => `<li>${echapper(q)}</li>`).join("")}</ul>` : ""}
      <p><strong>Relances ouvertes</strong></p>
      <ol class="relances-psy">${relancesPsy(competences, rome, typees).map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
      <p>Pour finir : « Qu'as-tu écrit dans “Un premier pas” sur ta fiche papier ? »</p>
      <p class="discret">Des pistes, pas un questionnaire à dérouler. Compétences du référentiel ROME 4.0 (France Travail). Ni score, ni niveau.</p>
    </section>`;
}

/** Plan d'action à écrire à la main (adaptation `nouveau-plan-exploration-ecrit`) : rien n'est saisi. */
export function blocPlanAction() {
  const ligne = (etiquette) => `<p class="ligne-a-ecrire"><span>${echapper(etiquette)}</span><span class="trait"></span></p>`;
  return `<section class="bloc plan-action">
      <h3>4. Mes prochains pas <span class="discret">(à écrire à la main)</span></h3>
      <p class="discret">En complément des recommandations de ton psychologue. Ce que tu écris ici reste sur ta feuille.</p>
      <p><strong>Ce que je vais chercher à l'Agora</strong></p>
      ${ligne("Métier ou mot-clé :")}
      ${ligne("Métier ou mot-clé :")}
      ${ligne("Avec qui j'en parle ensuite :")}
    </section>`;
}

/**
 * Fiche complète (HTML), sur le modèle du Rapport des Possibles du Centre :
 * 1. tes compétences repérées (avec ta trace et la question sur ton vécu), puis
 * la notice pour le psychologue, 2. les types d'activités où tu as montré des
 * compétences, 3. des métiers à explorer par zone (indicatif), 4. tes prochains
 * pas (à la main), puis l'encart pour le psy ou le conseiller.
 * @param {object} brut  réponse de l'API (voir normaliserFiche)
 * @param {{rome?:object, onet?:object, date?:string, metiersOuverts?:boolean, psy?:boolean, imprimable?:boolean}} o
 *   psy:false (fiche du téléphone) retire la notice et l'encart psy ;
 *   imprimable (par défaut = psy) ajoute le plan d'action à la main et la ligne
 *   vers un adulte (le téléphone affiche déjà cette ligne sous la fiche).
 */
export function rendreFiche(brut, o = {}) {
  const { rome, onet } = o;
  const avecPsy = o.psy !== false;
  const imprimable = o.imprimable ?? avecPsy;
  const f = normaliserFiche(brut);
  const toutes = [...f.depart, ...f.jeu];
  const { parEpisode, liste: typees, joues } = competencesTypees(f);
  const date = o.date ?? "";
  const typeLigne = (c) => {
    if (!parEpisode) return undefined;
    if (c.problemeIndex === null || c.problemeIndex === undefined || c.typePreuve === "vecu") return TYPE_RECIT;
    const k = c.typePreuve !== "participation" && c.horsScenario !== true ? lettreEpisode(c, f.problemes) : null;
    return k ? { lettre: k, ...RIASEC[k] } : { lettre: null, ...SANS_TYPE };
  };
  // Une seule fois par épisode, sous sa première compétence.
  const questionsVues = new Set();
  const questionVecu = (c) => {
    const q = texteOuNull(f.problemes[c.problemeIndex]?.questionVecu, 300);
    if (!q || questionsVues.has(c.problemeIndex)) return undefined;
    questionsVues.add(c.problemeIndex);
    return q;
  };
  const listeDepart = f.depart.length
    ? `<ul class="competences">${f.depart.map((c) => ligneCompetence(c, rome, "", { type: typeLigne(c) })).join("")}</ul>`
    : `<p class="discret">Pas de compétence de départ retenue cette fois. Tu pourras en ajouter avec le psy.</p>`;
  const listeJeu = f.jeu.length
    ? `<ul class="competences">${f.jeu.map((c) => ligneCompetence(c, rome, titreProbleme(c, f), { type: typeLigne(c), questionVecu: questionVecu(c) })).join("")}</ul>`
    : `<p class="discret">Tes réponses dans l'histoire sont à relire avec le psy.</p>`;
  const plu = f.preferences.filter((p) => p.valeur !== "non")
    .map((p) => `${titreEpisode(f.problemes, p.index, p.titre)}${p.valeur === "un_peu" ? " (un peu)" : ""}`);
  const interets = typees.length
    ? blocInteretsOrdonnes(typees, rome, { titre: "2. Les types d'activités où tu as montré des compétences pendant le jeu", joues })
    : "";
  return `<header class="fiche-entete">
      <div>
        <p class="surtitre">Déclic · complément à ton Rapport des Possibles${date ? ` · ${echapper(date)}` : ""}${f.code ? ` · partie ${echapper(f.code)}` : ""}</p>
        <h2><span class="avatar" aria-hidden="true">${echapper(f.avatar)}</span> ${echapper(f.pseudo || "Mon personnage")}</h2>
        <p class="discret">Ton Rapport des Possibles parle de tes intérêts, de tes aptitudes et de ta personnalité. Ici, ce sont des compétences repérées pendant le jeu, à partir de tes propres mots.</p>
      </div>
    </header>
    <section class="bloc">
      <h3>1. Tes compétences repérées</h3>
      <p class="discret">Ta trace, ce sont tes propres mots : ce que tu as écrit. Chaque compétence est à vérifier avec ton psy.</p>
      <h4>Ce que tu as déjà fait (ton récit)</h4>
      ${listeDepart}
      <h4>Ce que tu as proposé pendant le jeu</h4>
      ${listeJeu}
    </section>
    ${avecPsy ? noticePsy({ parEpisode }) : ""}
    ${interets}
    ${plu.length ? `<p class="preferences">Ce jour-là, ces situations t'ont plu : ${echapper(plu.join(", "))}.</p>` : ""}
    ${onet ? blocChampDesPossibles(typees, onet, rome, { ouvert: o.metiersOuverts ?? true, explores: joues?.length ?? null }) : ""}
    ${imprimable ? blocPlanAction() : ""}
    ${avecPsy ? encartPsy(f, toutes, rome, typees) : ""}
    <footer class="fiche-pied">
      <p><strong>Ces compétences ont été repérées pendant un jeu, à partir de tes mots. Elles ne sont pas un diplôme : parles-en avec ton psy.</strong></p>
      ${imprimable ? `<p class="relais">${echapper(RELAIS_ADULTE)}</p>` : ""}
      <p>Ce sont des pistes de réflexion, pas un résultat de test, et elles peuvent être incomplètes. Tu restes l'expert·e de ton vécu. Compétences : ${echapper(rome?.source ?? "ROME 4.0 (France Travail)")}.</p>
    </footer>`;
}
