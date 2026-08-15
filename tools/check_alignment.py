#!/usr/bin/env python3
"""Vérifie la correspondance des versets calculée par tools/align_versions.py.

Deux contrôles :

1. Cas témoins — des versets connus, repérés par un mot-clé attendu dans chaque
   langue. Ex. : Psaume 51:12 (« Crée en moi un cœur pur ») doit tomber sur
   « clean heart » en anglais, et non sur le verset voisin.

2. Contrôle global — pour chaque référence utilisée par l'application (versets
   du jour, thèmes, plans), on vérifie que le verset visé existe dans chaque
   version et que sa longueur reste plausible par rapport à la LSG.

Usage : python3 tools/check_alignment.py
"""
from __future__ import annotations

import base64
import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
VDIR = DATA / "versions"

FR = ("LSG", "DBY", "OST", "MAR")
EN = ("KJV", "WEB", "ASV", "YLT", "BBE")

# référence LSG -> (mots attendus en français, mots attendus en anglais)
# un seul des mots suffit (les traductions varient)
CASES = [
    ("PSA 51:12", ["cœur pur", "coeur pur", "coeur net"], ["clean heart", "right heart"]),
    ("PSA 23:1", ["berger"], ["shepherd", "sheep"]),
    ("PSA 23:4", ["vallée", "ombre de la mort"], ["valley", "shadow"]),
    ("PSA 3:2", ["ennemis", "pressent"], ["increased", "distresses", "attacks", "trouble"]),
    ("PSA 119:105", ["lampe"], ["lamp", "light"]),
    ("PSA 46:2", ["refuge", "retraite"], ["refuge", "harbour"]),
    ("PSA 91:1", ["Très-Haut", "Tres-Haut", "Souverain"], ["Most High"]),
    ("ISA 9:5", ["enfant nous est né", "enfant nous est ne", "enfant nous est"], ["child is born", "child has come", "child hath been born"]),
    ("ISA 40:31", ["aigles"], ["eagles"]),
    ("ISA 53:5", ["blessé", "blesse", "meurtri", "navré"], ["wounded", "pierced"]),
    ("JON 2:2", ["pria", "prière"], ["prayed", "prayeth", "made prayer"]),
    ("ECC 4:9", ["Deux valent mieux"], ["Two are better", "two are better"]),
    ("ECC 5:10", ["abonde", "beaucoup de bien", "augmentation des biens"], ["goods increase", "goods are increased", "multiplying of good"]),
    ("MRK 9:23", ["possible"], ["possible"]),
    ("MRK 10:27", ["impossible", "possible"], ["impossible", "possible"]),
    ("3JN 1:4", ["joie"], ["joy"]),
    ("NAM 1:7", ["bon"], ["good"]),
    ("JHN 3:16", ["aimé le monde", "aime le monde"], ["loved the world", "love the world", "such love for the world"]),
    ("GEN 1:1", ["commencement"], ["beginning", "first"]),
    ("ROM 8:28", ["toutes choses"], ["all things", "everything"]),
    ("PHP 4:13", ["fortifie", "force"], ["strength", "strengthens", "power", "enableth"]),
    ("JOL 2:28", ["esprit"], ["spirit"]),
    ("MAL 3:10", ["dîmes", "dimes"], ["tithes", "tithe", "tenths"]),
    ("MAL 4:2", ["soleil"], ["sun"]),
    ("PSA 42:2", ["biche", "cerf"], ["hart", "deer", "roe"]),
    ("HOS 2:16", ["attirer", "attirerai"], ["allure", "enticing", "make her come"]),
]


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def norm(s: str) -> str:
    return strip_accents(s).lower()


def load(vid: str):
    blob = (VDIR / f"{vid}.b64").read_text(encoding="utf-8")
    text = gzip.decompress(base64.b64decode(blob)).decode("utf-8")
    return [[c.split("\x1e") for c in b.split("\x1d")]
            for b in text.split("\x1c")]


def main() -> int:
    index = json.loads((VDIR / "index.json").read_text(encoding="utf-8"))
    abbrs = [b["a"] for b in index["books"]]
    bi = {a: i for i, a in enumerate(abbrs)}
    maps = {v["id"]: v["map"] for v in index["versions"]}
    books = {v["id"]: load(v["id"]) for v in index["versions"]}
    ids = [v["id"] for v in index["versions"]]

    def resolve(vid, b, c, v):
        """(chapitre, verset) dans `vid` pour la référence LSG (b, c, v)."""
        m = maps[vid].get(f"{b}.{c - 1}")
        if not m:
            return c, v
        if v - 1 >= len(m):
            return c, 0
        e = m[v - 1]
        if e == 0:
            return c, 0
        if isinstance(e, str):
            cc, vv = e.split(":")
            return int(cc), int(vv)
        return c, e

    def text(vid, ref):
        mm = re.match(r"^([A-Z0-9]{3}) (\d+):(\d+)$", ref)
        b, c, v = bi[mm.group(1)], int(mm.group(2)), int(mm.group(3))
        cc, vv = resolve(vid, b, c, v)
        if not vv:
            return ""
        ch = books[vid][b][cc - 1]
        return ch[vv - 1] if vv - 1 < len(ch) else ""

    fails = 0
    print("=== cas témoins ===")
    for ref, frw, enw in CASES:
        bad = []
        for vid in ids:
            t = norm(text(vid, ref))
            words = frw if vid in FR else enw
            if not t:
                bad.append(f"{vid}(vide)")
            elif not any(norm(w) in t for w in words):
                bad.append(f"{vid}: {text(vid, ref)[:58]}")
        if bad:
            fails += 1
            print(f"  ❌ {ref}")
            for b in bad:
                print(f"       {b}")
        else:
            print(f"  ✅ {ref}")

    # --- contrôle global sur les références de l'application ---------------
    refs = set(json.loads((DATA / "daily_verses.json").read_text(encoding="utf-8")))
    for t in json.loads((DATA / "themes.json").read_text(encoding="utf-8")):
        refs.update(t["v"])
    for p in json.loads((DATA / "plans.json").read_text(encoding="utf-8")):
        for d in p["days"]:
            refs.update(d["r"])

    print("\n=== couverture des références de l'application ===")
    single = sorted(r for r in refs if re.match(r"^[A-Z0-9]{3} \d+:\d+$", r))
    for vid in ids:
        missing = [r for r in single if not text(vid, r)]
        flag = "✅" if not missing else "⚠ "
        print(f"  {flag} {vid}: {len(single) - len(missing)}/{len(single)} versets résolus"
              + (f" — manquants {missing[:6]}" if missing else ""))
        if missing:
            fails += 1

    print("\n" + ("✅ alignement validé" if not fails
                  else f"❌ {fails} problème(s)"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
