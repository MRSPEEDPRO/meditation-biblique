#!/usr/bin/env python3
"""Importe les traductions bibliques (domaine public) et produit, pour chacune,
un blob compressé prêt à être embarqué par data/gen_plans.py.

Sortie (data/versions/) :
  index.json     métadonnées de toutes les versions (nom, langue, licence,
                 nombre de versets par chapitre, décalages de versification)
  <ID>.b64       texte intégral : compact + gzip -9 + base64

Le texte compact utilise les mêmes séparateurs que la version historique :
  \\x1e entre versets · \\x1d entre chapitres · \\x1c entre livres.

Sources (toutes dans le domaine public) :
  scrollmapper/bible_databases  KJV, ASV, YLT, BBE, FreJND (Darby), FreBDM1744
  world-english-bible (npm)     WEB
  splitant/php-bible-api        Ostervald
  data/bible_lsg.json           Louis Segond 1910 (déjà présent dans le dépôt)

Usage : python3 tools/import_versions.py [--sources RÉPERTOIRE]

  RÉPERTOIRE doit contenir :
    bible_databases/formats/json/*.json
    world-english-bible/json/*.json
    php-bible-api/resources/ostervald/*.json
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "versions"

# --- Canon : 66 livres, abréviations OSIS, noms FR et EN --------------------
BOOKS: list[tuple[str, str, str, int]] = [
    ("GEN", "Genèse", "Genesis", 0), ("EXO", "Exode", "Exodus", 0),
    ("LEV", "Lévitique", "Leviticus", 0), ("NUM", "Nombres", "Numbers", 0),
    ("DEU", "Deutéronome", "Deuteronomy", 0), ("JOS", "Josué", "Joshua", 0),
    ("JDG", "Juges", "Judges", 0), ("RUT", "Ruth", "Ruth", 0),
    ("1SA", "1 Samuel", "1 Samuel", 0), ("2SA", "2 Samuel", "2 Samuel", 0),
    ("1KI", "1 Rois", "1 Kings", 0), ("2KI", "2 Rois", "2 Kings", 0),
    ("1CH", "1 Chroniques", "1 Chronicles", 0),
    ("2CH", "2 Chroniques", "2 Chronicles", 0), ("EZR", "Esdras", "Ezra", 0),
    ("NEH", "Néhémie", "Nehemiah", 0), ("EST", "Esther", "Esther", 0),
    ("JOB", "Job", "Job", 0), ("PSA", "Psaumes", "Psalms", 0),
    ("PRO", "Proverbes", "Proverbs", 0),
    ("ECC", "Ecclésiaste", "Ecclesiastes", 0),
    ("SNG", "Cantique des cantiques", "Song of Solomon", 0),
    ("ISA", "Ésaïe", "Isaiah", 0), ("JER", "Jérémie", "Jeremiah", 0),
    ("LAM", "Lamentations", "Lamentations", 0),
    ("EZK", "Ézéchiel", "Ezekiel", 0), ("DAN", "Daniel", "Daniel", 0),
    ("HOS", "Osée", "Hosea", 0), ("JOL", "Joël", "Joel", 0),
    ("AMO", "Amos", "Amos", 0), ("OBA", "Abdias", "Obadiah", 0),
    ("JON", "Jonas", "Jonah", 0), ("MIC", "Michée", "Micah", 0),
    ("NAM", "Nahum", "Nahum", 0), ("HAB", "Habacuc", "Habakkuk", 0),
    ("ZEP", "Sophonie", "Zephaniah", 0), ("HAG", "Aggée", "Haggai", 0),
    ("ZEC", "Zacharie", "Zechariah", 0), ("MAL", "Malachie", "Malachi", 0),
    ("MAT", "Matthieu", "Matthew", 1), ("MRK", "Marc", "Mark", 1),
    ("LUK", "Luc", "Luke", 1), ("JHN", "Jean", "John", 1),
    ("ACT", "Actes", "Acts", 1), ("ROM", "Romains", "Romans", 1),
    ("1CO", "1 Corinthiens", "1 Corinthians", 1),
    ("2CO", "2 Corinthiens", "2 Corinthians", 1),
    ("GAL", "Galates", "Galatians", 1), ("EPH", "Éphésiens", "Ephesians", 1),
    ("PHP", "Philippiens", "Philippians", 1),
    ("COL", "Colossiens", "Colossians", 1),
    ("1TH", "1 Thessaloniciens", "1 Thessalonians", 1),
    ("2TH", "2 Thessaloniciens", "2 Thessalonians", 1),
    ("1TI", "1 Timothée", "1 Timothy", 1), ("2TI", "2 Timothée", "2 Timothy", 1),
    ("TIT", "Tite", "Titus", 1), ("PHM", "Philémon", "Philemon", 1),
    ("HEB", "Hébreux", "Hebrews", 1), ("JAS", "Jacques", "James", 1),
    ("1PE", "1 Pierre", "1 Peter", 1), ("2PE", "2 Pierre", "2 Peter", 1),
    ("1JN", "1 Jean", "1 John", 1), ("2JN", "2 Jean", "2 John", 1),
    ("3JN", "3 Jean", "3 John", 1), ("JUD", "Jude", "Jude", 1),
    ("REV", "Apocalypse", "Revelation", 1),
]

# --- Description des versions ----------------------------------------------
# id, nom affiché, langue, année, licence, source
VERSIONS = [
    ("LSG", "Louis Segond 1910", "Louis Segond 1910", "fr", 1910,
     "Domaine public", "lsg", None),
    ("DBY", "Darby (J. N. Darby, 1885)", "Darby in French (1885)", "fr", 1885,
     "Domaine public", "bdb", "FreJND"),
    ("OST", "Ostervald 1881", "Ostervald (1881)", "fr", 1881,
     "Domaine public", "ost", None),
    ("MAR", "David Martin 1744", "David Martin (1744)", "fr", 1744,
     "Domaine public", "bdb", "FreBDM1744"),
    ("KJV", "King James Version (1769)", "King James Version (1769)", "en",
     1769, "Public domain", "bdb", "KJV"),
    ("WEB", "World English Bible", "World English Bible", "en", 2000,
     "Public domain", "web", None),
    ("ASV", "American Standard Version (1901)",
     "American Standard Version (1901)", "en", 1901, "Public domain",
     "bdb", "ASV"),
    ("YLT", "Young's Literal Translation (1898)",
     "Young's Literal Translation (1898)", "en", 1898, "Public domain",
     "bdb", "YLT"),
    ("BBE", "Bible in Basic English (1949)", "Bible in Basic English (1949)",
     "en", 1949, "Public domain", "bdb", "BBE"),
]

WEB_FILES = [
    "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua",
    "judges", "ruth", "1samuel", "2samuel", "1kings", "2kings", "1chronicles",
    "2chronicles", "ezra", "nehemiah", "esther", "job", "psalms", "proverbs",
    "ecclesiastes", "songofsolomon", "isaiah", "jeremiah", "lamentations",
    "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah", "micah",
    "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
    "matthew", "mark", "luke", "john", "acts", "romans", "1corinthians",
    "2corinthians", "galatians", "ephesians", "philippians", "colossians",
    "1thessalonians", "2thessalonians", "1timothy", "2timothy", "titus",
    "philemon", "hebrews", "james", "1peter", "2peter", "1john", "2john",
    "3john", "jude", "revelation",
]

OST_FILES = [
    "genese", "exode", "levitique", "nombres", "deuteronome", "josue", "juges",
    "ruth", "1-samuel", "2-samuel", "1-rois", "2-rois", "1-chroniques",
    "2-chroniques", "esdras", "nehemie", "esther", "job", "psaumes",
    "proverbes", "ecclesiaste", "cantique-des-cantiques", "esaie", "jeremie",
    "lamentations", "ezechiel", "daniel", "osee", "joel", "amos", "abdias",
    "jonas", "michee", "nahum", "habakuk", "sophonie", "agee", "zacharie",
    "malachie", "matthieu", "marc", "luc", "jean", "actes", "romains",
    "1-corinthiens", "2-corinthiens", "galates", "ephesiens", "philippiens",
    "colossiens", "1-thessaloniciens", "2-thessaloniciens", "1-timothee",
    "2-timothee", "tite", "philemon", "hebreux", "jacques", "1-pierre",
    "2-pierre", "1-jean", "2-jean", "3-jean", "jude", "apocalypse",
]

WS_RE = re.compile(r"\s+")


def clean(t: str) -> str:
    """Nettoie le texte d'un verset (marques d'apparat critique, espaces)."""
    if not t:
        return ""
    # « *** » (BBE) et « * » en tête de verset (Darby) : marques éditoriales
    t = re.sub(r"\*{2,}", " ", t)
    t = re.sub(r"(?<![\w])\*", " ", t)
    # crochets d'ajout des traducteurs : on garde le mot, on retire les crochets
    t = t.replace("[", "").replace("]", "")
    t = t.replace("\u00a0", " ")
    return WS_RE.sub(" ", t).strip()


def trim_trailing(bk: list[list[list[str]]]) -> list[list[list[str]]]:
    """Supprime les versets vides en fin de chapitre : ce sont des artefacts
    des sources (numéro de verset présent mais sans texte)."""
    out = []
    for b in bk:
        chs = []
        for c in b:
            c = list(c)
            while c and not c[-1]:
                c.pop()
            chs.append(c)
        out.append(chs)
    return out


def remap_hebrew_chapters(bk: list[list[list[str]]]) -> list[list[list[str]]]:
    """Ramène Joël et Malachie de la numérotation hébraïque à la numérotation
    française/anglaise usuelle (Joël 4 ch. -> 3 ; Malachie 3 ch. -> 4)."""
    bk = [list(b) for b in bk]
    if len(bk[28]) == 4:                       # Joël
        j = bk[28]
        bk[28] = [j[0], j[1] + j[2], j[3]]
    if len(bk[38]) == 3:                       # Malachie
        m = bk[38]
        bk[38] = [m[0], m[1], m[2][:18], m[2][18:]]
    return bk


# --- Lecteurs de sources ----------------------------------------------------
def load_lsg(_src: Path, _name) -> list[list[list[str]]]:
    d = json.loads((DATA / "bible_lsg.json").read_text(encoding="utf-8"))
    return [[[clean(v) for v in ch] for ch in b["c"]] for b in d["books"]]


def load_bdb(src: Path, name: str) -> list[list[list[str]]]:
    p = src / "bible_databases" / "formats" / "json" / f"{name}.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    bk = [[[clean(v["text"]) for v in c["verses"]] for c in b["chapters"]]
          for b in d["books"]]
    return remap_hebrew_chapters(trim_trailing(bk))


def load_web(src: Path, _name) -> list[list[list[str]]]:
    base = src / "world-english-bible" / "json"
    out = []
    for f in WEB_FILES:
        d = json.loads((base / f"{f}.json").read_text(encoding="utf-8"))
        chapters: dict[int, dict[int, list[str]]] = {}
        for x in d:
            cn, vn = x.get("chapterNumber"), x.get("verseNumber")
            if cn and vn and "value" in x:
                chapters.setdefault(cn, {}).setdefault(vn, []).append(x["value"])
        chs = []
        for cn in sorted(chapters):
            vs = chapters[cn]
            chs.append([clean(" ".join(vs[v])) if v in vs else ""
                        for v in range(1, max(vs) + 1)])
        out.append(chs)
    return remap_hebrew_chapters(trim_trailing(out))


def load_ost(src: Path, _name) -> list[list[list[str]]]:
    base = src / "php-bible-api" / "resources" / "ostervald"
    out = []
    for f in OST_FILES:
        d = json.loads((base / f"{f}.json").read_text(encoding="utf-8"))
        ch = d["chapters"]
        chs = []
        for cn in sorted(ch, key=int):
            vs = ch[cn]
            mx = max(int(k) for k in vs)
            chs.append([clean(vs.get(str(i), "")) for i in range(1, mx + 1)])
        out.append(chs)
    return remap_hebrew_chapters(trim_trailing(out))


LOADERS = {"lsg": load_lsg, "bdb": load_bdb, "web": load_web, "ost": load_ost}


def compact_blob(bk: list[list[list[str]]]) -> str:
    compact = "\x1c".join(
        "\x1d".join("\x1e".join(ch) for ch in b) for b in bk
    )
    return base64.b64encode(gzip.compress(compact.encode("utf-8"), 9)).decode()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="/tmp/bible-sources",
                    help="répertoire contenant les sources téléchargées")
    args = ap.parse_args()
    src = Path(args.sources)

    OUT.mkdir(parents=True, exist_ok=True)
    ref_chapters: list[int] | None = None
    index = {
        "books": [{"a": a, "fr": fr, "en": en, "t": t}
                  for a, fr, en, t in BOOKS],
        "versions": [],
    }
    problems: list[str] = []

    for vid, nfr, nen, lang, year, licence, kind, srcname in VERSIONS:
        loader = LOADERS[kind]
        try:
            bk = loader(src, srcname)
        except FileNotFoundError as e:
            problems.append(f"{vid}: source absente ({e.filename})")
            continue

        if len(bk) != 66:
            problems.append(f"{vid}: {len(bk)} livres au lieu de 66")
            continue
        chapters = [len(b) for b in bk]
        if ref_chapters is None:
            ref_chapters = chapters
        elif chapters != ref_chapters:
            bad = [(BOOKS[i][0], ref_chapters[i], chapters[i])
                   for i in range(66) if ref_chapters[i] != chapters[i]]
            problems.append(f"{vid}: chapitres divergents {bad}")
            continue

        empty = sum(1 for b in bk for c in b for v in c if not v)
        counts = [[len(c) for c in b] for b in bk]

        blob = compact_blob(bk)
        (OUT / f"{vid}.b64").write_text(blob, encoding="utf-8")

        index["versions"].append({
            "id": vid, "nfr": nfr, "nen": nen, "lang": lang,
            "year": year, "licence": licence,
            "v": counts,
            "verses": sum(sum(b) for b in counts),
            "empty": empty,
            "bytes": len(blob),
        })
        print(f"✅ {vid:4} {nfr:34} {sum(sum(b) for b in counts):6} versets · "
              f"{len(blob) / 1e6:.2f} Mo b64" + (f" · {empty} vide(s)" if empty else ""))

    (OUT / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    total = sum(v["bytes"] for v in index["versions"])
    print(f"\n{len(index['versions'])} version(s) · {total / 1e6:.2f} Mo de données compressées")
    for p in problems:
        print("  ⚠", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
