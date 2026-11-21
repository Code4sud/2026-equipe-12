// Page fiche.html?code=XXXX&joueur=<id> : charge la fiche du joueur
// (GET /api/parties/:code/fiche/:joueurId) et l'affiche, prête à imprimer en A4.
// ?demo=1 : données factices (personnage inventé).

import { rendreFiche } from "./fiche.js";

const params = new URLSearchParams(location.search);
const DEMO = params.get("demo") === "1";
const $ = (s) => document.querySelector(s);

export const FICHE_DEMO = {
  code: "DEMO",
  pseudo: "Lina",
  avatar: "🦊",
  // 3 épisodes par défaut : E, A, R (types éloignés sur l'hexagone RIASEC).
  problemes: [
    { index: 0, titre: "Le budget du tournoi", riasec: "E", questionVecu: "Ça t'est déjà arrivé de gérer un budget pour un projet avec d'autres ? Comment vous avez fait ?" },
    { index: 1, titre: "L'affiche du tournoi", riasec: "A", questionVecu: "Ça t'est déjà arrivé de créer un visuel, une vidéo ou un post pour faire connaître quelque chose ? Comment tu as fait ?" },
    { index: 2, titre: "Le jour J", riasec: "R", questionVecu: "Ça t'est déjà arrivé de chercher pourquoi un objet ne marchait plus, ou de réparer quelque chose ? Comment tu as fait ?" },
  ],
  competences: [
    { code: "3E205", libelle: "Réparer un équipement, une machine, une installation", mots: "Tu as raconté avoir réparé un vélo : c'est ce qu'on appelle « Réparer un équipement, une machine, une installation ».", preuve: "j'ai réparé le vélo d'un pote avec des tutos", typePreuve: "vecu", riasec: ["R"], problemeIndex: null, gardee: true },
    { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu as raconté avoir aidé un ami pour son dossier : c'est ce qu'on appelle « Conseiller, accompagner une personne ».", preuve: "je l'ai aidé à remplir son dossier pour le club", typePreuve: "vecu", riasec: ["S"], problemeIndex: null, gardee: true },
    { code: "4C101", libelle: "Élaborer, suivre et piloter un budget", mots: "Tu as proposé de comparer les prix avant d'acheter : c'est ce qu'on appelle « Élaborer, suivre et piloter un budget ».", preuve: "on regarde sur internet combien ça coûte", typePreuve: "jeu", idee: true, riasec: ["C"], problemeIndex: 0, gardee: true },
    { code: "6D108", libelle: "Faire preuve d'autonomie", mots: "Tu as proposé d'aller toi-même voir les commerçants : c'est ce qu'on appelle « Faire preuve d'autonomie ».", preuve: "je vais voir le boulanger du quartier pour mettre l'affiche en vitrine", typePreuve: "jeu", idee: false, horsScenario: true, riasec: [], problemeIndex: 1, gardee: true },
    { code: "3E202", libelle: "Réaliser un diagnostic technique", mots: "Tu as proposé de vérifier la panne avant de réparer : c'est ce qu'on appelle « Réaliser un diagnostic technique ».", preuve: "vérifier la bougie et le niveau d'essence", typePreuve: "jeu", idee: false, riasec: ["I", "R"], problemeIndex: 2, gardee: true },
    { code: "6D101", libelle: "Être à l'écoute, faire preuve d'empathie", mots: "Tu écoutes les autres.", preuve: "je demande ce qui s'est passé", typePreuve: "jeu", riasec: [], problemeIndex: 2, gardee: false },
  ],
  // Pour le psychologue seulement (jamais montré au groupe).
  passes: [],
  preferences: [
    { index: 0, titre: "Le budget du tournoi", valeur: "un_peu" },
    { index: 2, titre: "Le jour J", valeur: "oui" },
  ],
  debrief: "l'été dernier j'ai remonté la chaîne du scooter de mon cousin",
};

async function json(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function message(texte) {
  $("#statut").textContent = texte;
}

async function demarrer() {
  const code = String(params.get("code") ?? "").trim().toUpperCase();
  const joueur = String(params.get("joueur") ?? "").trim();
  let donnees;
  if (DEMO) {
    donnees = FICHE_DEMO;
  } else {
    if (!/^[A-Z]{4}$/.test(code) || !/^[\w-]{1,80}$/.test(joueur)) {
      message("Lien incomplet : ouvre ta fiche depuis ton téléphone, à la fin de la partie.");
      return;
    }
    let r = null;
    try {
      r = await fetch(`api/parties/${code}/fiche/${encodeURIComponent(joueur)}`);
    } catch {
      r = null;
    }
    if (!r || !r.ok) {
      message(
        r?.status === 404
          ? "Fiche introuvable. Rien n'est conservé plus d'une heure après la partie : demande à l'animateur."
          : "Impossible de charger ta fiche pour le moment. Réessaie dans un instant.",
      );
      return;
    }
    donnees = await r.json().catch(() => null);
    if (!donnees) return message("Impossible de lire ta fiche. Réessaie dans un instant.");
  }
  const [rome, onet] = await Promise.all([json("data/rome.json"), json("data/metiers.json")]);
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const fiche = $("#fiche");
  fiche.innerHTML = rendreFiche(donnees, { rome, onet, date, metiersOuverts: true });
  fiche.hidden = false;
  message("");
  const pseudo = donnees.pseudo ?? donnees.joueur?.pseudo ?? donnees.moi?.pseudo;
  if (pseudo) document.title = `Fiche de ${pseudo} — Déclic`;
  const imprimer = $("#imprimer");
  imprimer.disabled = false;
  imprimer.addEventListener("click", () => window.print());
}

demarrer();
