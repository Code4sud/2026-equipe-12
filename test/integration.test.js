// Test d'intégration : une partie complète des 6 vrais problèmes (public/data/problemes.json)
// avec la vraie machine à états (src/jeu.js), le MJ mock (src/mj.js), l'analyse mock
// (src/analyse.js), le rendu de l'écran commun (public/js/ecran.js) et de la fiche
// (public/js/fiche.js). Aucun réseau. Vérifie les règles critiques de la SPEC :
// réponses privées, une compétence par joueur et par problème, pas de bonne réponse
// (« je ne sais pas » refusé, le joueur réécrit),
// aucun mot interdit, aucun « undefined » à l'écran.
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
  let etat = creerEtat({ code: "BCDF", problemes: PROBLEMES, nbProblemes: 6, dureeEchange: 10, dureeReponse: 10, graine: 7, maintenant: 0 });
  let t = 1000;
  const effets = [];
  const vuesEcran = [];
  const vuesJoueurs = Object.fromEntries(IDS.map((id) => [id, []]));
  let refus = 0;
  const reponses = {}; // problemeIndex → [texte par joueur]

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
      } else if (e.type === "attribuer") {
        app({ t: "attribution_faite", problemeIndex: e.problemeIndex, competences: await mj.attribuer(e) });
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
    const p = etat.catalogue[etat.problemes[k]];
    ecran({ t: "suivant" }); // presentation → echange (minuteur)
    assert.equal(etat.phase, "echange");
    assert.ok(etat.minuteurFin > 0, "minuteur sur l'échange");
    ecran({ t: "fin_minuteur" });
    assert.equal(etat.phase, "reponse");
    // « Je ne sais pas » : refusé pour ce joueur seulement, il réécrit.
    const r = appliquer(etat, { t: "reponse", texte: "Je sais pas trop, on verra bien", role: "joueur", joueurId: IDS[0] }, t);
    assert.match(r.erreur ?? "", /Toutes les idées comptent/);
    assert.equal(r.etat, etat);
    refus++;
    reponses[k] = [
      k % 2 === 0 ? `${p.choix[0].texte} ${marque(k, 0)}` : `Je demande conseil à quelqu'un de confiance ${marque(k, 0)}`,
      `Je propose qu'on en parle tous ensemble ${marque(k, 1)}`,
    ];
    joueur(0, { t: "reponse", texte: reponses[k][0] });
    joueur(1, { t: "reponse", texte: reponses[k][1] });
    // Le joueur 3 ne répond pas : l'animateur passe, sa réponse est vide.
    ecran({ t: "fin_minuteur" });
    assert.equal(etat.phase, "competences", "directement les compétences");
    await vider();
    joueur(0, { t: "garder_competence", garder: true });
    joueur(1, { t: "garder_competence", garder: true });
    joueur(2, { t: "garder_competence", garder: k !== 1 });
  }
  assert.equal(etat.phase, "fin");
  return { etat, vuesEcran, vuesJoueurs, refus, reponses };
}

const partie = jouerPartie();

test("intégration : partie de 6 problèmes, sans évaluation, indice ni choix parmi 4", async () => {
  const { refus, vuesEcran } = await partie;
  assert.equal(refus, 6, "« je ne sais pas » refusé à chaque problème");
  const phases = new Set(vuesEcran.map((v) => v.phase));
  for (const ph of ["evaluation", "indice", "echange2", "choix", "solution"]) assert.ok(!phases.has(ph), `plus de phase ${ph}`);
});

test("intégration : une compétence par joueur et par problème, même sans réponse", async () => {
  const { etat, reponses } = await partie;
  for (const [i, id] of IDS.entries()) {
    const jeu = etat.joueurs[id].competences.filter((c) => c.problemeIndex !== null);
    assert.equal(jeu.length, 6, `${PSEUDOS[i]} : 6 compétences de jeu`);
    assert.deepEqual(jeu.map((c) => c.problemeIndex).sort(), [0, 1, 2, 3, 4, 5]);
    for (const c of jeu) {
      const p = etat.catalogue[etat.problemes[c.problemeIndex]];
      const autorises = [...p.competences.map((x) => x.code), p.competenceParticipation];
      assert.ok(autorises.includes(c.code), `${c.code} autorisé pour ${p.id}`);
      assert.ok(c.libelle && c.mots && c.preuve, "libellé, mots et preuve remplis");
      assert.doesNotMatch(c.mots, INTERDITS);
      if (c.typePreuve === "jeu" && i < 2) {
        const texte = reponses[c.problemeIndex][i];
        const choix = p.choix.map((x) => x.texte);
        assert.ok(texte.includes(c.preuve) || choix.includes(c.preuve), `preuve exacte : « ${c.preuve} »`);
      }
    }
  }
  // Le joueur qui n'a rien écrit (l'animateur est passé) : participation.
  const silencieux = etat.joueurs[IDS[2]].competences.filter((c) => c.problemeIndex !== null);
  assert.ok(silencieux.every((c) => c.typePreuve === "participation"));
});

test("intégration : l'écran voit qui a répondu, jamais une réponse ni le bon choix", async () => {
  const { vuesEcran } = await partie;
  const tout = JSON.stringify(vuesEcran);
  assert.doesNotMatch(tout, /zq\d+m\d+x/, "aucun texte de réponse à l'écran");
  for (const motif of [/maReponse/, /monChoix/, /"correct"/, /"competences":/, /"competenceDuProbleme"/]) {
    const m = tout.match(new RegExp(`.{0,80}${motif.source}.{0,40}`));
    assert.equal(m, null, `l'écran ne doit pas recevoir ${motif} : ${m?.[0]}`);
  }
  for (const v of vuesEcran) {
    for (const j of v.joueurs) {
      assert.deepEqual(Object.keys(j).sort(), ["aFini", "avatar", "connecte", "pseudo"]);
      assert.ok(j.aFini === null || typeof j.aFini === "boolean", "aFini = oui / non / rien à faire");
    }
    if (v.choix) assert.ok(v.choix.every((c) => typeof c === "string"), "choix = textes seuls");
  }
});

test("intégration : un joueur ne voit jamais la réponse d'un autre", async () => {
  const { vuesJoueurs } = await partie;
  IDS.forEach((id, i) => {
    const tout = JSON.stringify(vuesJoueurs[id]);
    const autres = (tout.match(/zq\d+m(\d+)x/g) ?? []).filter((m) => !m.endsWith(`m${i}x`));
    assert.deepEqual(autres, [], `${PSEUDOS[i]} ne voit que ses réponses`);
    assert.doesNotMatch(tout, /"correct"/);
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
    problemes: etat.problemes.map((id, index) => ({ index, id, titre: etat.catalogue[id].titre })),
  };
  const html = rendreFiche(fiche, { rome: ROME, onet: ONET });
  assert.match(html, /Lina/);
  assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/);
  // « faux cheveux » peut apparaître dans la description d'un métier (maquilleur) : ce n'est pas un jugement.
  assert.doesNotMatch(html, /\bfaux\b(?! cheveux)|mauvaise r[ée]ponse/i);
  for (const c of fiche.jeu) assert.ok(html.includes(c.code), `compétence ${c.code} sur la fiche`);
  assert.match(html, /Pour le psy/);
  // Compétence non gardée (Jade, problème 2) : absente de sa fiche.
  const jade = etat.joueurs[IDS[2]];
  const retiree = jade.competences.find((c) => c.problemeIndex === 1);
  assert.equal(retiree.gardee, false);
});
