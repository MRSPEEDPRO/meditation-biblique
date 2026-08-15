#!/usr/bin/env python3
"""Calcule la correspondance des numéros de versets entre la Louis Segond 1910
(référence de l'application) et chacune des autres traductions.

Pourquoi : les traditions de numérotation diffèrent. Le titre des psaumes est
compté comme verset 1 en français mais pas en anglais (Psaume 51:12 = Psalm
51:10) ; « Jonas 2:1 » en français est « Jonah 1:17 » en anglais ; Ésaïe 9:5
correspond à Isaiah 9:6. Sans correspondance, le verset du jour afficherait un
tout autre texte selon la version choisie.

Deux méthodes complémentaires :

1. Psaumes — règle documentée. Le titre (« Au chef des chantres… ») est compté
   comme verset 1 (parfois 1-2) dans la tradition française, et rattaché au
   verset 1 sans numéro dans la tradition anglaise. La correspondance est donc
   un décalage constant, égal à la différence du nombre de versets.

2. Autres livres — alignement par programmation dynamique sur le livre entier
   (et non chapitre par chapitre, pour absorber les décalages qui traversent
   une frontière de chapitre comme en Jonas). Le coût d'appariement combine la
   longueur relative des versets et les « ancres » communes — nombres et noms
   propres — qui se reconnaissent d'une langue à l'autre. Le calcul est mené
   dans une bande (±BAND versets) : les traditions ne divergent jamais plus.

Résultat : data/versions/index.json reçoit, pour chaque version, la table des
chapitres dont la numérotation diffère de la LSG. Une entrée vaut soit un
numéro de verset (même chapitre), soit « c:v » (le verset est passé dans un
autre chapitre), soit 0 (aucun équivalent).

Usage : python3 tools/align_versions.py
"""
from __future__ import annotations

import base64
import gzip
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VDIR = ROOT / "data" / "versions"

PSALMS = 18          # index du livre des Psaumes
BAND = 12            # écart maximal envisagé entre deux numérotations
GAP = 0.62           # coût d'un verset sans correspondance
ANCHOR = 0.34        # remise par ancre commune

STOP = set("""
the and that with this from they them their there where when what which shall
unto his her him you your are was were have has had not but for all who whom
into upon said say saith come came went selah lord god jesus christ
eternel dieu seigneur ainsi cela dont mais pour dans avec sont etait etaient
tout tous celui ceux quand alors donc car est les des une aux qui que
""".split())


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def anchors(t: str) -> set[str]:
    """Nombres et noms propres — comparables d'une langue à l'autre."""
    out = {"#" + n for n in re.findall(r"\d+", t)}
    for w in re.findall(r"\b[A-ZÀ-Þ][A-Za-zÀ-ÿ]{3,}", t):
        w = strip_accents(w).lower()
        if w not in STOP:
            out.add(w[:5])
    return out


def load(vid: str) -> list[list[list[str]]]:
    blob = (VDIR / f"{vid}.b64").read_text(encoding="utf-8")
    text = gzip.decompress(base64.b64decode(blob)).decode("utf-8")
    return [[c.split("\x1e") for c in b.split("\x1d")]
            for b in text.split("\x1c")]


def flatten(book: list[list[str]]) -> tuple[list[str], list[tuple[int, int]]]:
    """Renvoie (versets, [(chapitre, verset) 1-based]) pour un livre."""
    txt, pos = [], []
    for ci, ch in enumerate(book):
        for vi, v in enumerate(ch):
            txt.append(v)
            pos.append((ci + 1, vi + 1))
    return txt, pos


def align_book(src: list[str], dst: list[str]) -> list[int]:
    """Aligne deux listes de versets ; retourne l'index dst (0-based) pour
    chaque verset src, ou -1. Programmation dynamique en bande."""
    n, m = len(src), len(dst)
    if n == 0 or m == 0:
        return [-1] * n

    ls, ld = [len(s) for s in src], [len(s) for s in dst]
    ratio = max(1, sum(ls)) / max(1, sum(ld))
    asrc, adst = [anchors(s) for s in src], [anchors(s) for s in dst]

    def cost(i: int, j: int) -> float:
        a, b = ls[i], ld[j] * ratio
        c = abs(a - b) / max(1.0, a + b)
        return max(-0.9, c - ANCHOR * len(asrc[i] & adst[j]))

    band = BAND + abs(n - m)
    INF = float("inf")
    prev = {0: 0.0}
    bt: list[dict[int, int]] = [{}]
    for i in range(1, n + 1):
        cur: dict[int, float] = {}
        row: dict[int, int] = {}
        lo, hi = max(0, i - band), min(m, i + band)
        for j in range(lo, hi + 1):
            best, b = INF, 0
            if j - 1 >= 0 and (j - 1) in prev:                 # diagonale
                v = prev[j - 1] + cost(i - 1, j - 1)
                if v < best:
                    best, b = v, 1
            if j in prev:                                       # src seul
                v = prev[j] + GAP
                if v < best:
                    best, b = v, 2
            if (j - 1) in cur:                                  # dst seul
                v = cur[j - 1] + GAP
                if v < best:
                    best, b = v, 3
            if b:
                cur[j], row[j] = best, b
        prev, _ = cur, bt.append(row)

    out = [-1] * n
    i = n
    j = min(prev, key=prev.get) if prev else 0
    while i > 0:
        b = bt[i].get(j, 2)
        if b == 1:
            out[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif b == 2:
            i -= 1
        else:
            j -= 1
            if j < 0:
                break
    return out


def psalm_map(src: list[list[str]], dst: list[list[str]]) -> dict:
    """Décalage constant par psaume (le titre compte comme verset en français)."""
    out = {}
    for ci in range(len(src)):
        d = len(src[ci]) - len(dst[ci])
        if d == 0:
            continue
        n, m = len(src[ci]), len(dst[ci])
        out[f"{PSALMS}.{ci}"] = [min(max(1, v - d), m) if m else 0
                                 for v in range(1, n + 1)]
    return out


def main() -> int:
    index = json.loads((VDIR / "index.json").read_text(encoding="utf-8"))
    base = load("LSG")

    for ver in index["versions"]:
        vid = ver["id"]
        if vid == "LSG":
            ver["map"] = {}
            continue
        target = load(vid)
        mapping: dict[str, list] = {}

        for bi in range(66):
            if bi == PSALMS:
                mapping.update(psalm_map(base[bi], target[bi]))
                continue
            # rien à faire si toutes les longueurs coïncident
            if [len(c) for c in base[bi]] == [len(c) for c in target[bi]]:
                continue
            stxt, spos = flatten(base[bi])
            dtxt, dpos = flatten(target[bi])
            al = align_book(stxt, dtxt)
            per: dict[int, list] = {}
            # Un chapitre de même longueur des deux côtés est *présumé* aligné
            # à l'identité — mais seulement si l'alignement statistique le
            # confirme majoritairement. Sans ce garde-fou, une divergence de
            # vocabulaire (Crampon « Yahweh », PGR « l'Éternel »…) suffit à
            # faire dériver la programmation dynamique sur un chapitre pourtant
            # parfaitement parallèle. Avec un garde-fou trop large, à l'inverse,
            # on masquerait un vrai décalage (Ostervald sur Ecclésiaste 5).
            accord: dict[int, list[int]] = {}
            for k, j in enumerate(al):
                ci, vi = spos[k]
                if ci - 1 >= len(target[bi]):
                    continue
                if len(base[bi][ci - 1]) != len(target[bi][ci - 1]):
                    continue
                ok = accord.setdefault(ci, [0, 0])
                ok[1] += 1
                if j >= 0 and dpos[j] == (ci, vi):
                    ok[0] += 1
            memes = {ci for ci, (bon, tot) in accord.items()
                     if tot and bon / tot >= 0.5}
            for k, j in enumerate(al):
                ci, vi = spos[k]
                if ci in memes:
                    continue  # identité confirmée : rien à stocker
                per.setdefault(ci - 1, [])
                while len(per[ci - 1]) < vi - 1:
                    per[ci - 1].append(0)
                if j < 0:
                    per[ci - 1].append(0)
                else:
                    tc, tv = dpos[j]
                    per[ci - 1].append(tv if tc == ci else f"{tc}:{tv}")
            for ci, lst in per.items():
                # complète la fin du chapitre par l'identité si besoin
                full = []
                for vi in range(1, len(base[bi][ci]) + 1):
                    full.append(lst[vi - 1] if vi - 1 < len(lst) else vi)
                mapping[f"{bi}.{ci}"] = full

        ver["map"] = mapping
        print(f"{vid}: {len(mapping)} chapitre(s) réalignés")

    (VDIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"\nindex.json ({(VDIR / 'index.json').stat().st_size / 1e6:.2f} Mo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
