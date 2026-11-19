// Interface : récit → compétences proposées → validation par le jeune → fiche pour le psy.
// Toutes les données de test sont inventées.

import { EXEMPLES } from "./exemples.js";
import { RIASEC, echapper, blocRiasec } from "./riasec.js";
import { blocMetiers } from "./fiche.js";
import { analyserRecit } from "./analyse-client.js";
import { dicteeDisponible } from "./joueur-outils.js";

const RELANCES = [
  "Qu'est-ce que tu fais pour aider à la maison ?",
  "Un truc que tu as réparé, construit ou bidouillé ?",
  "Un moment où tu as aidé quelqu'un ?",
  "Ce que tu fais en ligne (jeux, réseaux, vidéos…) ?",
  "Un truc que les autres te demandent souvent ?",
  "Un petit boulot, un coup de main, une asso ?",
];

const $ = (s) => document.querySelector(s);
const etat = { recit: "", analyse: null, choix: new Map() };
let rome = null;
let onet = null;

// Typologie RIASEC, repères et blocs HTML : voir riasec.js (partagé avec la fiche du jeu).

// ---------- Navigation ----------
function aller(n) {
  for (const i of [1, 2, 3]) {
    $(`#etape-${i}`).hidden = i !== n;
    document.querySelector(`.etapes [data-etape="${i}"]`).classList.toggle("active", i === n);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-aller]").forEach((b) => b.addEventListener("click", () => aller(Number(b.dataset.aller))));

// ---------- Étape 1 ----------
const zone = $("#recit");
for (const q of RELANCES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "relance";
  b.textContent = q;
  b.addEventListener("click", () => {
    document.querySelectorAll(".relance").forEach((x) => x.classList.toggle("choisie", x === b));
    if (zone.value.trim()) zone.value = zone.value.trimEnd() + "\n\n";
    zone.placeholder = q;
    zone.focus();
  });
  $("#relances").append(b);
}
for (const ex of EXEMPLES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondaire";
  b.textContent = ex.nom;
  b.addEventListener("click", () => {
    zone.value = ex.recit;
  });
  $("#exemples").append(b);
}

// Dictée vocale (navigateurs compatibles uniquement)
// (seulement en contexte sécurisé : sinon le micro est refusé d'office)
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
if (dicteeDisponible(window)) {
  const micro = $("#micro");
  micro.hidden = false;
  let reco = null;
  micro.addEventListener("click", () => {
    if (reco) return reco.stop();
    reco = new Reco();
    reco.lang = "fr-FR";
    reco.continuous = true;
    reco.interimResults = false;
    reco.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) zone.value += (zone.value && !zone.value.endsWith(" ") ? " " : "") + e.results[i][0].transcript;
      }
    };
    reco.onend = () => {
      reco = null;
      micro.textContent = "🎙️ Parler au lieu d'écrire";
    };
    reco.start();
    micro.textContent = "⏹️ Arrêter la dictée";
  });
}

$("#analyser").addEventListener("click", async () => {
  const recit = zone.value.trim();
  const statut = $("#statut");
  if (recit.length < 30) {
    statut.textContent = "Raconte au moins une ou deux situations, même en quelques phrases.";
    return;
  }
  const bouton = $("#analyser");
  bouton.disabled = true;
  statut.textContent = "Je lis ton histoire et je cherche ce que tu sais faire…";
  try {
    etat.analyse = await analyser(recit);
    etat.recit = recit;
    etat.choix = new Map(etat.analyse.competences.map((_, i) => [i, null]));
    statut.textContent = "";
    afficherCartes();
    aller(2);
  } catch (e) {
    statut.textContent = e.message;
  } finally {
    bouton.disabled = false;
  }
});

// Sans serveur (démo statique GitHub Pages), analyserRecit renvoie un message
// clair : il n'y a plus de résultats pré-calculés (demo/*.json supprimés).
const analyser = (recit) => analyserRecit(recit);

// ---------- Étape 2 ----------
function afficherCartes() {
  const conteneur = $("#cartes");
  conteneur.replaceChildren();
  const { competences, a_approfondir } = etat.analyse;
  if (!competences.length) {
    conteneur.innerHTML = `<p class="vide">On n'a rien pu prouver à partir de ce récit. Ajoute une ou deux situations concrètes : ce que tu as fait, comment, avec qui.</p>`;
  }
  competences.forEach((c, i) => {
    const carte = $("#tpl-carte").content.firstElementChild.cloneNode(true);
    carte.querySelector(".situation").textContent = c.situation;
    const mots = carte.querySelector(".mots");
    mots.textContent = c.mots_du_jeune;
    mots.addEventListener("input", () => (c.mots_du_jeune = mots.textContent.trim()));
    carte.querySelector(".preuve").textContent = `« ${c.citation} »`;
    carte.querySelector(".code").textContent = c.code_rome;
    carte.querySelector(".libelle").textContent = c.libelle_rome;
    const type = RIASEC[c.riasec?.[0]];
    const puce = carte.querySelector(".riasec");
    if (type) {
      puce.textContent = `${type.verbe}`;
      puce.title = `Repère RIASEC : ${type.nom}`;
      puce.style.setProperty("--type", type.couleur);
    } else puce.remove();
    carte.querySelectorAll("[data-choix]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = etat.choix.get(i) === b.dataset.choix ? null : b.dataset.choix;
        etat.choix.set(i, v);
        carte.dataset.choix = v ?? "";
        carte.querySelectorAll("[data-choix]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.choix === v)));
        majBoutonFiche();
      }),
    );
    conteneur.append(carte);
  });
  const appro = $("#approfondir");
  appro.hidden = !a_approfondir.length;
  appro.innerHTML = a_approfondir.length
    ? `<h3>Tu peux en dire plus ?</h3><ul>${a_approfondir.map((q) => `<li>${echapper(q)}</li>`).join("")}</ul>`
    : "";
  majBoutonFiche();
}

function majBoutonFiche() {
  const n = [...etat.choix.values()].filter((v) => v === "garde").length;
  const b = $("#vers-fiche");
  b.disabled = n === 0;
  b.textContent = n ? `Préparer la fiche pour le psy (${n}) →` : "Garde au moins une compétence";
}

$("#vers-fiche").addEventListener("click", async () => {
  [rome, onet] = await Promise.all([
    rome ?? fetch("data/rome.json").then((r) => r.json()),
    onet ?? fetch("data/metiers.json").then((r) => r.json()),
  ]);
  afficherFiche();
  aller(3);
});

// ---------- Étape 3 : familles de métiers (calcul déterministe, sans IA) ----------
function famillesMetiers(codes) {
  const macros = new Map(rome.macros.map((m) => [m.code, m]));
  const parFiche = new Map();
  for (const code of new Set(codes)) {
    for (const f of macros.get(code)?.fiches ?? []) parFiche.set(f, (parFiche.get(f) || 0) + 1);
  }
  const parDomaine = new Map();
  for (const [f, n] of parFiche) {
    const d = rome.fiches[f].domaine;
    if (!parDomaine.has(d)) parDomaine.set(d, { total: 0, fiches: [] });
    const g = parDomaine.get(d);
    g.total += n;
    g.fiches.push({ code: f, n, titre: rome.fiches[f].titre });
  }
  return [...parDomaine.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 4)
    .map(([d, g]) => ({
      code: d,
      libelle: rome.domainesPro[d],
      fiches: g.fiches.sort((a, b) => b.n - a.n || a.titre.localeCompare(b.titre)).slice(0, 3),
    }));
}

function afficherFiche() {
  const gardees = etat.analyse.competences.filter((_, i) => etat.choix.get(i) === "garde");
  const familles = famillesMetiers(gardees.map((c) => c.code_rome));
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  $("#fiche").innerHTML = `
    <header class="fiche-entete">
      <div>
        <p class="surtitre">Fiche de préparation d'entretien · ${date}</p>
        <h2>Ce que le jeune sait déjà faire</h2>
      </div>
      <p class="badge">${gardees.length} compétence${gardees.length > 1 ? "s" : ""} validée${gardees.length > 1 ? "s" : ""} par le jeune</p>
    </header>
    <p class="note">Chaque ligne a été relue et gardée par le jeune. Les preuves sont ses propres mots. Ni score, ni niveau : c'est un point de départ pour l'échange.</p>

    <table class="tableau">
      <thead><tr><th>Situation vécue</th><th>Compétence (ROME 4.0)</th><th>Preuve — ses mots</th><th>Question pour en parler</th></tr></thead>
      <tbody>
        ${gardees
          .map(
            (c) => `<tr>
          <td><strong>${echapper(c.situation)}</strong><br><span class="discret">${echapper(c.mots_du_jeune)}</span></td>
          <td>${echapper(c.libelle_rome)}<br><span class="discret">${echapper(c.code_rome)} · ${echapper(c.categorie)}</span></td>
          <td class="citation">« ${echapper(c.citation)} »</td>
          <td>${echapper(c.question_psy)}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    ${blocRiasecOutil(gardees)}

    <section class="bloc">
      <h3>Pistes pour ouvrir l'entretien (15 min)</h3>
      <ol>${etat.analyse.pistes_entretien.map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
    </section>

    <section class="bloc">
      <h3>Familles de métiers qui mobilisent ces compétences</h3>
      <p class="discret">Calcul direct sur le ROME : domaines professionnels où ces compétences reviennent le plus. À explorer ensemble, pas une recommandation.</p>
      <div class="familles">
        ${familles
          .map(
            (f) => `<div class="famille">
          <h4>${echapper(f.libelle)} <span class="discret">(${f.code})</span></h4>
          <ul>${f.fiches
            .map(
              (m) => `<li><a href="https://candidat.francetravail.fr/metierscope/fiche-metier/${m.code}" target="_blank" rel="noopener">${echapper(m.titre)}</a> <span class="discret">${m.code}</span></li>`,
            )
            .join("")}</ul>
        </div>`,
          )
          .join("")}
      </div>
    </section>

    ${blocMetiersOnet(gardees)}

    <footer class="fiche-pied">
      Généré à partir du récit du jeune, non conservé. Compétences : ${echapper(etat.analyse.referentiel)}.
      ${etat.analyse.ecartees?.length ? `${etat.analyse.ecartees.length} proposition(s) de l'IA écartée(s) automatiquement faute de preuve vérifiable.` : ""}
    </footer>`;
}

// Métiers dont le profil d'intérêts ressemble à celui que montrent les compétences
// validées (majeur = 2, mineur = 1). Calcul déterministe, sans IA (voir fiche.js).
function blocMetiersOnet(gardees) {
  return blocMetiers(gardees, onet, rome, {
    intro: "Métiers dont le profil d'intérêts ressemble à celui que montrent les situations racontées. Ce sont des idées à explorer avec le jeune, pas des recommandations.",
  });
}

function blocRiasecOutil(gardees) {
  return blocRiasec(gardees, rome, {
    libelle: (c) => c.situation,
    intro: "France Travail attribue un code RIASEC à la plupart des compétences du ROME (357 sur 506). Voici à quels types d'intérêts se rattachent les situations racontées. C'est un repère à croiser avec le profil d'intérêts du questionnaire du Centre, pas un résultat de test.",
    absent: "Pas apparu dans ce récit, ce qui ne veut pas dire absent.",
    dominantsIntro: "Ce récit met surtout en avant :",
  });
}

$("#imprimer").addEventListener("click", () => window.print());
