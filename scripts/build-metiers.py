"""Construit data/metiers.json : métiers (titres et descriptions en français) +
profil RIASEC et domaines d'intérêt O*NET + niveau de préparation (Job Zone).

Sources :
  - table-metiers-onet-fr-jobzones.xlsx : 721 métiers O*NET traduits, Job Zone,
    et des corrections « Zone réelle » d'après l'ONISEP (colonne A)
  - O*NET 31.0 Database (USDOL/ETA, CC BY 4.0) :
      Career Interest Types.xlsx    -> profil RIASEC (échelle 1 à 7) par métier
      Specific Interest Areas.xlsx  -> domaines d'intérêt précis par métier

Usage : python scripts/build-metiers.py <table-fr.xlsx> <Career Interest Types.xlsx> \
          <Specific Interest Areas.xlsx> data/metiers.json
"""
import json
import re
import sys
import warnings
from collections import defaultdict

import openpyxl

warnings.filterwarnings("ignore")

RIASEC = {"Realistic": "R", "Investigative": "I", "Artistic": "A", "Social": "S", "Enterprising": "E", "Conventional": "C"}

DOMAINES_FR = {
    "Mechanics/Electronics": "Mécanique, électronique",
    "Construction/Woodwork": "Construction, bois",
    "Transportation/Machine Operation": "Transport, conduite d'engins",
    "Physical/Manual Labor": "Travail physique, manuel",
    "Protective Service": "Sécurité, secours",
    "Agriculture": "Agriculture",
    "Nature/Outdoors": "Nature, plein air",
    "Animal Service": "Animaux",
    "Athletics": "Sport",
    "Engineering": "Ingénierie",
    "Physical Science": "Sciences physiques",
    "Life Science": "Sciences du vivant",
    "Medical Science": "Sciences médicales",
    "Social Science": "Sciences humaines",
    "Humanities": "Lettres, histoire, langues",
    "Mathematics/Statistics": "Maths, statistiques",
    "Information Technology": "Informatique",
    "Visual Arts": "Arts visuels",
    "Applied Arts and Design": "Design, arts appliqués",
    "Performing Arts": "Arts de la scène",
    "Music": "Musique",
    "Creative Writing": "Écriture",
    "Media": "Médias",
    "Culinary Art": "Cuisine",
    "Teaching/Education": "Enseignement, éducation",
    "Social Service": "Action sociale",
    "Health Care Service": "Soins, santé",
    "Religious Activities": "Activités religieuses",
    "Personal Service": "Services à la personne",
    "Professional Advising": "Conseil",
    "Business Initiatives": "Créer son activité",
    "Sales": "Vente",
    "Marketing/Advertising": "Marketing, publicité",
    "Finance": "Finance",
    "Accounting": "Comptabilité",
    "Human Resources": "Ressources humaines",
    "Office Work": "Travail de bureau",
    "Management/Administration": "Gestion, direction",
    "Public Speaking": "Prise de parole",
    "Politics": "Politique",
    "Law": "Droit",
}

ZONES_FR = {
    1: "Très peu de préparation : formation sur le tas, pas de diplôme exigé",
    2: "Un peu de préparation : CAP, bac ou formation courte",
    3: "Préparation moyenne : CAP/BP, BTS, BUT, bac+2 ou apprentissage",
    4: "Préparation considérable : licence (bac+3/4)",
    5: "Préparation longue : master, doctorat",
}


def lire(path):
    return list(openpyxl.load_workbook(path, read_only=True).worksheets[0].iter_rows(values_only=True))


def main(table_fr, interests, areas, out):
    profils = defaultdict(dict)
    for code, _t, _eid, nom, scale, _sn, val, *_ in lire(interests)[1:]:
        if scale == "OI" and nom in RIASEC:
            profils[code][RIASEC[nom]] = round(float(val), 2)

    domaines = defaultdict(list)
    rangs = {}
    for code, _t, _eid, nom, scale, _sn, val, *_ in lire(areas)[1:]:
        if scale == "DS" and val and nom in DOMAINES_FR:
            rangs[(code, nom)] = val
    for (code, nom), rang in sorted(rangs.items(), key=lambda kv: kv[1]):
        if len(domaines[code]) < 3:
            domaines[code].append(DOMAINES_FR[nom])

    metiers, ignores = [], 0
    for r in lire(table_fr)[1:]:
        note, code, _en, titre, desc, zone = (r + (None,) * 6)[:6]
        if not code or not titre:
            continue
        titre = str(titre).strip()
        if "DOUBLON" in titre.upper() or code not in profils:
            ignores += 1
            continue
        zone_corrigee = None
        m = re.match(r"\s*zone\s*(\d)", str(note or ""), re.I)
        if m:
            zone_corrigee = int(m.group(1))
        p = profils[code]
        metiers.append({
            "code": code,
            "titre": titre,
            "description": str(desc or "").strip(),
            "zone": zone_corrigee or int(zone),
            "zoneCorrigee": bool(zone_corrigee and zone_corrigee != int(zone)),
            "riasec": [p.get(k, 0) for k in "RIASEC"],
            "domaines": domaines.get(code, []),
        })

    data = {
        "source": "O*NET 31.0 Database (USDOL/ETA), licence CC BY 4.0 : profils RIASEC et domaines d'intérêt. "
                  "Titres, descriptions et niveaux traduits et adaptés au système français (corrections d'après l'ONISEP). "
                  "Modifications non approuvées par USDOL/ETA. O*NET® est une marque de USDOL/ETA.",
        "licence": "https://creativecommons.org/licenses/by/4.0/",
        "zones": ZONES_FR,
        "metiers": metiers,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    corr = sum(m["zoneCorrigee"] for m in metiers)
    print(f"{len(metiers)} métiers ({corr} zones corrigées d'après l'ONISEP), {ignores} ignorés")


if __name__ == "__main__":
    main(*sys.argv[1:5])
