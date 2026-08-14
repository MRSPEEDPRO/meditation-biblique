#!/usr/bin/env python3
"""Assemble l'application complète dans un fichier unique : index.html

  src/index.template.html  squelette
  src/styles.css           styles
  src/inflate.js           décompression gzip embarquée
  data/embed_data.js       Bible + thèmes + plans + versets du jour
  src/app.js               logique de l'application

Usage : python3 build.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DATA = ROOT / "data"
OUT = ROOT / "index.html"


def read(p: Path) -> str:
    if not p.exists():
        sys.exit(f"❌ fichier manquant : {p.relative_to(ROOT)}")
    return p.read_text(encoding="utf-8")


def main() -> int:
    template = read(SRC / "index.template.html")
    css = read(SRC / "styles.css")
    inflate = read(SRC / "inflate.js")
    data = read(DATA / "embed_data.js")
    app = read(SRC / "app.js")

    # Un « </script> » à l'intérieur d'une chaîne JS fermerait la balise :
    # on le neutralise (aucune occurrence attendue, sécurité de principe).
    def safe(js: str) -> str:
        return js.replace("</script>", "<\\/script>")

    html = template
    for token, content in (
        ("/*__CSS__*/", css),
        ("/*__INFLATE__*/", safe(inflate)),
        ("/*__DATA__*/", safe(data)),
        ("/*__APP__*/", safe(app)),
    ):
        if token not in html:
            sys.exit(f"❌ marqueur absent du gabarit : {token}")
        # remplacement littéral (le contenu peut comporter des séquences \g<...>)
        html = html.replace(token, content)

    OUT.write_text(html, encoding="utf-8")

    size = OUT.stat().st_size
    print(f"✅ {OUT.name} construit — {size / 1e6:.2f} Mo")
    print(f"   CSS {len(css) / 1e3:.0f} ko · app {len(app) / 1e3:.0f} ko · "
          f"données {len(data) / 1e6:.2f} Mo")
    # contrôles rapides
    problems = []
    if "/*__" in html:
        problems.append("un marqueur n'a pas été remplacé")
    if html.count("<script>") != html.count("</script>"):
        problems.append("balises <script> déséquilibrées")
    for w in problems:
        print("  ⚠", w)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
