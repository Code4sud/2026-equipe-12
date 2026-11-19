#!/usr/bin/env node
// Enrichit public/data/metiers.json avec ESCO (libellé FR officiel + compétences
// essentielles en FR), à partir de :
//   - la correspondance officielle ESCO ↔ O*NET (CSV, ESCO Secretariat + USDOL/ETA, 2022)
//   - l'API ESCO : https://ec.europa.eu/esco/api/resource/occupation?uri=…&language=fr
//
// Node 22, fetch natif, aucune dépendance. Relançable : le champ "esco" de chaque
// métier est recalculé de zéro et la mention de source n'est ajoutée qu'une fois.
// Les réponses HTTP sont mises en cache sur disque (hors dépôt) :
//   %TEMP%/esco-cache  (ou la variable d'environnement ESCO_CACHE)
//
// Usage : node scripts/build-esco.mjs [--hors-ligne]
//   --hors-ligne : n'utilise que le cache (échoue si une ressource manque)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER_METIERS = join(RACINE, "public", "data", "metiers.json");
const CACHE = process.env.ESCO_CACHE || join(tmpdir(), "esco-cache");
const HORS_LIGNE = process.argv.includes("--hors-ligne");

const URL_CSV = "https://esco.ec.europa.eu/system/files/2023-08/ONET_%28Occupations%29_0_updated.csv";
const API_OCCUPATION = "https://ec.europa.eu/esco/api/resource/occupation";
const API_SKILL = "https://ec.europa.eu/esco/api/resource/skill";

const ORDRE_TYPES = ["exactMatch", "closeMatch", "narrowMatch", "broadMatch"];
const MAX_ENTREES = 2;
const MAX_COMPETENCES = 8;
const CONCURRENCE = 4;
const ESSAIS = 4;

export const MARQUEUR_ESCO = " Correspondances ESCO :";
export const MENTION_ESCO =
  `${MARQUEUR_ESCO} libellés et compétences essentielles en français issus d'ESCO v1.2 ` +
  "(classification européenne des aptitudes, compétences, certifications et professions), " +
  "© Union européenne, https://esco.ec.europa.eu, réutilisation autorisée (décision 2011/833/UE, licence CC BY 4.0) ; " +
  "correspondance ESCO-O*NET 2022 (ESCO Secretariat et USDOL/ETA).";

// ---------------------------------------------------------------- CSV

/** Parse un CSV (guillemets doublés, virgules et retours à la ligne dans les champs). */
export function parserCSV(texte) {
  if (texte.charCodeAt(0) === 0xfeff) texte = texte.slice(1);
  const lignes = [];
  let ligne = [], champ = "", guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; }
        else guillemets = false;
      } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

/** Correspondances O*NET → [{ uri, type }] (occupations ESCO uniquement, pas ISCO). */
export function lireCorrespondances(texte) {
  const lignes = parserCSV(texte);
  const iEntete = lignes.findIndex((l) => l[0]?.trim() === "O*NET Id");
  if (iEntete < 0) throw new Error("Entête « O*NET Id » introuvable dans le CSV");
  const entete = lignes[iEntete].map((c) => c.trim());
  const col = (nom) => {
    const i = entete.indexOf(nom);
    if (i < 0) throw new Error(`Colonne « ${nom} » introuvable`);
    return i;
  };
  const cId = col("O*NET Id"), cUri = col("ESCO or ISCO URI"), cType = col("Type of Match");
  const parMetier = new Map();
  for (const l of lignes.slice(iEntete + 1)) {
    const id = l[cId]?.trim(), uri = l[cUri]?.trim(), type = l[cType]?.trim();
    if (!id || !uri || !uri.includes("/esco/occupation/") || !ORDRE_TYPES.includes(type)) continue;
    if (!parMetier.has(id)) parMetier.set(id, []);
    const liste = parMetier.get(id);
    if (!liste.some((x) => x.uri === uri)) liste.push({ uri, type });
  }
  // Tri stable : exact, puis close, narrow, broad (ordre du fichier à type égal).
  for (const liste of parMetier.values()) {
    liste.sort((a, b) => ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type));
  }
  return parMetier;
}

// ---------------------------------------------------------------- HTTP + cache

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const cleCache = (url) => createHash("sha1").update(url).digest("hex");

// Sémaphore global : jamais plus de CONCURRENCE requêtes réseau en même temps.
let enCours = 0;
const fileAttente = [];
async function prendreJeton() {
  if (enCours < CONCURRENCE) { enCours++; return; }
  await new Promise((r) => fileAttente.push(r));
}
function rendreJeton() {
  const suivant = fileAttente.shift();
  if (suivant) suivant();
  else enCours--;
}

/** GET avec cache disque et retries. Renvoie { statut, texte } ; statut 404 mis en cache aussi. */
async function obtenir(url) {
  const chemin = join(CACHE, cleCache(url) + ".json");
  if (existsSync(chemin)) return JSON.parse(await readFile(chemin, "utf8"));
  if (HORS_LIGNE) throw new Error(`Absent du cache (mode --hors-ligne) : ${url}`);
  await prendreJeton();
  try {
    return await telecharger(url, chemin);
  } finally {
    rendreJeton();
  }
}

async function telecharger(url, chemin) {
  let derniere;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    try {
      const rep = await fetch(url, {
        headers: { accept: "application/json, text/csv;q=0.9, */*;q=0.5", "user-agent": "potentiel-cache-build-esco/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (rep.ok || rep.status === 404) {
        const res = { statut: rep.status, texte: rep.ok ? await rep.text() : "" };
        const tmp = chemin + "." + process.pid + ".tmp";
        await writeFile(tmp, JSON.stringify(res));
        await rename(tmp, chemin);
        return res;
      }
      derniere = new Error(`HTTP ${rep.status} sur ${url}`);
      // L'API ESCO renvoie un 500 permanent pour quelques concepts mal formés
      // ({"logref":"CognizoneException", "message":"More than one value found…"}).
      // Après les essais : erreur applicative (corps JSON avec logref) → mise en cache
      // comme « introuvable », pour que la relance donne le même résultat ; sinon
      // (panne réseau, 502/503…) → échec du script.
      if (rep.status >= 500 && essai === ESSAIS) {
        const corps = await rep.text().catch(() => "");
        let logref = null;
        try { logref = JSON.parse(corps).logref; } catch {}
        if (logref) {
          console.warn(`  ignoré (erreur API ${logref}, HTTP ${rep.status}) : ${url}`);
          const res = { statut: rep.status, texte: "", erreur: logref };
          const tmp = chemin + "." + process.pid + ".tmp";
          await writeFile(tmp, JSON.stringify(res));
          await rename(tmp, chemin);
          return res;
        }
      }
      if (rep.status < 500 && rep.status !== 429) break;
    } catch (e) {
      derniere = e;
    }
    await pause(500 * 2 ** (essai - 1));
  }
  throw derniere;
}

/** Applique fn à chaque élément avec une concurrence limitée. */
async function enParallele(elements, n, fn) {
  const resultats = new Array(elements.length);
  let suivant = 0;
  const travailleur = async () => {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await fn(elements[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, travailleur));
  return resultats;
}

// ---------------------------------------------------------------- ESCO

const propre = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const urlOccupation = (uri) => `${API_OCCUPATION}?uri=${encodeURIComponent(uri)}&language=fr`;
const urlSkill = (uri) => `${API_SKILL}?uri=${encodeURIComponent(uri)}&language=fr`;

/** Titre FR d'une compétence : celui du lien s'il est en FR, sinon la ressource skill. */
async function titreCompetence(lien) {
  const direct = propre(lien.title);
  // L'API renvoie les titres des liens dans la langue demandée ; on ne rappelle la
  // ressource skill que si le titre manque.
  if (direct) return direct;
  if (!lien.uri) return "";
  const { statut, texte } = await obtenir(urlSkill(lien.uri));
  if (statut !== 200) return "";
  const s = JSON.parse(texte);
  return propre(s.preferredLabel?.fr) || propre(s.title);
}

/** Occupation ESCO → { titre, competences } ou null si introuvable. */
const memo = new Map();
function occupation(uri) {
  if (!memo.has(uri)) memo.set(uri, chargerOccupation(uri));
  return memo.get(uri);
}
async function chargerOccupation(uri) {
  const { statut, texte } = await obtenir(urlOccupation(uri));
  if (statut !== 200) return null;
  const o = JSON.parse(texte);
  const titre = propre(o.preferredLabel?.fr) || propre(o.title);
  if (!titre) return null;
  const liens = o._links?.hasEssentialSkill || [];
  // Les savoir-faire (skill) d'abord, puis les connaissances : plus parlant pour un jeune.
  const tries = [...liens].sort((a, b) => rangType(a) - rangType(b));
  const competences = [];
  for (const lien of tries) {
    if (competences.length >= MAX_COMPETENCES) break;
    const t = await titreCompetence(lien);
    if (t && !competences.includes(t)) competences.push(t);
  }
  return { titre, competences };
}
const rangType = (l) => (String(l.skillType || "").endsWith("/knowledge") ? 1 : 0);

// ---------------------------------------------------------------- principal

async function principal() {
  await mkdir(CACHE, { recursive: true });
  console.log(`Cache : ${CACHE}`);

  const csv = await obtenir(URL_CSV);
  if (csv.statut !== 200) throw new Error(`CSV ESCO-O*NET introuvable (${csv.statut})`);
  const correspondances = lireCorrespondances(csv.texte);
  console.log(`Correspondances : ${correspondances.size} métiers O*NET dans le CSV`);

  const donnees = JSON.parse(await readFile(FICHIER_METIERS, "utf8"));
  const metiers = donnees.metiers;

  // Pour chaque métier, on parcourt ses candidats dans l'ordre de préférence et on
  // ne charge que ce qu'il faut pour en retenir MAX_ENTREES (une occupation absente
  // de l'API est sautée au profit de la suivante).
  let couverts = 0, introuvables = 0, faits = 0;
  await enParallele(metiers, CONCURRENCE, async (m) => {
    const entrees = [];
    for (const c of correspondances.get(m.code) || []) {
      if (entrees.length >= MAX_ENTREES) break;
      const o = await occupation(c.uri);
      if (!o) { introuvables++; continue; }
      entrees.push({ uri: c.uri, titre: o.titre, type: c.type, competences: o.competences });
    }
    if (entrees.length) { m.esco = entrees; couverts++; }
    else delete m.esco;
    if (++faits % 50 === 0) console.log(`  ${faits}/${metiers.length} métiers`);
  });

  const base = donnees.source.includes(MARQUEUR_ESCO)
    ? donnees.source.slice(0, donnees.source.indexOf(MARQUEUR_ESCO))
    : donnees.source;
  donnees.source = base + MENTION_ESCO;

  const sortie = JSON.stringify(donnees);
  const tmp = FICHIER_METIERS + ".tmp";
  await writeFile(tmp, sortie);
  await rename(tmp, FICHIER_METIERS);

  console.log(`Métiers : ${metiers.length}, avec au moins une correspondance ESCO : ${couverts}`);
  if (introuvables) console.log(`Occupations ESCO ignorées (introuvables dans l'API) : ${introuvables}`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
