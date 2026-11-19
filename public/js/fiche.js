// Rendu HTML de la fiche personnage (fiche.html, fin de partie sur le téléphone)
// et du bloc « Métiers à découvrir » (aussi utilisé par l'outil solo).
// Fonctions PURES : elles renvoient des chaînes HTML où tout texte venant des
// données (pseudo, preuve, mots…) est échappé. Utilisables dans Node pour les tests.

import { metiersProches, typesDominants } from "./metiers-proches.js";
import { RIASEC, echapper, reperesRiasec, poidsRiasec, puceRiasec, blocRiasec, typeDe, codeDe, indexMacros } from "./riasec.js";

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

/** Une compétence en ligne : gommette de couleur, libellé, mots, preuve. */
export function ligneCompetence(c, rome, contexte = "") {
  const t = typeDe(c, rome);
  const libelle = c.libelle ?? c.libelle_rome ?? indexMacros(rome).get(codeDe(c))?.libelle ?? codeDe(c) ?? "";
  const preuve = c.preuve ?? c.citation ?? "";
  const typePreuve = TYPES_PREUVE[c.typePreuve] ?? "";
  return `<li class="competence" style="--type:${t.couleur}">
      <span class="gommette${t.lettre ? "" : " gommette-blanche"}" title="Gommette ${t.gommette}" aria-hidden="true"></span>
      <div>
        <p class="competence-libelle"><strong>${echapper(libelle)}</strong>
          <span class="discret">${echapper(codeDe(c) ?? "")}${t.lettre ? ` · ${t.lettre} ${t.nom}` : ` · ${t.nom}`} · gommette ${t.gommette}</span></p>
        ${c.mots ?? c.mots_du_jeune ? `<p class="competence-mots">${echapper(c.mots ?? c.mots_du_jeune)}</p>` : ""}
        ${preuve ? `<blockquote class="preuve">« ${echapper(preuve)} »</blockquote>` : ""}
        ${typePreuve || contexte ? `<p class="discret competence-contexte">${echapper([typePreuve, contexte].filter(Boolean).join(" · "))}</p>` : ""}
      </div>
    </li>`;
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
  qs.push("Dans la partie, qu'est-ce qui t'a donné envie d'en savoir plus ?");
  qs.push("Parmi les métiers à découvrir, lequel tu aimerais aller voir de plus près ?");
  return qs.slice(0, 6);
}

/**
 * Fiche personnage complète (HTML).
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
      <h3>Pour le psy</h3>
      <p class="discret">Chaque compétence a été gardée par le jeune. Les preuves sont ses propres mots ou ses choix pendant le jeu. Ni score, ni niveau, ni classement : c'est un point de départ pour l'échange.</p>
      <p><strong>Questions pour en parler :</strong></p>
      <ol>${questionsPsy(toutes, rome).map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
    </section>`;
  return `<header class="fiche-entete">
      <div>
        <p class="surtitre">Déclic · fiche personnage${date ? ` · ${echapper(date)}` : ""}${f.code ? ` · partie ${echapper(f.code)}` : ""}</p>
        <h2><span class="avatar" aria-hidden="true">${echapper(f.avatar)}</span> ${echapper(f.pseudo || "Mon personnage")}</h2>
      </div>
    </header>
    <section class="bloc">
      <h3>Ce que je sais déjà faire</h3>
      ${listeDepart}
    </section>
    <section class="bloc">
      <h3>Compétences gagnées pendant le jeu</h3>
      ${listeJeu}
    </section>
    ${toutes.length ? blocRiasec(toutes, rome, {
      libelle: (c) => c.libelle ?? c.libelle_rome ?? codeDe(c),
      intro: "Chaque compétence du ROME a souvent une couleur d'intérêt (France Travail). Voici les couleurs de tes compétences. C'est un repère pour en parler, pas un résultat de test.",
      absent: "Pas apparu pendant la partie, ce qui ne veut pas dire absent.",
      dominantsIntro: "Tes compétences parlent surtout de :",
      questions: false,
    }) : ""}
    ${onet ? blocMetiers(toutes, onet, rome, { ouvert: o.metiersOuverts ?? true }) : ""}
    ${psy}
    <footer class="fiche-pied">
      Rien n'est conservé après la partie. Compétences : ${echapper(rome?.source ?? "ROME 4.0 (France Travail)")}. L'outil éclaire, il ne décide pas.
    </footer>`;
}
