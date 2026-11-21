// Simulation d'une partie complète contre `wrangler dev` (SPEC §7).
//
//   npx wrangler dev --port 8787 --var MJ_MODE:mock     (dans un autre terminal)
//   npm run simulate [-- http://localhost:8787]
//
// Crée une partie de 2 problèmes, connecte 1 écran + 3 joueurs en WebSocket
// (WebSocket global de Node 22), joue 2 problèmes (réflexion silencieuse, discussion,
// réponse privée ; « je ne sais pas » et la violence sont refusés au joueur concerné), et vérifie :
//   - à chaque épisode, le MJ choisit l'idée du tour : l'écran la montre d'abord SANS pseudo,
//     puis avec le pseudo quand son auteur accepte ; il reçoit la compétence de l'idée ;
//   - chaque autre réponse peut recevoir une compétence PRIVÉE (sur son téléphone seulement) ;
//   - l'écran n'a JAMAIS reçu le texte d'une réponse (ni d'un récit) ;
//   - aucun message ne contient « faux » ou « mauvaise réponse » ;
//   - reconnexion d'un joueur avec son joueurId, fiche JSON, page /p/<code> ;
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
// raccourcis avec « fin_minuteur », sauf le 1er échange qui teste l'alarme du DO :
// à 0, la partie N'AVANCE PAS seule (tempsEcoule), l'animateur lance la suite.
const DUREE = 10;

const { problemes } = JSON.parse(readFileSync(new URL("../public/data/problemes.json", import.meta.url), "utf8"));
const PROBLEMES = new Map(problemes.map((p) => [p.id, p]));

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

const sansAccents = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nbMotsCles = (texte, mots) => {
  const t = sansAccents(texte);
  return new Set(mots.map(sansAccents).filter((m) => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t))).size;
};

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
  envoyer(msg) {
    this.ws.send(JSON.stringify(msg));
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
  attendreVue(predicat, description) {
    return this.attendre((m) => m.t === "etat" && predicat(m.vue), description);
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

  // 1. Création de la partie.
  const r = await fetch(`${BASE}/api/parties`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nbProblemes: 2, dureeEchange: DUREE, dureeReponse: DUREE, dureeReflexion: DUREE }),
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
      console.log(
        `  [écran] etat phase=${v.phase} probleme=${v.problemeIndex ?? "-"} compte=${v.compte ? `${v.compte.repondu}/${v.compte.total}` : "-"}` +
          "",
      );
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
  await ecran.attendreVue((v) => v.joueurs?.length === 3, "3 joueurs à l'écran");
  verifier(true, "3 joueurs ont rejoint la partie");

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
    const v = (await j.attendreVue((v) => v.moi?.depart?.etat === "a_valider", "ses compétences de départ")).vue;
    const props = v.moi.depart.propositions;
    verifier(props.length >= 1 && props.length <= 3, `${j.pseudo} : ${props.length} compétence(s) de départ (max 3) — ${props.map((c) => c.code).join(", ")}`);
    j.envoyer({ t: "valider_depart", garder: props.map(() => true) });
  }

  // 4. Problème 1 : résolu.
  let v = (await ecran.attendreVue((v) => v.phase === "presentation" && v.problemeIndex === 0, "le problème 1")).vue;
  const p1 = PROBLEMES.get(v.probleme?.id);
  exiger(p1, `problème 1 connu : ${v.probleme?.id}`);
  // « J'ai lu » : la discussion démarre seule quand TOUT le monde a lu.
  joueurs[0].envoyer({ t: "lu" });
  joueurs[1].envoyer({ t: "lu" });
  v = (await ecran.attendreVue((v) => v.phase === "presentation" && v.compte?.repondu === 2, "2 joueurs sur 3 ont lu")).vue;
  verifier(JSON.stringify(v.joueurs.map((x) => x.aFini)) === "[true,true,false]", "l'écran voit qui a lu : Lina ✓, Moussa ✓, Jade …");
  joueurs[2].envoyer({ t: "lu" });
  await ecran.attendreVue((v) => v.phase === "reflexion" && v.problemeIndex === 0, "la réflexion silencieuse 1 (tout le monde a lu)");
  verifier(true, "tout le monde a lu : réflexion silencieuse");
  joueurs[0].envoyer({ t: "note", texte: `une note privée ${marque("n1")}` });
  console.log(`  … attente de la fin de la réflexion (${DUREE} s)`);
  await ecran.attendreVue((v) => v.phase === "echange" && v.problemeIndex === 0, "l'échange 1 (fin de la réflexion)");
  verifier(true, "fin de la réflexion : la discussion démarre seule");
  console.log(`  … attente de l'alarme du minuteur (${DUREE} s)`);
  await ecran.attendreVue((v) => v.phase === "echange" && v.tempsEcoule === true, "la fin du minuteur d'échange (alarme)");
  await new Promise((r) => setTimeout(r, 1500));
  verifier(ecran.vue?.phase === "echange", "temps écoulé : la partie attend l'animateur (pas d'enchaînement automatique)");
  ecran.envoyer({ t: "fin_minuteur" });
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 0, "la phase réponse 1");

  // L'idée du tour : l'écran montre d'abord ses mots SANS pseudo ; l'auteur, prévenu sur
  // son téléphone (« C'est ton idée ! On affiche ton pseudo ? »), accepte. Chacun des autres
  // reçoit en privé ce que sa réponse montre (compétence si action citable, sinon son idée).
  const ideeDuTour = async (pi, ecrits) => {
    const ve = (await ecran.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte, `l'idée du tour, épisode ${pi + 1}`)).vue;
    verifier(ve.idee.pseudo === null, `épisode ${pi + 1} : l'idée « ${ve.idee.texte} » s'affiche d'abord sans pseudo`);
    let auteur = null;
    for (const j of joueurs) {
      const vj = (await j.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.texte, "l'idée du tour")).vue;
      if (vj.moi.monIdee) auteur = j;
    }
    exiger(auteur, `épisode ${pi + 1} : l'auteur de l'idée est prévenu sur son téléphone`);
    const va = (await auteur.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.moi?.competenceDuProbleme, "sa compétence")).vue;
    verifier(va.moi.competenceDuProbleme.preuve === ve.idee.texte, `${auteur.pseudo} reçoit la compétence, trace = ses mots`);
    auteur.envoyer({ t: "afficher_pseudo", accord: true });
    const ve2 = (await ecran.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.idee?.pseudo, "le pseudo après accord")).vue;
    verifier(ve2.idee.pseudo === auteur.pseudo, `${auteur.pseudo} accepte : son pseudo s'affiche`);
    const prives = [];
    for (const j of joueurs.filter((x) => x !== auteur && ecrits.includes(x))) {
      const vj = (await j.attendreVue((v) => v.phase === "competences" && v.problemeIndex === pi && v.moi?.retourPrive, "son retour privé")).vue;
      const c = vj.moi.competenceDuProbleme;
      verifier(vj.moi.retourPrive === "idee" || (c && c.idee === false), `${j.pseudo} reçoit en privé : ${c ? c.libelle : "son idée, sans compétence"}`);
      if (c) prives.push({ j, c });
    }
    return { ...ve2.idee, auteur, prives };
  };
  const toutGarder = (idee) => {
    idee.auteur.envoyer({ t: "garder_competence", garder: true });
    for (const { j } of idee.prives) j.envoyer({ t: "garder_competence", garder: true });
  };

  const reponses1 = [
    `Moi je propose : ${p1.solution.motsCles.slice(0, 3).join(", ")} ${marque("a1")}`,
    `On en parle ensemble et on cherche une idée ${marque("a2")}`,
    `Je demande conseil à quelqu'un de confiance ${marque("a3")}`,
  ];
  joueurs.forEach((j, i) => j.envoyer({ t: "reponse", texte: reponses1[i] }));
  const idee1 = await ideeDuTour(0, [...joueurs]);

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
  joueurs[2] = revenu;
  for (const x of idee1.prives) if (x.j === ancien) x.j = revenu;
  if (idee1.auteur === ancien) idee1.auteur = revenu;
  await ecran.attendreVue((v) => v.joueurs?.every((x) => x.connecte), "tous les joueurs reconnectés");

  toutGarder(idee1);

  // 5. Épisode 2 : « je ne sais pas » et violence refusés, le joueur réécrit.
  v = (await ecran.attendreVue((v) => v.phase === "presentation" && v.problemeIndex === 1, "le problème 2")).vue;
  const p2 = PROBLEMES.get(v.probleme?.id);
  exiger(p2, `problème 2 connu : ${v.probleme?.id}`);
  // Phrase de liaison avec l'épisode 1 (écrite par le MJ, sinon la transition fixe).
  verifier(typeof v.liaison === "string" && v.liaison.length > 0, `épisode 2 relié au précédent : « ${v.liaison} »`);
  ecran.envoyer({ t: "suivant" });
  await ecran.attendreVue((v) => v.phase === "reflexion" && v.problemeIndex === 1, "la réflexion 2");
  ecran.envoyer({ t: "suivant" }); // l'animateur écourte la réflexion
  await ecran.attendreVue((v) => v.phase === "echange" && v.problemeIndex === 1, "l'échange 2");
  ecran.envoyer({ t: "fin_minuteur" });
  await ecran.attendreVue((v) => v.phase === "reponse" && v.problemeIndex === 1, "la réponse 2");
  const reponses2 = [`Je propose qu'on demande de l'aide ${marque("b1")}`, `Peut-être attendre un peu et en parler à un adulte ${marque("b2")}`, ""];
  joueurs[0].envoyer({ t: "reponse", texte: reponses2[0] });
  for (const [texte, motif] of [["Je sais pas trop, on verra bien", /Toutes les idées comptent/], ["Je le frappe", /sans violence/]]) {
    const depuis = joueurs[1].messages.length;
    joueurs[1].envoyer({ t: "reponse", texte });
    const m = await joueurs[1].attendre((x) => x.t === "erreur", `le refus de « ${texte} »`, depuis);
    verifier(motif.test(m.message ?? ""), `« ${texte} » refusé à ce joueur seulement : « ${m.message} »`);
    if (/Toutes/.test(motif.source)) {
      verifier(m.code === "sans_reponse", "code « sans_reponse » : le téléphone propose des débuts de phrase et « Je passe ce tour »");
      verifier(Array.isArray(m.amorces) && m.amorces.length === 3, `débuts de phrase envoyés : ${(m.amorces ?? []).join(" / ")}`);
    }
  }
  joueurs[1].envoyer({ t: "reponse", texte: reponses2[1] });
  // Le 3e joueur ne répond pas : l'animateur passe.
  await ecran.attendreVue((v) => v.phase === "reponse" && v.compte?.repondu === 2, "2 réponses sur 3");
  verifier(ecran.vue?.phase === "reponse", "le refus n'a rien changé pour les autres");
  ecran.envoyer({ t: "fin_minuteur" });
  const idee2 = await ideeDuTour(1, [joueurs[0], joueurs[1]]);
  verifier(idee2.pseudo !== joueurs[2].pseudo, "celui qui n'a rien écrit n'est jamais retenu");
  verifier(idee2.auteur.id !== idee1.auteur.id, "rotation stricte : l'idée retenue n'est pas celle du même joueur");
  const vAbsent = (await joueurs[2].attendreVue((v) => v.phase === "competences" && v.problemeIndex === 1, "sa vue")).vue;
  verifier(vAbsent.moi.sansReponse === true, `${joueurs[2].pseudo} (passé par l'animateur) : message « l'histoire continue »`);
  toutGarder(idee2);

  // 6. Fin.
  v = (await ecran.attendreVue((v) => v.phase === "fin", "la fin de partie")).vue;
  verifier(v.fin && typeof v.fin.nbCompetencesTotal === "number", `message de fin collectif (${v.fin?.nbCompetencesTotal} compétences au total)`);
  let totalJeu = 0;
  for (const j of joueurs) {
    const vj = (await j.attendreVue((v) => v.phase === "fin", "la fin")).vue;
    const jeu = vj.moi.competences.filter((c) => c.problemeIndex !== null);
    const idees = jeu.filter((c) => c.idee === true).length;
    const attendu = [idee1, idee2].filter((x) => x.pseudo === j.pseudo).length;
    const prives = [idee1, idee2].filter((x) => x.prives.some((p) => p.j.id === j.id)).length;
    verifier(idees === attendu && jeu.length === attendu + prives, `${j.pseudo} a ${jeu.length} compétence(s) de jeu (idées retenues : ${attendu}, privées : ${prives})`);
    totalJeu += idees;
    verifier(typeof vj.fin?.lienFiche === "string", `${j.pseudo} a un lien vers sa fiche`);
    const f = await fetch(`${BASE}/api/parties/${code}/fiche/${encodeURIComponent(j.id)}`);
    const fiche = f.status === 200 ? await f.json() : null;
    verifier(fiche?.joueur?.pseudo === j.pseudo && fiche.jeu.length === attendu + prives, `GET fiche de ${j.pseudo} → 200`);
  }
  verifier(totalJeu === 2, "une idée du tour par épisode");
  const inconnu = await fetch(`${BASE}/api/parties/${code}/fiche/joueur-inconnu-0000`);
  verifier(inconnu.status === 404, "fiche d'un joueur inconnu → 404");

  // 7. Confidentialité : l'écran n'a jamais reçu de récit ni de réponse non retenue.
  const toutEcran = ecran.bruts.join("\n");
  const retenue = (t) => [idee1, idee2].some((x) => t.includes(x.texte));
  const secrets = [...reponses1, ...reponses2, ...recits, `une note privée ${marque("n1")}`].filter((t) => t.trim() && !retenue(t));
  const fuites = secrets.filter((t) => toutEcran.includes(t) || toutEcran.includes(t.match(/zq\w+x/)?.[0] ?? "\u0000"));
  verifier(fuites.length === 0, `l'écran n'a jamais reçu le texte d'une réponse ou d'un récit (${ecran.bruts.length} messages vérifiés)`);
  verifier(/"aFini"/.test(toutEcran), "l'écran reçoit qui a fini (sans le contenu)");

  // Un joueur ne voit jamais la réponse d'un autre.
  joueurs.forEach((j, i) => {
    const tout = j.bruts.join("\n");
    const autres = [...reponses1, ...reponses2].filter((t, k) => k % 3 !== i && !retenue(t)).map((t) => t.match(/zq\w+x/)?.[0]).filter(Boolean);
    verifier(!autres.some((m) => tout.includes(m)), `${j.pseudo} ne voit pas les réponses non retenues des autres`);
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
    console.log("\n✔ Simulation réussie : 2 épisodes de l'histoire (réflexion, idée du tour à l'écran avec accord, compétences privées, réponses refusées puis réécrites).");
    process.exit(0);
  });
