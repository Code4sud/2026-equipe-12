// Durable Object « Partie » : une instance par partie (nommée par son code).
//
// Rôle : orchestrateur FIN autour de la logique pure de src/jeu.js.
//   1. un message arrive (WebSocket) ou un événement interne (alarme, IA) ;
//   2. appliquer(etat, evenement, maintenant) → { etat, effets } (ou { erreur }) ;
//   3. le nouvel état est PERSISTÉ (clé "etat") AVANT d'exécuter les effets ;
//   4. les effets sont exécutés (alarme du minuteur, appels IA non bloquants…) ;
//   5. chaque socket reçoit { t:"etat", vue, serveur } filtrée selon son rôle
//      (`serveur` = heure du serveur en ms, pour corriger l'horloge du client).
//
// WebSockets : API Hibernation (ctx.acceptWebSocket), pièce jointe { role, joueurId, depuis }.
// Écran animateur authentifié : la clé `cleEcran` (crypto.randomUUID, tirée à la
// création, rangée dans l'état mais jamais dans une vue ni dans la fiche) est
// exigée sur ?role=ecran&cle=… ; sinon, fermeture 4003 « Accès animateur refusé ».
// Rien n'est conservé après la partie : deleteAll() une heure après la fin
// (et après 6 h d'inactivité pour une partie abandonnée).
//
// Chien de garde IA : chaque appel IA (analyse du récit, idée du tour, compétences privées)
// laisse une échéance dans le stockage (clé "gardesIA"). Si l'appel est perdu
// (redémarrage du DO, rechargement de wrangler dev, déploiement), l'alarme
// relance l'étape avec le MJ mock à l'échéance : la partie ne reste jamais bloquée.
import { DurableObject } from "cloudflare:workers";
import { appliquer, creerEtat, effetsIAEnAttente, MAX_JOUEURS, vue } from "./jeu.js";
import { creerMJ, mjMock } from "./mj.js";
import { analyser, versCompetenceDepart } from "./analyse.js";
import { problemes, rome } from "./donnees.js";

const ROLES = new Set(["ecran", "joueur"]);

/**
 * Rotation stricte, contrôlée par le serveur (adaptation « rotation-joueurs-retenus ») :
 * si des joueurs pas encore retenus ont écrit une vraie réponse (`obligatoires`,
 * calculés par jeu.js), l'idée doit être l'une des leurs. Sinon, « rotation non
 * respectée » : le MJ de secours choisit parmi eux seulement.
 */
export async function respecterRotation(choix, entree, obligatoires) {
  if (!Array.isArray(obligatoires) || !obligatoires.length) return choix;
  if (choix?.joueurId && obligatoires.includes(choix.joueurId)) return choix;
  console.warn("[partie] rotation non respectée : le MJ de secours choisit parmi les joueurs pas encore retenus");
  const reponses = (entree.reponses ?? []).filter((r) => obligatoires.includes(r.joueurId));
  return mjMock({ rome }).choisir({ ...entree, reponses });
}
/** Code de fermeture d'un écran sans la bonne clé animateur (SPEC §2.3). */
export const CODE_ACCES_REFUSE = 4003;
export const MESSAGE_ACCES_REFUSE = "Accès animateur refusé : cette page ne s'ouvre que depuis l'ordinateur qui a créé la partie.";
const TAILLE_MAX_CLE = 128;
const ID_JOUEUR = /^[A-Za-z0-9_-]{8,64}$/;
const TAILLE_MAX_MESSAGE = 8000;
const DELAI_ABANDON_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_IA_MS = 25000;
/** Échéance du chien de garde IA (l'appel à l'IA est borné à 25 s). */
export const DELAI_GARDE_IA_MS = 45000;

// Limites contre l'abus (sockets ouvertes, débit de messages).
export const MAX_ECRANS = 2;
export const MAX_SOCKETS_PAR_JOUEUR = 3;
export const MAX_SOCKETS_JOUEURS = MAX_JOUEURS * 2 + 2;
const SEAU_CAPACITE = 10; // messages d'affilée
const SEAU_RECHARGE = 5; // messages par seconde
const ABUS_MAX = 20; // messages refusés avant fermeture (code 4008)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function envoyer(ws, message) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Socket déjà fermée : on l'ignore, la prochaine diffusion la sautera.
  }
}

/**
 * Compare deux chaînes en temps constant (pour une même longueur de `attendue`) :
 * le temps ne dépend pas de la position du premier caractère différent.
 */
export function egalTempsConstant(recue, attendue) {
  if (typeof recue !== "string" || typeof attendue !== "string" || attendue.length === 0) return false;
  const a = new TextEncoder().encode(recue);
  const b = new TextEncoder().encode(attendue);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function fermer(ws, code, raison) {
  try {
    ws.close(code, raison);
  } catch {
    // déjà fermée
  }
}

/** Clé d'un effet IA : un seul appel attendu par tour, par problème ou par joueur. */
export const cleIA = (effet) => `${effet.type}:${effet.tourId ?? effet.problemeIndex ?? effet.joueurId ?? ""}`;

export class Partie extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** État courant (cache mémoire, rechargé depuis le stockage au réveil). */
    this.etat = null;
    /** Échéances du chien de garde IA : { [cleIA]: epoch ms }. */
    this.gardes = {};
    this.mj = null;
    /** Seaux à jetons par socket (en mémoire : remis à zéro à l'hibernation, c'est voulu). */
    this.seaux = new WeakMap();
    ctx.blockConcurrencyWhile(async () => {
      this.etat = (await ctx.storage.get("etat")) ?? null;
      this.gardes = (await ctx.storage.get("gardesIA")) ?? {};
    });
    // Ping/pong sans réveiller l'objet (le client peut envoyer {"t":"ping"}).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  // ─────────────────────────── RPC (appelées par le worker) ───────────────────────────

  /**
   * Initialise la partie. Renvoie `{ cleEcran }` (clé de l'écran animateur, à
   * transmettre UNE fois au créateur), ou false si ce code est déjà utilisé (le
   * worker retente alors avec un autre code).
   */
  async init({ code, nbProblemes, dureeEchange, dureeReponse, dureeReflexion, debrief } = {}) {
    if (this.etat) return false;
    const graine = crypto.getRandomValues(new Uint32Array(1))[0];
    const maintenant = Date.now();
    const cleEcran = crypto.randomUUID();
    // `cleEcran` vit dans l'état persisté, mais vue() et fiche() construisent leurs
    // objets champ par champ : elle n'en sort jamais.
    const etat = { ...creerEtat({ code, problemes, nbProblemes, dureeEchange, dureeReponse, dureeReflexion, debrief, graine, maintenant }), cleEcran };
    this.etat = etat;
    await this.ctx.storage.put({ etat, activite: maintenant });
    await this.ctx.storage.setAlarm(maintenant + DELAI_ABANDON_MS);
    return { cleEcran };
  }

  /** Données de la fiche d'un joueur (pour fiche.html), ou null si inconnu. */
  async fiche(joueurId) {
    const e = this.etat;
    const j = e?.joueurs?.[joueurId];
    if (!j) return null;
    const competences = structuredClone(j.competences ?? []);
    const titre = (id) => e.catalogue?.[id]?.titre ?? id;
    const reponse = (index) => j.reponses?.[index] ?? null;
    return {
      code: e.code,
      phase: e.phase,
      termine: e.phase === "fin",
      date: e.finA ?? null,
      joueur: { id: j.id, pseudo: j.pseudo, avatar: j.avatar },
      competences,
      depart: competences.filter((c) => c.problemeIndex === null),
      jeu: competences.filter((c) => c.problemeIndex !== null),
      problemes: e.problemes.map((id, index) => ({
        index,
        id,
        titre: titre(id),
        riasec: e.catalogue?.[id]?.riasec ?? null,
        questionVecu: e.catalogue?.[id]?.questionVecu ?? null,
      })),
      // Pour le psychologue seulement (décision de Pierre §3) : les épisodes où le
      // jeune a préféré passer son tour, à explorer en entretien. Jamais montré au groupe.
      passes: e.problemes
        .map((id, index) => ({ index, titre: titre(id) }))
        .filter(({ index }) => reponse(index)?.passe === true),
      // « Ce genre de situation, tu aimerais en vivre dans un travail ? » (facultatif, sans score).
      preferences: e.problemes
        .map((id, index) => ({ index, titre: titre(id), valeur: reponse(index)?.preference ?? null }))
        .filter((p) => p.valeur !== null),
      // Débrief : « Raconte une fois, dans ta vraie vie, où tu l'as déjà utilisée » (privé).
      debrief: typeof j.debrief === "string" && j.debrief ? j.debrief : null,
    };
  }

  // ─────────────────────────── WebSocket ───────────────────────────

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ erreur: "Connexion WebSocket attendue." }, 426);
    }
    if (!this.etat) return json({ erreur: "Partie introuvable." }, 404);

    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    if (!ROLES.has(role)) return json({ erreur: "Rôle inconnu : « ecran » ou « joueur »." }, 400);

    let joueurId = null;
    let nouveau = false;
    let refus = null;
    if (role === "ecran") {
      const cle = url.searchParams.get("cle");
      const ok = typeof cle === "string" && cle.length <= TAILLE_MAX_CLE && egalTempsConstant(cle, this.etat.cleEcran);
      // Refus AVANT de toucher aux écrans en place : un intrus ne déconnecte jamais l'animateur.
      if (!ok) return this.refuserEcran();
    }
    if (role === "joueur") {
      const demande = url.searchParams.get("joueur");
      if (demande && ID_JOUEUR.test(demande) && this.etat.joueurs[demande]) {
        joueurId = demande; // reconnexion d'un joueur connu
        // Au plus 3 onglets par joueur : on ferme les plus anciens.
        this.fermerLesPlusAnciennes(this.ctx.getWebSockets(joueurId), MAX_SOCKETS_PAR_JOUEUR - 1, 4002, "remplacée par une connexion plus récente");
      } else {
        // Nouveau joueur : plafond de sockets (les sockets en trop sont refusées).
        if (this.ctx.getWebSockets("joueur").length >= MAX_SOCKETS_JOUEURS) {
          return json({ erreur: "La partie est complète." }, 409);
        }
        if (this.etat.phase !== "accueil") refus = "La partie a déjà commencé.";
        joueurId = crypto.randomUUID();
        nouveau = true;
      }
    } else {
      // Au plus 2 écrans : l'écran le plus récent remplace le plus ancien
      // (l'animateur qui recharge sa page n'est jamais bloqué).
      this.fermerLesPlusAnciennes(this.ctx.getWebSockets("ecran"), MAX_ECRANS - 1, 4002, "remplacé par un autre écran");
    }

    const { 0: client, 1: serveur } = new WebSocketPair();
    this.ctx.acceptWebSocket(serveur, joueurId ? [role, joueurId] : [role]);
    serveur.serializeAttachment({ role, joueurId, depuis: Date.now() });

    if (refus) {
      // Partie commencée : message lisible par la page, puis fermeture (code 4009).
      envoyer(serveur, { t: "erreur", message: refus });
      fermer(serveur, 4009, "partie commencée");
      return new Response(null, { status: 101, webSocket: client });
    }

    if (nouveau) envoyer(serveur, { t: "bienvenue", joueurId });
    if (role === "joueur" && !nouveau) {
      // Reconnexion : marque le joueur connecté (diffuse à tout le monde).
      const ok = await this.traiter({ t: "connexion", joueurId });
      if (!ok) this.envoyerVue(serveur);
    } else {
      this.envoyerVue(serveur);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Écran sans la bonne clé : socket acceptée le temps d'envoyer un message lisible,
   * puis fermée (4003). Étiquette « refuse » : elle ne compte pas parmi les écrans,
   * ne reçoit aucune vue et ne peut rien envoyer.
   */
  refuserEcran() {
    const { 0: client, 1: serveur } = new WebSocketPair();
    this.ctx.acceptWebSocket(serveur, ["refuse"]);
    serveur.serializeAttachment({ role: "refuse", joueurId: null, depuis: Date.now() });
    envoyer(serveur, { t: "erreur", message: MESSAGE_ACCES_REFUSE });
    fermer(serveur, CODE_ACCES_REFUSE, "accès animateur refusé");
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Ferme les sockets les plus anciennes pour n'en garder que `garder`. */
  fermerLesPlusAnciennes(sockets, garder, code, raison) {
    const triees = sockets
      .map((ws) => ({ ws, depuis: ws.deserializeAttachment()?.depuis ?? 0 }))
      .sort((a, b) => a.depuis - b.depuis);
    for (const { ws } of triees.slice(0, Math.max(0, triees.length - garder))) {
      envoyer(ws, { t: "erreur", message: "Cette page a été ouverte ailleurs." });
      fermer(ws, code, raison);
    }
  }

  /** Seau à jetons : "ok", "refuser" (message ignoré) ou "fermer" (abus répété). */
  autoriser(ws) {
    const now = Date.now();
    let s = this.seaux.get(ws);
    if (!s) {
      s = { jetons: SEAU_CAPACITE, t: now, abus: 0 };
      this.seaux.set(ws, s);
    }
    s.jetons = Math.min(SEAU_CAPACITE, s.jetons + ((now - s.t) * SEAU_RECHARGE) / 1000);
    s.t = now;
    if (s.jetons >= 1) {
      s.jetons -= 1;
      return "ok";
    }
    s.abus += 1;
    return s.abus >= ABUS_MAX ? "fermer" : "refuser";
  }

  async webSocketMessage(ws, message) {
    const debit = this.autoriser(ws);
    if (debit === "fermer") {
      envoyer(ws, { t: "erreur", message: "Trop de messages : connexion fermée." });
      return fermer(ws, 4008, "trop de messages");
    }
    if (debit === "refuser") return envoyer(ws, { t: "erreur", message: "Doucement : trop de messages d'un coup." });

    if (typeof message !== "string" || message.length > TAILLE_MAX_MESSAGE) {
      return envoyer(ws, { t: "erreur", message: "Message invalide." });
    }
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return envoyer(ws, { t: "erreur", message: "Message illisible." });
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.t !== "string") {
      return envoyer(ws, { t: "erreur", message: "Message invalide." });
    }
    if (msg.t === "ping") return envoyer(ws, { t: "pong" });

    const att = ws.deserializeAttachment();
    if (!att || !ROLES.has(att.role)) {
      envoyer(ws, { t: "erreur", message: "Connexion inconnue. Recharge la page." });
      return ws.close(4000, "connexion inconnue");
    }
    if (!this.etat) {
      return envoyer(ws, { t: "erreur", message: "Cette partie est terminée." });
    }
    // Le rôle et l'identité viennent de la connexion, jamais du message.
    const { role: _r, joueurId: _j, __maintenant: _m, secours: _s, ...contenu } = msg;
    const evenement = { ...contenu, role: att.role };
    if (att.role === "joueur") evenement.joueurId = att.joueurId;
    await this.traiter(evenement, ws);
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "au revoir");
    } catch {
      // déjà fermée
    }
    await this.departSocket(ws);
  }

  async webSocketError(ws) {
    await this.departSocket(ws);
  }

  async departSocket(ws) {
    const att = ws.deserializeAttachment();
    if (!this.etat || att?.role !== "joueur" || !this.etat.joueurs[att.joueurId]) return;
    // Encore une autre connexion ouverte pour ce joueur (2 onglets) ? Il reste connecté.
    const autres = this.ctx.getWebSockets(att.joueurId).filter((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (autres.length === 0 && this.etat.joueurs[att.joueurId].connecte) {
      await this.traiter({ t: "deconnexion", joueurId: att.joueurId });
    }
  }

  // ─────────────────────────── Alarme ───────────────────────────

  async alarm() {
    if (!this.etat) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const maintenant = Date.now();

    if (this.etat.phase === "fin") {
      const nettoyage = (await this.ctx.storage.get("nettoyage")) ?? maintenant;
      if (maintenant >= nettoyage - 1000) return this.supprimer();
      await this.ctx.storage.setAlarm(nettoyage);
      return;
    }

    // 1) Chien de garde IA : relance avec le MJ mock les appels perdus.
    await this.verifierGardes(maintenant);

    // 2) Minuteur arrivé à échéance.
    if (this.etat?.minuteurFin && !this.etat.tempsEcoule && maintenant >= this.etat.minuteurFin - 250) {
      await this.traiter({ t: "minuteur_fini" });
    }
    if (!this.etat) return;

    // 3) Abandon : aucune activité depuis longtemps.
    if (this.etat.phase !== "fin") {
      const activite = (await this.ctx.storage.get("activite")) ?? this.etat.creeA ?? 0;
      if (maintenant >= activite + DELAI_ABANDON_MS - 1000) return this.supprimer();
    }
    await this.programmerAlarme(maintenant);
  }

  /** Relance avec le mock chaque effet IA attendu dont l'échéance est passée. */
  async verifierGardes(maintenant) {
    const attente = effetsIAEnAttente(this.etat);
    const cles = new Set(attente.map(cleIA));
    let change = false;
    for (const cle of Object.keys(this.gardes)) {
      if (!cles.has(cle)) {
        delete this.gardes[cle];
        change = true;
      }
    }
    const aRelancer = [];
    for (const effet of attente) {
      const cle = cleIA(effet);
      const fin = this.gardes[cle];
      if (fin === undefined) {
        // État en attente sans échéance (état d'avant ce correctif) : on en pose une.
        this.gardes[cle] = maintenant + DELAI_GARDE_IA_MS;
        change = true;
      } else if (maintenant >= fin - 250) {
        delete this.gardes[cle];
        change = true;
        aRelancer.push(effet);
      }
    }
    if (change) await this.ctx.storage.put("gardesIA", this.gardes);
    for (const effet of aRelancer) {
      console.warn(`[partie ${this.etat?.code}] appel IA perdu (${cleIA(effet)}) : relance avec le MJ de secours`);
      await this.lancerIA({ ...effet, secours: true });
    }
  }

  /**
   * Programme LA prochaine alarme : la plus proche échéance parmi le minuteur,
   * le chien de garde IA et l'abandon (6 h sans activité) ; le nettoyage en fin.
   */
  async programmerAlarme(maintenant) {
    const e = this.etat;
    if (!e) return;
    if (e.phase === "fin") {
      const nettoyage = await this.ctx.storage.get("nettoyage");
      if (nettoyage) await this.ctx.storage.setAlarm(nettoyage);
      return;
    }
    const activite = (await this.ctx.storage.get("activite")) ?? maintenant;
    const echeances = [activite + DELAI_ABANDON_MS];
    if (e.minuteurFin && !e.tempsEcoule) echeances.push(e.minuteurFin);
    for (const fin of Object.values(this.gardes)) if (Number.isFinite(fin)) echeances.push(fin);
    await this.ctx.storage.setAlarm(Math.min(...echeances));
  }

  async supprimer() {
    for (const ws of this.ctx.getWebSockets()) {
      envoyer(ws, { t: "erreur", message: "Cette partie est terminée et a été effacée." });
      fermer(ws, 4001, "partie effacée");
    }
    this.etat = null;
    this.gardes = {};
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ─────────────────────────── Cœur : appliquer → persister → effets → diffuser ───────────────────────────

  /**
   * Applique un événement. Renvoie true si l'état a changé.
   * @param {object} evenement message client enrichi ({ role, joueurId }) ou événement interne
   * @param {WebSocket} [origine] socket à qui renvoyer l'erreur éventuelle
   */
  async traiter(evenement, origine) {
    if (!this.etat) return false;
    const maintenant = Date.now();
    const avant = this.etat;
    const { etat, effets, erreur, code } = appliquer(avant, evenement, maintenant);
    if (erreur) {
      // `code` (ex. "sans_reponse") : le téléphone propose des débuts de phrase et « Je passe ce tour ».
      if (origine) envoyer(origine, code ? { t: "erreur", message: erreur, code } : { t: "erreur", message: erreur });
      else console.log(`[partie ${avant.code}] événement ignoré (${evenement.t}) : ${erreur}`);
      return false;
    }
    // Rien n'a changé (même réponse renvoyée, même réglage…) : ni écriture, ni diffusion.
    if (!effets?.length && JSON.stringify(etat) === JSON.stringify(avant)) {
      if (origine) this.envoyerVue(origine);
      return false;
    }
    this.etat = etat;
    // Persister AVANT d'exécuter les effets.
    await this.ctx.storage.put({ etat, activite: maintenant });
    await this.executer(effets ?? [], maintenant);
    this.diffuser();
    return true;
  }

  async executer(effets, maintenant) {
    let gardesChangees = false;
    for (const effet of effets) {
      switch (effet.type) {
        case "minuteur":
        case "annuler_minuteur":
          // L'alarme suit l'état (minuteurFin) : voir programmerAlarme.
          break;
        case "nettoyer":
          await this.ctx.storage.put("nettoyage", effet.fin);
          break;
        case "analyser_recit":
        case "choisir":
        case "attribuer":
          // Échéance du chien de garde, PERSISTÉE avant l'appel : elle survit à un redémarrage.
          this.gardes[cleIA(effet)] = maintenant + DELAI_GARDE_IA_MS;
          gardesChangees = true;
          // Non bloquant : les autres messages continuent d'être traités pendant l'appel IA.
          this.ctx.waitUntil(this.lancerIA(effet));
          break;
        default:
          console.warn(`[partie] effet inconnu : ${effet.type}`);
      }
    }
    if (gardesChangees) await this.ctx.storage.put("gardesIA", this.gardes);
    await this.programmerAlarme(maintenant);
  }

  /** Message { t:"etat" } pour une socket, avec l'heure du serveur. */
  messageEtat(role, joueurId) {
    return { t: "etat", vue: vue(this.etat, role, joueurId), serveur: Date.now() };
  }

  envoyerVue(ws) {
    if (!this.etat) return;
    const att = ws.deserializeAttachment();
    if (!att || !ROLES.has(att.role)) return;
    envoyer(ws, this.messageEtat(att.role, att.joueurId));
  }

  diffuser() {
    if (!this.etat) return;
    const vueEcran = JSON.stringify(this.messageEtat("ecran"));
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || !ROLES.has(att.role)) continue; // socket refusée (4003) : rien à lui envoyer
      try {
        ws.send(att.role === "ecran" ? vueEcran : JSON.stringify(this.messageEtat("joueur", att.joueurId)));
      } catch {
        // socket fermée
      }
    }
  }

  // ─────────────────────────── IA (OpenAI ou mock) ───────────────────────────

  getMJ() {
    if (!this.mj) {
      this.mj = creerMJ({ apiKey: this.env.OPENAI_API_KEY, mode: this.env.MJ_MODE, rome });
    }
    return this.mj;
  }

  modeMock() {
    return this.env.MJ_MODE === "mock" || !this.env.OPENAI_API_KEY;
  }

  /** Calcule le résultat d'un effet IA puis réinjecte l'événement *_faite (ou erreur_ia). */
  async lancerIA(effet) {
    let evenement;
    try {
      evenement = await this.calculerIA(effet);
    } catch (err) {
      console.error(`[partie] échec IA (${effet.type}) :`, err?.message ?? err);
      if (effet.type === "analyser_recit") evenement = { t: "erreur_ia", joueurId: effet.joueurId };
      // Compétences privées : chacun garde son idée, sans compétence cette fois.
      else if (effet.type === "attribuer") evenement = { t: "erreur_ia", tache: "attribuer", problemeIndex: effet.problemeIndex };
      else evenement = { t: "erreur_ia" }; // idée du tour : pas d'idée retenue, l'histoire continue
    }
    // Les résultats périmés (autre tour, autre problème, autre phase) sont refusés par jeu.js.
    await this.traiter(evenement);
    await this.retirerGarde(effet);
  }

  /** Retire l'échéance du chien de garde, sauf si l'état attend encore cet effet. */
  async retirerGarde(effet) {
    const cle = cleIA(effet);
    if (!(cle in this.gardes)) return;
    if (effetsIAEnAttente(this.etat).some((x) => cleIA(x) === cle)) return;
    delete this.gardes[cle];
    if (this.etat) await this.ctx.storage.put("gardesIA", this.gardes);
  }

  /** Pseudos de la partie : jamais envoyés à l'IA, servent à contrôler ses sorties. */
  pseudos() {
    return Object.values(this.etat?.joueurs ?? {}).map((j) => j.pseudo);
  }

  /**
   * @param {object} effet effet IA ; `secours: true` = MJ mock directement
   *   (relance par l'animateur ou par le chien de garde).
   */
  async calculerIA(effet) {
    const secours = effet.secours === true;
    const mj = secours ? mjMock({ rome }) : this.getMJ();
    switch (effet.type) {
      case "analyser_recit": {
        const options = { apiKey: this.env.OPENAI_API_KEY, rome, max: 3, effort: "low", timeout: TIMEOUT_IA_MS };
        let res;
        try {
          res = await analyser(effet.texte, { ...options, mode: secours || this.modeMock() ? "mock" : "auto" });
        } catch (err) {
          console.warn("[partie] analyse IA impossible, bascule sur le mock :", err?.message ?? err);
          res = await analyser(effet.texte, { ...options, mode: "mock" });
        }
        return {
          t: "analyse_faite",
          joueurId: effet.joueurId,
          competences: res.competences.slice(0, 3).map(versCompetenceDepart),
        };
      }
      case "choisir": {
        // L'idée du tour : le MJ choisit une réponse (réponses déjà mélangées par
        // jeu.js, tirage enregistré), son auteur reçoit la compétence.
        const entree = { probleme: effet.probleme, reponses: effet.reponses ?? [], pseudos: this.pseudos() };
        let choix;
        try {
          choix = await mj.choisir(entree);
        } catch (err) {
          console.warn("[partie] choix de l'idée impossible, bascule sur le mock :", err?.message ?? err);
          choix = await mjMock({ rome }).choisir(entree);
        }
        choix = await respecterRotation(choix, entree, effet.obligatoires);
        const ev = { t: "attribution_faite", problemeIndex: effet.problemeIndex, joueurId: choix?.joueurId ?? null, competence: choix?.competence ?? null };
        if (Number.isInteger(effet.essai)) ev.essai = effet.essai;
        return ev;
      }
      case "attribuer": {
        // Compétences privées : une par autre réponse, si elle contient une action
        // citable (jeu.js le vérifie ; sinon le joueur garde simplement son idée).
        // Un appel à l'IA par joueur (mj.attribuer) : jamais la réponse d'un autre dans le prompt.
        const historique = Object.fromEntries((effet.reponses ?? []).map((r) => [r.joueurId, { reponses: [r.texte], choix: null }]));
        const entree = { probleme: effet.probleme, historique, pseudos: this.pseudos() };
        let competences;
        try {
          competences = await mj.attribuer(entree);
        } catch (err) {
          console.warn("[partie] compétences privées impossibles, bascule sur le mock :", err?.message ?? err);
          competences = await mjMock({ rome }).attribuer(entree);
        }
        return { t: "competences_privees", problemeIndex: effet.problemeIndex, competences: competences ?? {} };
      }
      default:
        throw new Error(`Effet IA inconnu : ${effet.type}`);
    }
  }

}
