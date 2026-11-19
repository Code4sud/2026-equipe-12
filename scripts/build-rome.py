"""Construit data/rome.json à partir de l'open data ROME 4.0 (France Travail).

Fichiers sources (data.gouv.fr, jeu « Répertoire opérationnel des métiers et des emplois ») :
  - 261014-arborescence-simplifiee-des-competences-26m10.xlsx
  - 261014-rome_arboprincipale-octobre-2026.xlsx

Usage : python scripts/build-rome.py <competences.xlsx> <arbo-principale.xlsx> data/rome.json
Dépendance : openpyxl
"""
import json
import re
import sys
import warnings

import openpyxl

warnings.filterwarnings("ignore")


def s(x):
    return str(x).strip() if x not in (None, "") else ""


# Le ROME écrit les majuscules initiales sans accent (« Elaborer », « Etre ») et
# « oeuvre » sans ligature. Même règle que accentuerLibelle() dans src/texte.js :
# le libellé sert de titre de carte et le jeune le recopie sur sa fiche papier.
E_ACCENT = {
    "tre": "Être", "crire": "Écrire", "duquer": "Éduquer", "laborer": "Élaborer", "quiper": "Équiper",
    "tablir": "Établir", "vacuer": "Évacuer", "valuer": "Évaluer", "couter": "Écouter", "changer": "Échanger",
    "mettre": "Émettre", "liminer": "Éliminer", "lever": "Élever", "conomiser": "Économiser",
    "tudier": "Étudier", "tiqueter": "Étiqueter",
}
RE_E_ACCENT = re.compile(r"(?<![^\W_])E(" + "|".join(E_ACCENT) + r")(?![^\W_])")


def accentuer(libelle):
    libelle = RE_E_ACCENT.sub(lambda m: E_ACCENT[m.group(1)], libelle)
    return re.sub(r"\b([Oo])euvre", lambda m: "Œuvre" if m.group(1) == "O" else "œuvre", libelle)


def main(comp_path, princ_path, out_path):
    rows = list(openpyxl.load_workbook(comp_path, read_only=True)["REF - Macro"].iter_rows(values_only=True))
    macros, last = [], {}
    for r in rows[1:]:
        if not r[1]:
            continue
        m = {
            "code": s(r[1]),
            "libelle": accentuer(s(r[13])),
            "categorie": s(r[14]),
            "domaine": s(r[5]),
            "enjeu": s(r[8]),
            "objectif": s(r[11]),
            "riasec": [x for x in (s(r[20]), s(r[21])) if x],  # [majeur, mineur]
            "fiches": [c.strip() for c in s(r[26]).split(",") if c.strip()],
        }
        for k in ("domaine", "enjeu", "objectif"):  # cellules fusionnées : on propage
            if m[k]:
                last[k] = m[k]
            else:
                m[k] = last.get(k, "")
        macros.append(m)

    grands, doms, fiches = {}, {}, {}
    ws = openpyxl.load_workbook(princ_path, read_only=True).worksheets[1]
    for r in ws.iter_rows(values_only=True):
        a, b, c, lab, _ = [s(x) for x in r[:5]]
        if not a:
            continue
        if not b:
            grands[a] = lab
        elif not c:
            doms[a + b] = lab
        else:
            code = a + b + c
            f = fiches.setdefault(code, {"titre": lab, "domaine": a + b, "appellations": []})
            if len(f["appellations"]) < 4 and lab not in f["appellations"]:
                f["appellations"].append(lab)

    data = {
        "source": "ROME 4.0 v26M10 (France Travail, open data, octobre 2026)",
        "macros": macros,
        "fiches": fiches,
        "domainesPro": doms,
        "grandsDomaines": grands,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    avec = sum(1 for m in macros if m["riasec"])
    print(f"{len(macros)} macro-compétences ({avec} avec RIASEC), {len(fiches)} fiches métiers")


if __name__ == "__main__":
    main(*sys.argv[1:4])
