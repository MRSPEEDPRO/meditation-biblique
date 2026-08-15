#!/usr/bin/env python3
"""Génère les 16 plans de lecture (data/plans.json) puis data/embed_data.js,
le fichier unique de données que build.py intègre dans index.html.

Usage : python3 data/gen_plans.py
"""
from __future__ import annotations

import base64
import gzip
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent
ROOT = DATA.parent

# --- Plans thématiques de 7 jours ------------------------------------------
THEMATIC: list[tuple[str, str, str, str, list[tuple[str, str]]]] = [
    ("t-foi", "7 jours de foi", "🌱",
     "Une semaine pour affermir sa confiance en Dieu.", [
         ("HEB 11:1-6", "La foi, ferme assurance"),
         ("MRK 11:20-24", "Ayez foi en Dieu"),
         ("MAT 17:14-20", "Grand comme un grain de sénevé"),
         ("ROM 10:8-17", "La foi vient de ce qu'on entend"),
         ("JAS 1:2-8", "Demander avec foi"),
         ("2CO 5:1-10", "Marcher par la foi"),
         ("HEB 11:32-40", "La nuée de témoins"),
     ]),
    ("t-amour", "7 jours dans l'amour de Dieu", "❤️",
     "Découvrir la profondeur de l'amour du Père.", [
         ("JHN 3:16-21", "Dieu a tant aimé le monde"),
         ("ROM 8:31-39", "Rien ne peut nous séparer"),
         ("1JN 4:7-21", "Dieu est amour"),
         ("PSA 103:1-14", "Sa compassion de père"),
         ("LUK 15:11-24", "Le père qui court"),
         ("EPH 3:14-21", "La largeur et la longueur"),
         ("1CO 13:1-13", "Le plus grand, c'est l'amour"),
     ]),
    ("t-esperance", "7 jours d'espérance", "🌅",
     "Relever la tête quand tout semble sombre.", [
         ("JER 29:10-14", "Des projets de paix"),
         ("LAM 3:19-33", "Renouvelées chaque matin"),
         ("ROM 5:1-5", "L'espérance ne trompe point"),
         ("ISA 40:27-31", "De nouvelles forces"),
         ("ROM 8:18-25", "La gloire à venir"),
         ("1PE 1:3-9", "Une espérance vivante"),
         ("REV 21:1-7", "Il essuiera toute larme"),
     ]),
    ("t-paix", "7 jours de paix", "🕊️",
     "Trouver le repos intérieur au milieu du bruit.", [
         ("JHN 14:25-31", "Je vous laisse ma paix"),
         ("PHP 4:4-9", "La paix qui surpasse"),
         ("ISA 26:1-9", "Une paix parfaite"),
         ("PSA 23:1-6", "Près des eaux paisibles"),
         ("MAT 11:25-30", "Vous trouverez du repos"),
         ("COL 3:12-17", "Que la paix règne"),
         ("PSA 46:1-11", "Arrêtez, et sachez"),
     ]),
    ("t-gratitude", "7 jours de gratitude", "🙏",
     "Apprendre à rendre grâce en toutes choses.", [
         ("PSA 100:1-5", "Entrez avec des louanges"),
         ("1TH 5:12-24", "Rendez grâces en tout"),
         ("PSA 103:1-22", "N'oublie aucun de ses bienfaits"),
         ("LUK 17:11-19", "Un seul revint"),
         ("COL 3:15-17", "Avec reconnaissance"),
         ("PSA 136:1-9", "Sa miséricorde dure à toujours"),
         ("PHP 4:10-20", "J'ai appris à être content"),
     ]),
    ("t-courage", "7 jours de courage", "🦁",
     "Avancer malgré la peur, fortifié par Dieu.", [
         ("JOS 1:1-9", "Fortifie-toi et prends courage"),
         ("DEU 31:1-8", "Il ne te délaissera point"),
         ("PSA 27:1-14", "De qui aurais-je crainte ?"),
         ("ISA 41:8-13", "Ne crains rien, je suis avec toi"),
         ("1SA 17:32-50", "David devant Goliath"),
         ("2TI 1:6-14", "Un esprit de force"),
         ("EPH 6:10-20", "Les armes de Dieu"),
     ]),
    ("t-deuil", "7 jours de consolation", "🕯️",
     "Traverser le deuil accompagné par Dieu.", [
         ("PSA 23:1-6", "Même dans la vallée"),
         ("2CO 1:3-11", "Le Dieu de toute consolation"),
         ("PSA 34:15-22", "Près de ceux qui ont le cœur brisé"),
         ("JHN 11:17-44", "Jésus pleura"),
         ("1TH 4:13-18", "Une espérance pour ceux qui dorment"),
         ("ISA 61:1-3", "Un diadème au lieu de la cendre"),
         ("REV 21:1-7", "Plus de deuil ni de cri"),
     ]),
    ("t-travail", "7 jours sur le travail", "🛠️",
     "Donner du sens à son quotidien professionnel.", [
         ("GEN 2:4-15", "Cultiver et garder"),
         ("COL 3:17-25", "Comme pour le Seigneur"),
         ("ECC 3:9-15", "Jouir du fruit de son travail"),
         ("PRO 16:1-9", "Recommande à l'Éternel tes œuvres"),
         ("EXO 20:8-11", "Le repos du septième jour"),
         ("1TH 4:9-12", "Travailler de ses mains"),
         ("PSA 90:12-17", "Affermis l'ouvrage de nos mains"),
     ]),
    ("t-argent", "7 jours sur l'argent", "🪙",
     "Remettre les biens matériels à leur juste place.", [
         ("MAT 6:19-24", "Là où est ton trésor"),
         ("LUK 12:13-21", "L'insensé et ses greniers"),
         ("PHP 4:10-20", "J'ai appris à être content"),
         ("PRO 3:1-10", "Honore l'Éternel avec tes biens"),
         ("1TI 6:6-19", "La racine de tous les maux"),
         ("2CO 9:6-15", "Un donateur joyeux"),
         ("MRK 12:38-44", "Les deux pites de la veuve"),
     ]),
]

BOOK_ORDER: list[str] = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]
NT_START = BOOK_ORDER.index("MAT")


def load_bible() -> dict:
    return json.loads((DATA / "bible_lsg.json").read_text(encoding="utf-8"))


def chapter_list(bible: dict, abbrs: list[str]) -> list[str]:
    """Liste « ABBR c » pour tous les chapitres des livres donnés."""
    idx = {b["a"]: b for b in bible["books"]}
    out = []
    for a in abbrs:
        for c in range(1, len(idx[a]["c"]) + 1):
            out.append(f"{a} {c}")
    return out


def spread(items: list[str], days: int) -> list[list[str]]:
    """Répartit `items` sur `days` jours, au plus près d'une part égale."""
    n = len(items)
    base, extra = divmod(n, days)
    out, i = [], 0
    for d in range(days):
        take = base + (1 if d < extra else 0)
        out.append(items[i:i + take])
        i += take
    return out


def fmt_range(bible: dict, chunk: list[str]) -> str:
    """« GEN 1, GEN 2, GEN 3 » -> « Genèse 1-3 » (regroupé par livre)."""
    names = {b["a"]: b["n"] for b in bible["books"]}
    groups: list[tuple[str, list[int]]] = []
    for ref in chunk:
        a, c = ref.rsplit(" ", 1)
        if groups and groups[-1][0] == a:
            groups[-1][1].append(int(c))
        else:
            groups.append((a, [int(c)]))
    parts = []
    for a, cs in groups:
        parts.append(f"{names[a]} {cs[0]}" if len(cs) == 1
                     else f"{names[a]} {cs[0]}-{cs[-1]}")
    return " · ".join(parts)


def build_plans(bible: dict) -> list[dict]:
    plans: list[dict] = []

    def add(pid, name, icon, desc, days_chunks, kind="chapters"):
        plans.append({
            "id": pid, "n": name, "i": icon, "d": desc,
            "len": len(days_chunks), "kind": kind,
            "days": [{"r": refs, "t": title} for refs, title in days_chunks],
        })

    all_ch = chapter_list(bible, BOOK_ORDER)
    assert len(all_ch) == 1189, len(all_ch)
    add("bible-1an", "La Bible en 1 an", "📖",
        "Les 1 189 chapitres en 365 jours, environ 4 par jour.",
        [(ch, fmt_range(bible, ch)) for ch in spread(all_ch, 365)])

    nt = chapter_list(bible, BOOK_ORDER[NT_START:])
    add("nt-90", "Nouveau Testament en 90 jours", "✝️",
        "Les 260 chapitres du Nouveau Testament en trois mois.",
        [(ch, fmt_range(bible, ch)) for ch in spread(nt, 90)])

    gospels = chapter_list(bible, ["MAT", "MRK", "LUK", "JHN"])
    add("evangiles-40", "Évangiles en 40 jours", "🕊️",
        "Marcher avec Jésus pendant quarante jours.",
        [(ch, fmt_range(bible, ch)) for ch in spread(gospels, 40)])

    psalms = chapter_list(bible, ["PSA"])
    add("psaumes-30", "Psaumes en 30 jours", "🎵",
        "Les 150 psaumes en un mois, 5 par jour.",
        [(ch, fmt_range(bible, ch)) for ch in spread(psalms, 30)])

    proverbs = chapter_list(bible, ["PRO"])
    add("proverbes-31", "Proverbes en 31 jours", "🦉",
        "Un chapitre de sagesse par jour du mois.",
        [(ch, fmt_range(bible, ch)) for ch in spread(proverbs, 31)])

    sagesse = chapter_list(bible, ["JOB", "ECC", "SNG"])
    add("sagesse-30", "Livres de sagesse en 30 jours", "📜",
        "Job, l'Ecclésiaste et le Cantique des cantiques en un mois.",
        [(ch, fmt_range(bible, ch)) for ch in spread(sagesse, 30)])

    epitres = chapter_list(bible, BOOK_ORDER[BOOK_ORDER.index("ROM"):])
    add("epitres-60", "Les épîtres en 60 jours", "✉️",
        "De Romains à l'Apocalypse, la lettre aux premières Églises.",
        [(ch, fmt_range(bible, ch)) for ch in spread(epitres, 60)])

    for pid, name, icon, desc, days in THEMATIC:
        add(pid, name, icon, desc,
            [([r], t) for r, t in days], kind="passages")

    return plans


def validate(bible: dict, plans: list[dict]) -> list[str]:
    idx = {b["a"]: b for b in bible["books"]}
    errs: list[str] = []
    for p in plans:
        if p["len"] != len(p["days"]):
            errs.append(f"{p['id']}: longueur incohérente")
        for i, day in enumerate(p["days"], 1):
            if not day["r"]:
                errs.append(f"{p['id']} jour {i}: aucune lecture")
            for ref in day["r"]:
                m = re.match(r"^([A-Z0-9]{3}) (\d+)(?::(\d+)-(\d+))?$", ref)
                if not m:
                    errs.append(f"{p['id']} jour {i}: réf. invalide « {ref} »")
                    continue
                a, c = m.group(1), int(m.group(2))
                book = idx.get(a)
                if not book:
                    errs.append(f"{p['id']} jour {i}: livre inconnu {a}")
                elif c > len(book["c"]):
                    errs.append(f"{p['id']} jour {i}: {ref} hors limites")
                elif m.group(3):
                    v1, v2 = int(m.group(3)), int(m.group(4))
                    nv = len(book["c"][c - 1])
                    if v1 > nv or v2 > nv or v1 > v2:
                        errs.append(f"{p['id']} jour {i}: {ref} versets hors limites")
    # tous les chapitres de la Bible couverts par le plan 1 an
    one = next(p for p in plans if p["id"] == "bible-1an")
    covered = [r for d in one["days"] for r in d["r"]]
    if len(covered) != 1189 or len(set(covered)) != 1189:
        errs.append(f"bible-1an: {len(set(covered))} chapitres uniques au lieu de 1189")
    return errs


def add_english(plans: list[dict]) -> None:
    """Ajoute le nom et la description anglais (data/plans_en.json)."""
    path = DATA / "plans_en.json"
    if not path.exists():
        return
    en = json.loads(path.read_text(encoding="utf-8"))
    for p in plans:
        tr = en.get(p["id"])
        if not tr:
            continue
        p["ne"] = tr["n"]
        p["de"] = tr["d"]
        titles = tr.get("days")
        if titles and len(titles) == len(p["days"]):
            for day, t in zip(p["days"], titles):
                day["te"] = t


def main() -> int:
    bible = load_bible()
    plans = build_plans(bible)
    errs = validate(bible, plans)
    if errs:
        print(f"❌ {len(errs)} problème(s) :")
        for e in errs[:30]:
            print("  -", e)
        return 1
    add_english(plans)

    (DATA / "plans.json").write_text(
        json.dumps(plans, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    themes = json.loads((DATA / "themes.json").read_text(encoding="utf-8"))
    daily = json.loads((DATA / "daily_verses.json").read_text(encoding="utf-8"))
    i18n = json.loads((DATA / "i18n.json").read_text(encoding="utf-8"))
    ui_en = json.loads((DATA / "ui_en.json").read_text(encoding="utf-8"))
    ui_en.pop("_comment", None)

    # --- Versions bibliques -------------------------------------------------
    # Chaque version est un texte compact (séparateurs \x1e entre versets,
    # \x1d entre chapitres, \x1c entre livres) compressé en gzip puis encodé
    # en base64. Elles sont décompressées à la demande, jamais toutes à la fois.
    vdir = DATA / "versions"
    vindex = json.loads((vdir / "index.json").read_text(encoding="utf-8"))
    books = vindex["books"]

    versions = []
    blobs = []
    for v in vindex["versions"]:
        vid = v["id"]
        versions.append({
            "id": vid, "nfr": v["nfr"], "nen": v["nen"], "lang": v["lang"],
            "year": v["year"], "licence": v["licence"],
            "v": v["v"], "map": v.get("map", {}),
        })
        blobs.append((vid, (vdir / f"{vid}.b64").read_text(encoding="utf-8")))

    # métadonnées des livres : abréviation, nom FR, nom EN, testament
    meta = [{"a": b["a"], "n": b["fr"], "en": b["en"], "t": b["t"]}
            for b in books]

    def j(o):
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

    parts = [
        "/* Données générées par data/gen_plans.py — ne pas éditer à la main. */\n",
        f"window.BIBLE_META={j(meta)};\n",
        f"window.VERSIONS={j(versions)};\n",
        "window.BIBLE_BLOBS={};\n",
    ]
    for vid, blob in blobs:
        parts.append(f'window.BIBLE_BLOBS["{vid}"]="{blob}";\n')
    # compatibilité : la version par défaut reste accessible sous BIBLE_BLOB
    parts.append('window.BIBLE_BLOB=window.BIBLE_BLOBS["LSG"];\n')
    parts.append(f"window.I18N={j(i18n)};\n")
    parts.append(f"window.UI_EN={j(ui_en)};\n")
    parts.append(f"window.THEMES={j(themes)};\n")
    parts.append(f"window.DAILY={j(daily)};\n")
    parts.append(f"window.PLANS={j(plans)};\n")

    out = DATA / "embed_data.js"
    out.write_text("".join(parts), encoding="utf-8")

    print(f"✅ plans   : {len(plans)}")
    for p in plans:
        print(f"   {p['i']} {p['n']:34} {p['len']:3} jours")
    print(f"✅ thèmes  : {len(themes)} · versets du jour : {len(daily)}")
    print(f"✅ versions: {len(versions)} — "
          + ", ".join(f"{v['id']}({v['lang']})" for v in versions))
    print(f"✅ {out.name} : {out.stat().st_size / 1e6:.2f} Mo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
