// Téléphone du joueur (joueur.html, servi aussi sur /p/<code>).
// Le serveur envoie après chaque changement une vue complète filtrée pour ce
// joueur ({ t:"etat", vue }, SPEC §2.3 et §3.3) : ce fichier ne fait que
// l'afficher et envoyer les actions du joueur. Aucune logique de jeu ici.
// Mode démo : ?demo=1 fait défiler des vues factices de chaque phase.

import { echapper, typeDe, couleursLisibles } from "./riasec.js";
import { rendreFiche } from "./fiche.js";
import {
  totalMinuteur, dicteeDisponible, competencesEnAttente, estDepartEnAttente, messageGarder, libelleValiderDepart,
  fermetureDefinitive, decalageServeur, decouperPhrases, texteEpisode, texteAmorce, separerMots, retourEpisode,
  texteMonIdee, ANNONCE_CADRE, MJ_EST_UNE_IA, QUESTIONS_DEBRIEF, MESSAGE_PASSE, PROMESSE_COMPETENCE, RELAIS_ADULTE,
} from "./joueur-outils.js";

// Copie de AVATARS (src/jeu.js, SPEC §3).
const AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦉", "🐢", "🐝", "🦄", "🐧", "🐯", "🐨"];

const RELANCES_RECIT = [
  "Un truc que tu as réparé ou bricolé ?",
  "Une fois où tu as aidé quelqu'un ?",
  "Un truc que tu as organisé avec tes potes ?",
  "Ce que tu fais en ligne (jeux, vidéos…) ?",
  "Un petit boulot, un coup de main, un club ?",
];

const LIMITES = { pseudo: 20, recitMin: 10, recit: 1000, reponse: 500, note: 200, debrief: 500 };

const params = new URLSearchParams(location.search);
const DEMO = params.get("demo") === "1";
const CODE = DEMO ? "DEMO" : lireCode();

const $ = (s) => document.querySelector(s);
const ecranEl = $("#ecran");
const annonceEl = $("#annonce");
const toastEl = $("#toast");
const connexionEl = $("#connexion");

const etat = {
  vue: null,
  cle: null,
  ws: null,
  tentatives: 0,
  aEteConnecte: false,
  minuteurReco: null,
  derniereErreur: "",
  joueurId: null,
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  choixDepart: [],
  edition: false,
  envoiEnCours: false,
  brouillons: {},
  debutsMinuteur: {},
  decalage: 0, // heure du serveur - heure du téléphone (ms), SPEC §2.3
  definitif: false, // fermeture 4001/4002/4008/4009 : pas de reconnexion
  rome: null,
  onet: null,
  chargements: {},
  // « Je ne sais pas » refusé (code sans_reponse) : débuts de phrase et « Je passe ce tour ».
  aide: null, // { pi, amorces, message }
};

// ---------- Utilitaires ----------

function lireCode() {
  const m = location.pathname.match(/\/p\/([A-Za-z]{4})\/?$/);
  const c = String(m?.[1] ?? params.get("code") ?? "").trim().toUpperCase();
  return /^[A-Z]{4}$/.test(c) ? c : null;
}

const cleStockage = (code) => `pc-joueur-${code}`;
function lireStockage(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function ecrireStockage(k, v) {
  try { localStorage.setItem(k, v); } catch { /* navigation privée : on continue sans */ }
}

let toastMinuteur = null;
function toast(message, duree = 4000) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastMinuteur);
  toastMinuteur = setTimeout(() => (toastEl.hidden = true), duree);
}

function annoncer(texte) {
  annonceEl.textContent = "";
  setTimeout(() => (annonceEl.textContent = texte), 50);
}

function etatConnexion(e, texte) {
  connexionEl.dataset.etat = e;
  connexionEl.textContent = texte;
}

const points = `<span class="points-attente" aria-hidden="true"><span></span><span></span><span></span></span>`;
const texteDe = (x) => (typeof x === "string" ? x : x?.texte ?? x?.resume ?? "");


function htmlMinuteur(v) {
  if (!v.minuteurFin) return "";
  return `<div class="minuteur petit" data-minuteur role="timer" aria-label="Temps restant">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="minuteur-fond" cx="50" cy="50" r="45"/><circle class="minuteur-arc" cx="50" cy="50" r="45" pathLength="100"/></svg>
      <span class="minuteur-texte"></span>
    </div>`;
}

const htmlCompte = (v) => (v.compte ? `<p class="tel-compte" data-compte></p>` : "");

// « J'ai lu » : la discussion démarre quand tout le monde l'a fait.
function boutonLu(v) {
  if (v.moi?.aLu) {
    return `<p class="tel-lu" role="status">✓ C'est noté. On attend que tout le monde ait lu.</p>${htmlCompte(v)}`;
  }
  return `<button type="button" class="bouton principal large grand" data-action="lu">✓ J'ai lu</button>`;
}

// Minuteur à 0 : on attend encore la réponse de ce joueur (pas d'enchaînement automatique).
const htmlTempsEcoule = (v, texte) => (v.tempsEcoule ? `<p class="tel-temps-ecoule" role="status">⏰ ${texte}</p>` : "");

function rappelQuestion(v) {
  const p = v.probleme;
  if (!p) return "";
  return `<details class="rappel">
      <summary><strong>${echapper(p.titre)}</strong> · relire la situation</summary>
      <p>${echapper(p.situation)}</p>
      ${p.question ? `<p class="tel-question">${echapper(p.question)}</p>` : ""}
    </details>`;
}

// Ce que devient la voix dictée (adaptation « langage-simple-dictee-accessibilite »).
const INFO_DICTEE = "Tu peux aussi dicter avec 🎙️ Dicter (à voix basse ou avec des écouteurs). Ton navigateur peut envoyer ta voix à son service de reconnaissance vocale pour la transformer en texte. Déclic ne garde pas ta voix. Tu peux toujours écrire au clavier.";

function zoneTexte({ id, label, max, placeholder, aide, rows = 5, infoDictee = false }) {
  return `<div class="champ">
      <label for="${id}">${label}</label>
      <textarea id="${id}" name="texte" rows="${rows}" maxlength="${max}" data-brouillon="${id}" placeholder="${echapper(placeholder)}"></textarea>
      <div class="rangee tel-sous-champ">
        <button type="button" class="bouton discret" data-action="micro" data-cible="${id}" aria-pressed="false" hidden>🎙️ Dicter</button>
        <span class="discret" data-compteur="${id}"></span>
      </div>
      ${infoDictee ? `<p class="discret tel-info-dictee" data-info-dictee hidden>${INFO_DICTEE}</p>` : ""}
      ${aide ? `<p class="discret">${aide}</p>` : ""}
    </div>`;
}

// Réécouter l'épisode (synthèse vocale du téléphone, si le navigateur le permet).
function boutonEcouter(v) {
  if (!v.probleme || typeof window === "undefined" || !("speechSynthesis" in window)) return "";
  return `<button type="button" class="bouton secondaire large" data-action="ecouter">🔊 Réécouter l'épisode</button>`;
}

// Phrase qui relie l'épisode au précédent (à partir du 2e).
const htmlLiaison = (v) => (v.liaison ? `<p class="tel-liaison">${echapper(v.liaison)}</p>` : "");

// Note privée pendant la réflexion et la discussion : facultative, jamais évaluée.
function formNote(v, pi) {
  const id = `note-${pi}`;
  if (etat.brouillons[id] == null && v.moi?.maNote) etat.brouillons[id] = v.moi.maNote;
  return `<form class="pile serre tel-note" data-form="note" novalidate>
      ${zoneTexte({ id, label: "Ta note (facultatif)", max: LIMITES.note, rows: 2, placeholder: "Un mot pour ne pas oublier ton idée…", aide: "🔒 Personne ne la verra : ni les autres, ni l'écran, ni le MJ." })}
      <button type="submit" class="bouton secondaire large" data-envoi>${v.moi?.maNote ? "✓ Note gardée · la mettre à jour" : "Garder ma note"}</button>
    </form>`;
}

// « Ce genre de situation, tu aimerais en vivre dans un travail ? » (facultatif, sans score).
function blocPreference(v) {
  if (!v.moi?.peutDonnerPreference) return "";
  const p = v.moi.maPreference;
  const b = (val, lib) => `<button type="button" class="bouton" data-action="preference" data-valeur="${val}" aria-pressed="${p === val}">${lib}</button>`;
  return `<section class="pile serre tel-preference" aria-label="Ton avis sur cette situation">
      <p><strong>Ce genre de situation, tu aimerais en vivre dans un travail ?</strong></p>
      <div class="rangee tel-choix-avis" role="group">${b("oui", "Oui")}${b("un_peu", "Un peu")}${b("non", "Non")}</div>
      <p class="discret">${p ? "C'est noté. Tu peux changer d'avis." : "Facultatif. Ta réponse va seulement sur ta fiche."}</p>
    </section>`;
}

const libelleDe = (c) => c.libelle ?? c.libelle_rome ?? c.code ?? "";
const motsDe = (c) => c.mots ?? c.mots_du_jeune ?? "";
const preuveDe = (c) => c.preuve ?? c.citation ?? "";

function carteCompetence(c, { surtitre = "", corps = "" } = {}) {
  const t = typeDe(c, etat.rome);
  // Bordure à la couleur SPEC ; bandeau assombri si besoin pour un texte lisible (AA).
  const { fond, texte } = couleursLisibles(t.couleur);
  // « Tu as proposé de … : c'est ce qu'on appelle « libellé ». » : le libellé n'est
  // pas répété juste en dessous (critique psy point 2).
  const libelle = libelleDe(c);
  const coupe = separerMots(motsDe(c), libelle);
  const titre = coupe
    ? `<p class="mots">${echapper(coupe.avant)}</p><h2>« ${echapper(libelle)} »${coupe.apres ? ` ${echapper(coupe.apres)}` : ""}</h2>`
    : `<h2>${echapper(libelle)}</h2>${motsDe(c) ? `<p class="mots">${echapper(motsDe(c))}</p>` : ""}`;
  return `<article class="carte-competence" style="--type:${t.couleur};--fond-type:${fond};--sur-type:${texte}">
      <p class="carte-competence-bandeau">${surtitre ? `${echapper(surtitre)} · ` : ""}${t.lettre ? `${t.lettre} · ${t.nom}` : t.nom}</p>
      <div class="carte-competence-corps">
        ${titre}
        ${c.horsScenario === true ? `<p class="discret">(repérée hors scénario, à discuter avec ton psy)</p>` : ""}
        ${preuveDe(c) ? `<p class="discret">Ta trace (tes mots) :</p><blockquote class="citation">« ${echapper(preuveDe(c))} »</blockquote>` : ""}
        ${corps}
        <p class="discret carte-verifier">Compétence repérée, à vérifier avec ton psy.</p>
      </div>
    </article>`;
}

function lienFiche(v) {
  const brut = v.fin?.lienFiche;
  if (typeof brut === "string" && /^(\/|https?:\/\/|fiche\.html)/.test(brut)) return brut;
  const id = v.moi?.id ?? etat.joueurId ?? "";
  return `fiche.html?code=${encodeURIComponent(v.code ?? CODE ?? "")}&joueur=${encodeURIComponent(id)}${DEMO ? "&demo=1" : ""}`;
}

// ---------- Données (couleurs RIASEC, métiers) ----------

function charger(nom) {
  if (etat[nom] || etat.chargements[nom]) return;
  const fichier = nom === "rome" ? "data/rome.json" : "data/metiers.json";
  etat.chargements[nom] = fetch(fichier)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      etat[nom] = d;
      if (etat.vue) rafraichir();
    })
    .catch(() => {})
    .finally(() => (etat.chargements[nom] = null));
}

// ---------- Écrans ----------

/** Écran à afficher pour une vue : { cle, titre, html }. Même clé = on ne reconstruit pas. */
function ecranPour(v) {
  if (!CODE) return ecranCode();
  if (!v) return ecranConnexion();
  const moi = v.moi;
  if (!moi || !moi.pseudo) {
    return v.phase === "accueil" ? ecranRejoindre(v) : ecranTropTard();
  }
  const pi = v.problemeIndex ?? 0;
  switch (v.phase) {
    case "accueil":
      return {
        cle: "attente-debut",
        titre: "Tu es dans la partie",
        html: `<div class="pile centre large">
            <span class="avatar grand" aria-hidden="true">${echapper(moi.avatar)}</span>
            <h1>Salut ${echapper(moi.pseudo)} !</h1>
            <p>Tu es dans la partie. Regarde l'écran : l'animateur va lancer le jeu.</p>
            ${points}
          </div>`,
      };
    case "creation":
      return ecranCreation(v);
    case "presentation":
      return {
        cle: `presentation:${pi}:${!!moi.aLu}:${v.liaison ?? ""}`,
        titre: moi.aLu ? "On attend les autres" : "Regarde l'écran",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">👀</p>
            ${htmlLiaison(v)}
            <h1>Regarde l'écran</h1>
            <p>L'animateur lit la situation${v.probleme?.titre ? ` « ${echapper(v.probleme.titre)} »` : ""}.</p>
            ${pi === 0 ? `<p class="tel-cadre">${echapper(ANNONCE_CADRE[0])} ${echapper(ANNONCE_CADRE[1])}</p>` : ""}
            ${boutonLu(v)}
            ${boutonEcouter(v)}
          </div>
          ${rappelQuestion(v)}`,
      };
    // Réflexion silencieuse avant la discussion : note privée facultative.
    case "reflexion":
      return {
        cle: `reflexion:${pi}:${moi.maNote ?? ""}`,
        titre: "Réfléchis en silence",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">🤫</p>
            <h1>Réfléchis en silence</h1>
            <p>Réfléchis seul·e à ce que tu ferais. On en parle juste après.</p>
            ${htmlMinuteur(v)}
          </div>
          ${formNote(v, pi)}
          ${boutonEcouter(v)}
          ${rappelQuestion(v)}`,
      };
    case "echange":
      return {
        cle: `${v.phase}:${pi}:${!!v.tempsEcoule}:${moi.maNote ?? ""}`,
        titre: "Discutez à voix haute",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">🗣️</p>
            <h1>Tour de table</h1>
            <p>Chacun dit son idée en une phrase, sans être coupé. Ensuite, discussion libre. Rien à écrire pour l'instant.</p>
            ${htmlMinuteur(v)}
            ${v.tempsEcoule ? `<p class="tel-temps-ecoule" role="status">⏰ Temps écoulé. L'animateur lance la suite.</p>` : ""}
          </div>
          <details class="rappel"${moi.maNote ? " open" : ""}>
            <summary>📝 Ta note (personne ne la voit)</summary>
            ${formNote(v, pi)}
          </details>
          ${rappelQuestion(v)}`,
      };
    case "reponse":
      return ecranReponse(v, pi);
    case "competences":
      return ecranCompetence(v, pi);
    case "debrief":
      return ecranDebrief(v);
    case "fin":
      return ecranFin(v);
    default:
      return {
        cle: `autre:${v.phase}`,
        titre: "Regarde l'écran",
        html: `<div class="pile centre large"><h1>Regarde l'écran</h1>${points}</div>`,
      };
  }
}

function ecranCode() {
  return {
    cle: "code",
    titre: "Rejoindre une partie",
    html: `<form class="pile large" data-form="code">
        <h1>Rejoindre une partie</h1>
        <p class="aide">Tape le code à 4 lettres affiché sur l'écran.</p>
        <input type="text" name="code" class="champ-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code de la partie" required>
        <button type="submit" class="bouton principal large grand">Rejoindre</button>
        <p class="discret"><a href="joueur.html?demo=1">Voir une démo</a></p>
      </form>`,
  };
}

function ecranConnexion() {
  const bloque = (!etat.aEteConnecte && etat.tentatives >= 4) || !!etat.derniereErreur;
  if (!bloque) {
    return {
      cle: "connexion",
      titre: "Connexion à la partie",
      html: `<div class="pile centre large">
          <h1>Partie ${echapper(CODE)}</h1>
          ${points}
          <p>Connexion à la partie…</p>
        </div>`,
    };
  }
  return {
    cle: `bloque:${etat.derniereErreur}`,
    titre: "Partie introuvable",
    html: `<div class="pile large">
        <h1>Je n'arrive pas à rejoindre la partie ${echapper(CODE)}</h1>
        ${etat.derniereErreur ? `<p>${echapper(etat.derniereErreur)}</p>` : ""}
        <p class="aide">${etat.definitif ? "Demande à l'animateur." : "Vérifie le code avec l'animateur. Je continue d'essayer."}</p>
        <form class="pile" data-form="code">
          <input type="text" name="code" class="champ-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Autre code de partie" required>
          <button type="submit" class="bouton secondaire large">Essayer un autre code</button>
        </form>
      </div>`,
  };
}

function ecranTropTard() {
  return {
    cle: "trop-tard",
    titre: "La partie a déjà commencé",
    html: `<div class="pile centre large">
        <p class="tel-emoji" aria-hidden="true">⏳</p>
        <h1>La partie a déjà commencé</h1>
        <p>Demande à l'animateur : tu pourras jouer à la prochaine partie.</p>
      </div>`,
  };
}

function ecranRejoindre(v) {
  const pris = Array.isArray(v?.avatarsPris) ? v.avatarsPris : [];
  if (pris.includes(etat.avatar)) etat.avatar = AVATARS.find((a) => !pris.includes(a)) ?? etat.avatar;
  return {
    cle: `rejoindre:${pris.join("")}`,
    titre: "Choisis ton pseudo et ton avatar",
    html: `<form class="pile large" data-form="rejoindre" novalidate>
        <h1>Bienvenue !</h1>
        <div class="tel-cadre pile serre">
          ${ANNONCE_CADRE.map((ph) => `<p>${echapper(ph)}</p>`).join("")}
          <p>${echapper(MJ_EST_UNE_IA)} Tes réponses sont lues par un service d'IA externe (voir <a href="confidentialite.html" target="_blank" rel="noopener">tes données</a>).</p>
        </div>
        <p class="aide">Choisis un pseudo (pas ton vrai nom) et un avatar. Rien n'est gardé après la partie.</p>
        <div class="champ">
          <label for="pseudo">Ton pseudo</label>
          <input type="text" id="pseudo" name="pseudo" maxlength="${LIMITES.pseudo}" autocomplete="off" data-brouillon="pseudo" required>
        </div>
        <fieldset class="avatars">
          <legend>Ton avatar</legend>
          <div class="grille-avatars">${AVATARS.map(
            (a) => `<button type="button" class="avatar-choix" data-action="avatar" data-avatar="${a}" aria-pressed="${a === etat.avatar}" aria-label="Avatar ${a}${pris.includes(a) ? " (déjà pris)" : ""}"${pris.includes(a) ? " disabled" : ""}>${a}</button>`,
          ).join("")}</div>
        </fieldset>
        <button type="submit" class="bouton principal large grand" data-envoi>C'est parti !</button>
      </form>`,
  };
}

function ecranCreation(v) {
  const d = v.moi.depart ?? { etat: "attente" };
  const props = Array.isArray(d.propositions) ? d.propositions : [];
  switch (d.etat) {
    case "analyse":
      return {
        cle: "creation:analyse",
        titre: "Je lis ce que tu as écrit",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">✨</p>
            <h1>Je lis ce que tu as écrit…</h1>
            ${points}
          </div>`,
      };
    case "a_valider": {
      if (etat.choixDepart.length !== props.length) etat.choixDepart = props.map(() => null);
      if (!etat.rome) charger("rome");
      const cartes = props
        .map((c, i) =>
          `<div class="tel-proposition" data-carte="${i}" data-choix="${etat.choixDepart[i] ?? ""}">
            ${carteCompetence(c, { surtitre: c.situation ?? "" })}
            <div class="rangee tel-garde" role="group" aria-label="Ton choix">
              <button type="button" class="bouton" data-action="depart" data-i="${i}" data-garder="1" aria-pressed="${etat.choixDepart[i] === true}">✓ C'est moi</button>
              <button type="button" class="bouton" data-action="depart" data-i="${i}" data-garder="0" aria-pressed="${etat.choixDepart[i] === false}">Pas moi</button>
            </div>
          </div>`)
        .join("");
      return {
        cle: `creation:a_valider:${props.length}:${!!etat.rome}`,
        titre: "Voilà ce qu'on a repéré",
        html: `<div class="pile large">
            <h1>Voilà ce qu'on a repéré</h1>
            ${props.length
              ? `<p class="aide">C'est toi qui décides : garde ce qui te ressemble.</p>${cartes}`
              : `<p>On n'a pas trouvé de compétence dans ton récit cette fois. Ce n'est pas un jugement : l'histoire te donnera d'autres occasions, et tu pourras en parler avec le psy.</p>`}
            <button type="button" class="bouton principal large grand" data-action="valider-depart" data-envoi>${libelleValiderDepart(etat.choixDepart)}</button>
          </div>`,
      };
    }
    case "valide": {
      const gardees = (d.gardees ?? []).filter((x) => x && typeof x === "object");
      return {
        cle: `creation:valide:${!!etat.rome}`,
        titre: "C'est noté",
        html: `<div class="pile large">
            <div class="pile centre">
              <p class="tel-emoji" aria-hidden="true">✅</p>
              <h1>C'est noté !</h1>
            </div>
            ${gardees.length
              ? `<p>Écris-les sur ta fiche papier, dans « Ce que je sais déjà faire », avec tes mots : un mot-clé suffit, et tu peux demander de l'aide.</p>
                 <ul class="tel-liste-gardees">${gardees.map((c) => `<li>${consigneMini(c)}</li>`).join("")}</ul>`
              : ""}
            <p class="discret centre-texte">On attend les autres joueurs. ${points}</p>
          </div>`,
      };
    }
    default:
      return {
        cle: "creation:attente",
        titre: "Crée ton personnage",
        html: `<form class="pile large" data-form="recit" novalidate>
            <h1>Crée ton personnage</h1>
            <p class="aide">Écris 1 ou 2 trucs que tu as déjà faits dans la vraie vie. Même si ça te paraît « rien ». Écris comme tu parles.</p>
            <div class="relances">${RELANCES_RECIT.map((q) => `<button type="button" class="relance" data-action="relance">${echapper(q)}</button>`).join("")}</div>
            ${zoneTexte({ id: "recit", label: "Ce que tu as déjà fait", max: LIMITES.recit, placeholder: "Par exemple : j'ai réparé le vélo d'un pote avec des tutos…", infoDictee: true })}
            <button type="submit" class="bouton principal large grand" data-envoi>Envoyer</button>
          </form>`,
      };
  }
}

function consigneMini(c) {
  const t = typeDe(c, etat.rome);
  return `<span class="pastille${t.lettre ? "" : " pastille-blanche"}" style="--type:${t.couleur}" aria-hidden="true"></span>
    <span><strong>${echapper(libelleDe(c))}</strong> <span class="discret">— ${echapper(t.nom)}</span></span>`;
}

// « Je ne sais pas » refusé (code sans_reponse) : dès le 1er refus, des débuts de
// phrase à toucher (préremplis) et « Je passe ce tour », sans reproche
// (décision de Pierre §3, critique psy point 11).
function blocAide(v, pi) {
  const a = etat.aide;
  if (!a || a.pi !== pi) return "";
  const amorces = Array.isArray(a.amorces) ? a.amorces : [];
  return `<section class="pile serre tel-aide" role="status">
      <p>${echapper(a.message || "Pas facile ? Commence par un de ces débuts de phrase, ou passe ce tour.")}</p>
      ${amorces.length ? `<div class="relances">${amorces.map((x, i) => `<button type="button" class="relance" data-action="amorce" data-i="${i}">${echapper(x)}</button>`).join("")}</div>` : ""}
      <button type="button" class="bouton secondaire large" data-action="passer" data-envoi>Je passe ce tour</button>
    </section>`;
}

function ecranReponse(v, pi) {
  const moi = v.moi;
  // « Je passe ce tour » : réponse vide, sans reproche ; une vraie réponse peut encore la remplacer.
  if (moi.jaiPasse && !etat.edition) {
    return {
      cle: `reponse:${pi}:passe:${!!v.tempsEcoule}:${moi.maPreference ?? ""}`,
      titre: "Tu passes ce tour",
      html: `<div class="pile large">
          <div class="pile centre">
            <p class="tel-emoji" aria-hidden="true">🙂</p>
            <h1>Pas de souci</h1>
            <p>${echapper(MESSAGE_PASSE)}</p>
            ${htmlMinuteur(v)}
            ${htmlCompte(v)}
          </div>
          <button type="button" class="bouton secondaire large" data-action="modifier">Finalement, j'ai une idée</button>
          ${blocPreference(v)}
        </div>`,
    };
  }
  const envoyee = typeof moi.maReponse === "string" && moi.maReponse !== "" && !etat.edition;
  if (envoyee) {
    return {
      cle: `reponse:${pi}:envoyee:${!!v.tempsEcoule}:${moi.maPreference ?? ""}`,
      titre: "Ta réponse est envoyée",
      html: `<div class="pile large">
          <div class="pile centre">
            <p class="tel-emoji" aria-hidden="true">📨</p>
            <h1>Ta réponse est envoyée</h1>
            ${htmlMinuteur(v)}
            ${htmlCompte(v)}
          </div>
          <blockquote class="citation">${echapper(moi.maReponse)}</blockquote>
          <p class="discret">Les autres joueurs ne la voient pas. Tu peux la changer tant que tout le monde n'a pas répondu.</p>
          <button type="button" class="bouton secondaire large" data-action="modifier">Modifier ma réponse</button>
          ${blocPreference(v)}
        </div>`,
    };
  }
  const note = moi.maNote || etat.brouillons[`note-${pi}`] || "";
  return {
    cle: `reponse:${pi}:saisie:${!!v.tempsEcoule}:${etat.aide?.pi === pi}`,
    titre: "À toi de répondre",
    html: `<form class="pile" data-form="reponse" novalidate>
        <div class="rangee tel-titre-minuteur">
          <h1>À toi !</h1>
          ${htmlMinuteur(v)}
        </div>
        ${htmlTempsEcoule(v, "Le temps est écoulé, mais on t'attend : envoie ta réponse.")}
        <p class="tel-question">Et toi, que fais-tu ?</p>
        <p>Raconte ce que tu ferais, toi. Écris TON idée avec tes mots, même si elle ressemble à une autre.</p>
        ${note ? `<p class="discret">📝 Ta note : « ${echapper(note)} »</p>` : ""}
        ${blocAide(v, pi)}
        ${zoneTexte({
          id: `reponse-${pi}`,
          label: "Ta réponse",
          max: LIMITES.reponse,
          placeholder: "Ce que tu ferais, avec tes mots…",
          aide: "🔒 Les autres joueurs ne verront pas ta réponse. Le MJ (une IA) la lit.",
          infoDictee: true,
        })}
        <button type="submit" class="bouton principal large grand" data-envoi>Envoyer ma réponse</button>
        ${htmlCompte(v)}
        ${rappelQuestion(v)}
      </form>`,
  };
}

// Recopie allégée sur la fiche papier (adaptation « ecrire-sa-competence-a-la-main »).
const CONSIGNE_FICHE = "✍️ Écris cette compétence sur ta <strong>fiche papier</strong> avec tes mots. Un mot-clé suffit, et tu peux demander de l'aide. Puis dis-nous si tu la gardes.";

function basGarder(c, pi) {
  if (c.gardee === true) {
    return `<p>C'est noté : elle va sur ta fiche.</p>
      <button type="button" class="bouton discret" data-action="garder" data-garder="0" data-pi="${pi}">Finalement, pas moi</button>`;
  }
  if (c.gardee === false) {
    return `<p>D'accord, elle ne va pas sur ta fiche.</p>
      <button type="button" class="bouton discret" data-action="garder" data-garder="1" data-pi="${pi}">Finalement, je la garde</button>`;
  }
  return `<p class="consigne-fiche">${CONSIGNE_FICHE}</p>
      <div class="rangee tel-garde" role="group" aria-label="Ton choix">
        <button type="button" class="bouton succes grand" data-action="garder" data-garder="1" data-pi="${pi}">✓ Je la garde</button>
        <button type="button" class="bouton grand" data-action="garder" data-garder="0" data-pi="${pi}">Pas moi</button>
      </div>`;
}

// L'idée du tour, vue par les autres joueurs : sans nom tant que son auteur n'a pas dit oui.
function ideeDuTour(idee) {
  if (idee.aucune) return `<p class="discret">Pas d'idée retenue cette fois : l'histoire continue au prochain épisode.</p>`;
  return `<section class="pile serre tel-idee-du-tour">
      <p class="discret">Cette idée fait avancer l'histoire${idee.pseudo ? ` (l'idée de ${echapper(idee.avatar ?? "")} ${echapper(idee.pseudo)})` : ""} :</p>
      <blockquote class="citation">« ${echapper(idee.texte ?? "")} »</blockquote>
    </section>`;
}

function ecranCompetence(v, pi) {
  const moi = v.moi;
  const c = moi.competenceDuProbleme;
  const idee = v.idee;
  const sorte = retourEpisode(v);
  if (sorte === "attente") {
    return {
      cle: `competences:${pi}:attente`,
      titre: "Le MJ lit vos idées",
      html: `<div class="pile centre large">
          <p class="tel-emoji" aria-hidden="true">💡</p>
          <h1>Le MJ lit vos idées…</h1>
          <p>Le MJ est une IA : il propose une idée qui fait avancer l'histoire, l'animateur valide. Regarde l'écran.</p>
          ${points}
        </div>`,
    };
  }
  if (c && !etat.rome) charger("rome");
  const pref = blocPreference(v);
  const cle = `competences:${pi}:${sorte}:${idee.aucune ? "" : `${idee.texte}:${idee.pseudo ?? ""}`}:${c?.code ?? ""}:${c?.gardee}:${moi.monIdee?.accordPseudo ?? ""}:${moi.maPreference ?? ""}:${!!etat.rome}`;

  // C'est son idée : d'abord l'accord pour afficher son pseudo (décision de Pierre §2).
  if (sorte === "mon-idee") {
    const accord = moi.monIdee.accordPseudo;
    const question = accord === null || accord === undefined
      ? `<p><strong>On affiche ton pseudo sur l'écran ?</strong></p>
         <div class="rangee tel-choix-avis" role="group" aria-label="Afficher ton pseudo">
           <button type="button" class="bouton" data-action="pseudo" data-accord="1">Oui</button>
           <button type="button" class="bouton" data-action="pseudo" data-accord="0">Non, reste discret</button>
         </div>`
      : `<p>${accord ? "Ton pseudo est affiché sur l'écran." : "Ton idée reste anonyme sur l'écran."}</p>
         <button type="button" class="bouton discret" data-action="pseudo" data-accord="${accord ? "0" : "1"}">${accord ? "Finalement, reste discret" : "Finalement, affiche mon pseudo"}</button>`;
    return {
      cle,
      titre: "C'est ton idée",
      html: `<div class="pile large">
          <h1>C'est ton idée !</h1>
          <p>Elle fait avancer l'histoire :</p>
          <blockquote class="citation">« ${echapper(idee.texte ?? "")} »</blockquote>
          <section class="pile serre tel-accord">${question}</section>
          ${c ? `${carteCompetence(c)}${basGarder(c, pi)}` : ""}
          ${pref}
        </div>`,
    };
  }

  let corps;
  let titre;
  if (sorte === "competence") {
    // Compétence privée : seulement sur son téléphone (décision de Pierre §1), sans 🎉.
    titre = "Ce que ta réponse montre";
    corps = `<h1>Ce que ta réponse montre</h1>
      ${carteCompetence(c)}
      ${basGarder(c, pi)}`;
  } else if (sorte === "idee") {
    // Pas d'action précise et citable : une reformulation, sans compétence (critique psy point 3).
    titre = "Ton idée";
    corps = `<h1>Ton idée</h1>
      <p class="tel-mon-idee">${echapper(texteMonIdee(moi))}</p>
      <p class="discret">Cette fois, le MJ n'a pas repéré de compétence dans ta réponse. ${echapper(PROMESSE_COMPETENCE)}</p>`;
  } else if (sorte === "passe") {
    titre = "L'histoire continue";
    corps = `<h1>L'histoire continue</h1>
      <p>${echapper(MESSAGE_PASSE)}</p>`;
  } else {
    titre = "Le MJ regarde ta réponse";
    corps = `<h1>Ta réponse</h1>
      <p>Le MJ regarde ce que ta réponse montre… ${points}</p>`;
  }
  return {
    cle,
    titre,
    html: `<div class="pile large">
        ${ideeDuTour(idee)}
        ${corps}
        ${pref}
      </div>`,
  };
}

// Débrief collectif (adaptation « nouveau-debriefing ») : 2 questions à l'oral, la
// 3e écrite en privé (facultative), pour le psychologue.
function ecranDebrief(v) {
  const moi = v.moi;
  if (etat.brouillons.debrief == null && moi.monDebrief) etat.brouillons.debrief = moi.monDebrief;
  return {
    cle: `debrief:${moi.monDebrief ?? ""}`,
    titre: "Débrief",
    html: `<div class="pile large">
        <div class="pile centre">
          <p class="tel-emoji" aria-hidden="true">💬</p>
          <h1>On en parle ensemble</h1>
          <p>Regarde l'écran : on se pose quelques questions avant ta fiche.</p>
        </div>
        <ol class="tel-questions">${QUESTIONS_DEBRIEF.slice(0, 2).map((q) => `<li>${echapper(q)}</li>`).join("")}</ol>
        <form class="pile" data-form="debrief" novalidate>
          ${zoneTexte({
            id: "debrief",
            label: echapper(QUESTIONS_DEBRIEF[2]),
            max: LIMITES.debrief,
            rows: 4,
            placeholder: "Une fois où tu l'as déjà fait…",
            aide: "Facultatif. Personne d'autre ne la voit : elle ira sur ta fiche, pour en parler avec le psy.",
          })}
          <button type="submit" class="bouton principal large" data-envoi>${moi.monDebrief ? "✓ C'est noté · mettre à jour" : "Garder ma réponse"}</button>
        </form>
      </div>`,
  };
}

function ecranFin(v) {
  if (!etat.rome) charger("rome");
  if (!etat.onet) charger("onet");
  const moi = v.moi;
  const fiche = rendreFiche(
    { code: v.code ?? CODE, pseudo: moi.pseudo, avatar: moi.avatar, competences: moi.competences ?? [] },
    { rome: etat.rome, onet: etat.onet, psy: false, metiersOuverts: false },
  );
  return {
    cle: `fin:${!!etat.rome}:${!!etat.onet}`,
    titre: "La partie est finie",
    html: `<div class="pile large">
        <div class="pile centre">
          <p class="tel-emoji" aria-hidden="true">🎉</p>
          <h1>La partie est finie, merci d'avoir joué !</h1>
          <p>Voici ta fiche. Tu peux l'imprimer et la montrer au psy pour en parler ensemble.</p>
        </div>
        <div class="pile serre">
          <a class="bouton principal large" href="${echapper(lienFiche(v))}" target="_blank" rel="noopener">🖨️ Ouvrir ma fiche à imprimer</a>
        </div>
        <!--en-attente-->
        <article class="fiche-tel">${fiche}</article>
        ${etat.onet ? "" : `<p class="discret centre-texte">Je cherche des métiers à découvrir… ${points}</p>`}
        <p class="tel-relais">${echapper(RELAIS_ADULTE)}</p>
      </div>`,
  };
}

// ---------- Compétences en attente (« Je la garde / Pas moi » pas encore répondu) ----------

// Écrans où le joueur n'a rien d'autre à faire : on lui rappelle les compétences
// qu'il n'a pas encore gardées ou retirées (l'animateur a pu passer à la suite).
const PHASES_AVEC_ATTENTE = new Set(["presentation", "reflexion", "echange", "competences", "debrief", "fin"]);

function blocEnAttente(v) {
  if (!PHASES_AVEC_ATTENTE.has(v?.phase) || !v.moi?.pseudo) return { cle: "", html: "" };
  const liste = competencesEnAttente(v);
  if (!liste.length) return { cle: "", html: "" };
  if (!etat.rome) charger("rome");
  // Compétence de départ (création close par l'animateur) : data-dep = son
  // departIndex ; compétence de jeu : data-pi = son problemeIndex.
  const cible = (c) => (estDepartEnAttente(c) ? `data-dep="${c.departIndex}"` : `data-pi="${c.problemeIndex}"`);
  const cartes = liste
    .map((c) => `<div class="tel-proposition">
        ${carteCompetence(c, { surtitre: estDepartEnAttente(c) ? "Ton histoire" : `Épisode ${c.problemeIndex + 1}` })}
        <div class="rangee tel-garde" role="group" aria-label="Ton choix pour cette compétence">
          <button type="button" class="bouton succes" data-action="garder" data-garder="1" ${cible(c)}>✓ Je la garde</button>
          <button type="button" class="bouton" data-action="garder" data-garder="0" ${cible(c)}>Pas moi</button>
        </div>
      </div>`)
    .join("");
  return {
    cle: `|attente:${liste.map((c) => (estDepartEnAttente(c) ? `d${c.departIndex}-${c.code}` : `${c.problemeIndex}-${c.code}`)).join(",")}:${!!etat.rome}`,
    html: `<section class="pile tel-en-attente" aria-labelledby="titre-en-attente">
        <h2 id="titre-en-attente">${liste.length > 1 ? "Ces compétences t'attendent" : "Cette compétence t'attend"}</h2>
        <p class="aide">Tu n'as pas encore dit si ${liste.length > 1 ? "tu les gardes" : "tu la gardes"}. C'est toi qui décides.</p>
        ${cartes}
      </section>`,
  };
}

// ---------- Affichage ----------

function afficher(v) {
  etat.vue = v;
  if (v && v.phase !== "reponse") etat.edition = false;
  // Les débuts de phrase ne valent que pour la réponse en cours.
  if (etat.aide && (v?.phase !== "reponse" || v.problemeIndex !== etat.aide.pi)) etat.aide = null;
  if (v && !(v.phase === "creation" && v.moi?.depart?.etat === "a_valider")) etat.choixDepart = [];
  const e = ecranPour(v);
  const attente = blocEnAttente(v);
  const cle = e.cle + attente.cle;
  if (cle !== etat.cle) {
    // Seul le bloc « en attente » a changé : on garde la position de lecture.
    const memeEcran = etat.cle != null && etat.cle.split("|attente:")[0] === e.cle;
    arreterDictee();
    etat.cle = cle;
    etat.envoiEnCours = false;
    ecranEl.innerHTML = e.html.includes("<!--en-attente-->")
      ? e.html.replace("<!--en-attente-->", attente.html)
      : e.html + attente.html;
    if (!memeEcran) {
      ecranEl.classList.remove("apparition");
      void ecranEl.offsetWidth;
      ecranEl.classList.add("apparition");
      annoncer(e.titre);
    }
    restaurerBrouillons();
    if (DICTEE) ecranEl.querySelectorAll('[data-action="micro"], [data-info-dictee]').forEach((b) => (b.hidden = false));
    if (!("speechSynthesis" in window)) ecranEl.querySelectorAll('[data-action="ecouter"]').forEach((b) => (b.hidden = true));
    if (!memeEcran) window.scrollTo(0, 0);
  }
  majDynamique();
}

function rafraichir() {
  etat.cle = null;
  const y = window.scrollY;
  afficher(etat.vue);
  window.scrollTo(0, y);
}

function majDynamique() {
  const v = etat.vue;
  if (v?.compte) {
    const { repondu = 0, total = 0 } = v.compte;
    const verbe = v.phase === "presentation" ? "ont lu" : v.phase === "competences" ? "ont fait leur choix" : "ont répondu";
    ecranEl.querySelectorAll("[data-compte]").forEach((el) => (el.textContent = `${repondu}/${total} ${verbe}`));
  }
  ecranEl.querySelectorAll("[data-envoi]").forEach((b) => (b.disabled = etat.envoiEnCours));
  majMinuteurs();
}

function majMinuteurs() {
  const fin = etat.vue?.minuteurFin;
  for (const el of ecranEl.querySelectorAll("[data-minuteur]")) {
    if (!fin) {
      el.hidden = true;
      continue;
    }
    el.hidden = false;
    const maintenant = Date.now() + etat.decalage; // heure du serveur
    if (!etat.debutsMinuteur[fin]) etat.debutsMinuteur = { [fin]: Math.min(maintenant, fin) };
    const total = totalMinuteur(etat.vue, etat.debutsMinuteur[fin], maintenant);
    const reste = Math.max(0, fin - maintenant);
    el.style.setProperty("--progression", (reste / total).toFixed(3));
    el.classList.toggle("bientot", reste > 0 && reste <= 10000);
    el.classList.toggle("fini", reste === 0);
    const s = Math.ceil(reste / 1000);
    el.querySelector(".minuteur-texte").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
}
setInterval(majMinuteurs, 250);

function restaurerBrouillons() {
  ecranEl.querySelectorAll("[data-brouillon]").forEach((z) => {
    const k = z.dataset.brouillon;
    if (etat.brouillons[k] != null) z.value = etat.brouillons[k];
    majCompteur(z);
  });
}

function majCompteur(z) {
  const c = ecranEl.querySelector(`[data-compteur="${z.id}"]`);
  if (c && z.maxLength > 0) c.textContent = `${z.value.length}/${z.maxLength}`;
}

// ---------- Dictée vocale (navigateurs compatibles uniquement) ----------

const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
// Le micro exige un contexte sécurisé (https ou localhost) : sur http://<ip>:8787,
// la dictée échouerait toujours (not-allowed). On ne propose donc pas le bouton.
const DICTEE = dicteeDisponible(window);
let recoActive = null;
// Reconnaissance sur l'appareil quand le navigateur le permet : la voix ne quitte
// pas le téléphone (adaptation « langage-simple-dictee-accessibilite »).
let dicteeLocale = false;
if (DICTEE && typeof Reco?.available === "function") {
  try {
    Promise.resolve(Reco.available({ langs: ["fr-FR"], processLocally: true }))
      .then((s) => { dicteeLocale = s === "available"; })
      .catch(() => {});
  } catch { /* API absente ou différente : dictée classique */ }
}

function basculerDictee(bouton) {
  if (recoActive) {
    recoActive.stop();
    return;
  }
  const zone = document.getElementById(bouton.dataset.cible);
  if (!zone || !Reco) return;
  const r = new Reco();
  r.lang = "fr-FR";
  if (dicteeLocale && "processLocally" in r) r.processLocally = true;
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const sep = zone.value && !/\s$/.test(zone.value) ? " " : "";
      zone.value = (zone.value + sep + e.results[i][0].transcript).slice(0, zone.maxLength > 0 ? zone.maxLength : 1000);
      zone.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Autorise le micro pour dicter, ou écris ta réponse.");
  };
  r.onend = () => {
    if (recoActive === r) recoActive = null;
    bouton.textContent = "🎙️ Dicter";
    bouton.setAttribute("aria-pressed", "false");
  };
  try {
    r.start();
  } catch {
    return;
  }
  recoActive = r;
  bouton.textContent = "⏹️ Arrêter la dictée";
  bouton.setAttribute("aria-pressed", "true");
}

function arreterDictee() {
  const r = recoActive;
  recoActive = null;
  if (r) try { r.abort(); } catch { /* déjà arrêtée */ }
}

// ---------- Réécouter l'épisode (synthèse vocale du téléphone) ----------

function ecouterEpisode(v) {
  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    return;
  }
  const voix = speechSynthesis.getVoices();
  const fr = voix.find((x) => x.lang === "fr-FR") ?? voix.find((x) => x.lang?.toLowerCase().startsWith("fr")) ?? null;
  // Une phrase par énoncé : Chrome coupe en silence les énoncés trop longs.
  for (const phrase of decouperPhrases(texteEpisode(v))) {
    const u = new SpeechSynthesisUtterance(phrase);
    u.lang = "fr-FR";
    if (fr) u.voice = fr;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}

// ---------- Actions du joueur ----------

function envoyer(msg) {
  if (DEMO) return actionDemo(msg);
  if (etat.ws?.readyState === WebSocket.OPEN) {
    etat.ws.send(JSON.stringify(msg));
    return true;
  }
  toast("Connexion perdue, je réessaie… Ta saisie est gardée.");
  return false;
}

function envoyerAvecAttente(msg) {
  if (envoyer(msg)) {
    etat.envoiEnCours = true;
    majDynamique();
    // Sécurité : si aucune vue n'arrive, on réactive le bouton.
    setTimeout(() => {
      if (etat.envoiEnCours) {
        etat.envoiEnCours = false;
        majDynamique();
      }
    }, 6000);
  }
}

ecranEl.addEventListener("input", (e) => {
  const z = e.target.closest("[data-brouillon]");
  if (!z) return;
  etat.brouillons[z.dataset.brouillon] = z.value;
  majCompteur(z);
});

ecranEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const v = etat.vue;
  switch (b.dataset.action) {
    case "avatar":
      etat.avatar = b.dataset.avatar;
      ecranEl.querySelectorAll('[data-action="avatar"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      break;
    case "relance": {
      const z = $("#recit");
      ecranEl.querySelectorAll(".relance").forEach((x) => x.classList.toggle("choisie", x === b));
      z.placeholder = b.textContent;
      z.focus();
      break;
    }
    case "micro":
      basculerDictee(b);
      break;
    case "depart": {
      const i = Number(b.dataset.i);
      const garder = b.dataset.garder === "1";
      etat.choixDepart[i] = etat.choixDepart[i] === garder ? null : garder;
      const carte = ecranEl.querySelector(`[data-carte="${i}"]`);
      carte.dataset.choix = etat.choixDepart[i] === null ? "" : etat.choixDepart[i] ? "garde" : "retire";
      carte.querySelectorAll('[data-action="depart"]').forEach((x) =>
        x.setAttribute("aria-pressed", String(etat.choixDepart[i] === (x.dataset.garder === "1"))),
      );
      // « Encore 1 carte à choisir » tant que tout n'est pas tranché, puis « Valider ».
      const valider = ecranEl.querySelector('[data-action="valider-depart"]');
      if (valider) valider.textContent = libelleValiderDepart(etat.choixDepart);
      break;
    }
    case "valider-depart": {
      const manque = etat.choixDepart.findIndex((x) => x === null);
      if (manque !== -1) {
        toast("Dis pour chaque carte si c'est toi ou pas.");
        ecranEl.querySelector(`[data-carte="${manque}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      envoyerAvecAttente({ t: "valider_depart", garder: etat.choixDepart.map(Boolean) });
      break;
    }
    case "modifier":
      etat.edition = true;
      etat.brouillons[`reponse-${v.problemeIndex ?? 0}`] = v.moi.maReponse ?? "";
      rafraichir();
      break;
    case "lu":
      envoyerAvecAttente({ t: "lu" });
      break;
    case "ecouter":
      ecouterEpisode(v);
      break;
    case "amorce": {
      // Début de phrase prérempli : le joueur n'a plus qu'à continuer.
      const a = etat.aide?.amorces?.[Number(b.dataset.i)];
      const z = ecranEl.querySelector('[data-form="reponse"] textarea');
      if (!a || !z) break;
      z.value = texteAmorce(a);
      etat.brouillons[z.dataset.brouillon] = z.value;
      majCompteur(z);
      ecranEl.querySelectorAll('[data-action="amorce"]').forEach((x) => x.classList.toggle("choisie", x === b));
      z.focus();
      z.setSelectionRange?.(z.value.length, z.value.length);
      break;
    }
    case "passer":
      arreterDictee();
      etat.edition = false;
      envoyerAvecAttente({ t: "passer" });
      break;
    case "preference":
      envoyer({ t: "preference", valeur: b.dataset.valeur, problemeIndex: v?.problemeIndex });
      break;
    case "pseudo":
      envoyer({ t: "afficher_pseudo", accord: b.dataset.accord === "1" });
      break;
    case "garder":
      // problemeIndex : la compétence visée (celle du problème en cours, ou une
      // compétence restée en attente d'un problème précédent).
      // Compétence de départ restée en attente : departIndex (data-dep).
      envoyer(messageGarder(
        b.dataset.garder === "1",
        b.dataset.dep != null && b.dataset.dep !== "" ? { departIndex: Number(b.dataset.dep) }
          : b.dataset.pi != null && b.dataset.pi !== "" ? Number(b.dataset.pi) : v?.problemeIndex,
      ));
      break;
  }
});

ecranEl.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  switch (f.dataset.form) {
    case "code": {
      const c = String(f.elements.code.value).trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(c)) return toast("Le code fait 4 lettres.");
      location.href = `joueur.html?code=${c}`;
      break;
    }
    case "rejoindre": {
      const pseudo = String(f.elements.pseudo.value).trim();
      if (!pseudo) return toast("Choisis un pseudo.");
      if (pseudo.length > LIMITES.pseudo) return toast(`Ton pseudo fait ${LIMITES.pseudo} caractères maximum.`);
      if (!AVATARS.includes(etat.avatar)) return toast("Choisis un avatar.");
      envoyerAvecAttente({ t: "rejoindre", pseudo, avatar: etat.avatar });
      break;
    }
    case "recit": {
      arreterDictee();
      const texte = String(f.elements.texte.value).trim();
      if (texte.length < LIMITES.recitMin) return toast("Écris au moins une phrase sur un truc que tu as fait.");
      envoyerAvecAttente({ t: "recit", texte: texte.slice(0, LIMITES.recit) });
      break;
    }
    case "reponse": {
      arreterDictee();
      const texte = String(f.elements.texte.value).trim();
      if (!texte) return toast("Écris ce que tu ferais, même en quelques mots.");
      etat.edition = false;
      envoyerAvecAttente({ t: "reponse", texte: texte.slice(0, LIMITES.reponse) });
      break;
    }
    case "note": {
      arreterDictee();
      const texte = String(f.elements.texte.value).trim().slice(0, LIMITES.note);
      envoyerAvecAttente({ t: "note", texte });
      break;
    }
    case "debrief": {
      arreterDictee();
      const texte = String(f.elements.texte.value).trim().slice(0, LIMITES.debrief);
      envoyerAvecAttente({ t: "debrief", texte });
      break;
    }
  }
});

// ---------- Connexion WebSocket (reconnexion avec backoff) ----------

function recevoir(m) {
  if (!m || typeof m !== "object") return;
  if (m.t === "bienvenue" && typeof m.joueurId === "string") {
    etat.joueurId = m.joueurId;
    ecrireStockage(cleStockage(CODE), m.joueurId);
  } else if (m.t === "etat" && m.vue) {
    etat.decalage = decalageServeur(m, Date.now(), etat.decalage);
    afficher(m.vue);
  } else if (m.t === "erreur") {
    etat.envoiEnCours = false;
    etat.derniereErreur = String(m.message ?? "");
    // « Je ne sais pas » : débuts de phrase et « Je passe ce tour » dans l'écran de réponse.
    if (m.code === "sans_reponse" && etat.vue?.phase === "reponse") {
      etat.aide = { pi: etat.vue.problemeIndex ?? 0, amorces: Array.isArray(m.amorces) ? m.amorces.map(String) : [], message: etat.derniereErreur };
      etat.edition = true;
      rafraichir();
      return;
    }
    if (etat.derniereErreur) toast(etat.derniereErreur);
    if (etat.vue) majDynamique();
    else afficher(null);
  }
}

function connecter() {
  clearTimeout(etat.minuteurReco);
  if (etat.ws || etat.definitif) return;
  const url = new URL(`api/parties/${CODE}/ws`, document.baseURI);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", "joueur");
  if (etat.joueurId) url.searchParams.set("joueur", etat.joueurId);
  etatConnexion("attente", etat.aEteConnecte ? "Reconnexion…" : "Connexion…");
  let ws;
  try {
    ws = new WebSocket(url);
  } catch {
    return planifierReconnexion();
  }
  etat.ws = ws;
  ws.addEventListener("open", () => {
    etat.tentatives = 0;
    etat.aEteConnecte = true;
    etat.derniereErreur = "";
    etatConnexion("ok", "Connecté");
  });
  ws.addEventListener("message", (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    recevoir(m);
  });
  ws.addEventListener("close", (e) => {
    if (etat.ws !== ws) return;
    etat.ws = null;
    if (fermetureDefinitive(e.code)) {
      // Partie effacée, page ouverte ailleurs, abus ou partie déjà commencée :
      // on ne se reconnecte pas, on laisse le message reçu (SPEC §2.3).
      etat.definitif = true;
      etatConnexion("erreur", etat.derniereErreur || "Déconnecté");
      if (etat.derniereErreur) toast(etat.derniereErreur, 8000);
      if (!etat.vue) afficher(null);
      return;
    }
    etatConnexion("erreur", "Hors ligne");
    planifierReconnexion();
  });
}

function planifierReconnexion() {
  etat.tentatives++;
  if (!etat.vue) afficher(null);
  const delai = Math.min(15000, 500 * 2 ** Math.min(etat.tentatives, 5)) + Math.random() * 400;
  etat.minuteurReco = setTimeout(connecter, delai);
}

document.addEventListener("visibilitychange", () => {
  if (!DEMO && CODE && document.visibilityState === "visible" && !etat.ws) {
    etat.tentatives = 0;
    connecter();
  }
});
window.addEventListener("online", () => {
  if (!DEMO && CODE && !etat.ws) connecter();
});

// ---------- Mode démo (?demo=1) : vues factices de chaque phase ----------

const DEMO_PROBLEME = {
  id: "budget-tournoi",
  titre: "Le budget du tournoi",
  situation: "Le club de foot du quartier vous confie l'organisation de son premier tournoi des jeunes, dans un mois. Huit équipes sont attendues, et le club vous donne 150 euros pour tout : ballons, goûter, coupe et récompenses. À vous de décider comment utiliser cet argent.",
  question: "Que faites-vous ?",
  illustration: "illustrations/budget-tournoi.svg"
};
const DEMO_PROBLEME_2 = {
  id: "affiche-tournoi",
  titre: "L'affiche du tournoi",
  situation: "Le budget est bouclé. Mais à trois semaines du tournoi, presque personne dans le quartier n'est au courant, et il manque encore des équipes. Le club vous demande de faire l'affiche et de faire venir des joueurs et du public.",
  question: "Que faites-vous ?",
  illustration: "illustrations/affiche-tournoi.svg"
};
const DEMO_LIAISON = "La liste des achats et les prix comparés ont permis de boucler le budget. Reste à faire connaître le tournoi.";
// Copies de AMORCES et MESSAGE_SANS_REPONSE (src/texte.js) : le serveur les envoie avec le refus.
const DEMO_AMORCES = ["Moi, je demanderais à…", "D'abord, je…", "J'irais voir…"];
const DEMO_MESSAGE_SANS_REPONSE = "Toutes les idées comptent ! Pas facile ? Commence par un de ces débuts de phrase, ou passe ce tour.";
const DEMO_PROPOSITIONS = [
  { code: "3E205", libelle: "Réparer un équipement, une machine, une installation", mots: "Tu as raconté avoir réparé un vélo : c'est ce qu'on appelle « Réparer un équipement, une machine, une installation ».", preuve: "j'ai réparé le vélo d'un pote avec des tutos", typePreuve: "vecu", riasec: ["R"], situation: "Vélo réparé", problemeIndex: null, gardee: null },
  { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as aidé quelqu'un à remplir un dossier : c'est ce qu'on appelle « Conseiller, accompagner une personne ».", preuve: "je l'ai aidé à remplir son dossier", typePreuve: "vecu", riasec: ["S"], situation: "Coup de main", problemeIndex: null, gardee: null },
];
// Compétence de l'idée du tour (Lina) et compétence privée (une autre réponse).
const DEMO_COMPETENCE = {
  code: "6B318", libelle: "Collecter et analyser des données, des informations", mots: "Tu as proposé de chercher les prix avant d'acheter : c'est ce qu'on appelle « Collecter et analyser des données, des informations ».",
  preuve: "on regarde sur internet combien ça coûte", typePreuve: "jeu", idee: true, riasec: ["C"], problemeIndex: 0, gardee: null,
};
const DEMO_PRIVEE = {
  code: "6D103", libelle: "Être force de proposition", mots: "Tu as proposé de demander au boulanger d'offrir le goûter : c'est ce qu'on appelle « Être force de proposition ».",
  preuve: "demander au boulanger du quartier de nous offrir le goûter", typePreuve: "jeu", idee: false, horsScenario: true, riasec: [], problemeIndex: 0, gardee: null,
};
const DEMO_IDEE_SANS_NOM = { pseudo: null, avatar: null, accordPseudo: null, texte: DEMO_COMPETENCE.preuve, competence: { code: DEMO_COMPETENCE.code, libelle: DEMO_COMPETENCE.libelle } };

function scenesDemo() {
  const moi = (x = {}) => ({
    id: "demo-lina", pseudo: "Lina", avatar: "🦊",
    depart: { etat: "valide", propositions: DEMO_PROPOSITIONS, gardees: [DEMO_PROPOSITIONS[0]] },
    maReponse: null, maNote: null, jaiPasse: false, sansReponse: false, maPreference: null, peutDonnerPreference: false,
    monIdee: null, retourPrive: null, maReformulation: null, competenceDuProbleme: null, competences: [], monDebrief: null, ...x,
  });
  const apres = (x = {}) => moi({ maReponse: "On regarde sur internet combien ça coûte et on demande au boulanger du quartier de nous offrir le goûter.", peutDonnerPreference: true, ...x });
  const base = (phase, x = {}) => ({ code: "DEMO", phase, problemeIndex: 0, nbProblemes: 3, probleme: DEMO_PROBLEME, liaison: null, minuteurFin: null, compte: null, ...x });
  const dans = (s) => Date.now() + s * 1000;
  return [
    ["Rejoindre", () => base("accueil", { probleme: null, moi: null })],
    ["En attente du début", () => base("accueil", { probleme: null, moi: moi({ depart: { etat: "attente" } }) })],
    ["Création : récit", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "attente" } }) })],
    ["Création : analyse", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "analyse" } }) })],
    ["Création : C'est moi / Pas moi", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "a_valider", propositions: DEMO_PROPOSITIONS } }) })],
    ["Création : aucune compétence", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "a_valider", propositions: [] } }) })],
    ["Création : validé", () => base("creation", { probleme: null, moi: moi() })],
    ["Présentation (épisode 1)", () => base("presentation", { moi: moi() })],
    ["Réflexion en silence", () => base("reflexion", { moi: moi(), minuteurFin: dans(30) })],
    ["Tour de table", () => base("echange", { moi: moi({ maNote: "comparer les prix" }), minuteurFin: dans(120) })],
    ["Réponse", () => base("reponse", { moi: moi({ maNote: "comparer les prix" }), minuteurFin: dans(90), compte: { repondu: 1, total: 4 } })],
    ["Réponse : « je ne sais pas »", () => base("reponse", { moi: moi(), minuteurFin: dans(70), compte: { repondu: 2, total: 4 }, demoAide: true })],
    ["Je passe ce tour", () => base("reponse", { moi: moi({ maReponse: "", jaiPasse: true, peutDonnerPreference: true }), minuteurFin: dans(50), compte: { repondu: 3, total: 4 } })],
    ["Réponse envoyée + avis", () => base("reponse", { moi: apres(), minuteurFin: dans(42), compte: { repondu: 3, total: 4 } })],
    ["Le MJ lit vos idées", () => base("competences", { moi: apres(), attenteIA: true })],
    ["C'est ton idée : pseudo ?", () => base("competences", { moi: apres({ monIdee: { accordPseudo: null }, competenceDuProbleme: { ...DEMO_COMPETENCE } }), idee: { ...DEMO_IDEE_SANS_NOM } })],
    ["Ton idée : pseudo affiché", () => base("competences", { moi: apres({ monIdee: { accordPseudo: true }, competenceDuProbleme: { ...DEMO_COMPETENCE, gardee: true }, maPreference: "oui" }), idee: { ...DEMO_IDEE_SANS_NOM, pseudo: "Lina", avatar: "🦊", accordPseudo: true, notee: true } })],
    ["Ce que ta réponse montre", () => base("competences", { moi: apres({ retourPrive: "competence", competenceDuProbleme: { ...DEMO_PRIVEE } }), idee: { ...DEMO_IDEE_SANS_NOM, pseudo: "Sam", avatar: "🐼", accordPseudo: true } })],
    ["Ton idée (sans compétence)", () => base("competences", { moi: apres({ retourPrive: "idee", maReformulation: "Ton idée : chercher les prix sur internet et demander de l'aide aux commerçants" }), idee: { ...DEMO_IDEE_SANS_NOM } })],
    ["Le MJ regarde ta réponse", () => base("competences", { moi: apres(), idee: { ...DEMO_IDEE_SANS_NOM } })],
    ["Tu as passé ce tour", () => base("competences", { moi: moi({ maReponse: "", jaiPasse: true, peutDonnerPreference: true, retourPrive: "idee" }), idee: { ...DEMO_IDEE_SANS_NOM } })],
    ["Présentation (épisode 2, liaison)", () => base("presentation", { problemeIndex: 1, probleme: DEMO_PROBLEME_2, liaison: DEMO_LIAISON, moi: moi() })],
    ["Débrief", () => base("debrief", { problemeIndex: 2, probleme: null, moi: moi() })],
    ["Fin", () => base("fin", {
      phase: "fin", problemeIndex: 2, probleme: null,
      moi: moi({ competences: [
        { ...DEMO_PROPOSITIONS[0], gardee: true },
        { ...DEMO_COMPETENCE, gardee: true },
        { ...DEMO_PRIVEE, problemeIndex: 1, gardee: true },
        { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as proposé de lui expliquer calmement : c'est ce qu'on appelle « Conseiller, accompagner une personne ».", preuve: "je lui explique calmement", typePreuve: "jeu", idee: false, riasec: ["S"], problemeIndex: 2, gardee: true },
      ] }),
      fin: { lienFiche: "fiche.html?demo=1" },
    })],
    ["Fin (compétence pas encore choisie)", () => base("fin", {
      phase: "fin", problemeIndex: 2, probleme: null,
      moi: moi({ competences: [
        { ...DEMO_PROPOSITIONS[0], gardee: true },
        { ...DEMO_COMPETENCE, gardee: true },
        { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as proposé de lui expliquer calmement : c'est ce qu'on appelle « Conseiller, accompagner une personne ».", preuve: "je lui explique calmement", typePreuve: "jeu", idee: false, riasec: ["S"], problemeIndex: 2, gardee: null },
      ] }),
      fin: { lienFiche: "fiche.html?demo=1" },
    })],
    // L'animateur a clos la création avant que Lina valide : ses compétences de départ l'attendent.
    ["Création close : départ en attente", () => base("presentation", {
      moi: moi({
        depart: { etat: "valide", propositions: DEMO_PROPOSITIONS.map((c, i) => ({ ...c, departIndex: i })), gardees: [] },
        competences: DEMO_PROPOSITIONS.map((c, i) => ({ ...c, departIndex: i, gardee: null })),
      }),
    })],
  ];
}

const demo = { scenes: [], index: 0, vue: null, lecture: null, prevenu: false };

function montrerScene(i) {
  demo.index = (i + demo.scenes.length) % demo.scenes.length;
  const [nom, fabrique] = demo.scenes[demo.index];
  demo.vue = fabrique();
  $("#demo-etiquette").textContent = `${demo.index + 1}/${demo.scenes.length} · ${nom}`;
  etat.cle = null;
  etat.aide = null;
  etat.edition = false;
  etat.brouillons = {};
  // Scène « je ne sais pas » : on simule le refus du serveur (débuts de phrase + « Je passe ce tour »).
  if (demo.vue.demoAide) {
    afficher(demo.vue);
    recevoir({ t: "erreur", message: DEMO_MESSAGE_SANS_REPONSE, code: "sans_reponse", amorces: DEMO_AMORCES });
    return;
  }
  afficher(demo.vue);
}

/** Réponse de démo refusée comme « je ne sais pas » (approximation de estSansReponse, src/texte.js). */
const demoSansReponse = (t) => /^\s*(je\s+)?(ne\s+)?(sais\s+pas|sait\s+pas|jsp|aucune\s+id[ée]e|je\s+vois\s+pas|euh+|bof)\b[\s.!?…]*$/i.test(String(t ?? ""));

function actionDemo(msg) {
  if (!demo.prevenu) {
    toast("Mode démo : rien n'est envoyé.");
    demo.prevenu = true;
  }
  const v = structuredClone(demo.vue);
  const index = demo.index;
  switch (msg.t) {
    case "rejoindre":
      v.moi = { id: "demo-lina", pseudo: msg.pseudo, avatar: msg.avatar, depart: { etat: "attente" }, competences: [] };
      break;
    case "recit":
      v.moi.depart = { etat: "analyse" };
      setTimeout(() => {
        if (demo.index !== index) return;
        const w = structuredClone(demo.vue);
        w.moi.depart = { etat: "a_valider", propositions: DEMO_PROPOSITIONS };
        demo.vue = w;
        afficher(w);
      }, 1500);
      break;
    case "valider_depart":
      v.moi.depart = { etat: "valide", propositions: DEMO_PROPOSITIONS, gardees: DEMO_PROPOSITIONS.filter((_, i) => msg.garder[i]) };
      break;
    case "reponse":
      if (demoSansReponse(msg.texte)) {
        setTimeout(() => recevoir({ t: "erreur", message: DEMO_MESSAGE_SANS_REPONSE, code: "sans_reponse", amorces: DEMO_AMORCES }), 150);
        return true;
      }
      if (typeof v.moi.maReponse !== "string" && v.compte) v.compte.repondu++;
      v.moi.maReponse = msg.texte;
      v.moi.jaiPasse = false;
      v.moi.peutDonnerPreference = true;
      break;
    case "passer":
      if (typeof v.moi.maReponse !== "string" && v.compte) v.compte.repondu++;
      v.moi.maReponse = "";
      v.moi.jaiPasse = true;
      v.moi.peutDonnerPreference = true;
      break;
    case "note":
      v.moi.maNote = msg.texte || null;
      break;
    case "preference":
      v.moi.maPreference = msg.valeur;
      break;
    case "afficher_pseudo":
      if (v.moi.monIdee) v.moi.monIdee.accordPseudo = msg.accord;
      if (v.idee) Object.assign(v.idee, { accordPseudo: msg.accord, pseudo: msg.accord ? v.moi.pseudo : null, avatar: msg.accord ? v.moi.avatar : null });
      break;
    case "debrief":
      v.moi.monDebrief = msg.texte || null;
      break;
    case "garder_competence": {
      if (Number.isInteger(msg.departIndex)) {
        for (const c of v.moi.competences ?? []) if (c.problemeIndex == null && c.departIndex === msg.departIndex) c.gardee = msg.garder;
        break;
      }
      const pi = Number.isInteger(msg.problemeIndex) ? msg.problemeIndex : v.problemeIndex;
      if (v.moi.competenceDuProbleme && v.moi.competenceDuProbleme.problemeIndex === pi) v.moi.competenceDuProbleme.gardee = msg.garder;
      for (const c of v.moi.competences ?? []) if (c.problemeIndex === pi) c.gardee = msg.garder;
      break;
    }
  }
  demo.vue = v;
  setTimeout(() => afficher(v), 150);
  return true;
}

function demarrerDemo() {
  demo.scenes = scenesDemo();
  const barre = $("#demo-barre");
  barre.hidden = false;
  document.body.classList.add("avec-demo");
  barre.addEventListener("click", (e) => {
    const b = e.target.closest("[data-demo]");
    if (!b) return;
    if (b.dataset.demo === "precedent") montrerScene(demo.index - 1);
    if (b.dataset.demo === "suivant") montrerScene(demo.index + 1);
    if (b.dataset.demo === "lecture") {
      if (demo.lecture) {
        clearInterval(demo.lecture);
        demo.lecture = null;
      } else demo.lecture = setInterval(() => montrerScene(demo.index + 1), 4000);
      b.setAttribute("aria-pressed", String(!!demo.lecture));
    }
  });
  etatConnexion("ok", "Démo");
  const depart = Number(params.get("vue"));
  montrerScene(Number.isInteger(depart) && depart > 0 ? depart - 1 : 0);
}

// ---------- Démarrage ----------

$("#code-partie").textContent = CODE ? CODE : "";
if (DEMO) {
  demarrerDemo();
} else if (!CODE) {
  connexionEl.hidden = true;
  afficher(null);
} else {
  etat.joueurId = lireStockage(cleStockage(CODE));
  afficher(null);
  connecter();
}
