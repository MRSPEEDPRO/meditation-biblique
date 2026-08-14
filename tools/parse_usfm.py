#!/usr/bin/env python3
"""Convertit les fichiers USFM de la Bible Louis Segond 1910 (domaine public)
en un JSON compact utilisable hors-ligne par l'application.

Source : https://github.com/BibleCorps/FRA-B-LSG1910-PD-UBS

Format de sortie (data/bible_lsg.json) :
{
  "version": "Louis Segond 1910",
  "books": [
     {"a": "GEN", "n": "Genèse", "t": 0, "c": [[ "verset 1", "verset 2", ...], ...]},
     ...
  ]
}
  a = abréviation OSIS, n = nom français, t = testament (0=AT, 1=NT),
  c = liste des chapitres, chaque chapitre étant la liste de ses versets.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

# --- Noms français officiels des 66 livres, dans l'ordre canonique -----------
BOOKS: list[tuple[str, str, int]] = [
    ("GEN", "Genèse", 0), ("EXO", "Exode", 0), ("LEV", "Lévitique", 0),
    ("NUM", "Nombres", 0), ("DEU", "Deutéronome", 0), ("JOS", "Josué", 0),
    ("JDG", "Juges", 0), ("RUT", "Ruth", 0), ("1SA", "1 Samuel", 0),
    ("2SA", "2 Samuel", 0), ("1KI", "1 Rois", 0), ("2KI", "2 Rois", 0),
    ("1CH", "1 Chroniques", 0), ("2CH", "2 Chroniques", 0), ("EZR", "Esdras", 0),
    ("NEH", "Néhémie", 0), ("EST", "Esther", 0), ("JOB", "Job", 0),
    ("PSA", "Psaumes", 0), ("PRO", "Proverbes", 0), ("ECC", "Ecclésiaste", 0),
    ("SNG", "Cantique des cantiques", 0), ("ISA", "Ésaïe", 0),
    ("JER", "Jérémie", 0), ("LAM", "Lamentations", 0), ("EZK", "Ézéchiel", 0),
    ("DAN", "Daniel", 0), ("HOS", "Osée", 0), ("JOL", "Joël", 0),
    ("AMO", "Amos", 0), ("OBA", "Abdias", 0), ("JON", "Jonas", 0),
    ("MIC", "Michée", 0), ("NAM", "Nahum", 0), ("HAB", "Habacuc", 0),
    ("ZEP", "Sophonie", 0), ("HAG", "Aggée", 0), ("ZEC", "Zacharie", 0),
    ("MAL", "Malachie", 0),
    ("MAT", "Matthieu", 1), ("MRK", "Marc", 1), ("LUK", "Luc", 1),
    ("JHN", "Jean", 1), ("ACT", "Actes", 1), ("ROM", "Romains", 1),
    ("1CO", "1 Corinthiens", 1), ("2CO", "2 Corinthiens", 1),
    ("GAL", "Galates", 1), ("EPH", "Éphésiens", 1), ("PHP", "Philippiens", 1),
    ("COL", "Colossiens", 1), ("1TH", "1 Thessaloniciens", 1),
    ("2TH", "2 Thessaloniciens", 1), ("1TI", "1 Timothée", 1),
    ("2TI", "2 Timothée", 1), ("TIT", "Tite", 1), ("PHM", "Philémon", 1),
    ("HEB", "Hébreux", 1), ("JAS", "Jacques", 1), ("1PE", "1 Pierre", 1),
    ("2PE", "2 Pierre", 1), ("1JN", "1 Jean", 1), ("2JN", "2 Jean", 1),
    ("3JN", "3 Jean", 1), ("JUD", "Jude", 1), ("REV", "Apocalypse", 1),
]

# Marqueurs USFM dont le contenu n'appartient PAS au texte biblique
# (introductions, titres, notes, références croisées...).
NOTE_RE_GENERIC = re.compile(r"\\(x|f|fe|ef)\b.*?\\\1\*", re.S)
CHAR_MARKER_RE = re.compile(r"\\\+?[a-z]+[0-9]*\*")  # marqueurs de fin : \wj* \nd* ...
OPEN_MARKER_RE = re.compile(r"\\\+?[a-z]+[0-9]*\b\s?")  # marqueurs d'ouverture
WS_RE = re.compile(r"\s+")

# Lignes de contenu poétique/prose qui prolongent le verset courant.
CONTINUATION = {
    "p", "m", "pi", "pi1", "pi2", "mi", "nb", "pc", "pr", "cls", "pmo", "pm",
    "pmc", "pmr", "ph", "ph1", "ph2", "ph3", "li", "li1", "li2", "li3", "li4",
    "lim", "lim1", "lim2", "q", "q1", "q2", "q3", "q4", "qc", "qr", "qm",
    "qm1", "qm2", "qm3", "b", "tr", "th1", "th2", "thr1", "thr2", "tc1",
    "tc2", "tcr1", "tcr2", "d", "sp", "qa", "qs",
}


def clean(text: str) -> str:
    """Retire notes, références croisées et marqueurs de caractère."""
    prev = None
    while prev != text:  # notes imbriquées
        prev = text
        text = NOTE_RE_GENERIC.sub(" ", text)
    # notes non refermées en fin de ligne
    text = re.sub(r"\\(?:x|f|fe|ef)\b.*$", " ", text)
    text = CHAR_MARKER_RE.sub("", text)
    text = OPEN_MARKER_RE.sub("", text)
    text = text.replace("\u00a0", " ")
    return WS_RE.sub(" ", text).strip()


def parse_book(path: Path) -> list[list[str]]:
    """Retourne la liste des chapitres ; chaque chapitre est une liste de versets."""
    chapters: list[list[str]] = []
    cur: list[str] | None = None
    verse: list[str] = []
    vnum = 0

    def flush() -> None:
        nonlocal verse, vnum
        if cur is not None and vnum:
            txt = clean(" ".join(verse))
            while len(cur) < vnum - 1:
                cur.append("")  # verset absent (rare)
            if len(cur) == vnum - 1:
                cur.append(txt)
            else:  # \v répété (ex. versets fusionnés "1-2")
                cur[vnum - 1] = (cur[vnum - 1] + " " + txt).strip()
        verse = []

    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"\\([a-z0-9]+)\*?\s*(.*)$", line, re.S)
        marker, rest = (m.group(1), m.group(2)) if m else ("", line)

        if marker == "c":
            flush()
            vnum = 0
            cur = []
            chapters.append(cur)
        elif marker == "v":
            flush()
            mv = re.match(r"(\d+)(?:[-–](\d+))?\s*(.*)$", rest, re.S)
            if not mv:
                continue
            num, body = int(mv.group(1)), mv.group(3)
            # Correction d'une coquille de la source : « \v 11 5Éloignez... »
            # au lieu de « \v 115 Éloignez... ». Le chiffre égaré est collé au
            # texte alors que le numéro reculerait — on le rattache au numéro.
            expected = len(cur) + 1 if cur is not None else 1
            md = re.match(r"(\d)(\D.*)$", body, re.S)
            if md and num < expected and int(f"{num}{md.group(1)}") == expected:
                num, body = expected, md.group(2)
            vnum, verse = num, [body]
        elif marker in CONTINUATION or marker == "":
            if vnum:
                verse.append(rest if m else line)
        # tout autre marqueur (\id \h \mt \ip \io \s \r ...) est ignoré
    flush()
    return chapters


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/lsg")
    files = {}
    for p in src.rglob("*.sfm"):
        m = re.search(r"-(\d\d)-([A-Z0-9]{3})\.", p.name)
        if m:
            files[m.group(2)] = p

    out_books = []
    total_v = total_c = 0
    problems = []
    for abbr, name, testament in BOOKS:
        p = files.get(abbr)
        if not p:
            problems.append(f"livre manquant : {abbr}")
            continue
        chapters = parse_book(p)
        if not chapters:
            problems.append(f"aucun chapitre : {abbr}")
        empties = sum(1 for ch in chapters for v in ch if not v)
        if empties:
            problems.append(f"{abbr}: {empties} verset(s) vide(s)")
        total_c += len(chapters)
        total_v += sum(len(ch) for ch in chapters)
        out_books.append({"a": abbr, "n": name, "t": testament, "c": chapters})

    data = {
        "version": "Louis Segond 1910",
        "licence": "Domaine public",
        "books": out_books,
    }
    dest = Path(__file__).resolve().parent.parent / "data" / "bible_lsg.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"livres   : {len(out_books)}")
    print(f"chapitres: {total_c}")
    print(f"versets  : {total_v}")
    print(f"fichier  : {dest} ({dest.stat().st_size / 1e6:.1f} Mo)")
    for w in problems[:20]:
        print("  ⚠", w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
