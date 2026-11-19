// Intégrité de public/data/metiers.json (O*NET + enrichissement ESCO) et
// rapprochement métiers (public/js/metiers-proches.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const fichier = (rel) => fileURLToPath(new URL("../" + rel, import.meta.url));
const donnees = JSON.parse(readFileSync(fichier("public/data/metiers.json"), "utf8"));
const metiers = donnees.metiers;

const TYPES_ESCO = ["exactMatch", "closeMatch", "narrowMatch", "broadMatch"];
const nonVide = (s) => typeof s === "string" && s.trim().length > 0;

test("metiers.json : 675 métiers, codes O*NET uniques", () => {
  assert.ok(Array.isArray(metiers));
  assert.equal(metiers.length, 675);
  const codes = new Set(metiers.map((m) => m.code));
  assert.equal(codes.size, metiers.length);
  for (const m of metiers) assert.match(m.code, /^\d{2}-\d{4}\.\d{2}$/, m.code);
});

test("metiers.json : libellés FR, riasec de 6 nombres, zone 1 à 5", () => {
  for (const m of metiers) {
    assert.ok(nonVide(m.titre), `titre vide : ${m.code}`);
    assert.ok(nonVide(m.description), `description vide : ${m.code}`);
    assert.ok(Array.isArray(m.riasec) && m.riasec.length === 6, `riasec : ${m.code}`);
    for (const x of m.riasec) assert.ok(Number.isFinite(x) && x >= 0 && x <= 7, `riasec ${m.code} : ${x}`);
    assert.ok(Number.isInteger(m.zone) && m.zone >= 1 && m.zone <= 5, `zone ${m.code} : ${m.zone}`);
    assert.ok(Array.isArray(m.domaines), `domaines : ${m.code}`);
  }
  for (const z of ["1", "2", "3", "4", "5"]) assert.ok(nonVide(donnees.zones[z]), `zone ${z}`);
});

test("metiers.json : champ esco bien formé (max 2 entrées, types ordonnés, max 8 compétences FR)", () => {
  let avecEsco = 0;
  for (const m of metiers) {
    if (m.esco === undefined) continue;
    avecEsco++;
    assert.ok(Array.isArray(m.esco) && m.esco.length >= 1 && m.esco.length <= 2, `esco ${m.code}`);
    const rangs = m.esco.map((e) => TYPES_ESCO.indexOf(e.type));
    assert.deepEqual(rangs, [...rangs].sort((a, b) => a - b), `ordre des types ${m.code}`);
    assert.equal(new Set(m.esco.map((e) => e.uri)).size, m.esco.length, `doublon ${m.code}`);
    for (const e of m.esco) {
      assert.match(e.uri, /^http:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f-]{36}$/, `uri ${m.code}`);
      assert.ok(TYPES_ESCO.includes(e.type), `type ${m.code} : ${e.type}`);
      assert.ok(nonVide(e.titre), `titre ESCO vide : ${m.code}`);
      assert.ok(Array.isArray(e.competences) && e.competences.length <= 8, `competences ${m.code}`);
      for (const c of e.competences) assert.ok(nonVide(c), `compétence vide : ${m.code}`);
    }
  }
  // L'enrichissement a bien été lancé : la grande majorité des métiers est couverte.
  assert.ok(avecEsco >= metiers.length * 0.8, `seulement ${avecEsco} métiers avec ESCO`);
});

test("metiers.json : libellés ESCO en français (pas la version anglaise)", () => {
  // Échantillon témoin : des mots anglais fréquents ne doivent pas apparaître seuls.
  const anglais = /\b(the|and|manager|worker|operator|skills?)\b/i;
  let total = 0, anglaisTrouves = 0;
  for (const m of metiers) for (const e of m.esco || []) {
    for (const s of [e.titre, ...e.competences]) {
      total++;
      if (anglais.test(s)) anglaisTrouves++;
    }
  }
  assert.ok(total > 0);
  assert.ok(anglaisTrouves / total < 0.01, `${anglaisTrouves}/${total} libellés semblent en anglais`);
});

test("metiers.json : mention de source O*NET et ESCO", () => {
  assert.match(donnees.source, /O\*NET/);
  assert.match(donnees.source, /ESCO/);
  assert.match(donnees.source, /Union européenne/);
  assert.match(donnees.source, /https:\/\/esco\.ec\.europa\.eu/);
  // Relançable : la mention n'apparaît qu'une fois.
  assert.equal(donnees.source.split("Correspondances ESCO").length - 1, 1);
});

test("metiers-proches : un profil S+C renvoie des métiers accessibles de zone ≤ 3", async () => {
  const mod = await import(pathToFileURL(fichier("public/js/metiers-proches.js")).href);
  const res = mod.metiersProches({ S: 2, C: 1 }, metiers);
  assert.ok(res, "résultat attendu");
  assert.ok(res.accessibles.length > 0 && res.accessibles.length <= 5);
  for (const m of res.accessibles) {
    assert.ok(m.zone <= 3, `${m.titre} zone ${m.zone}`);
    assert.ok(m.proximite > 0);
    const dominants = mod.typesDominants(m);
    assert.ok(dominants.includes("S") || dominants.includes("C"), `${m.titre} : ${dominants}`);
  }
  assert.ok(res.plusLongs.length <= 3);
  for (const m of res.plusLongs) assert.ok(m.zone >= 4);
  // Sans aucune preuve RIASEC : pas de proposition.
  assert.equal(mod.metiersProches({}, metiers), null);
});
