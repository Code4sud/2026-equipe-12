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
  problemes: [{ titre: "Le téléphone mystère" }, { titre: "Le serveur de l'équipe" }, { titre: "Scooter en panne" }],
  competences: [
    { code: "3E205", libelle: "Réparer un équipement, une machine, une installation", mots: "Tu sais réparer des objets en suivant des explications.", preuve: "j'ai réparé le vélo d'un pote avec des tutos", typePreuve: "vecu", riasec: ["R"], problemeIndex: null, gardee: true },
    { code: "1D101", libelle: "Conseiller, accompagner une personne", mots: "Tu aides les autres quand ils sont bloqués.", preuve: "je l'ai aidé à remplir son dossier pour le club", typePreuve: "vecu", riasec: ["S"], problemeIndex: null, gardee: true },
    { code: "6B318", libelle: "Collecter et analyser des données, des informations", mots: "Tu as pensé à chercher les infos avant d'agir.", preuve: "on regarde sur internet combien ça coûte", typePreuve: "jeu", riasec: ["C"], problemeIndex: 0, gardee: true },
    { code: "6D102", libelle: "Avoir l'esprit d'équipe", mots: "Tu as participé à la discussion avec le groupe.", preuve: "A participé à la discussion de groupe", typePreuve: "participation", riasec: [], problemeIndex: 1, gardee: true },
    { code: "3E104", libelle: "Effectuer les opérations de réparation", mots: "Tu as pensé à vérifier la panne avant de réparer.", preuve: "Vérifier la bougie et le niveau d'essence", typePreuve: "jeu", riasec: ["A", "R"], problemeIndex: 2, gardee: true },
    { code: "6D101", libelle: "Etre à l'écoute, faire preuve d'empathie", mots: "Tu écoutes les autres.", preuve: "je demande ce qui s'est passé", typePreuve: "jeu", riasec: [], problemeIndex: 2, gardee: false },
  ],
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
