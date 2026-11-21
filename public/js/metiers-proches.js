// Métiers à découvrir : rapprochement déterministe (sans IA) entre les types
// d'activités où le jeune a montré des compétences (codes RIASEC de ses
// compétences gardées) et le profil RIASEC des métiers O*NET. Utilisable dans le
// navigateur et dans Node.
//
// La proximité (cosinus de profils centrés) sert seulement à TRIER : elle n'est
// jamais affichée, ni en chiffre ni en étiquette (« très proche », « proche »…).
// Les seuils de Lewis et Morris (0,426 / 0,729) ont été établis pour des scores de
// l'O*NET Interest Profiler, pas pour un profil tiré de 3 à 6 compétences : on ne
// les reprend pas (critique psy, points 4 et 5). Les seuils ci-dessous (0,5 et
// 0,35) sont des choix de conception, sans valeur de mesure : la fiche présente
// ces métiers comme des pistes « indicatives ».

const ORDRE = ["R", "I", "A", "S", "E", "C"];

const centrer = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map((x) => x - m);
};
const cosinus = (a, b) => {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? p / Math.sqrt(na * nb) : 0;
};

/**
 * @param {{R:number,I:number,A:number,S:number,E:number,C:number}} poids
 *   nombre de preuves par type (ex. majeur = 2, mineur = 1)
 * @param {Array} metiers  data/metiers.json → metiers
 * @returns {{accessibles: Array, plusLongs: Array}} null si aucune preuve RIASEC
 *
 * « Accessibles » = sans études longues (zones O*NET 1 à 3, jusqu'à bac+2).
 * Le public (15-25 ans, souvent sans diplôme) passe d'abord : on prend jusqu'à
 * `nbCourts` métiers de zone 1-2 (sur le tas, CAP, bac) proches du profil
 * (proximité ≥ `seuilCourts`), on complète avec la
 * zone 3 (BTS, BUT, bac+2), puis de nouveau avec la zone 1-2 s'il manque des
 * métiers de zone 3. Ordre d'affichage : zone 1-2 d'abord, puis zone 3, chaque
 * groupe trié par proximité.
 */
export function metiersProches(poids, metiers, { nbAccessibles = 5, nbLongs = 3, nbCourts = 3, seuilCourts = 0.5 } = {}) {
  const jeune = ORDRE.map((k) => poids[k] || 0);
  if (!jeune.some((x) => x > 0)) return null;
  const j = centrer(jeune);
  const classes = metiers
    .map((m) => ({ ...m, proximite: cosinus(j, centrer(m.riasec)) }))
    .filter((m) => m.proximite > 0)
    .sort((a, b) => b.proximite - a.proximite || a.zone - b.zone);
  // Zone 1-2 mise en avant seulement si le métier ressemble vraiment au profil
  // (sinon on proposerait des métiers sans rapport juste parce qu'ils sont courts).
  const courts = classes.filter((m) => m.zone <= 2 && m.proximite >= seuilCourts);
  const moyens = classes.filter((m) => m.zone === 3);
  const nMoyens = Math.min(moyens.length, Math.max(0, nbAccessibles - Math.min(courts.length, nbCourts)));
  const nCourts = Math.min(courts.length, nbAccessibles - nMoyens);
  return {
    accessibles: [...courts.slice(0, nCourts), ...moyens.slice(0, nMoyens)],
    plusLongs: classes.filter((m) => m.zone >= 4).slice(0, nbLongs),
  };
}

/**
 * Métiers proches du profil, rangés par zone de préparation (1 à 5), comme le
 * « champ des possibles » du Rapport des Possibles : au plus `parZone` métiers
 * par zone, seulement s'ils ressemblent assez au profil (proximité ≥ `seuil`).
 * Une zone peut rester vide. null si le profil est vide. 2 métiers par zone sur la
 * fiche (`parZone`) : choix de conception, pour ne pas noyer le jeune (Chernev
 * 2015 : l'effet de la surcharge de choix dépend des préférences incertaines ;
 * Scheibehenne 2010 trouve un effet moyen proche de zéro, c'est une nuance).
 */
export function metiersParZone(poids, metiers, { parZone = 3, seuil = 0.35 } = {}) {
  const jeune = ORDRE.map((k) => poids[k] || 0);
  if (!jeune.some((x) => x > 0)) return null;
  const j = centrer(jeune);
  const classes = metiers
    .map((m) => ({ ...m, proximite: cosinus(j, centrer(m.riasec)) }))
    .filter((m) => m.proximite >= seuil)
    .sort((a, b) => b.proximite - a.proximite);
  const zones = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const m of classes) {
    const z = Number(m.zone);
    if (zones[z] && zones[z].length < parZone) zones[z].push(m);
  }
  return zones;
}

// Les 2 types RIASEC dominants d'un métier, pour l'afficher simplement (« S·C »).
export function typesDominants(m) {
  return ORDRE.map((k, i) => [k, m.riasec[i]])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
}
