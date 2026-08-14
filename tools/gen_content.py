#!/usr/bin/env python3
"""Génère les données éditoriales de l'application :

  data/themes.json        19 thèmes de méditation × 14 versets = 266 versets
  data/daily_verses.json  247 versets du jour (rotation annuelle)

Chaque référence est vérifiée contre data/bible_lsg.json : le script échoue
si une référence n'existe pas dans la Bible Louis Segond 1910.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# --- 19 thèmes × 14 versets ------------------------------------------------
THEMES: list[tuple[str, str, str, list[str]]] = [
    ("foi", "La foi", "🌱", [
        "HEB 11:1", "HEB 11:6", "ROM 10:17", "MRK 11:22", "MRK 9:23",
        "2CO 5:7", "MAT 17:20", "JAS 1:6", "EPH 2:8", "1PE 1:7",
        "GAL 2:20", "ROM 1:17", "LUK 17:5", "1JN 5:4",
    ]),
    ("amour", "L'amour de Dieu", "❤️", [
        "JHN 3:16", "ROM 8:38", "ROM 8:39", "1JN 4:8", "1JN 4:19",
        "PSA 136:1", "JER 31:3", "ROM 5:8", "EPH 3:18", "1JN 3:1",
        "ZEP 3:17", "PSA 103:11", "ISA 54:10", "JHN 15:9",
    ]),
    ("esperance", "L'espérance", "🌅", [
        "JER 29:11", "ROM 15:13", "ROM 8:24", "PSA 39:7", "HEB 6:19",
        "ISA 40:31", "LAM 3:21", "LAM 3:22", "ROM 5:5", "PRO 23:18",
        "TIT 2:13", "1PE 1:3", "PSA 42:5", "MIC 7:7",
    ]),
    ("paix", "La paix", "🕊️", [
        "JHN 14:27", "PHP 4:7", "ISA 26:3", "PSA 4:8", "ROM 5:1",
        "COL 3:15", "MAT 5:9", "PSA 29:11", "ISA 9:6", "JHN 16:33",
        "NUM 6:26", "ROM 12:18", "2TH 3:16", "PSA 34:14",
    ]),
    ("gratitude", "La gratitude", "🙏", [
        "1TH 5:18", "PSA 100:4", "COL 3:17", "PSA 107:1", "PHP 4:6",
        "PSA 118:24", "EPH 5:20", "PSA 9:1", "COL 2:7", "PSA 95:2",
        "1CH 16:34", "PSA 136:26", "DAN 2:23", "PSA 103:2",
    ]),
    ("courage", "Le courage", "🦁", [
        "JOS 1:9", "DEU 31:6", "PSA 27:1", "ISA 41:10", "2TI 1:7",
        "1CO 16:13", "PSA 31:24", "PRO 28:1", "PSA 118:6", "EPH 6:10",
        "1CH 28:20", "MRK 6:50", "ACT 4:31", "PSA 56:3",
    ]),
    ("pardon", "Le pardon", "🤝", [
        "1JN 1:9", "EPH 4:32", "COL 3:13", "MAT 6:14", "MRK 11:25",
        "PSA 103:12", "ISA 1:18", "LUK 6:37", "MAT 18:21", "MAT 18:22",
        "ACT 3:19", "MIC 7:18", "PSA 32:5", "HEB 8:12",
    ]),
    ("joie", "La joie", "😊", [
        "NEH 8:10", "PSA 16:11", "JHN 15:11", "PHP 4:4", "GAL 5:22",
        "PSA 30:5", "ROM 15:13", "JAS 1:2", "PSA 126:3", "1PE 1:8",
        "PSA 28:7", "ISA 12:3", "PSA 5:11", "HAB 3:18",
    ]),
    ("priere", "La prière", "🕯️", [
        "PHP 4:6", "1TH 5:17", "MAT 6:6", "JAS 5:16", "1JN 5:14",
        "MAT 7:7", "JER 33:3", "MRK 11:24", "PSA 145:18", "ROM 8:26",
        "LUK 18:1", "COL 4:2", "PSA 55:22", "MAT 21:22",
    ]),
    ("epreuve", "L'épreuve", "⛰️", [
        "JAS 1:12", "ROM 8:28", "2CO 4:17", "1PE 5:10", "PSA 34:19",
        "JHN 16:33", "1CO 10:13", "2CO 12:9", "PSA 46:1", "ROM 5:3",
        "PSA 23:4", "ISA 43:2", "JOB 23:10", "PSA 121:1",
    ]),
    ("humilite", "L'humilité", "🌾", [
        "JAS 4:10", "1PE 5:5", "PRO 11:2", "PHP 2:3", "MIC 6:8",
        "MAT 23:12", "PRO 22:4", "LUK 14:11", "PSA 25:9", "PRO 16:18",
        "1PE 5:6", "PHP 2:5", "COL 3:12", "ROM 12:3",
    ]),
    ("sagesse", "La sagesse", "🦉", [
        "JAS 1:5", "PRO 1:7", "PRO 3:5", "PRO 3:6", "PRO 4:7",
        "PSA 111:10", "PRO 2:6", "ECC 7:12", "COL 2:3", "PRO 9:10",
        "JAS 3:17", "PRO 16:16", "PSA 119:105", "PRO 19:20",
    ]),
    ("protection", "La protection", "🛡️", [
        "PSA 91:1", "PSA 91:2", "PSA 121:7", "PRO 18:10", "PSA 18:2",
        "ISA 41:13", "PSA 46:1", "2TH 3:3", "PSA 32:7", "PSA 5:11",
        "PSA 3:3", "DEU 31:8", "PSA 138:7", "NAM 1:7",
    ]),
    ("guerison", "La guérison", "🌿", [
        "JER 30:17", "PSA 147:3", "ISA 53:5", "JAS 5:15", "EXO 15:26",
        "MAT 11:28", "PSA 103:3", "1PE 2:24", "PRO 17:22", "MAL 4:2",
        "PSA 30:2", "MRK 5:34", "ACT 3:16", "PSA 41:3",
    ]),
    ("force", "La force", "💪", [
        "PHP 4:13", "ISA 40:29", "PSA 46:1", "NEH 8:10", "2CO 12:10",
        "PSA 18:32", "EPH 6:10", "ISA 41:10", "PSA 73:26", "HAB 3:19",
        "PSA 29:11", "1CH 16:11", "PSA 28:8", "COL 1:11",
    ]),
    ("confiance", "La confiance", "⚓", [
        "PRO 3:5", "PSA 56:3", "PSA 37:5", "JER 17:7", "ISA 26:4",
        "PSA 20:7", "NAM 1:7", "PSA 9:10", "PSA 112:7", "ROM 8:31",
        "PSA 62:8", "2SA 22:31", "PSA 143:8", "ISA 12:2",
    ]),
    ("patience", "La patience", "⏳", [
        "JAS 5:7", "ROM 12:12", "GAL 6:9", "ECC 3:1", "PSA 27:14",
        "LAM 3:25", "ROM 8:25", "COL 1:11", "HEB 10:36", "PSA 37:7",
        "JAS 1:4", "1CO 13:4", "EPH 4:2", "ISA 40:31",
    ]),
    ("famille", "La famille", "🏡", [
        "JOS 24:15", "PRO 22:6", "EPH 6:4", "PSA 127:3", "DEU 6:6",
        "DEU 6:7", "COL 3:20", "EXO 20:12", "PRO 31:28", "1TI 5:8",
        "PSA 133:1", "MAL 4:6", "ACT 16:31", "PRO 17:6",
    ]),
    ("provision", "La provision de Dieu", "🌻", [
        "PHP 4:19", "MAT 6:33", "PSA 23:1", "MAT 6:26", "PSA 34:10",
        "MAL 3:10", "LUK 6:38", "PRO 3:9", "PSA 37:25", "2CO 9:8",
        "DEU 8:18", "PSA 84:11", "GEN 22:14", "PSA 145:16",
    ]),
]

# --- 247 versets du jour ---------------------------------------------------
DAILY: list[str] = [
    "GEN 1:1", "GEN 1:27", "GEN 9:13", "GEN 28:15", "GEN 50:20",
    "EXO 14:14", "EXO 15:2", "EXO 20:12", "EXO 33:14", "EXO 34:6",
    "LEV 19:18", "NUM 6:24", "NUM 6:25", "NUM 23:19",
    "DEU 4:29", "DEU 6:5", "DEU 7:9", "DEU 30:19", "DEU 31:6",
    "DEU 31:8", "JOS 1:8", "JOS 1:9", "JOS 24:15",
    "JDG 6:12", "RUT 1:16", "1SA 2:2", "1SA 12:24", "1SA 16:7",
    "2SA 22:2", "2SA 22:31", "1KI 8:23", "2KI 6:16",
    "1CH 16:11", "1CH 16:34", "1CH 29:11", "2CH 7:14", "2CH 20:15",
    "NEH 8:10", "NEH 9:6", "EST 4:14", "JOB 1:21", "JOB 19:25",
    "JOB 23:10", "JOB 42:2", "PSA 1:1", "PSA 1:3", "PSA 4:8",
    "PSA 8:3", "PSA 9:9", "PSA 16:8", "PSA 16:11", "PSA 18:2",
    "PSA 19:1", "PSA 19:14", "PSA 20:7", "PSA 23:1", "PSA 121:2",
    "PSA 126:5", "PSA 127:1", "PSA 130:5", "PSA 133:1", "PSA 136:1",
    "PSA 139:14", "PSA 139:23", "PSA 143:8", "PSA 145:18", "PSA 147:3",
    "PSA 150:6", "PRO 1:7", "PRO 3:5", "PRO 3:6", "PRO 4:23",
    "PRO 11:25", "PRO 12:25", "PRO 18:10", "PRO 19:21", "PRO 22:6",
    "PRO 27:17", "PRO 29:25", "PRO 31:25", "ECC 3:1", "ECC 3:11",
    "ECC 4:9", "SNG 2:11", "SNG 8:7", "ISA 1:18", "ISA 6:8",
    "ISA 9:6", "ISA 12:2", "ISA 26:3", "ISA 30:21", "ISA 53:5",
    "ISA 54:10", "ISA 55:8", "ISA 55:11", "ISA 58:11", "ISA 61:1",
    "JER 1:5", "JER 17:7", "JER 29:11", "JER 29:13", "JER 31:3",
    "JER 32:27", "JER 33:3", "LAM 3:22", "LAM 3:23", "LAM 3:25",
    "EZK 36:26", "DAN 3:17", "DAN 6:23", "HOS 6:3",
    "JOL 2:25", "AMO 5:24", "OBA 1:15", "JON 2:2",
    "MIC 6:8", "MIC 7:7", "NAM 1:7", "HAB 2:4", "HAB 3:19",
    "ZEP 3:17", "HAG 2:9", "ZEC 4:6", "MAL 3:10",
    "MAT 4:4", "MAT 5:14", "MAT 5:16", "MAT 6:21", "MAT 6:33",
    "MAT 7:7", "MAT 16:26", "MAT 19:26", "MAT 22:37", "MAT 28:19",
    "MAT 28:20", "MRK 9:23", "MRK 10:27", "MRK 11:24", "MRK 12:30",
    "MRK 16:15", "LUK 1:37", "LUK 6:31", "LUK 6:38", "LUK 11:9",
    "LUK 12:7", "LUK 12:34", "LUK 18:27", "JHN 1:1", "JHN 1:12",
    "JHN 3:16", "JHN 3:17", "JHN 8:12", "JHN 8:32", "JHN 14:1",
    "JHN 14:6", "JHN 14:27", "JHN 15:5", "JHN 15:13", "JHN 16:33",
    "ACT 1:8", "ACT 2:38", "ACT 4:12", "ACT 16:31", "ACT 20:35",
    "ROM 1:16", "ROM 5:8", "ROM 6:23", "ROM 8:1", "ROM 8:18",
    "ROM 8:28", "ROM 10:9", "ROM 12:1", "ROM 12:2", "ROM 12:12",
    "ROM 15:13", "1CO 10:13", "1CO 13:4", "1CO 13:13", "1CO 15:58",
    "1CO 16:14", "2CO 1:3", "2CO 4:16", "2CO 5:7", "2CO 5:17",
    "2CO 9:7", "2CO 12:9", "GAL 2:20", "GAL 5:22", "GAL 6:9",
    "EPH 2:8", "EPH 2:10", "EPH 3:20", "EPH 4:32", "EPH 6:10",
    "PHP 1:6", "PHP 2:3", "PHP 4:6", "PHP 4:7", "PHP 4:8",
    "PHP 4:13", "PHP 4:19", "COL 3:2", "COL 3:12", "COL 3:15",
    "COL 3:23", "1TH 5:16", "1TH 5:17", "1TH 5:18",
    "2TH 3:3", "1TI 4:12", "1TI 6:6", "2TI 1:7", "2TI 3:16",
    "TIT 3:5", "PHM 1:6", "HEB 4:12", "HEB 10:23", "HEB 11:1",
    "HEB 12:1", "HEB 12:2", "HEB 13:5", "HEB 13:8",
    "JAS 1:2", "JAS 1:5", "JAS 1:12", "JAS 1:22", "JAS 4:8",
    "JAS 5:16", "1PE 2:9", "1PE 3:15", "1PE 4:10", "1PE 5:7",
    "2PE 1:3", "2PE 3:9", "1JN 1:9", "1JN 3:1", "1JN 4:4",
    "1JN 4:18", "1JN 4:19", "1JN 5:14", "2JN 1:6",
    "3JN 1:4", "JUD 1:24", "REV 3:20", "REV 21:4", "REV 21:5",
    "REV 22:13",
]

REF_RE = re.compile(r"^([A-Z0-9]{3}) (\d+):(\d+)$")


def load_bible() -> dict:
    path = DATA / "bible_lsg.json"
    if not path.exists():
        sys.exit("data/bible_lsg.json manquant — lancez d'abord tools/parse_usfm.py")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    bible = load_bible()
    index = {b["a"]: b for b in bible["books"]}
    errors: list[str] = []

    def check(ref: str, where: str) -> None:
        m = REF_RE.match(ref)
        if not m:
            errors.append(f"{where}: référence mal formée « {ref} »")
            return
        abbr, c, v = m.group(1), int(m.group(2)), int(m.group(3))
        book = index.get(abbr)
        if not book:
            errors.append(f"{where}: livre inconnu « {abbr} »")
        elif c > len(book["c"]):
            errors.append(f"{where}: {ref} — {book['n']} n'a que {len(book['c'])} ch.")
        elif v > len(book["c"][c - 1]):
            errors.append(
                f"{where}: {ref} — {book['n']} {c} n'a que "
                f"{len(book['c'][c - 1])} versets"
            )

    themes_out = []
    for slug, label, icon, refs in THEMES:
        for r in refs:
            check(r, f"thème {slug}")
        if len(set(refs)) != len(refs):
            errors.append(f"thème {slug}: doublon interne")
        themes_out.append({"id": slug, "n": label, "i": icon, "v": refs})

    for r in DAILY:
        check(r, "verset du jour")
    if len(set(DAILY)) != len(DAILY):
        seen, dup = set(), set()
        for r in DAILY:
            (dup if r in seen else seen).add(r)
        errors.append(f"versets du jour: doublons {sorted(dup)}")

    if errors:
        print(f"❌ {len(errors)} problème(s) :")
        for e in errors[:40]:
            print("  -", e)
        return 1

    (DATA / "themes.json").write_text(
        json.dumps(themes_out, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (DATA / "daily_verses.json").write_text(
        json.dumps(DAILY, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    nb_theme_v = sum(len(t["v"]) for t in themes_out)
    print(f"✅ thèmes          : {len(themes_out)} ({nb_theme_v} versets)")
    print(f"✅ versets du jour : {len(DAILY)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
