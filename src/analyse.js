// Analyse d'un récit libre : propose des compétences ROME 4.0, chacune prouvée
// par une citation exacte du récit. Aucune compétence hors référentiel, aucune
// sans preuve, aucun score.
//
// Compatible Cloudflare Workers : aucune lecture de fichier, le référentiel ROME
// et la clé API sont passés en paramètres.
//
//   analyser(recit, { apiKey, rome, max, mode })
//     - avec apiKey (et mode ≠ "mock") : IA OpenAI (gpt-5-nano), puis garde-fous côté serveur ;
//     - sans clé, ou mode "mock" : MODE MOCK déterministe (mots-clés), même format.
import { appelerJSON, creerClient } from "./openai.js";
import { accentuerLibelle, propositionAutour } from "./texte.js";

/** Nombre minimal de mots d'une citation-preuve (règle « 3 à 25 mots » du prompt). */
export const CITATION_MIN_MOTS = 3;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalisation tolérante (casse, apostrophes, guillemets, espaces, ponctuation
 * finale) pour vérifier qu'une citation figure bien dans un texte.
 * Utilisée aussi par le MJ (src/mj.js) pour vérifier les preuves.
 */
export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/[.…,;:!?"]+$/g, "")
    .replace(/^["]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
export const normaliser = norm;

/** Vrai si `citation` (normalisée) figure dans `texte` (normalisé). */
export function citationExacte(citation, texte) {
  const c = norm(citation);
  return c.length > 0 && norm(texte).includes(c);
}

/** Minuscules, sans accents, apostrophes droites : pour les mots-clés du mock. */
export const sansAccents = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'");

// ---------------------------------------------------------------------------
// Référentiel (mis en cache par objet rome)
// ---------------------------------------------------------------------------

const CACHE = new WeakMap();

function referentiel(rome) {
  if (!rome || !Array.isArray(rome.macros)) {
    throw new Error("Référentiel ROME manquant : passe { rome } à analyser().");
  }
  let r = CACHE.get(rome);
  if (!r) {
    const macros = new Map(rome.macros.map((m) => [m.code, m]));
    const liste = rome.macros
      .map((m) => `${m.code} | ${m.categorie} | ${m.enjeu} > ${m.objectif} | ${m.libelle}`)
      .join("\n");
    r = { macros, system: SYSTEM_DEBUT + liste, verbes: indexVerbes(rome.macros) };
    CACHE.set(rome, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// IA (OpenAI)
// ---------------------------------------------------------------------------

const SYSTEM_DEBUT = `Tu aides un psychologue du travail du Centre des Possibles (Nice) à préparer l'entretien de restitution avec un jeune (c'est le psychologue qui en fixe la durée). Le jeune a 15 ans ou plus ; il est en questionnement sur son orientation ou en décrochage, et peut penser ne rien savoir faire.

Tu reçois un récit libre du jeune : des situations qu'il a vécues (famille, quartier, loisirs, en ligne, petits boulots…). Ta mission : repérer les compétences réelles que ces situations montrent, et les relier au référentiel ROME 4.0 de France Travail.

Règles absolues :
1. Tu choisis UNIQUEMENT des macro-compétences de la liste ROME ci-dessous, par leur code exact. Si rien ne correspond bien, tu n'inventes pas : tu n'ajoutes pas la compétence.
2. Chaque compétence est prouvée par une citation : un extrait copié MOT POUR MOT du récit (sans corriger l'orthographe, sans reformuler, 3 à 25 mots). Pas de citation exacte = pas de compétence.
3. Aucune déduction sur la santé, l'origine, la nationalité, la langue maternelle, la situation familiale, la religion, les opinions politiques ou syndicales, la vie ou l'orientation sexuelle, la situation financière. Aucun jugement sur la personnalité, les émotions, l'intelligence ou l'état psychologique du jeune : tu décris ce que son récit montre qu'il SAIT FAIRE, jamais ce qu'il EST. Si le jeune dit « je traduis pour ma mère », tu retiens la compétence (traduire, faire le lien, accompagner des démarches), jamais une information sur sa famille ou son origine. Tes formulations ne mentionnent jamais ces sujets.
4. Pas de score, pas de niveau, pas de jugement, pas de verdict d'orientation. Tu éclaires, le psychologue et le jeune décident.
5. « mots_du_jeune » : une phrase courte, au tutoiement, simple, que le jeune comprend immédiatement, qui décrit une ACTION qu'il a faite (verbe d'action au passé : « Tu as gardé plusieurs enfants en même temps et tu leur as fait respecter des règles. »). Jamais d'adjectif sur la personne (« tu es créatif », « doué ») ni de superlatif (« génial », « incroyable »). Pas de jargon.
6. « situation » : 2 à 6 mots qui nomment la situation vécue (« Garde des petits frères »).
7. « question_psy » : une question ouverte que le psychologue peut poser pour faire raconter un exemple concret de cette compétence. Jamais une question sur un sujet sensible (règle 3).
8. Privilégie la qualité : quelques compétences bien prouvées valent mieux que 15 approximatives ; il n'y a pas de minimum (1 ou 2 si seules 1 ou 2 citations tiennent). Une même citation peut justifier deux compétences différentes si c'est vraiment le cas.
9. « pistes_entretien » : 2 ou 3 questions ouvertes, bienveillantes, pour ouvrir l'entretien sur ce que le jeune a envie de faire ensuite, en partant de ce qu'il a raconté.
10. « a_approfondir » : 0 à 3 situations évoquées trop brièvement pour en tirer une compétence, formulées comme une invitation (« Tu as parlé du foot le samedi : qu'est-ce que tu y fais exactement ? »).

Liste des macro-compétences ROME 4.0 (code | catégorie | enjeu > objectif | libellé) :
`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["competences", "pistes_entretien", "a_approfondir"],
  properties: {
    competences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code_rome", "situation", "citation", "mots_du_jeune", "question_psy"],
        properties: {
          // Code vérifié côté serveur contre le référentiel (voir plus bas).
          code_rome: { type: "string" },
          situation: { type: "string" },
          citation: { type: "string" },
          mots_du_jeune: { type: "string" },
          question_psy: { type: "string" },
        },
      },
    },
    pistes_entretien: { type: "array", items: { type: "string" } },
    a_approfondir: { type: "array", items: { type: "string" } },
  },
};

async function analyserIA(recit, { apiKey, ref, max, effort, timeout, client: clientInjecte }) {
  const client = clientInjecte ?? creerClient(apiKey);
  const consigneMax = max < 8 ? `\n\nPropose AU MAXIMUM ${max} compétences : les ${max} mieux prouvées.` : "";
  try {
    // `timeout` est une limite de temps TOTALE pour l'appel.
    return await appelerJSON({
      client,
      system: ref.system,
      contenu: `Récit du jeune :\n"""\n${recit}\n"""${consigneMax}`,
      schema: SCHEMA,
      nom: "analyse",
      effort,
      maxTokens: 16000,
      timeoutMs: timeout,
    });
  } catch (err) {
    if (err?.message === "refus du modèle") {
      throw new Error("L'IA n'a pas pu analyser ce récit. Reformule-le ou raconte une autre situation.");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mock déterministe
// ---------------------------------------------------------------------------

const QUESTION_PSY = "Tu peux raconter un moment précis où tu as fait ça ? Qu'est-ce que tu as fait, toi ?";

// Déclencheurs courants : un mot du récit (normalisé, sans accents, sans « j' »)
// qui correspond à `re` propose le code ROME associé. Codes vérifiés dans rome.json
// (un code absent du référentiel est ignoré, et le test le signale).
export const DECLENCHEURS = [
  { re: /^(gard(e|es|er|ais|ait|ions)?|baby|babysit\w*|enfants?)$/, code: "1A102", situation: "Garde d'enfants", mots: "Tu sais t'occuper d'enfants et veiller sur eux." },
  { re: /^(caisses?|caissier\w*|monnaie|encaiss\w*)$/, code: "4A201", situation: "Tenir une caisse", mots: "Tu sais tenir une caisse et rendre la monnaie." },
  { re: /^(repar\w*|depann\w*|bricol\w*)$/, code: "3E205", situation: "Réparer des objets", mots: "Tu sais réparer des choses qui ne marchent plus." },
  { re: /^(fetes?|anniversaires?|evenements?|tournois?|soirees?)$/, code: "2A304", situation: "Organiser un événement", mots: "Tu sais préparer un événement pour que tout soit prêt le jour J." },
  { re: /^(organis\w*|planifi\w*|planning)$/, code: "6D107", situation: "S'organiser", mots: "Tu sais t'organiser et faire les choses dans le bon ordre." },
  { re: /^(aid(e|es|er|ais|ait|ons|ez)?|servic\w*)$/, code: "6D116", situation: "Rendre service", mots: "Tu aimes rendre service et aider les autres." },
  { re: /^(discord|moder\w*|communaute\w*|twitch|stream\w*)$/, code: "1B109", situation: "Animer une communauté en ligne", mots: "Tu sais faire vivre un groupe en ligne et y garder une bonne ambiance." },
  { re: /^(conflits?|disputes?|embrouilles?|calm\w*|bagarres?|separe\w*)$/, code: "1B108", situation: "Apaiser un conflit", mots: "Tu sais calmer les tensions et aider les gens à se mettre d'accord." },
  { re: /^(tradui\w*|traduct\w*)$/, code: "2A203", situation: "Traduire", mots: "Tu sais traduire et faire le lien entre des personnes qui ne se comprennent pas." },
  { re: /^(cuisin\w*|recettes?|repas|gateaux?|patisser\w*|plats?)$/, code: "3B604", situation: "Cuisiner", mots: "Tu sais préparer des plats à manger." },
  { re: /^(vend(s|re|u|us|ais|ait|ons)?|ventes?|revend\w*)$/, code: "5B101", situation: "Vendre", mots: "Tu sais vendre et convaincre quelqu'un d'acheter." },
  { re: /^(equipes?|foot|football|basket|handball|volley|rugby|matchs?)$/, code: "6D102", situation: "Jouer en équipe", mots: "Tu sais jouer collectif et t'appuyer sur les autres." },
  { re: /^(entrain(e|es|er|ais|ait)|coach\w*)$/, code: "1A103", situation: "Entraîner un groupe", mots: "Tu sais animer une activité sportive pour d'autres." },
  { re: /^(dessin\w*|dessine\w*|graphi\w*|logos?|affiches?)$/, code: "2A402", situation: "Dessiner, créer des visuels", mots: "Tu sais créer des images et des visuels qui attirent l'œil." },
  { re: /^(montages?|monte|montais|youtube|tiktok)$/, code: "2A403", situation: "Monter des vidéos", mots: "Tu sais monter des vidéos." },
  { re: /^(ordi|ordis|ordinateurs?|informatique|logiciels?|applis?|applications?|parametr\w*)$/, code: "6B309", situation: "Outils numériques", mots: "Tu sais te débrouiller avec les outils numériques." },
  { re: /^(programm\w*|coder|code|codais|codait)$/, code: "2D102", situation: "Programmer", mots: "Tu sais écrire du code pour créer un programme ou une appli." },
  { re: /^(ecout\w*)$/, code: "6D101", situation: "Écouter les autres", mots: "Tu sais écouter les autres et comprendre ce qu'ils ressentent." },
  { re: /^(menage|nettoy\w*|range\w*|rangement)$/, code: "3E301", situation: "Entretenir un lieu", mots: "Tu sais remettre un lieu propre et en ordre." },
  { re: /^(jardin\w*|plantes?|planter|pelouse|tondre|tonte)$/, code: "3C103", situation: "Jardiner", mots: "Tu sais entretenir un jardin ou des espaces verts." },
  { re: /^(demarches?|formulaires?|papiers|administrati\w*|dossiers?)$/, code: "4A111", situation: "Démarches administratives", mots: "Tu sais remplir des papiers et faire des démarches." },
  { re: /^(chiens?|animal|animaux|chevaux|cheval)$/, code: "1E407", situation: "S'occuper d'animaux", mots: "Tu sais prendre soin d'un animal." },
  { re: /^(accueil\w*|renseign\w*)$/, code: "5A101", situation: "Accueillir du public", mots: "Tu sais accueillir les gens et les renseigner." },
  { re: /^(persever\w*|recommenc\w*|reessay\w*)$/, code: "6D109", situation: "Ne pas lâcher", mots: "Tu sais persévérer jusqu'à y arriver." },
];

// Mots trop courants pour compter comme recoupement avec un libellé ROME.
const MOTS_VIDES = new Set(
  "avec dans pour une des les aux par sur son ses leur leurs cette autre autres etre faire realiser assurer mettre oeuvre".split(" "),
);

/** Index « radical du verbe du libellé » → macros, pour le repérage sur les libellés ROME. */
function indexVerbes(macros) {
  const index = new Map();
  for (const m of macros) {
    const mots = sansAccents(m.libelle).split(/[^a-z']+/).filter(Boolean);
    const verbe = mots[0] ?? "";
    const radical = verbe.replace(/(er|ir|re)$/, "");
    if (radical.length < 6 || MOTS_VIDES.has(verbe)) continue;
    const autres = mots.slice(1).filter((w) => w.length >= 5 && !MOTS_VIDES.has(w)).map((w) => w.slice(0, 6));
    if (!index.has(radical)) index.set(radical, []);
    index.get(radical).push({ macro: m, autres });
  }
  return index;
}

/** Découpe en phrases, avec leur position dans le texte d'origine. */
function phrases(texte) {
  const res = [];
  for (const m of texte.matchAll(/[^.!?…\n]+[.!?…]*/g)) {
    const brut = m[0];
    const debut = m.index + (brut.length - brut.trimStart().length);
    const contenu = brut.trim();
    if (contenu) res.push({ texte: contenu, debut });
  }
  return res;
}

/** Mots d'une phrase avec leurs positions, et leur forme normalisée (sans « j' », « l' »…). */
function mots(phrase) {
  return [...phrase.matchAll(/\S+/g)].map((m) => ({
    debut: m.index,
    fin: m.index + m[0].length,
    n: sansAccents(m[0]).replace(/^[a-z]'/, "").replace(/[^a-z0-9'-]+/g, ""),
  }));
}

/**
 * Citation exacte (sous-chaîne du texte d'origine) de 3 à 25 mots autour du mot `i` :
 * la PROPOSITION qui le contient (découpée sur , ; : et, si elle dépasse 25 mots,
 * sur « et » / « puis »), jamais coupée sur un article ou une préposition seule
 * (« … je compare les »). Même logique que la preuve du MJ mock (texte.js).
 * Renvoie null si la phrase est trop courte.
 */
export function extraitAutour(phrase, listeMots, i, maxMots = 25) {
  if (listeMots.length < 3) return null;
  return propositionAutour(phrase, i, { max: maxMots, min: 3 }) || null;
}

/** Repérage déterministe : déclencheurs courants puis verbes des libellés ROME. */
export function reperer(recit, rome, max = 8) {
  const ref = referentiel(rome);
  const trouvees = [];
  const vus = new Set();
  const ajouter = (code, citation, extra, position) => {
    const macro = ref.macros.get(code);
    if (!macro || !citation || vus.has(code)) return;
    vus.add(code);
    trouvees.push({ code, macro, citation, position, ...extra });
  };

  for (const ph of phrases(recit)) {
    const liste = mots(ph.texte);
    const radicaux = new Set(liste.map((x) => x.n.slice(0, 6)));
    liste.forEach((w, i) => {
      if (!w.n) return;
      // 1) Déclencheurs courants.
      for (const d of DECLENCHEURS) {
        if (d.re.test(w.n)) {
          ajouter(d.code, extraitAutour(ph.texte, liste, i), { situation: d.situation, mots: d.mots }, ph.debut + w.debut);
        }
      }
      // 2) Verbe d'un libellé ROME + au moins un autre mot du libellé dans la phrase.
      for (const [radical, candidats] of ref.verbes) {
        if (!w.n.startsWith(radical)) continue;
        let meilleur = null;
        let score = 0;
        for (const c of candidats) {
          const s = c.autres.filter((a) => radicaux.has(a)).length;
          if (s > score) [meilleur, score] = [c, s];
        }
        if (meilleur) {
          const libelle = accentuerLibelle(meilleur.macro.libelle);
          ajouter(
            meilleur.macro.code,
            extraitAutour(ph.texte, liste, i),
            { situation: "Situation racontée", mots: `Tu sais ${libelle.charAt(0).toLowerCase()}${libelle.slice(1)}.` },
            ph.debut + w.debut,
          );
        }
      }
    });
  }
  return trouvees.sort((x, y) => x.position - y.position).slice(0, max);
}

function analyserMock(recit, { rome, max }) {
  const trouvees = reperer(recit, rome, max);
  return {
    brut: {
      competences: trouvees.map((t) => ({
        code_rome: t.code,
        situation: t.situation,
        citation: t.citation,
        mots_du_jeune: t.mots,
        question_psy: QUESTION_PSY,
      })),
      pistes_entretien: [
        "Dans ce que tu as raconté, qu'est-ce que tu as le plus aimé faire ?",
        "Si tu pouvais refaire une de ces situations, qu'est-ce que tu referais pareil ?",
      ],
      a_approfondir: trouvees.length
        ? []
        : ["Tu peux raconter une situation précise : ce que tu as fait, avec qui, et comment ça s'est passé ?"],
    },
    modele: "mock",
  };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/**
 * @param {string} recit
 * @param {{ apiKey?: string, rome: object, max?: number, mode?: string, effort?: string, timeout?: number }} options
 *   mode : "auto" (IA si apiKey, sinon mock) ou "mock" (toujours le mock).
 */
export async function analyser(recit, { apiKey, rome, max = 8, mode = "auto", effort = "medium", timeout = 60000, client } = {}) {
  const ref = referentiel(rome);
  const texteRecit = String(recit ?? "");
  const mock = mode === "mock" || (!apiKey && !client);
  const { brut, modele } = mock
    ? analyserMock(texteRecit, { rome, max })
    : await analyserIA(texteRecit, { apiKey, ref, max, effort, timeout, client });

  // Garde-fous côté serveur : on ne garde que ce qui est vérifiable.
  const vus = new Set();
  const retenues = [];
  const ecartees = [];
  for (const c of brut.competences ?? []) {
    const macro = ref.macros.get(c.code_rome);
    const prouvee = citationExacte(c.citation, texteRecit);
    const cle = c.code_rome + "|" + norm(c.citation);
    if (!macro || !prouvee) {
      ecartees.push({ code_rome: c.code_rome, raison: !macro ? "hors référentiel" : "citation introuvable dans le récit" });
      continue;
    }
    // Une preuve d'un ou deux mots ne prouve rien (sauf si c'est le récit entier).
    if (norm(c.citation).split(" ").length < CITATION_MIN_MOTS && norm(c.citation) !== norm(texteRecit)) {
      ecartees.push({ code_rome: c.code_rome, raison: "citation trop courte" });
      continue;
    }
    if (vus.has(cle)) continue;
    vus.add(cle);
    retenues.push({
      ...c,
      libelle_rome: accentuerLibelle(macro.libelle),
      categorie: macro.categorie,
      domaine: `${macro.enjeu} › ${macro.objectif}`,
      riasec: macro.riasec, // [majeur, mineur] attribués par France Travail
    });
  }

  return {
    competences: retenues.slice(0, max),
    ecartees,
    pistes_entretien: (brut.pistes_entretien ?? []).slice(0, 3),
    a_approfondir: (brut.a_approfondir ?? []).slice(0, 3),
    modele,
    referentiel: rome.source,
  };
}

/**
 * Convertit une compétence de l'analyse au format commun du jeu (SPEC §4.2),
 * pour les compétences de départ (création du personnage).
 */
export function versCompetenceDepart(c) {
  return {
    code: c.code_rome,
    libelle: c.libelle_rome,
    mots: c.mots_du_jeune,
    preuve: c.citation,
    typePreuve: "vecu",
    riasec: c.riasec ?? [],
    problemeIndex: null,
    gardee: null,
  };
}
