// Simulation d'une partie complète contre `wrangler dev` (SPEC §7).
//
//   npx wrangler dev --port 8787 --var MJ_MODE:mock     (dans un autre terminal)
//   npm run simulate [-- http://localhost:8787]
//
// Crée une partie avec les réglages automatiques (autant d'épisodes que de joueurs,
// entre 3 et 6 : à 3 joueurs, les épisodes E, A et R, joués dans l'ordre de
// l'histoire ; durée de discussion selon la taille du groupe), connecte 1 écran +
// 3 joueurs en WebSocket (WebSocket global de Node 22) et joue le déroulé complet :
//   présentation → réflexion silencieuse (note privée) → discussion → réponse privée
//   → idée du tour → compétences privées, × 3 épisodes, puis débrief et fin.
// Elle vérifie :
//   - les réglages automatiques, puis une durée de discussion changée par l'animateur ;
//   - la réflexion qui passe seule à la discussion, la discussion qui attend l'animateur ;
//   - « je ne sais pas » (et une amorce envoyée seule) refusé avec les amorces, la
//     violence refusée, au joueur concerné seulement ; « Je passe ce tour » ;
//     un joueur passé par l'animateur (message « l'histoire continue ») ;
//   - l'idée du tour : d'abord SANS pseudo, puis avec (accord) ou toujours sans (refus) ;
//     rotation stricte ; « Choisir une autre idée » de l'animateur ;
//   - une compétence PRIVÉE possible pour chaque autre réponse (sur son téléphone seulement) ;
//   - une phrase de liaison à partir du 2e épisode ; l'avis facultatif par épisode ;
//   - le débrief (réponse privée), puis la fiche JSON (épisodes avec type RIASEC et
//     question sur le vécu, épisodes passés, avis, débrief) ;
//   - l'écran n'a JAMAIS reçu le texte d'une réponse, d'un récit, d'une note ni d'un
//     débrief, ni qui a passé son tour ; aucun joueur ne voit la réponse d'un autre ;
//   - aucun message ne contient « faux » ou « mauvaise réponse » ;
//   - reconnexion d'un joueur avec son joueurId, page /p/<code> ;
//   - écran animateur : refusé (4003) sans clé ou avec une mauvaise clé ; la clé
//     (cleEcran) n'apparaît dans aucune vue ni aucune fiche.
// Journalise tout ce que reçoit l'écran (SIMULATE_VERBOSE=1 pour le JSON complet).
// Code de sortie 1 en cas d'échec.
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] || process.env.SIMULATE_URL || "http://localhost:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const VERBEUX = process.env.SIMULATE_VERBOSE === "1";
const DELAI_MAX_MS = 30000;
// Minimum accepté par le jeu (DUREE_MIN de src/jeu.js) : les minuteurs sont
// raccourcis avec « fin_minuteur », sauf au 1er épisode, qui teste les alarmes du DO :
// la réflexion passe SEULE à la discussion ; à la fin de la discussion, la partie
// N'AVANCE PAS seule (tempsEcoule), l'animateur lance la suite.
const DUREE = 10;
// Un joueur réel n'envoie pas plus de 5 messages par seconde : la simulation non plus.
const ESPACEMENT_MS = 250;

const { problemes } = JSON.parse(readFileSync(new URL("../public/data/problemes.json", import.meta.url), "utf8"));
const PROBLEMES = new Map(problemes.map((p) => [p.id, p]));
const typeDe = (p) => String(p?.riasec ?? "").charAt(0).toUpperCase();

// ─────────────────────────── Outils ───────────────────────────
// (ideeDuTour est définie dans main, elle a besoin de l'écran et des joueurs.)

let echecs = 0;
function verifier(condition, message) {
  if (condition) console.log(`  ✔ ${message}`);
  else {
    echecs++;
    console.error(`  ✘ ÉCHEC : ${message}`);
  }
  return condition;
}
function exiger(condition, message) {
  if (!verifier(condition, message)) throw new Error(message);
}

class Client {
  constructor(nom, url) {
    this.nom = nom;
    this.url = url;
    this.messages = []; // messages parsés
    this.bruts = []; // textes bruts
    this.attentes = [];
  }
  ouvrir() {
    return new Promise((resoudre, rejeter) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener("open", () => resoudre(this));
      ws.addEventListener("error", (e) => rejeter(new Error(`${this.nom} : connexion impossible (${e.message ?? "erreur"})`)));
      ws.addEventListener("message", (ev) => {
        const brut = typeof ev.data === "string" ? ev.data : String(ev.data);
        this.bruts.push(brut);
        let msg;
        try {
          msg = JSON.parse(brut);
        } catch {
          msg = { t: "?", brut };
        }
        this.messages.push(msg);
        if (this.journal) this.journal(msg, brut);
        this.attentes = this.attentes.filter((a) => !a.tester());
      });
    });
  }
  /**
   * Envoie un message en respectant l'anti-abus du serveur (5 messages par seconde
   * et par socket, SPEC §2.3) : au plus un message toutes les ESPACEMENT_MS, dans l'ordre.
   */
  envoyer(msg) {
    const quand = Math.max(Date.now(), this.prochainEnvoi ?? 0);
    this.prochainEnvoi = quand + ESPACEMENT_MS;
    const brut = JSON.stringify(msg);
    if (quand <= Date.now()) this.ws.send(brut);
    else setTimeout(() => this.ws.send(brut), quand - Date.now());
  }
  get vue() {
    return this.messages.filter((m) => m.t === "etat").at(-1)?.vue ?? null;
  }
  /** Attend un message vérifiant `predicat` (parmi ceux reçus à partir de maintenant ou déjà). */
  attendre(predicat, description, depuis = 0) {
    return new Promise((resoudre, rejeter) => {
      const tester = () => {
        const m = this.messages.slice(depuis).find(predicat);
        if (m) {
          clearTimeout(minuterie);
          resoudre(m);
          return true;
        }
        return false;
      };
      const minuterie = setTimeout(() => {
        this.attentes = this.attentes.filter((a) => a.tester !== tester);
        rejeter(new Error(`${this.nom} : délai dépassé en attendant ${description} (dernière phase : ${this.vue?.phase})`));
      }, DELAI_MAX_MS);
      if (!tester()) this.attentes.push({ tester });
    });
  }
  /** Attend une vue (dernier état) qui vérifie `predicat`. */
  attendreVue(predicat, description, depuis = 0) {
    return this.attendre((m) => m.t === "etat" && predicat(m.vue), description, depuis);
  }
  fermer() {
    try {
      this.ws.close();
    } catch {
      // déjà fermée
    }
  }
}

const marque = (n) => `zq${n}x`; // marqueur unique, introuvable ailleurs

/** Ouvre une socket qui doit être refusée : résout { code, messages } à sa fermeture. */
function connexionRefusee(url) {
  return new Promise((resoudre, rejeter) => {
    const ws = new WebSocket(url);
    const messages = [];
    const minuterie = setTimeout(() => {
      ws.close();
      rejeter(new Error(`connexion non fermée par le serveur : ${url.replace(/cle=[^&]*/, "cle=…")}`));
    }, DELAI_MAX_MS);
    ws.addEventListener("message", (ev) => {
      try {
        messages.push(JSON.parse(String(ev.data)));
      } catch {
        messages.push({ t: "?" });
      }
    });
    ws.addEventListener("close", (ev) => {
      clearTimeout(minuterie);
      resoudre({ code: ev.code, messages });
    });
  });
}

// ─────────────────────────── Scénario ───────────────────────────

async function main() {
  console.log(`Simulation contre ${BASE}`);

  // 1. Création de la partie : nombre d'épisodes et durée de discussion automatiques
  //    (non envoyés), débrief activé (comme l'accueil le fait par défaut).
  const r = await fetch(`${BASE}/api/parties`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dureeReponse: DUREE, dureeReflexion: DUREE, debrief: true }),
  });
  exiger(r.status === 201, `POST /api/parties → 201 (reçu ${r.status})`);
  const { code, cleEcran } = await r.json();
  exiger(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(code), `code de partie valide : ${code}`);
  exiger(typeof cleEcran === "string" && /^[0-9a-f-]{36}$/.test(cleEcran), "clé de l'écran animateur reçue à la création");

  // Écran sans clé ou avec une mauvaise clé : refusé (4003), sans aucune vue.
  const autreCle = cleEcran.slice(0, -1) + (cleEcran.endsWith("0") ? "1" : "0");
  for (const [libelle, q] of [["sans clé", "role=ecran"], ["avec une mauvaise clé", `role=ecran&cle=${autreCle}`]]) {
    const refus = await connexionRefusee(`${WS_BASE}/api/parties/${code}/ws?${q}`);
    verifier(
      refus.code === 4003 && refus.messages.length === 1 && refus.messages[0].t === "erreur" && !refus.messages.some((m) => m.t === "etat"),
      `écran ${libelle} refusé (fermeture ${refus.code}, messages : ${refus.messages.map((m) => m.t).join(", ") || "aucun"})`,
    );
  }

  const page = await fetch(`${BASE}/p/${code}`);
  verifier(page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html"), `GET /p/${code} sert la page joueur (HTML)`);
  await page.body?.cancel();

  // 2. Écran + 3 joueurs.
  const ecran = new Client("écran", `${WS_BASE}/api/parties/${code}/ws?role=ecran&cle=${encodeURIComponent(cleEcran)}`);
  ecran.journal = (msg, brut) => {
    if (VERBEUX) console.log(`  [écran] ${brut}`);
    else if (msg.t === "etat") {
      const v = msg.vue;
      console.log(`  [écran] etat phase=${v.phase} probleme=${v.problemeIndex ?? "-"} compte=${v.compte ? `${v.compte.repondu}/${v.compte.total}` : "-"}`);
    } else console.log(`  [écran] ${brut}`);
  };
  await ecran.ouvrir();
  await ecran.attendreVue((v) => v.phase === "accueil", "la vue d'accueil");

  const pseudos = [
    ["Lina", "🦊"],
    ["Moussa", "🐼"],
    ["Jade", "🦁"],
  ];
  const joueurs = [];
  for (const [pseudo, avatar] of pseudos) {
    const j = new Client(pseudo, `${WS_BASE}/api/parties/${code}/ws?role=joueur`);
    await j.ouvrir();
    const b = await j.attendre((m) => m.t === "bienvenue", "bienvenue");
    j.id = b.joueurId;
    j.pseudo = pseudo;
    j.envoyer({ t: "rejoindre", pseudo, avatar });
    await j.attendreVue((v) => v.moi?.pseudo === pseudo, "son inscription");
    joueurs.push(j);
  }
  let v = (await ecran.attendreVue((v) => v.joueurs?.length === 3, "3 joueurs à l'écran")).vue;
  verifier(true, "3 joueurs ont rejoint la partie");

  // Réglages automatiques selon le nombre de joueurs (SPEC §1).
  const rg = v.reglages ?? {};
  verifier(rg.nbProblemesAuto === true && rg.nbProblemes === 3, `3 joueurs → 3 épisodes automatiques (reçu ${rg.nbProblemes})`);
  verifier(rg.dureeEchangeAuto === true && rg.dureeEchange === 90, `3 joueurs → discussion de 90 s automatique (reçu ${rg.dureeEchange})`);
  verifier(rg.dureeReflexion === DUREE && rg.debrief === true, "réflexion et débrief réglés à la création");
  // L'animateur raccourcit la discussion pour la simulation : le nombre d'épisodes reste automatique.
  ecran.envoyer({ t: "reglages", dureeEchange: DUREE });
  v = (await ecran.attendreVue((v) => v.reglages?.dureeEchange === DUREE, "la durée de discussion changée")).vue;
  verifier(v.reglages.dureeEchangeAuto === false && v.reglages.nbProblemesAuto === true, "durée de discussion choisie par l'animateur, épisodes toujours automatiques");

  // Message invalide → erreur en français, sans changer l'état.
  const n0 = joueurs[0].messages.length;
  joueurs[0].envoyer({ t: "demarrer" });
  const err = await joueurs[0].attendre((m) => m.t === "erreur", "une erreur", n0);
  verifier(typeof err.message === "string" && err.message.length > 0, `message interdit refusé : « ${err.message} »`);

  // 3. Création du personnage.
  ecran.envoyer({ t: "demarrer" });
  await ecran.attendreVue((v) => v.phase === "creation", "la phase creation");
  const recits = [
    `Le mercredi j'aide des collégiens du club à faire leurs devoirs après l'entraînement ${marque("r1")}.`,
    `Sur Discord je modère un serveur de 300 personnes et je calme les embrouilles ${marque("r2")}.`,
    `J'ai réparé le scooter de mon pote et j'ai organisé un tournoi de foot au city ${marque("r3")}.`,
  ];
  joueurs.forEach((j, i) => j.envoyer({ t: "recit", texte: recits[i] }));
  for (const j of joueurs) {
    const vj = (await j.attendreVue((v) => v.moi?.depart?.etat === "a_valider", "ses compétences de départ")).vue;
    const props = vj.moi.depart.propositions;
    verifier(props.length >= 1 && props.length <= 3, `${j.pseudo} : ${props.length} compétence(s) de départ (max 3) — ${props.map((c) => c.code).join(", ")}`);
    j.envoyer({ t: "valider_depart", garder: props.map(() => true) });
  }

  // L'idée du tour : l'écran montre d'abord ses mots SANS pseudo ; l'auteur, prévenu sur
  // son téléphone (« C'est ton idée ! On affiche ton pseudo ? »), accepte ou refuse.
  // Chacun des autres reçoit en privé ce que sa réponse montre (compétence si action
  // citable, sinon son idée). `autreIdee` : l'animateur demande d'abord une autre idée.
  const ideeDuTour = async (pi, ecrits, { accord = true, autreIdee = false } = {}) => {
    let ve = (await ecran.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte, `l'idée du tour, épisode ${pi + 1}`)).vue;
    verifier(ve.idee.pseudo === null && ve.idee.avatar === null, `épisode ${pi + 1} : l'idée « ${ve.idee.texte} » s'affiche d'abord sans pseudo`);
    const trouverAuteur = async (texte) => {
      for (const j of joueurs) {
        const vj = (await j.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte === texte, "l'idée du tour")).vue;
        if (vj.moi.monIdee) return j;
      }
      return null;
    };
    let auteur = await trouverAuteur(ve.idee.texte);
    exiger(auteur, `épisode ${pi + 1} : l'auteur de l'idée est prévenu sur son téléphone`);
    let ecarte = null;
    const affichees = [ve.idee.texte]; // toutes les idées montrées à l'écran pendant l'épisode
    if (autreIdee) {
      verifier(ve.autreIdeePossible === true, "l'animateur peut demander une autre idée");
      const depuis = ecran.messages.length;
      const premiere = ve.idee.texte;
      ecran.envoyer({ t: "autre_idee" });
      ve = (await ecran.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte && v.idee.texte !== premiere, "une autre idée", depuis)).vue;
      ecarte = auteur;
      affichees.push(ve.idee.texte);
      auteur = await trouverAuteur(ve.idee.texte);
      exiger(auteur && auteur !== ecarte, `« Choisir une autre idée » : le MJ propose l'idée d'un autre joueur (« ${ve.idee.texte} »)`);
      verifier(ve.idee.pseudo === null, "la nouvelle idée s'affiche elle aussi sans pseudo");
      const vx = (await ecarte.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte === ve.idee.texte && v.moi?.retourPrive, "son retour après l'autre idée")).vue;
      verifier(!vx.moi.monIdee && vx.moi.competenceDuProbleme?.idee === false, `${ecarte.pseudo} garde sa compétence, désormais privée`);
    }
    const va = (await auteur.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.moi?.competenceDuProbleme?.idee === true, "sa compétence")).vue;
    verifier(va.moi.competenceDuProbleme.preuve === ve.idee.texte, `${auteur.pseudo} reçoit la compétence, trace = ses mots`);
    const depuis = ecran.messages.length;
    auteur.envoyer({ t: "afficher_pseudo", accord });
    const ve2 = (await ecran.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.accordPseudo === accord, "la réponse de l'auteur", depuis)).vue;
    if (accord) verifier(ve2.idee.pseudo === auteur.pseudo, `${auteur.pseudo} accepte : son pseudo s'affiche`);
    else verifier(ve2.idee.pseudo === null && ve2.idee.avatar === null, `${auteur.pseudo} préfère rester discret : toujours aucun pseudo à l'écran`);
    const prives = [];
    for (const j of joueurs.filter((x) => x !== auteur && ecrits.includes(x))) {
      const vj = (await j.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte === ve.idee.texte && v.moi?.retourPrive, "son retour privé")).vue;
      const c = vj.moi.competenceDuProbleme;
      verifier(vj.moi.retourPrive === "idee" || (c && c.idee === false), `${j.pseudo} reçoit en privé : ${c ? c.libelle : "son idée, sans compétence"}`);
      if (c) prives.push({ j, c });
    }
    return { ...ve2.idee, texte: ve.idee.texte, affichees, auteur, prives, ecarte };
  };
  const toutGarder = (idee) => {
    idee.auteur.envoyer({ t: "garder_competence", garder: true });
    for (const { j } of idee.prives) j.envoyer({ t: "garder_competence", garder: true });
  };
  const episode = async (pi) => {
    const ve = (await ecran.attendreVue((v) => v.phase === "presentation" && v.problemeIndex === pi, `l'épisode ${pi + 1}`)).vue;
    const p = PROBLEMES.get(ve.probleme?.id);
    exiger(p, `épisode ${pi + 1} connu : ${ve.probleme?.id} (type ${typeDe(p)})`);
    return { p, ve };
  };

  // 4. Épisode 1 : réflexion et discussion jusqu'au bout des minuteurs (alarmes du DO).
  const ep1 = await episode(0);
  verifier(ep1.ve.liaison === null, "1er épisode : pas de phrase de liaison");
  // « J'ai lu » : la réflexion démarre seule quand TOUT le monde a lu.
  joueurs[0].envoyer({ t: "lu" });
  joueurs[1].envoyer({ t: "lu" });
  v = (await ecran.attendreVue((v) => v.phase === "presentation" && v.compte?.repondu === 2, "2 joueurs sur 3 ont lu")).vue;
  verifier(JSON.stringify(v.joueurs.map((x) => x.aFini)) === "[true,true,false]", "l'écran voit qui a lu : Lina ✓, Moussa ✓, Jade …");
  joueurs[2].envoyer({ t: "lu" });
  await ecran.attendreVue((v) => v.phase === "reflexion" && v.problemeIndex === 0, "la réflexion silencieuse 1 (tout le monde a lu)");
  verifier(true, "tout le monde a lu : réflexion silencieuse");
  const note = `une note privée ${marque("n1")}`;
  joueurs[0].envoyer({ t: "note", texte: note });
  await joueurs[0].attendreVue((v) => v.moi?.maNote === note, "sa note privée");
  verifier(true, "Lina note un mot pendant la réflexion (privé)");
  console.log(`  … attente de la fin de la réflexion (${DUREE} s)`);
  await ecran.attendreVue((v) => v.phase === "echange" && v.problemeIndex === 0, "l'échange 1 (fin de la réflexion)");
  verifier(true, "fin de la réflexion : la discussion démarre seule");
  console.log(`  … attente de l'alarme du minuteur (${DUREE} s)`);
  await ecran.attendreVue((v) => v.phase === "echange" && v.tempsEcoule === true, "la fin du minuteur d'échange (alarme)");
  await new Promise((r) => setTimeout(r, 1500));
  verifier(ecran.vue?.phase === "echange", "temps écoulé : la partie attend l'animateur (pas d'enchaînement automatique)");
  ecran.envoyer({ t: "fin_minuteur" });
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 0, "la phase réponse 1");

  const reponses1 = [
    `Moi je propose : ${ep1.p.solution.motsCles.slice(0, 3).join(", ")} ${marque("a1")}`,
    `On en parle ensemble et on cherche une idée ${marque("a2")}`,
    `Je demande conseil à quelqu'un de confiance ${marque("a3")}`,
  ];
  joueurs.forEach((j, i) => j.envoyer({ t: "reponse", texte: reponses1[i] }));
  const idee1 = await ideeDuTour(0, [...joueurs]);

  // Avis facultatif sur l'épisode (sans score).
  const vp = (await joueurs[0].attendreVue((v) => v.problemeIndex === 0 && v.moi?.peutDonnerPreference, "la question d'avis")).vue;
  verifier(vp.moi.peutDonnerPreference === true, "après sa réponse : « Ce genre de situation, tu aimerais en vivre dans un travail ? »");
  joueurs[0].envoyer({ t: "preference", valeur: "oui" });
  joueurs[1].envoyer({ t: "preference", valeur: "un_peu" });
  await joueurs[0].attendreVue((v) => v.moi?.maPreference === "oui", "son avis");
  verifier(true, "Lina répond « oui », Moussa « un peu »");

  // Reconnexion d'un joueur pendant la phase compétences.
  const ancien = joueurs[2];
  ancien.fermer();
  await ecran.attendreVue((v) => v.joueurs?.some((x) => x.pseudo === ancien.pseudo && x.connecte === false), "la déconnexion de Jade");
  const revenu = new Client(ancien.pseudo, `${WS_BASE}/api/parties/${code}/ws?role=joueur&joueur=${encodeURIComponent(ancien.id)}`);
  await revenu.ouvrir();
  const vr = (await revenu.attendreVue((v) => v.moi, "sa vue après reconnexion")).vue;
  verifier(vr.moi.id === ancien.id && !revenu.messages.some((m) => m.t === "bienvenue"), "reconnexion avec le même joueurId, sans nouveau « bienvenue »");
  revenu.id = ancien.id;
  revenu.pseudo = ancien.pseudo;
  revenu.ancien = ancien;
  joueurs[2] = revenu;
  for (const x of idee1.prives) if (x.j === ancien) x.j = revenu;
  if (idee1.auteur === ancien) idee1.auteur = revenu;
  await ecran.attendreVue((v) => v.joueurs?.every((x) => x.connecte), "tous les joueurs reconnectés");

  toutGarder(idee1);

  // 5. Épisode 2 : « je ne sais pas », une amorce seule et la violence sont refusés,
  //    le joueur réécrit ; Jade ne répond pas (l'animateur passe) ; l'auteur reste discret.
  const ep2 = await episode(1);
  // Phrase de liaison avec l'épisode 1 (écrite par le MJ, sinon la transition fixe).
  verifier(typeof ep2.ve.liaison === "string" && ep2.ve.liaison.length > 0, `épisode 2 relié au précédent : « ${ep2.ve.liaison} »`);
  ecran.envoyer({ t: "suivant" });
  await ecran.attendreVue((v) => v.phase === "reflexion" && v.problemeIndex === 1, "la réflexion 2");
  ecran.envoyer({ t: "suivant" }); // l'animateur écourte la réflexion
  await ecran.attendreVue((v) => v.phase === "echange" && v.problemeIndex === 1, "l'échange 2");
  ecran.envoyer({ t: "fin_minuteur" });
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 1, "la réponse 2");
  const reponses2 = [`Je propose qu'on demande de l'aide ${marque("b1")}`, `Peut-être attendre un peu et en parler à un adulte ${marque("b2")}`, ""];
  joueurs[0].envoyer({ t: "reponse", texte: reponses2[0] });
  const refus = [
    ["Je sais pas trop, on verra bien", /Toutes les idées comptent/, "sans_reponse"],
    ["D'abord, je…", /Toutes les idées comptent/, "sans_reponse"],
    ["Je le frappe", /sans violence/, "violence"],
  ];
  for (const [texte, motif, codeAttendu] of refus) {
    const depuis = joueurs[1].messages.length;
    joueurs[1].envoyer({ t: "reponse", texte });
    const m = await joueurs[1].attendre((x) => x.t === "erreur", `le refus de « ${texte} »`, depuis);
    verifier(motif.test(m.message ?? "") && m.code === codeAttendu, `« ${texte} » refusé à ce joueur seulement (code ${m.code}) : « ${m.message} »`);
    if (codeAttendu === "sans_reponse") {
      verifier(Array.isArray(m.amorces) && m.amorces.length === 3, `débuts de phrase proposés avec « Je passe ce tour » : ${(m.amorces ?? []).join(" / ")}`);
    }
  }
  joueurs[1].envoyer({ t: "reponse", texte: reponses2[1] });
  // Le 3e joueur ne répond pas : l'animateur passe.
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 1 && v.compte?.repondu === 2, "2 réponses sur 3");
  verifier(ecran.vue?.phase === "reponse", "les refus n'ont rien changé pour les autres");
  ecran.envoyer({ t: "fin_minuteur" });
  const idee2 = await ideeDuTour(1, [joueurs[0], joueurs[1]], { accord: false });
  verifier(idee2.auteur !== joueurs[2], "celui qui n'a rien écrit n'est jamais retenu");
  verifier(idee2.auteur.id !== idee1.auteur.id, "rotation stricte : l'idée retenue n'est pas celle du même joueur");
  const vAbsent = (await joueurs[2].attendreVue((v) => v.phase === "competences" && v.problemeIndex === 1, "sa vue")).vue;
  verifier(vAbsent.moi.sansReponse === true && vAbsent.moi.jaiPasse === false, `${joueurs[2].pseudo} (passé par l'animateur) : message « l'histoire continue »`);
  toutGarder(idee2);

  // 6. Épisode 3 : Jade préfère passer son tour ; l'animateur demande une autre idée.
  const ep3 = await episode(2);
  verifier(typeof ep3.ve.liaison === "string" && ep3.ve.liaison.length > 0, `épisode 3 relié au précédent : « ${ep3.ve.liaison} »`);
  ecran.envoyer({ t: "suivant" });
  await ecran.attendreVue((v) => v.phase === "reflexion" && v.problemeIndex === 2, "la réflexion 3");
  ecran.envoyer({ t: "fin_minuteur" });
  await ecran.attendreVue((v) => v.phase === "echange" && v.problemeIndex === 2, "l'échange 3");
  ecran.envoyer({ t: "suivant" });
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 2, "la réponse 3");
  const reponses3 = [
    `Je vérifie s'il reste de l'essence et je regarde la béquille ${marque("c1")}`,
    `On teste les freins et on demande au mécano du quartier ${marque("c2")}`,
    "",
  ];
  joueurs[2].envoyer({ t: "passer" });
  const vPasse = (await joueurs[2].attendreVue((v) => v.problemeIndex === 2 && v.moi?.jaiPasse === true, "son tour passé")).vue;
  verifier(vPasse.moi.jaiPasse === true, `${joueurs[2].pseudo} passe ce tour, sans reproche`);
  v = (await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 2 && v.compte?.repondu === 1, "1 joueur sur 3 a fini")).vue;
  verifier(v.joueurs.find((x) => x.pseudo === joueurs[2].pseudo)?.aFini === true, "l'écran voit Jade « fini » comme les autres (jamais qu'elle a passé)");
  joueurs[0].envoyer({ t: "reponse", texte: reponses3[0] });
  joueurs[1].envoyer({ t: "reponse", texte: reponses3[1] });
  const idee3 = await ideeDuTour(2, [joueurs[0], joueurs[1]], { autreIdee: true });
  if (idee3.ecarte && !idee3.prives.some((x) => x.j === idee3.ecarte)) {
    const c = (await idee3.ecarte.attendreVue((v) => v.problemeIndex === 2 && v.moi?.competenceDuProbleme, "sa compétence")).vue.moi.competenceDuProbleme;
    idee3.prives.push({ j: idee3.ecarte, c });
  }
  toutGarder(idee3);

  // 7. Débrief (réponse privée), puis fin.
  await ecran.attendreVue((v) => v.phase === "debrief", "le débrief");
  verifier(true, "après le dernier épisode : débrief collectif");
  const debriefs = [`Au club j'ai déjà géré la caisse du goûter ${marque("d1")}`, `Avec mes potes on a monté un tournoi ${marque("d2")}`];
  joueurs[0].envoyer({ t: "debrief", texte: debriefs[0] });
  joueurs[1].envoyer({ t: "debrief", texte: debriefs[1] });
  v = (await ecran.attendreVue((v) => v.phase === "debrief" && v.compte?.repondu === 2, "2 réponses au débrief")).vue;
  verifier(v.compte.total === 3, "l'écran voit qui a répondu au débrief, jamais quoi");
  ecran.envoyer({ t: "suivant" });

  v = (await ecran.attendreVue((v) => v.phase === "fin", "la fin de partie")).vue;
  verifier(v.fin && typeof v.fin.nbCompetencesTotal === "number", `message de fin collectif (${v.fin?.nbCompetencesTotal} compétences au total)`);
  const idees = [idee1, idee2, idee3];
  verifier(
    JSON.stringify([ep1, ep2, ep3].map((x) => typeDe(x.p))) === '["E","A","R"]',
    `3 épisodes aux types éloignés, dans l'ordre de l'histoire : ${[ep1, ep2, ep3].map((x) => `${x.p.id} (${typeDe(x.p)})`).join(", ")}`,
  );
  let totalJeu = 0;
  for (const j of joueurs) {
    const vj = (await j.attendreVue((v) => v.phase === "fin", "la fin")).vue;
    const jeu = vj.moi.competences.filter((c) => c.problemeIndex !== null);
    const nbIdees = jeu.filter((c) => c.idee === true).length;
    const attendu = idees.filter((x) => x.auteur.id === j.id).length;
    const prives = idees.filter((x) => x.prives.some((p) => p.j.id === j.id)).length;
    verifier(nbIdees === attendu && jeu.length === attendu + prives, `${j.pseudo} a ${jeu.length} compétence(s) de jeu (idées retenues : ${attendu}, privées : ${prives})`);
    totalJeu += nbIdees;
    verifier(typeof vj.fin?.lienFiche === "string", `${j.pseudo} a un lien vers sa fiche`);
    const f = await fetch(`${BASE}/api/parties/${code}/fiche/${encodeURIComponent(j.id)}`);
    const fiche = f.status === 200 ? await f.json() : null;
    verifier(fiche?.joueur?.pseudo === j.pseudo && fiche.jeu.length === attendu + prives, `GET fiche de ${j.pseudo} → 200`);
    verifier(
      fiche?.problemes?.length === 3 && fiche.problemes.every((p) => /^[RIASEC]/.test(p.riasec ?? "") && typeof p.questionVecu === "string"),
      `fiche de ${j.pseudo} : chaque épisode avec son type RIASEC et sa question sur le vécu`,
    );
    const i = joueurs.indexOf(j);
    const passes = (fiche?.passes ?? []).map((p) => p.index);
    verifier(JSON.stringify(passes) === (i === 2 ? "[2]" : "[]"), `fiche de ${j.pseudo} (pour le psy) : épisodes passés ${JSON.stringify(passes)}`);
    const avis = (fiche?.preferences ?? []).map((p) => p.valeur);
    verifier(JSON.stringify(avis) === JSON.stringify([["oui"], ["un_peu"], []][i]), `fiche de ${j.pseudo} : avis ${JSON.stringify(avis)}`);
    verifier((fiche?.debrief ?? null) === (debriefs[i] ?? null), `fiche de ${j.pseudo} : débrief ${fiche?.debrief ? "présent" : "absent"}`);
  }
  verifier(totalJeu === 3, "une idée du tour par épisode");
  const inconnu = await fetch(`${BASE}/api/parties/${code}/fiche/joueur-inconnu-0000`);
  verifier(inconnu.status === 404, "fiche d'un joueur inconnu → 404");

  // 8. Confidentialité : l'écran n'a jamais reçu de récit, de note, de débrief ni de
  //    réponse non retenue, ni qui a passé son tour.
  const toutEcran = ecran.bruts.join("\n");
  // Une idée montrée à l'écran (même remplacée par « Choisir une autre idée ») est publique.
  const retenue = (t) => idees.some((x) => x.affichees.some((a) => t.includes(a)));
  const reponses = [...reponses1, ...reponses2, ...reponses3];
  const secrets = [...reponses, ...recits, note, ...debriefs].filter((t) => t.trim() && !retenue(t));
  const fuites = secrets.filter((t) => toutEcran.includes(t) || toutEcran.includes(t.match(/zq\w+x/)?.[0] ?? "\u0000"));
  verifier(fuites.length === 0, `l'écran n'a jamais reçu le texte d'une réponse, d'un récit, d'une note ou d'un débrief (${ecran.bruts.length} messages vérifiés)`);
  verifier(!/"(passe|passes|jaiPasse|sansReponse|preference|preferences|maPreference|monDebrief)"\s*:/.test(toutEcran), "l'écran ne sait jamais qui a passé son tour, ni les avis, ni les débriefs");
  verifier(/"aFini"/.test(toutEcran), "l'écran reçoit qui a fini (sans le contenu)");

  // Un joueur ne voit jamais la réponse, la note ni le débrief d'un autre.
  joueurs.forEach((j, i) => {
    const tout = [...(j.ancien?.bruts ?? []), ...j.bruts].join("\n");
    const autres = [...reponses.filter((t, k) => k % 3 !== i && !retenue(t)), ...debriefs.filter((_, k) => k !== i), ...(i === 0 ? [] : [note])]
      .map((t) => t.match(/zq\w+x/)?.[0])
      .filter(Boolean);
    verifier(!autres.some((m) => tout.includes(m)), `${j.pseudo} ne voit ni les réponses non retenues, ni les notes, ni les débriefs des autres`);
  });

  // Aucun mot interdit nulle part.
  const tous = [ecran, ...joueurs].flatMap((c) => c.bruts).join("\n");
  verifier(!/\bfaux\b|mauvaise r[ée]ponse/i.test(tous), "aucun « faux » ni « mauvaise réponse » dans les messages");
  const fiches = await Promise.all(
    joueurs.map((j) => fetch(`${BASE}/api/parties/${code}/fiche/${encodeURIComponent(j.id)}`).then((f) => f.text())),
  );
  verifier(!tous.includes(cleEcran) && !/cleEcran/.test(tous), "la clé animateur n'apparaît dans aucune vue (écran ni joueurs)");
  verifier(fiches.every((f) => !f.includes(cleEcran) && !/cleEcran/.test(f)), "la clé animateur n'apparaît dans aucune fiche");

  [ecran, ...joueurs].forEach((c) => c.fermer());
  // Pour vérifier à la main (curl) avant le nettoyage automatique (1 h après la fin) :
  console.log(`\nPartie ${code} — fiches : ${joueurs.map((j) => `/api/parties/${code}/fiche/${j.id}`).join("  ")}`);
}

main()
  .catch((e) => {
    echecs++;
    console.error(`\n✘ Simulation interrompue : ${e.message}`);
  })
  .finally(() => {
    if (echecs) {
      console.error(`\n${echecs} vérification(s) en échec.`);
      process.exit(1);
    }
    console.log(
      "\n✔ Simulation réussie : 3 épisodes automatiques (E, A, R) avec réflexion, idée du tour sans pseudo puis avec accord ou refus, " +
        "autre idée, compétences privées, réponses refusées puis réécrites, tour passé, avis, débrief et fiche.",
    );
    process.exit(0);
  });
