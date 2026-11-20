// Téléphone du joueur (joueur.html, servi aussi sur /p/<code>).
// Le serveur envoie après chaque changement une vue complète filtrée pour ce
// joueur ({ t:"etat", vue }, SPEC §2.3 et §3.3) : ce fichier ne fait que
// l'afficher et envoyer les actions du joueur. Aucune logique de jeu ici.
// Mode démo : ?demo=1 fait défiler des vues factices de chaque phase.

import { echapper, typeDe, couleursLisibles } from "./riasec.js";
import { rendreFiche } from "./fiche.js";
import { totalMinuteur, dicteeDisponible, competencesEnAttente, estDepartEnAttente, messageGarder, libelleValiderDepart, fermetureDefinitive, decalageServeur } from "./joueur-outils.js";

// Copie de AVATARS (src/jeu.js, SPEC §3).
const AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦉", "🐢", "🐝", "🦄", "🐧", "🐯", "🐨"];

const RELANCES_RECIT = [
  "Un truc que tu as réparé ou bricolé ?",
  "Une fois où tu as aidé quelqu'un ?",
  "Un truc que tu as organisé avec tes potes ?",
  "Ce que tu fais en ligne (jeux, vidéos…) ?",
  "Un petit boulot, un coup de main, un club ?",
];

const LIMITES = { pseudo: 20, recitMin: 10, recit: 1000, reponse: 500 };

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

function zoneTexte({ id, label, max, placeholder, aide }) {
  return `<div class="champ">
      <label for="${id}">${label}</label>
      <textarea id="${id}" name="texte" rows="5" maxlength="${max}" data-brouillon="${id}" placeholder="${echapper(placeholder)}"></textarea>
      <div class="rangee tel-sous-champ">
        <button type="button" class="bouton discret" data-action="micro" data-cible="${id}" aria-pressed="false" hidden>🎙️ Dicter</button>
        <span class="discret" data-compteur="${id}"></span>
      </div>
      ${aide ? `<p class="discret">${aide}</p>` : ""}
    </div>`;
}

const libelleDe = (c) => c.libelle ?? c.libelle_rome ?? c.code ?? "";
const motsDe = (c) => c.mots ?? c.mots_du_jeune ?? "";
const preuveDe = (c) => c.preuve ?? c.citation ?? "";

function carteCompetence(c, { surtitre = "", corps = "" } = {}) {
  const t = typeDe(c, etat.rome);
  // Bordure à la couleur SPEC ; bandeau assombri si besoin pour un texte lisible (AA).
  const { fond, texte } = couleursLisibles(t.couleur);
  return `<article class="carte-competence" style="--type:${t.couleur};--fond-type:${fond};--sur-type:${texte}">
      <p class="carte-competence-bandeau">${surtitre ? `${echapper(surtitre)} · ` : ""}${t.lettre ? `${t.lettre} · ${t.nom}` : t.nom}</p>
      <div class="carte-competence-corps">
        <h2>${echapper(libelleDe(c))}</h2>
        ${motsDe(c) ? `<p class="mots">${echapper(motsDe(c))}</p>` : ""}
        ${preuveDe(c) ? `<p class="discret">Ta preuve :</p><blockquote class="citation">« ${echapper(preuveDe(c))} »</blockquote>` : ""}
        ${corps}
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
        cle: `presentation:${pi}:${!!moi.aLu}`,
        titre: moi.aLu ? "On attend les autres" : "Regarde l'écran",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">👀</p>
            <h1>Regarde l'écran</h1>
            <p>L'animateur lit la situation${v.probleme?.titre ? ` « ${echapper(v.probleme.titre)} »` : ""}.</p>
            ${boutonLu(v)}
          </div>
          ${rappelQuestion(v)}`,
      };
    case "echange":
      return {
        cle: `${v.phase}:${pi}:${!!v.tempsEcoule}`,
        titre: "Discutez à voix haute",
        html: `<div class="pile centre large">
            <p class="tel-emoji" aria-hidden="true">🗣️</p>
            <h1>Discutez à voix haute</h1>
            <p>Rien à écrire pour l'instant. Dites ce que vous feriez, toutes les idées comptent.</p>
            ${htmlMinuteur(v)}
            ${v.tempsEcoule ? `<p class="tel-temps-ecoule" role="status">⏰ Temps écoulé. L'animateur lance la suite.</p>` : ""}
          </div>
          ${rappelQuestion(v)}`,
      };
    case "reponse":
      return ecranReponse(v, pi);
    case "competences":
      return ecranCompetence(v, pi);
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
        <p class="aide">Choisis un pseudo (pas ton vrai nom) et un avatar. Rien n'est gardé après la partie : <a href="confidentialite.html" target="_blank" rel="noopener">tes données</a>.</p>
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
              : `<p>On n'a pas trouvé de compétence à prouver cette fois. Pas grave : tu vas en gagner pendant le jeu !</p>`}
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
              ? `<p>Recopie-les dans « Ce que je sais déjà faire » sur ta fiche papier :</p>
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
            ${zoneTexte({ id: "recit", label: "Ce que tu as déjà fait", max: LIMITES.recit, placeholder: "Par exemple : j'ai réparé le vélo d'un pote avec des tutos…" })}
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

function ecranReponse(v, pi) {
  const envoyee = typeof v.moi.maReponse === "string" && !etat.edition;
  if (envoyee) {
    return {
      cle: `reponse:${pi}:envoyee:${!!v.tempsEcoule}`,
      titre: "Ta réponse est envoyée",
      html: `<div class="pile large">
          <div class="pile centre">
            <p class="tel-emoji" aria-hidden="true">📨</p>
            <h1>Ta réponse est envoyée</h1>
            ${htmlMinuteur(v)}
            ${htmlCompte(v)}
          </div>
          ${v.moi.maReponse ? `<blockquote class="citation">${echapper(v.moi.maReponse)}</blockquote>` : ""}
          <p class="discret">Personne d'autre ne la voit. Tu peux la changer tant que tout le monde n'a pas répondu.</p>
          <button type="button" class="bouton secondaire large" data-action="modifier">Modifier ma réponse</button>
        </div>`,
    };
  }
  return {
    cle: `reponse:${pi}:saisie:${!!v.tempsEcoule}`,
    titre: "À toi de répondre",
    html: `<form class="pile" data-form="reponse" novalidate>
        <div class="rangee tel-titre-minuteur">
          <h1>À toi !</h1>
          ${htmlMinuteur(v)}
        </div>
        ${htmlTempsEcoule(v, "Le temps est écoulé, mais on t'attend : envoie ta réponse.")}
        ${v.probleme?.question ? `<p class="tel-question">${echapper(v.probleme.question)}</p>` : ""}
        ${zoneTexte({
          id: `reponse-${pi}`,
          label: "Ta réponse",
          max: LIMITES.reponse,
          placeholder: "Ce que tu ferais, avec tes mots…",
          aide: "🔒 Personne d'autre ne verra ta réponse.",
        })}
        <button type="submit" class="bouton principal large grand" data-envoi>Envoyer ma réponse</button>
        ${htmlCompte(v)}
        ${rappelQuestion(v)}
      </form>`,
  };
}


function ecranCompetence(v, pi) {
  const c = v.moi.competenceDuProbleme;
  const idee = v.idee;
  if (v.attenteIA || !idee) {
    return {
      cle: `competences:${pi}:attente`,
      titre: "Le MJ lit vos idées",
      html: `<div class="pile centre large">
          <p class="tel-emoji" aria-hidden="true">💡</p>
          <h1>Le MJ lit vos idées…</h1>
          <p>Il choisit celle qui fait avancer l'histoire. Regarde l'écran.</p>
          ${points}
        </div>`,
    };
  }
  if (!c) {
    // L'idée d'un autre joueur est retenue (ou aucune) : on regarde l'écran.
    return {
      cle: `competences:${pi}:autre:${idee.aucune ? "" : idee.pseudo}`,
      titre: "L'idée du tour",
      html: `<div class="pile centre large">
          <p class="tel-emoji" aria-hidden="true">👀</p>
          ${idee.aucune
            ? `<h1>Pas d'idée retenue cette fois</h1><p>L'histoire continue au prochain épisode.</p>`
            : `<h1>L'idée de ${echapper(idee.pseudo)} est retenue</h1>
               <blockquote class="citation">« ${echapper(idee.texte ?? "")} »</blockquote>
               <p>Regarde l'écran : l'histoire continue avec son idée. À toi au prochain épisode !</p>`}
        </div>`,
    };
  }
  if (!etat.rome) charger("rome");
  let bas;
  if (c.gardee === true) {
    bas = `<p>C'est noté : elle va sur ta fiche.</p>
      <p class="discret centre-texte">L'histoire continue. ${points}</p>
      <button type="button" class="bouton discret" data-action="garder" data-garder="0" data-pi="${pi}">Finalement, pas moi</button>`;
  } else if (c.gardee === false) {
    bas = `<p>D'accord, elle ne va pas sur ta fiche.</p>
      <p class="discret centre-texte">L'histoire continue. ${points}</p>
      <button type="button" class="bouton discret" data-action="garder" data-garder="1" data-pi="${pi}">Finalement, je la garde</button>`;
  } else {
    bas = `<p class="consigne-fiche">✍️ Écris cette compétence sur ta <strong>fiche papier</strong>, dans « Compétences trouvées pendant le jeu », puis dis-nous si tu la gardes.</p>
      <div class="rangee tel-garde" role="group" aria-label="Ton choix">
        <button type="button" class="bouton succes grand" data-action="garder" data-garder="1" data-pi="${pi}">✓ Je la garde</button>
        <button type="button" class="bouton grand" data-action="garder" data-garder="0" data-pi="${pi}">Pas moi</button>
      </div>`;
  }
  return {
    cle: `competences:${pi}:${c.code}:${c.gardee}:${!!etat.rome}`,
    titre: "Ton idée est retenue",
    html: `<div class="pile large">
        <h1>🎉 Ton idée est retenue pour la suite de l'histoire !</h1>
        ${carteCompetence(c)}
        ${bas}
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
          <h1>Bravo, la partie est finie !</h1>
          <p>Voici ta fiche. Tu peux l'imprimer et la montrer au psy pour en parler ensemble.</p>
        </div>
        <div class="pile serre">
          <a class="bouton principal large" href="${echapper(lienFiche(v))}" target="_blank" rel="noopener">🖨️ Ouvrir ma fiche à imprimer</a>
        </div>
        <!--en-attente-->
        <article class="fiche-tel">${fiche}</article>
        ${etat.onet ? "" : `<p class="discret centre-texte">Je cherche des métiers à découvrir… ${points}</p>`}
      </div>`,
  };
}

// ---------- Compétences en attente (« Je la garde / Pas moi » pas encore répondu) ----------

// Écrans où le joueur n'a rien d'autre à faire : on lui rappelle les compétences
// qu'il n'a pas encore gardées ou retirées (l'animateur a pu passer à la suite).
const PHASES_AVEC_ATTENTE = new Set(["presentation", "echange", "competences", "fin"]);

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
        ${carteCompetence(c, { surtitre: estDepartEnAttente(c) ? "Ton histoire" : `Problème ${c.problemeIndex + 1}` })}
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
    if (DICTEE) ecranEl.querySelectorAll('[data-action="micro"]').forEach((b) => (b.hidden = false));
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
    const verbe = v.phase === "presentation" ? "ont lu" : "ont répondu";
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

function basculerDictee(bouton) {
  if (recoActive) {
    recoActive.stop();
    return;
  }
  const zone = document.getElementById(bouton.dataset.cible);
  if (!zone || !Reco) return;
  const r = new Reco();
  r.lang = "fr-FR";
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
const DEMO_PROPOSITIONS = [
  { code: "3E205", libelle: "Réparer un équipement, une machine, une installation", mots: "Tu sais réparer des objets en suivant des explications.", preuve: "j'ai réparé le vélo d'un pote avec des tutos", typePreuve: "vecu", riasec: ["R"], situation: "Vélo réparé", problemeIndex: null, gardee: null },
  { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu aides les autres quand ils sont bloqués.", preuve: "je l'ai aidé à remplir son dossier", typePreuve: "vecu", riasec: ["S"], situation: "Coup de main", problemeIndex: null, gardee: null },
];
const DEMO_COMPETENCE = {
  code: "6B318", libelle: "Collecter et analyser des données, des informations", mots: "Tu as pensé à chercher les infos avant d'agir.",
  preuve: "on regarde sur internet combien ça coûte", typePreuve: "jeu", riasec: ["C"], problemeIndex: 0, gardee: null,
};

function scenesDemo() {
  const moi = (x = {}) => ({
    id: "demo-lina", pseudo: "Lina", avatar: "🦊",
    depart: { etat: "valide", propositions: DEMO_PROPOSITIONS, gardees: [DEMO_PROPOSITIONS[0]] },
    maReponse: null, competenceDuProbleme: null, competences: [], ...x,
  });
  const base = (phase, x = {}) => ({ code: "DEMO", phase, problemeIndex: 0, nbProblemes: 3, probleme: DEMO_PROBLEME, minuteurFin: null, compte: null, ...x });
  const dans = (s) => Date.now() + s * 1000;
  return [
    ["Rejoindre", () => base("accueil", { probleme: null, moi: null })],
    ["En attente du début", () => base("accueil", { probleme: null, moi: moi({ depart: { etat: "attente" } }) })],
    ["Création : récit", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "attente" } }) })],
    ["Création : analyse", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "analyse" } }) })],
    ["Création : C'est moi / Pas moi", () => base("creation", { probleme: null, moi: moi({ depart: { etat: "a_valider", propositions: DEMO_PROPOSITIONS } }) })],
    ["Création : validé", () => base("creation", { probleme: null, moi: moi() })],
    ["Présentation", () => base("presentation", { moi: moi() })],
    ["Échange", () => base("echange", { moi: moi(), minuteurFin: dans(120) })],
    ["Réponse", () => base("reponse", { moi: moi(), minuteurFin: dans(90), compte: { repondu: 1, total: 4 } })],
    ["Réponse envoyée", () => base("reponse", { moi: moi({ maReponse: "On regarde sur internet combien ça coûte et on met une protection en attendant." }), minuteurFin: dans(42), compte: { repondu: 3, total: 4 } })],
    ["Le MJ lit vos idées", () => base("competences", { moi: moi(), attenteIA: true })],
    ["Idée d'un autre joueur", () => base("competences", { moi: moi(), idee: { pseudo: "Sam", avatar: "🐼", texte: "on demande au boulanger du quartier de nous offrir le goûter", competence: { code: "6D115", libelle: "Faire preuve de créativité, d'inventivité" } } })],
    ["Ton idée est retenue", () => base("competences", { moi: moi({ competenceDuProbleme: { ...DEMO_COMPETENCE } }), idee: { pseudo: "Lina", avatar: "🦊", texte: DEMO_COMPETENCE.preuve, competence: { code: DEMO_COMPETENCE.code, libelle: DEMO_COMPETENCE.libelle } } })],
    ["Compétence notée", () => base("competences", { moi: moi({ competenceDuProbleme: { ...DEMO_COMPETENCE, gardee: true } }), idee: { pseudo: "Lina", avatar: "🦊", texte: DEMO_COMPETENCE.preuve, competence: { code: DEMO_COMPETENCE.code, libelle: DEMO_COMPETENCE.libelle }, notee: true } })],
    ["Fin", () => base("fin", {
      phase: "fin", problemeIndex: 2, probleme: null,
      moi: moi({ competences: [
        { ...DEMO_PROPOSITIONS[0], gardee: true },
        { ...DEMO_COMPETENCE, gardee: true },
        { code: "6D102", libelle: "Avoir l'esprit d'équipe", mots: "Tu as participé à la discussion avec le groupe.", preuve: "A participé à la discussion de groupe", typePreuve: "participation", riasec: [], problemeIndex: 1, gardee: true },
        { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as pensé à rassurer la personne.", preuve: "je lui explique calmement", typePreuve: "jeu", riasec: ["S"], problemeIndex: 2, gardee: true },
      ] }),
      fin: { lienFiche: "fiche.html?demo=1" },
    })],
    ["Fin (compétence pas encore choisie)", () => base("fin", {
      phase: "fin", problemeIndex: 2, probleme: null,
      moi: moi({ competences: [
        { ...DEMO_PROPOSITIONS[0], gardee: true },
        { ...DEMO_COMPETENCE, gardee: true },
        { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as pensé à rassurer la personne.", preuve: "je lui explique calmement", typePreuve: "jeu", riasec: ["S"], problemeIndex: 2, gardee: null },
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
  afficher(demo.vue);
}

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
      if (typeof v.moi.maReponse !== "string" && v.compte) v.compte.repondu++;
      v.moi.maReponse = msg.texte;
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
