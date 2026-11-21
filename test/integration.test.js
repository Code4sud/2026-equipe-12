// Test d'intégration : une partie complète des 6 vrais problèmes (public/data/problemes.json)
// avec la vraie machine à états (src/jeu.js), le MJ mock (src/mj.js), l'analyse mock
// (src/analyse.js), le rendu de l'écran commun (public/js/ecran.js) et de la fiche
// (public/js/fiche.js). Aucun réseau. Vérifie les règles critiques de la SPEC :
// l'histoire en 6 épisodes, la réflexion silencieuse, l'idée du tour (sans pseudo tant
// que son auteur n'a pas dit oui), les compétences privées des autres réponses,
// réponses non retenues privées, « je ne sais pas » refusé (le joueur réécrit ou
// passe), aucun mot interdit, aucun « undefined » à l'écran.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { appliquer, creerEtat, vue } from "../src/jeu.js";
import { mjMock } from "../src/mj.js";
import { analyser, versCompetenceDepart } from "../src/analyse.js";
import { rendreScene } from "../public/js/ecran.js";
import { rendreFiche } from "../public/js/fiche.js";

const lire = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const ROME = lire("public/data/rome.json");
const ONET = lire("public/data/metiers.json");
const PROBLEMES = lire("public/data/problemes.json").problemes;

const IDS = ["joueur-aaaa0001", "joueur-bbbb0002", "joueur-cccc0003"];
const PSEUDOS = ["Lina", "Moussa", "Jade"];
const AVATARS = ["🦊", "🐼", "🦁"];
const marque = (p, j) => `zq${p}m${j}x`; // marqueur unique dans chaque réponse
const INTERDITS = /\bfaux\b|mauvaise r[ée]ponse|\bscore\b|classement/i;

async function jouerPartie() {
  const mj = mjMock({ rome: ROME });
  let etat = creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 6, dureeEchange: 10, dureeReponse: 10, dureeReflexion: 10, graine: 7, maintenant: 0 });
  let t = 1000;
  const effets = [];
  const vuesEcran = [];
  const vuesJoueurs = Object.fromEntries(IDS.map((id) => [id, []]));
  let refus = 0;
  const reponses = {}; // problemeIndex → [texte par joueur]
  const retenus = {}; // problemeIndex → joueurId

  const capturer = () => {
    vuesEcran.push(vue(etat, "ecran"));
    for (const id of IDS) vuesJoueurs[id].push(vue(etat, "joueur", id));
  };
  const app = (ev) => {
    const r = appliquer(etat, ev, (t += 1000));
    assert.equal(r.erreur, undefined, `${ev.t} refusé en phase ${etat.phase} : ${r.erreur}`);
    etat = r.etat;
    effets.push(...r.effets);
    capturer();
  };
  const ecran = (msg) => app({ ...msg, role: "ecran" });
  const joueur = (i, msg) => app({ ...msg, role: "joueur", joueurId: IDS[i] });
  const vider = async () => {
    while (effets.length) {
      const e = effets.shift();
      if (e.type === "analyser_recit") {
        const res = await analyser(e.texte, { rome: ROME, mode: "mock", max: 3 });
        app({ t: "analyse_faite", joueurId: e.joueurId, competences: res.competences.slice(0, 3).map(versCompetenceDepart) });
      } else if (e.type === "choisir") {
        const choix = await mj.choisir(e);
        app({ t: "attribution_faite", problemeIndex: e.problemeIndex, essai: e.essai, joueurId: choix?.joueurId ?? null, competence: choix?.competence ?? null });
      } else if (e.type === "attribuer") {
        const historique = Object.fromEntries(e.reponses.map((r) => [r.joueurId, { reponses: [r.texte], choix: null }]));
        app({ t: "competences_privees", problemeIndex: e.problemeIndex, competences: await mj.attribuer({ probleme: e.probleme, historique }) });
      }
    }
  };

  capturer();
  IDS.forEach((_, i) => joueur(i, { t: "rejoindre", pseudo: PSEUDOS[i], avatar: AVATARS[i] }));
  ecran({ t: "demarrer" });
  const recits = [
    "J'ai réparé le vélo d'un pote avec des tutos sur internet.",
    "Je modère un serveur Discord et je calme les embrouilles entre les membres.",
    "J'ai organisé un tournoi de foot au city stade avec les jeunes du quartier.",
  ];
  IDS.forEach((_, i) => joueur(i, { t: "recit", texte: recits[i] }));
  await vider();
  IDS.forEach((id, i) => {
    const n = etat.joueurs[id].depart.propositions.length;
    joueur(i, { t: "valider_depart", garder: Array.from({ length: n }, () => true) });
  });
  assert.equal(etat.phase, "presentation");

  for (let k = 0; k < 6; k++) {
    ecran({ t: "suivant" }); // presentation → réflexion silencieuse (minuteur)
    assert.equal(etat.phase, "reflexion");
    app({ t: "minuteur_fini" }); // fin de la réflexion : la discussion démarre d'elle-même
    assert.equal(etat.phase, "echange");
    ecran({ t: "fin_minuteur" });
    assert.equal(etat.phase, "reponse");
    // « Je ne sais pas » : refusé pour ce joueur seulement, il réécrit.
    const r = appliquer(etat, { t: "reponse", texte: "Je sais pas trop, on verra bien", role: "joueur", joueurId: IDS[0] }, t);
    assert.match(r.erreur ?? "", /Toutes les idées comptent/);
    refus++;
    reponses[k] = [
      `Je cherche une solution avec les autres ${marque(k, 0)}`,
      `Je propose qu'on en parle tous ensemble ${marque(k, 1)}`,
      `Moi je demande conseil à quelqu'un de confiance ${marque(k, 2)}`,
    ];
    IDS.forEach((_, i) => joueur(i, { t: "reponse", texte: reponses[k][i] }));
    assert.equal(etat.phase, "competences", "le MJ choisit l'idée du tour");
    await vider();
    const id = etat.idee?.joueurId;
    assert.ok(IDS.includes(id), `idée retenue à l'épisode ${k + 1}`);
    retenus[k] = id;
    // L'auteur accepte d'afficher son pseudo (sauf au 3e épisode), l'écrit sur sa fiche
    // papier et la garde (sauf au 2e épisode) ; chacun tranche sa compétence privée.
    joueur(IDS.indexOf(id), { t: "afficher_pseudo", accord: k !== 2 });
    joueur(IDS.indexOf(id), { t: "garder_competence", garder: k !== 1 });
    for (const autre of IDS.filter((x) => x !== id)) {
      if (etat.phase !== "competences") break;
      if (etat.joueurs[autre].competences.some((c) => c.problemeIndex === k)) joueur(IDS.indexOf(autre), { t: "garder_competence", garder: true });
    }
  }
  assert.equal(etat.phase, "fin");
  return { etat, vuesEcran, vuesJoueurs, refus, reponses, retenus };
}

const partie = jouerPartie();

test("intégration : 6 épisodes de l'histoire, dans l'ordre, sans évaluation ni choix parmi 4", async () => {
  const { etat, refus, vuesEcran } = await partie;
  assert.deepEqual(etat.problemes, PROBLEMES.map((p) => p.id), "l'histoire complète, dans l'ordre");
  assert.equal(refus, 6, "« je ne sais pas » refusé à chaque épisode");
  const phases = new Set(vuesEcran.map((v) => v.phase));
  for (const ph of ["evaluation", "indice", "echange2", "choix", "solution"]) assert.ok(!phases.has(ph), `plus de phase ${ph}`);
});

test("intégration : une idée du tour par épisode, compétences privées citables pour les autres ; chacun est retenu à son tour", async () => {
  const { etat, reponses, retenus } = await partie;
  for (let k = 0; k < 6; k++) {
    const idees = IDS.filter((id) => etat.joueurs[id].competences.some((c) => c.problemeIndex === k && c.idee === true));
    assert.deepEqual(idees, [retenus[k]], `épisode ${k + 1} : une seule idée du tour`);
    for (const id of IDS) {
      const cs = etat.joueurs[id].competences.filter((c) => c.problemeIndex === k);
      assert.ok(cs.length <= 1, "une compétence au plus par joueur et par épisode");
      for (const c of cs) assert.ok(reponses[k][IDS.indexOf(id)].includes(c.preuve), `trace = ses propres mots : « ${c.preuve} »`);
    }
    const c = etat.joueurs[retenus[k]].competences.find((x) => x.problemeIndex === k);
    const p = etat.catalogue[etat.problemes[k]];
    assert.ok(p.competences.some((x) => x.code === c.code), `${c.code} autorisé pour ${p.id}`);
    assert.ok(c.libelle && c.mots && c.preuve);
    assert.ok(reponses[k][IDS.indexOf(retenus[k])].includes(c.preuve), `preuve = ses propres mots : « ${c.preuve} »`);
    assert.doesNotMatch(c.mots, INTERDITS);
  }
  assert.deepEqual(new Set(Object.values(retenus).slice(0, 3)), new Set(IDS), "rotation stricte : chacun est retenu une fois dans les 3 premiers épisodes");
});

test("intégration : l'écran voit qui a répondu ; seule l'idée retenue est montrée, avec son pseudo s'il l'accepte", async () => {
  const { vuesEcran, retenus } = await partie;
  for (const v of vuesEcran) {
    const s = JSON.stringify(v);
    for (const motif of [/maReponse/, /"competences":/, /"competenceDuProbleme"/, /"preuve"/]) assert.doesNotMatch(s, motif);
    const vus = s.match(/zq\d+m\d+x/g) ?? [];
    if (v.phase !== "competences") assert.deepEqual(vus, [], `aucune réponse à l'écran (${v.phase})`);
    else for (const m of vus) assert.equal(m, marque(v.problemeIndex, IDS.indexOf(retenus[v.problemeIndex])), "seulement l'idée retenue");
    for (const j of v.joueurs) assert.deepEqual(Object.keys(j).sort(), ["aFini", "avatar", "connecte", "pseudo"]);
  }
  const avecIdee = vuesEcran.filter((v) => v.idee?.pseudo);
  assert.ok(avecIdee.length >= 6);
  for (const v of avecIdee) assert.equal(v.idee.pseudo, PSEUDOS[IDS.indexOf(retenus[v.problemeIndex])]);
  assert.ok(!vuesEcran.some((v) => v.problemeIndex === 2 && v.idee?.pseudo), "épisode 3 : « Non, reste discret »");
  assert.ok(vuesEcran.some((v) => v.phase === "competences" && v.idee?.texte && v.idee.pseudo === null), "l'idée s'affiche d'abord sans nom");
  assert.ok(vuesEcran.some((v) => v.phase === "reflexion"), "réflexion silencieuse avant la discussion");
});

test("intégration : un joueur ne voit la réponse d'un autre que si c'est l'idée retenue", async () => {
  const { vuesJoueurs, retenus } = await partie;
  IDS.forEach((id, i) => {
    for (const v of vuesJoueurs[id]) {
      for (const m of JSON.stringify(v).match(/zq\d+m\d+x/g) ?? []) {
        if (m.endsWith(`m${i}x`)) continue;
        assert.equal(v.phase, "competences");
        assert.equal(m, marque(v.problemeIndex, IDS.indexOf(retenus[v.problemeIndex])));
      }
    }
  });
});

test("intégration : l'écran commun se rend à chaque étape, sans mot interdit ni trou", async () => {
  const { vuesEcran } = await partie;
  for (const v of vuesEcran) {
    const html = rendreScene(v, { origine: "http://localhost:8787" });
    assert.ok(html.length > 50, v.phase);
    assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/, `phase ${v.phase}`);
    assert.doesNotMatch(html, INTERDITS, `phase ${v.phase}`);
  }
  const fin = vuesEcran.at(-1);
  assert.equal(fin.phase, "fin");
  assert.ok(fin.fin.nbCompetencesTotal > 0);
});

test("intégration : la fiche (format de Partie.fiche) se rend avec ses compétences et ses métiers", async () => {
  const { etat } = await partie;
  const j = etat.joueurs[IDS[0]];
  // Même forme que Partie.fiche() (src/partie.js).
  const fiche = {
    code: etat.code,
    phase: etat.phase,
    termine: true,
    date: etat.finA,
    joueur: { id: j.id, pseudo: j.pseudo, avatar: j.avatar },
    competences: structuredClone(j.competences),
    depart: j.competences.filter((c) => c.problemeIndex === null),
    jeu: j.competences.filter((c) => c.problemeIndex !== null),
    problemes: etat.problemes.map((id, index) => ({
      index, id, titre: etat.catalogue[id].titre, riasec: etat.catalogue[id].riasec, questionVecu: etat.catalogue[id].questionVecu,
    })),
    passes: [],
    preferences: [],
    debrief: null,
  };
  const html = rendreFiche(fiche, { rome: ROME, onet: ONET });
  assert.match(html, /Lina/);
  assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/);
  // « faux cheveux » peut apparaître dans la description d'un métier (maquilleur) : ce n'est pas un jugement.
  assert.doesNotMatch(html, /\bfaux\b(?! cheveux)|mauvaise r[ée]ponse/i);
  for (const c of fiche.jeu.filter((x) => x.gardee !== false)) assert.ok(html.includes(c.code), `compétence ${c.code} sur la fiche`);
  assert.match(html, /Pour le psy/);
  // Compétence non gardée (épisode 2) : gardee:false chez son auteur.
  const { retenus } = await partie;
  const retiree = etat.joueurs[retenus[1]].competences.find((c) => c.problemeIndex === 1);
  assert.equal(retiree.gardee, false);
});
