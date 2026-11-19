// Rendu HTML de la fiche personnage (fiche.html, fin de partie sur le téléphone)
// et du bloc « Métiers à découvrir » (aussi utilisé par l'outil solo).
// Fonctions PURES : elles renvoient des chaînes HTML où tout texte venant des
// données (pseudo, preuve, mots…) est échappé. Utilisables dans Node pour les tests.

import { metiersProches, metiersParZone, typesDominants } from "./metiers-proches.js";
import { RIASEC, echapper, reperesRiasec, poidsRiasec, puceRiasec, blocInteretsOrdonnes, typeDe, codeDe, indexMacros } from "./riasec.js";

const TYPES_ESCO = {
  exactMatch: "correspondance exacte",
  closeMatch: "correspondance proche",
  narrowMatch: "métier plus précis",
  broadMatch: "métier plus large",
};

const TYPES_PREUVE = {
  vecu: "Ce que tu as déjà vécu",
  jeu: "Montrée pendant le jeu",
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

/**
 * Normalise la réponse de GET /api/parties/:code/fiche/:joueurId (ou la vue joueur de fin).
 * Formats acceptés : { pseudo, avatar, competences } | { joueur:{…} } | { moi:{…} },
 * avec éventuellement { depart:[…], jeu:[…] } au lieu de `competences`.
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
  return {
    code: b.code ?? j.code ?? null,
    pseudo: String(j.pseudo ?? b.pseudo ?? "").slice(0, 40),
    avatar: String(j.avatar ?? b.avatar ?? "").slice(0, 8),
    date: b.date ?? b.finA ?? null,
    problemes: Array.isArray(b.problemes) ? b.problemes : [],
    depart: retenues.filter(estDepart),
    jeu: retenues.filter((c) => !estDepart(c)).sort((a, b2) => (a.problemeIndex ?? 0) - (b2.problemeIndex ?? 0)),
  };
}

/** Titre du problème d'où vient une compétence (si connu). */
function titreProbleme(c, fiche) {
  if (c.problemeTitre) return c.problemeTitre;
  const p = fiche.problemes[c.problemeIndex];
  if (typeof p === "string") return p;
  if (p?.titre) return p.titre;
  return Number.isInteger(c.problemeIndex) ? `Problème ${c.problemeIndex + 1}` : "";
}

/** Une compétence en ligne : pastille de couleur, libellé, mots, preuve. */
export function ligneCompetence(c, rome, contexte = "") {
  const t = typeDe(c, rome);
  const libelle = c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle ?? codeDe(c) ?? "";
  const preuve = c.preuve ?? c.citation ?? "";
  const typePreuve = TYPES_PREUVE[c.typePreuve] ?? "";
  return `<li class="competence" style="--type:${t.couleur}">
      <span class="pastille${t.lettre ? "" : " pastille-blanche"}" title="${echapper(t.nom)}" aria-hidden="true"></span>
      <div>
        <p class="competence-libelle"><strong>${echapper(libelle)}</strong>
          <span class="discret">${echapper(codeDe(c) ?? "")}${t.lettre ? ` · ${t.lettre} ${t.nom}` : ` · ${t.nom}`}</span></p>
        ${c.mots ?? c.mots_du_jeune ? `<p class="competence-mots">${echapper(c.mots ?? c.mots_du_jeune)}</p>` : ""}
        ${preuve ? `<blockquote class="preuve">« ${echapper(preuve)} »</blockquote>` : ""}
        ${typePreuve || contexte ? `<p class="discret competence-contexte">${echapper([typePreuve, contexte].filter(Boolean).join(" · "))}</p>` : ""}
      </div>
    </li>`;
}

// Les 5 zones de métiers du Rapport des Possibles (même base O*NET, mêmes zones),
// avec les durées qu'il affiche.
export const ZONES_METIERS = {
  1: { titre: "1re zone · Métiers accessibles en 0 à 6 mois", texte: "Une courte formation suffit, souvent sur le terrain. Le bac n'est pas toujours nécessaire." },
  2: { titre: "2e zone · Métiers accessibles en 3 mois à 2 ans", texte: "Niveau CAP, BEP ou bac, souvent en alternance." },
  3: { titre: "3e zone · Métiers accessibles en 1 à 4 ans", texte: "Des études après le bac : BTS, BUT ou licence professionnelle." },
  4: { titre: "4e zone · Métiers accessibles en 2 à 6 ans", texte: "Une licence ou un master, parfois avec un concours." },
  5: { titre: "5e zone · Métiers accessibles en 4 à 10 ans", texte: "Les études les plus longues : doctorat ou spécialisation après le master." },
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
 * « Ton champ des possibles par zone de métiers » : métiers proches du profil
 * d'intérêts des compétences, rangés par les 5 zones du Rapport des Possibles.
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
        : `<p class="discret">Pas de métier proche dans cette zone cette fois.</p>`}
    </div>`).join("");
  return `<section class="bloc bloc-metiers">
    <h3>3. Ton champ des possibles par zone de métiers</h3>
    <p class="discret">Des métiers dont le profil d'intérêts ressemble à celui de tes compétences, rangés par zones comme dans ton Rapport des Possibles. Ce sont des pistes à explorer : aucune porte n'est fermée.</p>
    <p class="encart-lien">Formations, salaires et débouchés près de chez toi : cherche ces métiers sur
      <a href="https://www.orientation-regionsud.fr/" target="_blank" rel="noopener">orientation-regionsud.fr</a> (la borne de l'Agora des métiers).</p>
    ${sections}
    <p class="discret source">${echapper(onet.source ?? "")}${licence ? ` <a href="${echapper(licence)}" target="_blank" rel="noopener">CC BY 4.0</a>` : ""}</p>
  </section>`;
}

/** Questions pour l'encart « Pour le psy » : à partir des compétences et des types dominants. */
export function questionsPsy(competences, rome) {
  const qs = [];
  const libelles = competences
    .map((c) => c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle)
    .filter(Boolean);
  if (libelles[0]) qs.push(`Tu as gardé « ${libelles[0]} » : raconte-moi une autre fois où tu as fait ça.`);
  if (libelles[1]) qs.push(`« ${libelles[1]} » : où est-ce que tu t'en sers en dehors du jeu ?`);
  const { dominants } = reperesRiasec(competences, rome);
  for (const k of dominants) qs.push(RIASEC[k].question);
  qs.push("Parmi les métiers de ton Rapport des Possibles, lesquels demandent ces compétences ?");
  qs.push("Qu'est-ce qui compte le plus pour toi dans un futur métier ?");
  return qs.slice(0, 6);
}

/**
 * Fiche complète (HTML), sur le modèle du Rapport des Possibles du Centre :
 * 1. tes compétences révélées (ce que le rapport ne contient pas : le support du
 * 4e temps de l'entretien), 2. tes intérêts classés par ordre, 3. ton champ des
 * possibles par zone, puis l'encart pour le psy ou le conseiller.
 * @param {object} brut  réponse de l'API (voir normaliserFiche)
 * @param {{rome?:object, onet?:object, date?:string, metiersOuverts?:boolean, psy?:boolean}} o
 */
export function rendreFiche(brut, o = {}) {
  const { rome, onet } = o;
  const f = normaliserFiche(brut);
  const toutes = [...f.depart, ...f.jeu];
  const date = o.date ?? "";
  const listeDepart = f.depart.length
    ? `<ul class="competences">${f.depart.map((c) => ligneCompetence(c, rome)).join("")}</ul>`
    : `<p class="discret">Pas de compétence de départ retenue cette fois. Tu pourras en ajouter avec le psy.</p>`;
  const listeJeu = f.jeu.length
    ? `<ul class="competences">${f.jeu.map((c) => ligneCompetence(c, rome, titreProbleme(c, f))).join("")}</ul>`
    : `<p class="discret">Pas encore de compétence gagnée en jeu.</p>`;
  const psy = o.psy === false ? "" : `<section class="bloc encart-psy">
      <h3>Pour le psy ou le conseiller</h3>
      <p>Ce document <strong>complète le Rapport des Possibles</strong> : le rapport présente les intérêts, les aptitudes et la personnalité ; ici, ce sont des <strong>compétences et des activités transversales</strong>, à relier au projet du jeune pendant l'analyse (4e temps de l'entretien).</p>
      <p class="discret">Chaque compétence a été gardée par le jeune. La preuve, ce sont ses propres mots pendant le jeu. Compétences du référentiel ROME 4.0 (France Travail). Ni score, ni niveau, ni classement.</p>
      <p><strong>Questions pour en parler :</strong></p>
      <ol>${questionsPsy(toutes, rome).map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
    </section>`;
  const interets = toutes.length ? blocInteretsOrdonnes(toutes, rome, { titre: "2. Tes intérêts, classés par ordre" }) : "";
  return `<header class="fiche-entete">
      <div>
        <p class="surtitre">Déclic · complément à ton Rapport des Possibles${date ? ` · ${echapper(date)}` : ""}${f.code ? ` · partie ${echapper(f.code)}` : ""}</p>
        <h2><span class="avatar" aria-hidden="true">${echapper(f.avatar)}</span> ${echapper(f.pseudo || "Mon personnage")}</h2>
        <p class="discret">Ton Rapport des Possibles parle de tes intérêts, de tes aptitudes et de ta personnalité. Ici, ce sont les compétences que tu as montrées toi-même, avec tes propres mots.</p>
      </div>
    </header>
    <section class="bloc">
      <h3>1. Tes compétences révélées</h3>
      <h4>Ce que tu sais déjà faire</h4>
      ${listeDepart}
      <h4>Ce que tu as montré pendant le jeu</h4>
      ${listeJeu}
    </section>
    ${interets}
    ${onet ? blocChampDesPossibles(toutes, onet, rome, { ouvert: o.metiersOuverts ?? true }) : ""}
    ${psy}
    <footer class="fiche-pied">
      Ces compétences viennent d'un jeu et de tes propres mots : ce sont des pistes de réflexion, pas un résultat de test, et elles peuvent être incomplètes. Tu restes l'expert·e de ton vécu. Compétences : ${echapper(rome?.source ?? "ROME 4.0 (France Travail)")}.
    </footer>`;
}
