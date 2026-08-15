/* ==========================================================================
   Méditation Biblique — logique de l'application
   Tout fonctionne hors-ligne : aucune requête réseau n'est effectuée.
   Données injectées par build.py :
     BIBLE_META, BIBLE_BLOBS, VERSIONS, I18N, THEMES, DAILY, PLANS
   ========================================================================== */
(function () {
  "use strict";

  // --- Langue de l'interface ------------------------------------------------
  var I18N = window.I18N || { fr: {}, en: {} };
  var LANGUES = ["fr", "en"];
  var langue = "fr";        // fixé par applySettings() au démarrage

  function t(cle, repli) {
    var table = I18N[langue] || {};
    if (table[cle] !== undefined) return table[cle];
    if (I18N.fr && I18N.fr[cle] !== undefined) return I18N.fr[cle];
    return repli !== undefined ? repli : cle;
  }

  // Choisit le champ français ou anglais d'un objet de contenu
  // (thèmes et plans portent « n »/« ne », « d »/« de », « t »/« te »).
  function loc(obj, champ) {
    if (!obj) return "";
    if (langue === "en" && obj[champ + "e"]) return obj[champ + "e"];
    return obj[champ] || "";
  }

  // --- Versions de la Bible -------------------------------------------------
  var META = window.BIBLE_META || [];
  var VERSIONS = window.VERSIONS || [];
  var BLOBS = window.BIBLE_BLOBS || {};
  var VERSION_DEFAUT = "LSG";

  var CACHE = {};            // {versionId: [{a,n,t,c:[[verset,...],...]}]}
  var version = VERSION_DEFAUT;   // version courante (fixée par applySettings)

  function versionInfo(id) {
    for (var i = 0; i < VERSIONS.length; i++) {
      if (VERSIONS[i].id === id) return VERSIONS[i];
    }
    return null;
  }

  function versionNom(id) {
    var v = versionInfo(id);
    if (!v) return id;
    return langue === "en" ? v.nen : v.nfr;
  }

  function versionsParLangue(lg) {
    return VERSIONS.filter(function (v) { return v.lang === lg; });
  }

  // Le nom des livres suit la langue de l'interface.
  function nomLivre(m) {
    return (langue === "en" && m.en) ? m.en : m.n;
  }

  // Reconstruit la structure des livres à partir du texte compact décompressé.
  function construireBible(text, id) {
    var rawBooks = text.split("\u001c");
    var books = META.map(function (m, bi) {
      return {
        a: m.a, n: nomLivre(m), t: m.t,
        c: rawBooks[bi].split("\u001d").map(function (ch) {
          return ch.split("\u001e");
        })
      };
    });
    CACHE[id || version] = books;
    return books;
  }

  // Décompresse une version (et la garde en mémoire).
  function inflateVersion(id) {
    if (CACHE[id]) return CACHE[id];
    var blob = BLOBS[id] || BLOBS[VERSION_DEFAUT];
    if (!blob) return null;
    var bin = atob(blob);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return construireBible(window.gunzipToString(bytes), id);
  }

  function inflate() {
    var b = inflateVersion(version) || inflateVersion(VERSION_DEFAUT);
    if (b && BOOKS !== b) {
      BOOKS = b;
      BY_ABBR = {};
      BOOKS.forEach(function (x) { BY_ABBR[x.a] = x; });
    }
    return BOOKS;
  }

  // Les vues parcourent BOOKS / BY_ABBR : on les recalcule à chaque changement
  // de version ou de langue.
  var BOOKS = null;
  var BY_ABBR = {};

  function actualiserBooks() {
    BOOKS = null;
    return inflate();
  }

  // Renomme les livres déjà en cache après un changement de langue.
  function renommerLivres() {
    Object.keys(CACHE).forEach(function (id) {
      CACHE[id].forEach(function (b, bi) {
        if (META[bi]) b.n = nomLivre(META[bi]);
      });
    });
    if (BOOKS) actualiserBooks();
  }

  // --- Numérotation des versets --------------------------------------------
  // Les traditions ne numérotent pas toujours de la même façon : le titre des
  // psaumes compte comme verset 1 en français mais pas en anglais, « Jonas 2:1 »
  // devient « Jonah 1:17 »… Les références de l'application sont exprimées dans
  // la numérotation Louis Segond ; on les convertit vers la version affichée.
  var indexLivre = {};
  META.forEach(function (m, i) { indexLivre[m.a] = i; });

  // Retourne {c, v} dans la version `id`, ou null si le verset n'existe pas.
  function mapVerset(id, abbr, c, v) {
    var info = versionInfo(id);
    var bi = indexLivre[abbr];
    if (!info || bi === undefined || !info.map) return { c: c, v: v };
    var table = info.map[bi + "." + (c - 1)];
    if (!table) return { c: c, v: v };
    if (v < 1 || v > table.length) return null;
    var e = table[v - 1];
    if (!e) return null;
    if (typeof e === "string") {
      var parts = e.split(":");
      return { c: +parts[0], v: +parts[1] };
    }
    return { c: c, v: e };
  }

  // --- Références ----------------------------------------------------------
  function parseRef(ref) {
    var m = /^([A-Z0-9]{3}) (\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(ref);
    if (!m) return null;
    return {
      a: m[1],
      c: +m[2],
      v: m[3] ? +m[3] : null,
      v2: m[4] ? +m[4] : (m[3] ? +m[3] : null)
    };
  }

  function bookName(abbr) {
    var b = BY_ABBR[abbr];
    if (b) return b.n;
    for (var i = 0; i < META.length; i++) {
      if (META[i].a === abbr) return nomLivre(META[i]);
    }
    return abbr;
  }

  function refLabel(ref) {
    var p = parseRef(ref);
    if (!p) return ref;
    var s = bookName(p.a) + " " + p.c;
    if (p.v) s += ":" + p.v + (p.v2 && p.v2 !== p.v ? "-" + p.v2 : "");
    return s;
  }

  // Texte d'une référence dans une version donnée (par défaut, la courante).
  function verseTextIn(id, ref) {
    var books = inflateVersion(id);
    var p = parseRef(ref);
    if (!books || !p) return "";
    var bi = indexLivre[p.a];
    if (bi === undefined || !books[bi]) return "";
    var b = books[bi];
    if (!p.v) {
      var ch0 = b.c[p.c - 1];
      return ch0 ? ch0.join(" ") : "";
    }
    var out = [];
    for (var v = p.v; v <= (p.v2 || p.v); v++) {
      var m = mapVerset(id, p.a, p.c, v);
      if (!m) continue;
      var ch = b.c[m.c - 1];
      if (ch && ch[m.v - 1]) out.push(ch[m.v - 1]);
    }
    return out.join(" ");
  }

  function verseText(ref) {
    inflate();
    return verseTextIn(version, ref);
  }

  // --- Stockage local ------------------------------------------------------
  var KEY = "meditation-biblique";
  var DEFAULTS = {
    favoris: [],          // ["JHN 3:16", ...]
    notes: [],            // [{id, date, ref, texte}]
    plans: {},            // {planId: {faits: [n° de jour], debut: "AAAA-MM-JJ"}}
    reglages: {
      taille: 1, theme: "jour", rappel: false, vitesse: 0.9,
      lectureSuite: false,
      langue: "fr",          // langue de l'interface : "fr" | "en"
      version: "LSG"         // version biblique affichée
    },
    perso: null,          // {mode:"suivi"|"aleatoire", livre, chapitre|null, pos, vus}
    surlignes: {},        // {"JHN 3:16": "j"|"v"|"b"|"r"}
    lecture: null,        // {a, c} dernière position de lecture
    proseLignes: false,   // affichage « un verset par ligne »
    lu: {},               // {"AAAA-MM-JJ": "REF"} — historique verset du jour
    serie: { dernier: null, jours: 0, record: 0 },
    histo: [],            // ["AAAA-MM-JJ", ...] jours où l'on a médité
    profil: null,         // {nom, avatar, heure|null, depuis:"AAAA-MM-JJ"}
    garde: null           // {vu, jours, sceau} — cohérence de la progression
  };

  var S = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      var o = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (o[k] === undefined) o[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
      });
      Object.keys(DEFAULTS.reglages).forEach(function (k) {
        if (o.reglages[k] === undefined) o.reglages[k] = DEFAULTS.reglages[k];
      });
      return o;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
      } catch (e) {
        toast("Stockage plein : impossible d'enregistrer.");
      }
    }, 120);
  }

  // --- Dates ---------------------------------------------------------------
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
              "août", "septembre", "octobre", "novembre", "décembre"];
  var JOURS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                  "Friday", "Saturday"];
  var MOIS_EN = ["January", "February", "March", "April", "May", "June",
                 "July", "August", "September", "October", "November",
                 "December"];

  function ymd(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  // Date en toutes lettres, dans la langue de l'interface.
  function frDate(d) {
    if (langue === "en") {
      return JOURS_EN[d.getDay()] + " " + d.getDate() + " " +
        MOIS_EN[d.getMonth()] + " " + d.getFullYear();
    }
    return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] +
      " " + d.getFullYear();
  }
  function dayNumber(d) {
    // nombre de jours depuis l'époque, en heure locale
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) +
      d.getFullYear() * 365 + Math.floor(d.getFullYear() / 4);
  }
  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  // --- Verset du jour ------------------------------------------------------
  var DAILY = window.DAILY || [];

  function dailyRefFor(date) {
    return DAILY[((dayNumber(date) % DAILY.length) + DAILY.length) % DAILY.length];
  }

  function persoRefFor(date) {
    var p = S.perso;
    if (!p) return null;
    inflate();
    var b = BY_ABBR[p.livre];
    if (!b) return null;
    var pool = [];
    var chapters = p.chapitre ? [p.chapitre] : b.c.map(function (_, i) { return i + 1; });
    chapters.forEach(function (c) {
      var n = b.c[c - 1] ? b.c[c - 1].length : 0;
      for (var v = 1; v <= n; v++) pool.push(p.livre + " " + c + ":" + v);
    });
    if (!pool.length) return null;
    var idx, cycle = 0;
    var sel = p.livre + "|" + (p.chapitre || 0) + "|" + (p.tirage || 0);
    if (p.mode === "aleatoire") {
      // tirage déterministe par jour, toujours différent de la veille
      var seed = dayNumber(date);
      idx = hash(seed + "|" + sel) % pool.length;
      var prev = hash((seed - 1) + "|" + sel) % pool.length;
      if (pool.length > 1 && idx === prev) idx = (idx + 1) % pool.length;
    } else {
      // suivi : un verset après l'autre, avec cycle en fin de passage
      var brut = (p.pos || 0) + (dayNumber(date) - (p.jour0 || dayNumber(new Date())));
      cycle = Math.floor(brut / pool.length);
      idx = brut % pool.length;
      if (idx < 0) { idx += pool.length; cycle -= 1; }
    }
    return { ref: pool[idx], total: pool.length, index: idx, cycle: cycle, pool: pool };
  }

  // Mémorise un verset rencontré dans le passage choisi
  function markVu(ref) {
    if (!S.perso) return;
    if (!S.perso.vus) S.perso.vus = [];
    if (S.perso.vus.indexOf(ref) === -1) {
      S.perso.vus.push(ref);
      if (S.perso.vus.length > 600) S.perso.vus.shift();
      save();
    }
  }

  function hash(s) {
    s = String(s);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  // --- Utilitaires DOM -----------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  var toastTimer = null;
  function toast(msg) {
    var old = $(".toast");
    if (old) old.remove();
    var t = el('<div class="toast" role="status" aria-live="polite">' + esc(tr(msg)) + "</div>");
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  function sheet(title, bodyHtml) {
    closeSheet();
    var bg = el('<div class="sheet-bg" role="dialog" aria-modal="true"></div>');
    var sh = el('<div class="sheet"><div class="sheet-grip"></div>' +
      (title ? "<h3>" + esc(title) + "</h3>" : "") +
      '<div class="sheet-body"></div></div>');
    $(".sheet-body", sh).innerHTML = bodyHtml;
    traduireArbre(sh);
    bg.appendChild(sh);
    bg.addEventListener("click", function (e) { if (e.target === bg) closeSheet(); });
    document.body.appendChild(bg);
    document.body.style.overflow = "hidden";
    return sh;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if ($(".sheet-bg")) { closeSheet(); return; }
    if ($(".reader")) closeReader();
  });

  function closeSheet() {
    var bg = $(".sheet-bg");
    if (bg) bg.remove();
    document.body.style.overflow = "";
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSheet();
  });

  // --- Partage -------------------------------------------------------------
  function shareText(ref) {
    return "« " + verseText(ref) + " »\n— " + refLabel(ref) +
      " (" + versionNom(version) + ")";
  }

  function shareRow(ref) {
    var txt = shareText(ref);
    var enc = encodeURIComponent(txt);
    var url = encodeURIComponent(location.href.split("#")[0]);
    return '<div class="share-row">' +
      '<a class="share-btn sh-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + enc + '">WhatsApp</a>' +
      '<a class="share-btn sh-tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + url + "&text=" + enc + '">Telegram</a>' +
      '<a class="share-btn sh-fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + url + "&quote=" + enc + '">Facebook</a>' +
      '<a class="share-btn sh-x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + enc + '">X</a>' +
      '<a class="share-btn sh-em" href="mailto:?subject=' + encodeURIComponent("Un verset pour vous : " + refLabel(ref)) + "&body=" + enc + '">E-mail</a>' +
      '<button class="share-btn sh-cp" data-copy="' + esc(txt) + '">Copier</button>' +
      "</div>";
  }

  // --- Carte-verset en image (canvas, hors-ligne) --------------------------
  var CARTES = [
    { id: "sauge", nom: "Sauge", a: "#e8efe6", b: "#c3d5bd", t: "#243027", r: "#4c6b53" },
    { id: "aube", nom: "Aube", a: "#fdeee2", b: "#f3cfae", t: "#3b2a1c", r: "#8a5a33" },
    { id: "nuit", nom: "Nuit", a: "#1d2430", b: "#2f3d4f", t: "#f2f5f8", r: "#9fc0d8" },
    { id: "papier", nom: "Papier", a: "#faf8f3", b: "#ece5d6", t: "#2b2822", r: "#7a6a4f" }
  ];

  // Découpe un texte en lignes tenant dans une largeur donnée.
  function couperLignes(ctx, texte, largeur) {
    var mots = String(texte).split(/\s+/);
    var lignes = [];
    var courante = "";
    mots.forEach(function (m) {
      var essai = courante ? courante + " " + m : m;
      if (ctx.measureText(essai).width > largeur && courante) {
        lignes.push(courante);
        courante = m;
      } else courante = essai;
    });
    if (courante) lignes.push(courante);
    return lignes;
  }

  function dessinerCarte(canvas, ref, palette) {
    var W = 1080, H = 1080;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return null;   // environnement sans canvas : on n'affiche rien
    var p = palette;

    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.a);
    g.addColorStop(1, p.b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // cadre discret
    ctx.strokeStyle = p.r;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.strokeRect(54, 54, W - 108, H - 108);
    ctx.globalAlpha = 1;

    var texte = verseText(ref);
    if (texte.length > 320) texte = texte.slice(0, 317).replace(/\s+\S*$/, "") + "…";

    // taille de police adaptée à la longueur du verset
    var taille = texte.length > 240 ? 42 : texte.length > 160 ? 50 : texte.length > 90 ? 58 : 68;
    var marge = 130;
    var lignes;
    for (;;) {
      ctx.font = "italic " + taille + "px Georgia, 'Times New Roman', serif";
      lignes = couperLignes(ctx, "« " + texte + " »", W - marge * 2);
      if (lignes.length * taille * 1.42 <= H - 430 || taille <= 30) break;
      taille -= 4;
    }

    ctx.fillStyle = p.t;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var interligne = taille * 1.42;
    var depart = H / 2 - ((lignes.length - 1) * interligne) / 2 - 30;
    lignes.forEach(function (l, i) {
      ctx.fillText(l, W / 2, depart + i * interligne);
    });

    // référence
    var bas = depart + lignes.length * interligne + 34;
    ctx.font = "600 40px Georgia, 'Times New Roman', serif";
    ctx.fillStyle = p.r;
    ctx.fillText("— " + refLabel(ref), W / 2, bas);

    // pied de carte
    ctx.font = "26px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.globalAlpha = 0.75;
    ctx.fillText(versionNom(version), W / 2, H - 120);
    ctx.font = "28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.globalAlpha = 0.9;
    ctx.fillText("🌿 Méditation Biblique", W / 2, H - 78);
    ctx.globalAlpha = 1;
    return canvas;
  }

  function carteSheet(ref) {
    var choix = CARTES[0];
    var h = '<p class="muted" style="font-size:.88rem;margin:.2rem 0 1rem">' +
      "Une image carrée, prête à envoyer sur WhatsApp ou à publier.</p>" +
      '<canvas id="cv-canvas" class="cv-preview" aria-label="Aperçu de la carte"></canvas>' +
      '<div class="cv-palettes">';
    CARTES.forEach(function (p, i) {
      h += '<button class="cv-sw' + (i === 0 ? " on" : "") + '" data-cvp="' + p.id +
        '" title="' + esc(p.nom) + '" aria-label="Fond ' + esc(p.nom) + '" ' +
        'style="background:linear-gradient(135deg,' + p.a + "," + p.b + ')"></button>';
    });
    h += "</div>" +
      '<div class="grid two" style="margin-top:14px">' +
      '<button class="btn primary" id="cv-dl">⬇ Enregistrer</button>' +
      '<button class="btn" id="cv-share">📲 Partager</button></div>' +
      '<button class="btn block" style="margin-top:8px" data-close>Fermer</button>';

    sheet("Carte du verset", h);
    var canvas = $("#cv-canvas");
    if (!dessinerCarte(canvas, ref, choix)) {
      toast("Images non prises en charge par ce navigateur");
      return;
    }

    $$("[data-cvp]").forEach(function (b) {
      b.addEventListener("click", function () {
        CARTES.forEach(function (p) { if (p.id === b.dataset.cvp) choix = p; });
        $$("[data-cvp]").forEach(function (o) { o.classList.toggle("on", o === b); });
        dessinerCarte(canvas, ref, choix);
      });
    });

    function versBlob(cb) {
      if (canvas.toBlob) canvas.toBlob(cb, "image/png");
      else cb(null);
    }
    var nomFichier = "verset-" + ref.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() + ".png";

    $("#cv-dl").addEventListener("click", function () {
      versBlob(function (blob) {
        var a = document.createElement("a");
        a.download = nomFichier;
        a.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (blob) URL.revokeObjectURL(a.href);
          a.remove();
        }, 400);
        toast("Image enregistrée ✓");
      });
    });

    $("#cv-share").addEventListener("click", function () {
      versBlob(function (blob) {
        if (!blob || !navigator.canShare) { toast("Partage d'image non disponible — enregistrez-la"); return; }
        var f = new File([blob], nomFichier, { type: "image/png" });
        if (!navigator.canShare({ files: [f] })) {
          toast("Partage d'image non disponible — enregistrez-la");
          return;
        }
        navigator.share({ files: [f], text: shareText(ref) }).catch(function () {});
      });
    });
  }

  // --- Comparaison des versions --------------------------------------------
  // Affiche le même verset dans toutes les traductions embarquées. Chaque
  // version est décompressée à la demande, puis conservée en mémoire.
  function comparerSheet(ref) {
    if (!ref) {
      // par défaut : le verset affiché aujourd'hui
      var inf = S.perso && S.perso.actif !== false ? persoRefFor(new Date()) : null;
      ref = inf ? inf.ref : dailyRefFor(addDays(new Date(), -offset));
    }
    var sh = sheet(t("ver.compare"),
      '<p class="muted" style="font-size:.9rem;margin:.2rem 0 .2rem">' +
      esc(refLabel(ref)) + "</p>" +
      '<p class="muted" style="font-size:.78rem;margin:0 0 1rem">' +
      esc(t("ver.note.versification")) + "</p>" +
      '<div id="cmp-list"><p class="muted">' + esc(t("misc.loading")) + "</p></div>" +
      '<button class="btn block" style="margin-top:12px" data-close>' +
      esc(t("act.close")) + "</button>");

    // rendu différé : laisse le panneau s'ouvrir avant de décompresser
    setTimeout(function () {
      var box = $("#cmp-list", sh);
      if (!box) return;
      var h = "";
      [["fr", t("ver.french")], ["en", t("ver.english")]].forEach(function (g) {
        var liste = versionsParLangue(g[0]);
        if (!liste.length) return;
        h += '<div class="cmp-lang">' + esc(g[1]) + "</div>";
        liste.forEach(function (v) {
          var txt = verseTextIn(v.id, ref);
          h += '<div class="cmp-item' + (v.id === version ? " on" : "") + '">' +
            '<div class="cmp-head"><span class="ver-id">' + esc(v.id) + "</span>" +
            '<span class="cmp-name">' + esc(langue === "en" ? v.nen : v.nfr) + "</span>" +
            '<button class="btn xs" data-copy="' + esc(txt) + '">' +
            esc(t("act.copy")) + "</button></div>" +
            '<p class="cmp-text">' + (txt ? esc(txt) : "—") + "</p></div>";
        });
      });
      box.innerHTML = h;
      traduireArbre(box);
    }, 30);
    return sh;
  }

  function openShare(ref) {
    var sh = sheet("Partager ce verset",
      '<p class="muted" style="font-size:.9rem;margin:.2rem 0 1rem">' +
      esc(refLabel(ref)) + "</p>" + shareRow(ref) +
      '<button class="btn block" style="margin-top:12px" data-carte="' + ref + '">🖼 Créer une carte image</button>' +
      '<button class="btn block" style="margin-top:8px" data-close>Fermer</button>');
    if (navigator.share) {
      var nat = el('<button class="btn primary block" style="margin-bottom:12px">📲 Partager…</button>');
      nat.addEventListener("click", function () {
        navigator.share({ text: shareText(ref) }).catch(function () {});
      });
      $(".sheet-body", sh).insertBefore(nat, $(".sheet-body", sh).firstChild);
    }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("Copié ✓"); },
        function () { fallbackCopy(text); }
      );
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Copié ✓"); }
    catch (e) { toast("Copie impossible"); }
    ta.remove();
  }

  // --- Synthèse vocale -----------------------------------------------------
  // Ponctuation adaptée à l'oral (virgules, points, respirations), vitesse
  // unifiée avec la lecture de chapitre, attente des voix avant la première
  // lecture, et garde anti-coupure : Chrome interrompt l'audio au-delà de
  // ~15 s, un discret pause()/resume() toutes les 9 s relance le compte.
  var speaking = false;        // « Écouter » en cours
  var ENONCE = false;          // un énoncé (Écouter ou chapitre) est en cours
  var GARDE_DELAI = 9000;      // anti-coupure : intervalle de relance (ms)
  var gardeTimer = null;
  var VOIX_ATTENTES = false;   // les voix ont déjà été chargées une fois
  var RESPIRATION = 260;       // respiration entre deux versets (ms)

  // « : » → virgule · « ; » → point ou virgule selon la suite · guillemets
  // retirés · tirets cadratins et « … » transformés en respirations.
  function normaliserPonctuation(t) {
    if (typeof t !== "string" || !t) return t;
    return t
      .replace(/[«»“”"]/g, "")              // guillemets retirés
      .replace(/[—–]/g, ",")                // tirets cadratins → respiration
      .replace(/…/g, ",")                   // points de suspension → respiration
      .replace(/:/g, ",")                   // deux-points → virgule
      .replace(/;\s*([A-ZÀÂÄÇÈÉÊËÎÏÔÙÛÜŸŒ])/g, ". $1")  // « ; » + majuscule → point
      .replace(/;/g, ",")                   // « ; » + minuscule → virgule
      .replace(/([!?])\s*,/g, "$1")         // « ! , » / « ? , » → « ! » / « ? »
      .replace(/,\./g, ".")                 // « , . » → point
      .replace(/\.\s*,/g, ".")              // « . , » → point
      .replace(/,\s*,/g, ",")               // « , , » → une seule virgule
      .replace(/,([^\s,])/g, ", $1")        // toujours un espace après la virgule
      .replace(/[ \t\u00A0]{2,}/g, " ")     // espaces multiples → un espace
      .replace(/^[\s,]+/, "")               // pas de respiration en tête
      .replace(/[\s,]+$/, "");              // ni en queue
  }

  // Voix classées : françaises d'abord, puis par langue, puis par nom.
  function voixTriees() {
    var s = window.speechSynthesis;
    var voices = (s && typeof s.getVoices === "function") ? (s.getVoices() || []) : [];
    return voices.slice().sort(function (a, b) {
      var af = /^fr/i.test(a.lang || "") ? 0 : 1;
      var bf = /^fr/i.test(b.lang || "") ? 0 : 1;
      if (af !== bf) return af - bf;
      var al = String(a.lang || ""), bl = String(b.lang || "");
      if (al !== bl) return al < bl ? -1 : 1;
      var an = String(a.name || ""), bn = String(b.name || "");
      return an === bn ? 0 : (an < bn ? -1 : 1);
    });
  }

  function voixFr() {
    var v = voixTriees();
    for (var i = 0; i < v.length; i++) {
      if (/^fr/i.test(v[i].lang || "")) return v[i];
    }
    return null;
  }

  function gardeTic() {
    try {
      var s = window.speechSynthesis;
      if (s && !LECT.pause && s.speaking &&
          typeof s.pause === "function" && typeof s.resume === "function") {
        s.pause();
        s.resume();
      }
    } catch (e) { /* aucune conséquence */ }
  }

  function armerGarde() {
    if (gardeTimer) return;
    gardeTimer = setInterval(gardeTic, GARDE_DELAI);
  }

  function desarmerGarde() {
    if (!gardeTimer) return;
    clearInterval(gardeTimer);
    gardeTimer = null;
  }

  // Garde armée tant qu'un énoncé est en cours (Écouter ou lecture de chapitre).
  function garderEnonciation() {
    if (ENONCE) return;
    ENONCE = true;
    armerGarde();
  }

  function relacherEnonciation() {
    if (!ENONCE) return;
    ENONCE = false;
    desarmerGarde();
  }

  // Les voix se chargent de façon asynchrone : on attend la première liste
  // (événement « voiceschanged », repli 1,2 s) avant de lire.
  function attendreVoix(cb) {
    var s = window.speechSynthesis;
    if (VOIX_ATTENTES) { cb(); return; }
    var liste = (s && typeof s.getVoices === "function") ? (s.getVoices() || []) : [];
    if (liste.length) { VOIX_ATTENTES = true; cb(); return; }
    var fait = false;
    var fin = function () {
      if (fait) return;
      fait = true;
      try { s.removeEventListener("voiceschanged", fin); } catch (e) { /* rien */ }
      VOIX_ATTENTES = true;
      cb();
    };
    try { s.addEventListener("voiceschanged", fin); } catch (e) { /* rien */ }
    setTimeout(fin, 1200);
  }

  function speak(text, btn) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
      toast("Lecture audio non disponible"); return;
    }
    if (speaking) {  // seconde pression : on arrête
      speaking = false;
      relacherEnonciation();
      if (btn) btn.classList.remove("on");
      try { window.speechSynthesis.cancel(); } catch (e) { /* rien */ }
      return;
    }
    if (LECT.actif) stopLecture(true);   // ne pas chevaucher la lecture de chapitre
    speaking = true;
    if (btn) btn.classList.add("on");
    garderEnonciation();
    attendreVoix(function () {
      if (!speaking) return;             // arrêté pendant l'attente des voix
      var u = new SpeechSynthesisUtterance(normaliserPonctuation(text));
      u.lang = "fr-FR";
      u.rate = lectureVitesse();         // vitesse unifiée avec la lecture de chapitre
      var v = voixFr();
      if (v) u.voice = v;
      u.onend = u.onerror = function () {
        speaking = false;
        relacherEnonciation();
        if (btn) btn.classList.remove("on");
      };
      try { window.speechSynthesis.speak(u); }
      catch (e) {
        speaking = false;
        relacherEnonciation();
        if (btn) btn.classList.remove("on");
      }
    });
  }

  // --- Rappel de méditation (notification locale, facultatif) --------------
  // Aucune donnée ne part de l'appareil : la notification est déclenchée
  // localement par un minuteur, tant que l'application reste ouverte.
  var rappelTimer = null;

  function rappelsDisponibles() {
    return typeof window.Notification !== "undefined";
  }
  function rappelsActifs() {
    return !!(S.reglages.rappel && rappelsDisponibles() &&
      window.Notification.permission === "granted");
  }

  function demanderRappel() {
    if (!rappelsDisponibles()) { toast("Notifications non prises en charge"); return; }
    if (!S.profil || !S.profil.heure) {
      toast("Choisissez d'abord une heure dans votre profil");
      return;
    }
    window.Notification.requestPermission().then(function (p) {
      if (p === "granted") {
        S.reglages.rappel = true;
        save();
        planifierRappel();
        toast("Rappel activé pour " + S.profil.heure + " ⏰");
      } else {
        S.reglages.rappel = false;
        save();
        toast("Notifications refusées par le navigateur");
      }
      render();
    }).catch(function () { toast("Notifications indisponibles"); });
  }

  function couperRappel() {
    S.reglages.rappel = false;
    save();
    clearTimeout(rappelTimer);
    rappelTimer = null;
    render();
    toast("Rappel désactivé");
  }

  function planifierRappel() {
    clearTimeout(rappelTimer);
    rappelTimer = null;
    if (!rappelsActifs() || !S.profil || !S.profil.heure) return;
    var hm = /^(\d{1,2}):(\d{2})$/.exec(S.profil.heure);
    if (!hm) return;
    var maintenant = new Date();
    var cible = new Date(maintenant);
    cible.setHours(+hm[1], +hm[2], 0, 0);
    if (cible <= maintenant) cible.setDate(cible.getDate() + 1);
    var delai = cible - maintenant;
    if (delai > 86400000) return;
    rappelTimer = setTimeout(function () {
      try {
        if (S.serie.dernier !== ymd(new Date())) {
          var ref = dailyRefFor(new Date());
          new window.Notification("🌿 Votre méditation du jour", {
            body: refLabel(ref) + " — " + verseText(ref).slice(0, 110) + "…",
            tag: "meditation-jour",
            lang: "fr"
          });
        }
      } catch (e) { /* notification refusée entre-temps */ }
      planifierRappel();
    }, delai);
  }

  // --- Lecture audio d'un chapitre entier ----------------------------------
  // Chaque verset est prononcé séparément : on peut ainsi suivre la lecture
  // à l'écran et reprendre exactement là où l'on s'est arrêté. Une respiration
  // de 260 ms sépare deux versets.
  var LECT = { actif: false, n: 0, total: 0, pause: false, gap: false };
  var generation = 0;  // invalide les rappels d'un verset relancé (vitesse…)

  function lectureVitesse() {
    var v = S.reglages.vitesse;
    return (typeof v === "number" && v > 0) ? v : 0.9;
  }

  function stopLecture(silencieux) {
    var etait = LECT.actif;
    LECT.actif = false;
    LECT.pause = false;
    LECT.gap = false;
    LECT.n = 0;
    generation++;
    try { window.speechSynthesis.cancel(); } catch (e) { /* rien à annuler */ }
    $$(".prose .v.lect").forEach(function (v) { v.classList.remove("lect"); });
    majBarreLecture();
    if (etait) {
      relacherEnonciation();
      if (!silencieux) toast("Lecture arrêtée");
    }
  }

  function marquerVersetLu(n) {
    $$(".prose .v.lect").forEach(function (v) { v.classList.remove("lect"); });
    var cible = $("#rv" + n);
    if (!cible) return;
    cible.classList.add("lect");
    try { cible.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch (e) { cible.scrollIntoView(false); }
  }

  function direVerset(n) {
    if (!LECT.actif || LECT.pause) return;
    var b = BY_ABBR[RD.a];
    var ch = b && b.c[RD.c - 1];
    if (!ch || n > ch.length) {
      // fin du chapitre : on enchaîne si le suivant existe
      var suivant = RD.c + 1;
      if (S.reglages.lectureSuite && b && suivant <= b.c.length) {
        stopLecture(true);
        openReader(RD.a, suivant);
        setTimeout(function () { lireChapitre(1); }, 400);
        return;
      }
      stopLecture(true);
      toast("Fin du chapitre 🌿");
      return;
    }
    LECT.n = n;
    LECT.gap = false;
    var gen = ++generation;
    marquerVersetLu(n);
    majBarreLecture();

    var txt = normaliserPonctuation(ch[n - 1]);
    if (!txt) {  // verset muet : on souffle et on enchaîne
      LECT.gap = true;
      setTimeout(function () {
        if (!LECT.actif || gen !== generation) return;
        if (!LECT.pause) { LECT.gap = false; direVerset(n + 1); }
      }, RESPIRATION);
      return;
    }
    var u = new SpeechSynthesisUtterance(txt);
    u.lang = "fr-FR";
    u.rate = lectureVitesse();
    var v = voixFr();
    if (v) u.voice = v;
    u.onend = function () {
      if (!LECT.actif) return;
      // respiration de 260 ms entre les versets
      LECT.gap = true;
      setTimeout(function () {
        if (!LECT.actif || gen !== generation) return;
        if (!LECT.pause) { LECT.gap = false; direVerset(n + 1); }
      }, RESPIRATION);
    };
    u.onerror = function () { stopLecture(true); };
    try { window.speechSynthesis.speak(u); }
    catch (e) { stopLecture(true); }
  }

  function lireChapitre(depart) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
      toast("Lecture audio non disponible"); return;
    }
    if (speaking) {  // ne pas chevaucher « Écouter »
      speaking = false;
      relacherEnonciation();
      try { window.speechSynthesis.cancel(); } catch (e) { /* rien */ }
    }
    var b = BY_ABBR[RD.a];
    if (!b) return;
    stopLecture(true);
    LECT.actif = true;
    LECT.pause = false;
    LECT.gap = false;
    LECT.total = b.c[RD.c - 1].length;
    garderEnonciation();
    attendreVoix(function () {
      if (!LECT.actif) return;   // arrêté pendant l'attente des voix
      direVerset(depart || 1);
    });
  }

  function pauseLecture() {
    if (!LECT.actif) return;
    if (LECT.pause) {
      LECT.pause = false;
      var repris = false;
      try { window.speechSynthesis.resume(); repris = true; } catch (e) { /* voix indisponible */ }
      if (!repris) { direVerset(LECT.n); }
      else if (LECT.gap) {  // pause pendant la respiration entre deux versets
        LECT.gap = false;
        direVerset(LECT.n + 1);
      }
      majBarreLecture();
    } else {
      LECT.pause = true;
      try { window.speechSynthesis.pause(); } catch (e) { /* ignoré */ }
      majBarreLecture();
    }
  }

  function changerVitesse() {
    var paliers = [0.7, 0.85, 1, 1.15, 1.3];
    var i = paliers.indexOf(lectureVitesse());
    S.reglages.vitesse = paliers[(i + 1) % paliers.length];
    save();
    majBarreLecture();
    if (LECT.actif) {
      // la vitesse s'applique au verset suivant : on relance le verset courant
      var n = LECT.n;
      try { window.speechSynthesis.cancel(); } catch (e) { /* rien */ }
      LECT.pause = false;
      setTimeout(function () { if (LECT.actif) direVerset(n); }, 60);
    }
    toast("Vitesse ×" + lectureVitesse());
  }

  function majBarreLecture() {
    var bar = $(".lectbar");
    if (!LECT.actif) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = el('<div class="lectbar" role="group" aria-label="Lecture audio du chapitre"></div>');
      var r = $(".reader");
      if (!r) return;
      r.appendChild(bar);
    }
    bar.innerHTML =
      '<button class="icon-btn" id="lec-pause" aria-label="' +
      (LECT.pause ? "Reprendre" : "Mettre en pause") + '">' + (LECT.pause ? "▶" : "⏸") + "</button>" +
      '<div class="lect-info"><div class="lect-t">🔊 Verset ' + LECT.n + " / " + LECT.total +
      (LECT.pause ? " — en pause" : "") + "</div>" +
      '<div class="lect-bar"><i style="width:' +
      Math.round((LECT.n / Math.max(1, LECT.total)) * 100) + '%"></i></div></div>' +
      '<button class="btn sm" id="lec-speed" aria-label="Vitesse de lecture">×' + lectureVitesse() + "</button>" +
      '<button class="icon-btn" id="lec-stop" aria-label="Arrêter la lecture">✕</button>';
  }

  // --- Favoris / notes -----------------------------------------------------
  function isFav(ref) { return S.favoris.indexOf(ref) !== -1; }
  function toggleFav(ref) {
    var i = S.favoris.indexOf(ref);
    if (i === -1) { S.favoris.unshift(ref); toast("Ajouté aux favoris ★"); }
    else { S.favoris.splice(i, 1); toast("Retiré des favoris"); }
    save();
  }

  function addNote(ref, texte, tags) {
    S.notes.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      date: new Date().toISOString(),
      ref: ref || "",
      texte: texte,
      tags: tags || []
    });
    save();
  }

  // étiquettes proposées pour classer les notes
  var ETIQUETTES = [
    { id: "promesse", ic: "🌈", nom: "Promesse", en: "Promise" },
    { id: "priere", ic: "🙏", nom: "Prière", en: "Prayer" },
    { id: "exauce", ic: "✅", nom: "Exaucé", en: "Answered" },
    { id: "retenir", ic: "💡", nom: "À retenir", en: "To remember" },
    { id: "epreuve", ic: "🌧", nom: "Épreuve", en: "Trial" },
    { id: "gratitude", ic: "💛", nom: "Gratitude", en: "Gratitude" }
  ];

  // Nom d'une étiquette dans la langue courante.
  function etiquetteNom(e) {
    return (langue === "en" && e && e.en) ? e.en : (e ? e.nom : "");
  }

  function etiquette(id) {
    for (var i = 0; i < ETIQUETTES.length; i++) if (ETIQUETTES[i].id === id) return ETIQUETTES[i];
    return null;
  }

  function noteSheet(ref, editId) {
    var existante = null;
    if (editId) {
      existante = S.notes.filter(function (n) { return n.id === editId; })[0] || null;
    }
    var tags = (existante && existante.tags) ? existante.tags.slice() : [];
    var refNote = existante ? existante.ref : ref;

    var chips = '<div class="tagpick">';
    ETIQUETTES.forEach(function (t) {
      chips += '<button type="button" class="tagc' + (tags.indexOf(t.id) !== -1 ? " on" : "") +
        '" data-tag="' + t.id + '">' + t.ic + " " + esc(etiquetteNom(t)) + "</button>";
    });
    chips += "</div>";

    var sh = sheet(existante ? "Modifier la note" : "Note de méditation",
      (refNote ? '<p class="muted" style="font-size:.9rem;margin:.2rem 0 .8rem">' + esc(refLabel(refNote)) + "</p>" : "") +
      '<textarea class="field" id="nt" placeholder="Ce que Dieu me dit aujourd\'hui…"></textarea>' +
      '<label class="lbl">Étiquettes</label>' + chips +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn grow" data-close style="flex:1">Annuler</button>' +
      '<button class="btn primary" id="nsave" style="flex:1">Enregistrer</button></div>');

    var ta = $("#nt", sh);
    if (existante) ta.value = existante.texte;
    setTimeout(function () { ta.focus(); }, 120);

    $$(".tagc", sh).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.tag;
        var i = tags.indexOf(id);
        if (i === -1) tags.push(id); else tags.splice(i, 1);
        b.classList.toggle("on", tags.indexOf(id) !== -1);
      });
    });

    $("#nsave", sh).addEventListener("click", function () {
      var v = ta.value.trim();
      if (!v) { toast("Note vide"); return; }
      if (existante) {
        existante.texte = v;
        existante.tags = tags;
        save();
        toast("Note modifiée ✓");
      } else {
        addNote(refNote, v, tags);
        toast("Note enregistrée ✓");
      }
      closeSheet();
      if (current === "journal") render();
    });
  }

  // --- Profil local --------------------------------------------------------
  // Aucune inscription en ligne : le profil vit uniquement dans ce navigateur.
  var AVATARS = ["🌿", "🕊️", "🙏", "✝️", "🌻", "🔥", "⭐", "🌅", "🍃", "💛", "🌊", "🦋"];

  function profil() { return S.profil; }

  function saluer() {
    var hh = new Date().getHours();
    if (hh < 5) return "Belle nuit";
    if (hh < 12) return "Bonjour";
    if (hh < 18) return "Bon après-midi";
    return "Bonsoir";
  }

  function prenom() {
    return (S.profil && S.profil.nom) ? S.profil.nom : "";
  }

  function saveProfil(nom, avatar, heure) {
    nom = String(nom || "").trim().slice(0, 24);
    S.profil = {
      nom: nom,
      avatar: avatar || "🌿",
      heure: heure || null,
      depuis: (S.profil && S.profil.depuis) || ymd(new Date())
    };
    save();
  }

  // Écran d'accueil : proposé une seule fois, jamais bloquant.
  function onboarding() {
    var choix = { avatar: "🌿", heure: "" };
    var el = document.createElement("div");
    el.className = "onb";
    var h = '<div class="onb-inner">';
    h += '<div class="onb-logo">🌿</div>';
    h += "<h1>Bienvenue</h1>";
    h += '<p class="sub">Créons votre profil pour personnaliser vos méditations.<br>' +
      "Tout reste sur cet appareil.</p>";
    h += '<label class="lbl" for="onb-nom">Comment vous appelez-vous ?</label>';
    h += '<input class="field" id="onb-nom" maxlength="24" autocomplete="given-name" ' +
      'placeholder="Votre prénom">';
    h += '<label class="lbl">Choisissez votre image</label><div class="ava-grid">';
    AVATARS.forEach(function (a, i) {
      h += '<button type="button" class="ava' + (i === 0 ? " on" : "") +
        '" data-ava="' + a + '" aria-label="Avatar ' + a + '">' + a + "</button>";
    });
    h += "</div>";
    h += '<label class="lbl" for="onb-h">Votre moment de méditation <span class="muted">(facultatif)</span></label>';
    h += '<input class="field" id="onb-h" type="time" value="07:00">';
    h += '<button class="btn primary block" id="onb-go" style="margin-top:22px">Commencer 🌿</button>';
    h += '<button type="button" class="skip" id="onb-skip">Passer cette étape</button>';
    h += '<p class="note">🔒 Aucune inscription en ligne, aucun mot de passe.<br>' +
      "Vos données ne quittent jamais cet appareil.</p>";
    h += "</div>";
    el.innerHTML = h;
    traduireArbre(el);
    document.body.appendChild(el);

    var nom = el.querySelector("#onb-nom");
    setTimeout(function () { try { nom.focus(); } catch (e) {} }, 260);

    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-ava]");
      if (a) {
        choix.avatar = a.dataset.ava;
        el.querySelectorAll(".ava").forEach(function (b) {
          b.classList.toggle("on", b === a);
        });
        return;
      }
      if (e.target.closest("#onb-go")) {
        var hv = el.querySelector("#onb-h").value;
        saveProfil(nom.value, choix.avatar, hv || null);
        el.remove();
        render();
        if (prenom()) toast("Bienvenue, " + prenom() + " 🌿");
        return;
      }
      if (e.target.closest("#onb-skip")) {
        saveProfil("", "🌿", null);
        el.remove();
        render();
      }
    });

    nom.addEventListener("keydown", function (e) {
      if (e.key === "Enter") el.querySelector("#onb-go").click();
    });
  }

  // Modification du profil depuis l'onglet « Plus »
  function profilSheet() {
    var p = S.profil || { nom: "", avatar: "🌿", heure: null };
    var h = '<label class="lbl" for="pf-nom">Prénom</label>' +
      '<input class="field" id="pf-nom" maxlength="24" value="' + esc(p.nom || "") +
      '" placeholder="Votre prénom">';
    h += '<label class="lbl">Image</label><div class="ava-grid">';
    AVATARS.forEach(function (a) {
      h += '<button type="button" class="ava' + (a === p.avatar ? " on" : "") +
        '" data-ava="' + a + '">' + a + "</button>";
    });
    h += "</div>";
    h += '<label class="lbl" for="pf-h">Moment de méditation</label>' +
      '<input class="field" id="pf-h" type="time" value="' + esc(p.heure || "") + '">';
    h += '<div style="display:flex;gap:8px;margin-top:18px">' +
      '<button class="btn primary grow" id="pf-save">Enregistrer</button></div>';

    var sh = sheet("Mon profil", h);
    var av = p.avatar;
    sh.addEventListener("click", function (e) {
      var a = e.target.closest("[data-ava]");
      if (a) {
        av = a.dataset.ava;
        sh.querySelectorAll(".ava").forEach(function (b) { b.classList.toggle("on", b === a); });
        return;
      }
      if (e.target.closest("#pf-save")) {
        saveProfil(sh.querySelector("#pf-nom").value, av, sh.querySelector("#pf-h").value || null);
        closeSheet();
        render();
        toast("Profil enregistré ✓");
      }
    });
  }

  // --- Série de jours ------------------------------------------------------
  // ==========================================================================
  //  INTÉGRITÉ DE LA PROGRESSION
  //  Les séries et les badges se veulent le reflet d'une pratique réelle. Tout
  //  tourne sur l'appareil : rien n'est infalsifiable, et ce n'est pas le but.
  //  On empêche simplement les incohérences — horloge reculée, historique
  //  gonflé, sauvegarde retouchée — pour que le chiffre affiché veuille dire
  //  quelque chose. Personne n'est bloqué : on recalcule à partir des faits.
  // ==========================================================================

  // Empreinte courte et non cryptographique de l'historique. Elle ne protège
  // pas contre quelqu'un qui lit ce code — elle détecte une retouche à la main
  // du fichier de sauvegarde, ce qui est le cas réel.
  function sceau(histo, record) {
    var h = 2166136261;
    var src = (histo || []).join(",") + "|" + (record || 0) + "|" + KEY;
    for (var i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(36);
  }

  // Nombre de jours entre deux dates « AAAA-MM-JJ » (calendaire, sans heure).
  function ecartJours(a, b) {
    if (!a || !b) return null;
    var x = a.split("-"), y = b.split("-");
    var da = Date.UTC(+x[0], +x[1] - 1, +x[2]);
    var db = Date.UTC(+y[0], +y[1] - 1, +y[2]);
    return Math.round((db - da) / 864e5);
  }

  // Recalcule la série depuis l'historique : c'est la seule source de vérité.
  // Un record ne peut pas dépasser la plus longue suite réellement présente.
  function serieDepuisHisto(histo, aujourdhui) {
    var jours = (histo || []).slice().sort();
    var vus = {}, uniq = [];
    jours.forEach(function (j) { if (!vus[j]) { vus[j] = true; uniq.push(j); } });
    var record = 0, courante = 0, precedent = null;
    uniq.forEach(function (j) {
      courante = (precedent && ecartJours(precedent, j) === 1) ? courante + 1 : 1;
      if (courante > record) record = courante;
      precedent = j;
    });
    // la série « en cours » ne vaut que si elle touche aujourd'hui ou hier
    var enCours = 0;
    if (precedent) {
      var d = ecartJours(precedent, aujourdhui);
      if (d === 0 || d === 1) {
        enCours = 1;
        for (var i = uniq.length - 2; i >= 0; i--) {
          if (ecartJours(uniq[i], uniq[i + 1]) === 1) enCours++; else break;
        }
      }
    }
    return { jours: enCours, record: record, total: uniq.length };
  }

  // Passe l'état au crible. Renvoie la liste des corrections appliquées.
  function verifierIntegrite() {
    var today = ymd(new Date());
    var corrige = [];
    if (!S.histo) S.histo = [];
    if (!S.serie) S.serie = { dernier: null, jours: 0, record: 0 };

    // -- jours postérieurs à aujourd'hui : horloge avancée puis remise à l'heure
    var futurs = S.histo.filter(function (j) { return j > today; });
    if (futurs.length) {
      S.histo = S.histo.filter(function (j) { return j <= today; });
      corrige.push("futur");
    }

    // -- doublons
    var vus = {}, net = [];
    S.histo.forEach(function (j) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(j) && !vus[j]) { vus[j] = true; net.push(j); }
    });
    if (net.length !== S.histo.length) { S.histo = net; corrige.push("doublons"); }
    S.histo.sort();

    // -- l'horloge a-t-elle reculé ? (le dernier jour connu est dans le futur)
    var g = S.garde;
    if (g && g.vu && g.vu > today) corrige.push("horloge");

    // -- série et record recalculés depuis les faits
    var vrai = serieDepuisHisto(S.histo, today);
    if (S.serie.jours !== vrai.jours) { S.serie.jours = vrai.jours; corrige.push("serie"); }
    if ((S.serie.record || 0) > vrai.record) {
      // un record supérieur à la plus longue suite réelle n'a pas de sens,
      // sauf s'il vient d'une sauvegarde scellée que l'on a validée
      var scelle = g && g.sceau === sceau(S.histo, g.record) ? g.record : 0;
      S.serie.record = Math.max(vrai.record, Math.min(S.serie.record, scelle));
      corrige.push("record");
    } else if ((S.serie.record || 0) < vrai.record) {
      S.serie.record = vrai.record;
    }
    S.serie.dernier = S.histo.length ? S.histo[S.histo.length - 1] : null;

    // -- on rescelle
    S.garde = { vu: today, jours: vrai.total, sceau: sceau(S.histo, S.serie.record) };
    return corrige;
  }

  function touchStreak() {
    var today = ymd(new Date());
    var st = S.serie;
    if (!S.histo) S.histo = [];
    if (S.histo.indexOf(today) === -1) {
      S.histo.push(today);
      if (S.histo.length > 800) S.histo = S.histo.slice(-800);
    }
    var vrai = serieDepuisHisto(S.histo, today);
    st.jours = vrai.jours;
    st.record = Math.max(st.record || 0, vrai.record);
    st.dernier = today;
    S.garde = { vu: today, jours: vrai.total, sceau: sceau(S.histo, st.record) };
    save();
  }

  // ==========================================================================
  //  VUES
  // ==========================================================================
  var current = "jour";
  var offset = 0;           // décalage en jours pour le verset du jour
  var explorerState = { book: null, chap: 1 };

  function viewJour() {
    var date = addDays(new Date(), -offset);
    var perso = persoRefFor(date);
    var usePerso = !!(perso && S.perso && S.perso.actif !== false);
    var ref = usePerso ? perso.ref : dailyRefFor(date);
    var txt = verseText(ref);
    if (offset === 0) S.lu[ymd(date)] = ref;
    if (usePerso && offset === 0) markVu(ref);

    var h = "";

    // salutation personnalisée (uniquement pour aujourd'hui)
    if (offset === 0 && S.profil && S.profil.nom) {
      var st = S.serie;
      var sous = st.jours > 1
        ? "<b>" + st.jours + " jours</b> de méditation d'affilée 🔥"
        : "Que ce verset éclaire votre journée.";
      h += '<div class="hello"><div class="hello-ava">' + esc(S.profil.avatar || "🌿") + "</div>" +
        '<div class="hello-txt"><div class="h">' + esc(saluer() + ", " + S.profil.nom) + "</div>" +
        '<div class="s">' + sous + "</div></div></div>";
    }

    // rappel doux de l'heure choisie
    if (offset === 0 && S.profil && S.profil.heure && S.serie.dernier !== ymd(new Date())) {
      h += '<div class="nudge"><span class="ic">⏰</span><div>Votre moment de méditation : <b>' +
        esc(S.profil.heure) + "</b></div></div>";
    }

    h += '<div class="card verse-card">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">';
    h += '<span class="verse-date">' + esc(frDate(date)) + "</span>";
    if (usePerso) h += '<span class="chip">🎯 Ma méditation</span>';
    h += "</div>";
    h += '<p class="verse-text' + (S.reglages.taille > 1.1 ? " big" : "") + '">' + esc(txt) + "</p>";
    h += '<div class="verse-ref">— ' + esc(refLabel(ref)) + "</div>";
    if (usePerso) {
      h += '<div class="muted" style="font-size:.8rem;margin-top:6px">' +
        (S.perso.mode === "suivi"
          ? "Verset " + (perso.index + 1) + " sur " + perso.total + " · suivi"
          : "Tirage du jour · " + ((S.perso.vus || []).length) + " verset" +
            ((S.perso.vus || []).length > 1 ? "s" : "") + " découvert" +
            ((S.perso.vus || []).length > 1 ? "s" : "") + " sur " + perso.total) + "</div>";
    }
    h += '<div class="verse-actions">';
    h += '<button class="btn sm" data-speak="' + esc(txt) + '">🔊 Écouter</button>';
    h += '<button class="btn sm' + (isFav(ref) ? " on" : "") + '" data-fav="' + ref + '">' +
      (isFav(ref) ? "★ Favori" : "☆ Favori") + "</button>";
    h += '<button class="btn sm" data-note="' + ref + '">✍️ Noter</button>';
    h += '<button class="btn sm" data-share="' + ref + '">↗ Partager</button>';
    h += "</div></div>";

    // navigation entre les jours
    h += '<div style="display:flex;gap:8px;margin-bottom:16px">';
    h += '<button class="btn sm" style="flex:1" data-off="1">← Jour précédent</button>';
    if (offset > 0) {
      h += '<button class="btn sm" style="flex:1" data-off="-1">Jour suivant →</button>';
      h += '<button class="btn sm" data-off="0">Aujourd\'hui</button>';
    }
    h += "</div>";

    // méditation personnalisée
    h += '<div class="card">';
    h += '<div class="card-title">🎯 Ma méditation</div>';
    if (S.perso) {
      var pb = bookName(S.perso.livre);
      h += "<p style=\"margin:0 0 4px\"><strong>" + esc(pb) +
        (S.perso.chapitre ? " " + S.perso.chapitre : " (livre entier)") + "</strong></p>";
      h += '<p class="muted" style="font-size:.87rem;margin:0 0 14px">Mode ' +
        (S.perso.mode === "suivi" ? "📆 suivi — un verset après l'autre"
                                  : "🎲 aléatoire — une surprise chaque jour") + "</p>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      h += '<button class="btn sm" id="perso-tog">' +
        (S.perso.actif === false ? "Activer ma méditation" : "Voir le verset du jour général") + "</button>";
      h += '<button class="btn sm" id="perso-edit">Modifier</button>';
      h += '<button class="btn sm" data-tab="perso">Ouvrir ▸</button>';
      h += '<button class="btn sm" id="perso-del">Supprimer</button></div>';
    } else {
      h += '<p class="muted" style="font-size:.9rem;margin:0 0 14px">Choisissez un livre ou un chapitre : ' +
        "chaque jour, votre verset en sera tiré.</p>";
      h += '<button class="btn primary block" id="perso-edit">Créer ma méditation</button>';
    }
    h += "</div>";

    // série
    h += '<div class="card"><div class="card-title">🔥 Ma régularité</div>' +
      '<div style="display:flex;gap:22px">' +
      '<div><div style="font-size:1.7rem;font-weight:700;line-height:1">' + S.serie.jours + "</div>" +
      '<div class="muted" style="font-size:.8rem">jours d\'affilée</div></div>' +
      '<div><div style="font-size:1.7rem;font-weight:700;line-height:1">' + S.serie.record + "</div>" +
      '<div class="muted" style="font-size:.8rem">record</div></div>' +
      '<div><div style="font-size:1.7rem;font-weight:700;line-height:1">' + Object.keys(S.lu).length + "</div>" +
      '<div class="muted" style="font-size:.8rem">jours médités</div></div>' +
      "</div></div>";

    return h;
  }

  function persoSheet() {
    inflate();
    var cur = S.perso || { mode: "suivi", livre: "PSA", chapitre: null };
    var opts = BOOKS.map(function (b) {
      return '<option value="' + b.a + '"' + (b.a === cur.livre ? " selected" : "") + ">" +
        esc(b.n) + "</option>";
    }).join("");
    var sh = sheet("Ma méditation personnalisée",
      '<label class="lbl">Livre</label>' +
      '<select class="field" id="p-book">' + opts + "</select>" +
      '<label class="lbl">Chapitre</label>' +
      '<select class="field" id="p-chap"></select>' +
      '<label class="lbl">Méthode</label>' +
      '<div class="grid two">' +
      '<button class="tile" data-mode="suivi"><span class="ic">📆</span>' +
      '<span class="lb">Suivi</span><span class="sub">Dans l\'ordre, jour après jour</span></button>' +
      '<button class="tile" data-mode="aleatoire"><span class="ic">🎲</span>' +
      '<span class="lb">Aléatoire</span><span class="sub">Un verset surprise</span></button>' +
      "</div>" +
      '<div style="display:flex;gap:8px;margin-top:18px">' +
      '<button class="btn" data-close style="flex:1">Annuler</button>' +
      '<button class="btn primary" id="p-save" style="flex:1">Enregistrer</button></div>');

    var mode = cur.mode;
    function paintMode() {
      $$("[data-mode]", sh).forEach(function (b) {
        b.style.borderColor = b.dataset.mode === mode ? "var(--sage)" : "";
        b.style.background = b.dataset.mode === mode ? "var(--sage-soft)" : "";
      });
    }
    $$("[data-mode]", sh).forEach(function (b) {
      b.addEventListener("click", function () { mode = b.dataset.mode; paintMode(); });
    });
    paintMode();

    function fillChap() {
      var b = BY_ABBR[$("#p-book", sh).value];
      var o = '<option value="">Tout le livre (' + b.c.length + " chapitres)</option>";
      for (var i = 1; i <= b.c.length; i++) {
        o += '<option value="' + i + '"' +
          (cur.chapitre === i && b.a === cur.livre ? " selected" : "") + ">Chapitre " + i + "</option>";
      }
      $("#p-chap", sh).innerHTML = o;
      traduireArbre($("#p-chap", sh));
    }
    $("#p-book", sh).addEventListener("change", fillChap);
    fillChap();

    $("#p-save", sh).addEventListener("click", function () {
      var livre = $("#p-book", sh).value;
      var chap = $("#p-chap", sh).value ? +$("#p-chap", sh).value : null;
      var memePassage = S.perso && S.perso.livre === livre &&
        S.perso.chapitre === chap;
      S.perso = {
        mode: mode, livre: livre, chapitre: chap,
        pos: 0, jour0: dayNumber(new Date()), actif: true,
        vus: memePassage ? (S.perso.vus || []) : []
      };
      save();
      closeSheet();
      var inf3 = persoRefFor(new Date());
      if (inf3) markVu(inf3.ref);
      current = "perso";
      offset = 0;
      render();
      toast("Méditation enregistrée ✓");
    });
  }

  // --- Vue « Ma méditation » -----------------------------------------------
  function viewPerso() {
    var h = '<h2 class="section-h">🎯 Ma méditation</h2>';

    if (!S.perso) {
      h += '<p class="section-sub">Choisissez un passage : chaque jour, votre verset en sera tiré.</p>';
      h += '<div class="card"><div class="empty"><span class="ic">🎯</span>' +
        "Aucune méditation en cours.<br><small>Un chapitre, un livre entier — à votre rythme.</small></div>" +
        '<button class="btn primary block" id="perso-edit">Créer ma méditation</button></div>';

      h += '<div class="card"><div class="card-title">Comment ça marche</div>';
      h += '<div class="step"><div class="num">📆</div><div><h4>Suivi</h4>' +
        "<p>Les versets défilent <strong>dans l'ordre</strong>, un par jour. " +
        "Arrivé au bout du passage, la lecture <strong>recommence</strong> pour un nouveau cycle.</p></div></div>";
      h += '<div class="step"><div class="num">🎲</div><div><h4>Aléatoire</h4>' +
        "<p>Un verset <strong>surprise</strong> chaque jour, jamais celui de la veille. " +
        "Vos <strong>découvertes</strong> sont comptabilisées au fil du temps.</p></div></div>";
      h += "</div>";
      return h;
    }

    var p = S.perso;
    var info = persoRefFor(addDays(new Date(), -offset));
    if (!info) return h + '<div class="card"><div class="empty">Passage introuvable.</div></div>';
    var ref = info.ref;
    var txt = verseText(ref);
    var passage = bookName(p.livre) + (p.chapitre ? " " + p.chapitre : " (livre entier)");
    var vus = (p.vus || []).length;

    // --- le verset
    h += '<div class="card verse-card">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">';
    h += '<span class="verse-date">' + esc(frDate(addDays(new Date(), -offset))) + "</span>";
    h += '<span class="chip">' + (p.mode === "suivi" ? "📆 Suivi" : "🎲 Aléatoire") + "</span>";
    h += "</div>";
    h += '<p class="verse-text' + (S.reglages.taille > 1.1 ? " big" : "") + '">' + esc(txt) + "</p>";
    h += '<div class="verse-ref">— ' + esc(refLabel(ref)) + "</div>";
    h += '<div class="verse-actions">';
    h += '<button class="btn sm" data-speak="' + esc(txt) + '">🔊 Écouter</button>';
    h += '<button class="btn sm' + (isFav(ref) ? " on" : "") + '" data-fav="' + ref + '">' +
      (isFav(ref) ? "★ Favori" : "☆ Favori") + "</button>";
    h += '<button class="btn sm" data-note="' + ref + '">✍️ Noter</button>';
    h += '<button class="btn sm" data-share="' + ref + '">↗ Partager</button>';
    h += '<button class="btn sm" data-open="' + ref + '">📖 Contexte</button>';
    h += "</div></div>";

    // --- pilotage selon la méthode
    h += '<div class="card"><div class="card-title">' + esc(passage) + "</div>";

    if (p.mode === "suivi") {
      var pos = info.index + 1;
      var pct = Math.round(pos / info.total * 100);
      h += '<div class="row" style="border:none;padding:0 0 8px">' +
        '<div class="grow"><div class="ttl">Verset ' + pos + " sur " + info.total + "</div>" +
        '<div class="meta">' + pct + " % du passage" +
        (info.cycle > 0 ? " · cycle n° " + (info.cycle + 1) : "") + "</div></div></div>";
      h += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
      h += '<div style="display:flex;gap:8px;margin-top:14px">';
      h += '<button class="btn sm" style="flex:1" data-pstep="-1">← Précédent</button>';
      h += '<button class="btn sm" style="flex:1" data-pstep="1">Suivant →</button>';
      h += "</div>";
      h += '<p class="muted" style="font-size:.82rem;margin:12px 0 0">' +
        "Un verset par jour, dans l'ordre. Vous pouvez aussi avancer à la main." +
        (info.index + 1 === info.total
          ? " <strong>Dernier verset : demain, le cycle recommence.</strong>" : "") + "</p>";
    } else {
      var pctv = Math.round(vus / info.total * 100);
      h += '<div class="row" style="border:none;padding:0 0 8px">' +
        '<div class="grow"><div class="ttl">' + vus + " verset" + (vus > 1 ? "s" : "") +
        " découvert" + (vus > 1 ? "s" : "") + "</div>" +
        '<div class="meta">sur ' + info.total + " possibles · " + pctv + " %</div></div></div>";
      h += '<div class="bar"><i style="width:' + pctv + '%"></i></div>';
      h += '<div style="display:flex;gap:8px;margin-top:14px">';
      h += '<button class="btn sm block" id="perso-redraw">🎲 Tirer un autre verset</button>';
      h += "</div>";
      h += '<p class="muted" style="font-size:.82rem;margin:12px 0 0">' +
        "Chaque jour un verset différent de la veille. Le tirage du jour reste le même " +
        "jusqu'à demain, sauf si vous en demandez un autre.</p>";
    }
    h += "</div>";

    // --- changer de méthode, à tout moment
    h += '<div class="card"><div class="card-title">Méthode</div><div class="grid two">';
    h += '<button class="tile" data-pmode="suivi"' +
      (p.mode === "suivi" ? ' style="border-color:var(--sage);background:var(--sage-soft)"' : "") +
      '><span class="ic">📆</span><span class="lb">Suivi</span>' +
      '<span class="sub">Dans l\'ordre</span></button>';
    h += '<button class="tile" data-pmode="aleatoire"' +
      (p.mode === "aleatoire" ? ' style="border-color:var(--sage);background:var(--sage-soft)"' : "") +
      '><span class="ic">🎲</span><span class="lb">Aléatoire</span>' +
      '<span class="sub">Un verset surprise</span></button>';
    h += "</div>";
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">';
    h += '<button class="btn sm" id="perso-edit">Changer de passage</button>';
    h += '<button class="btn sm" id="perso-tog">' +
      (p.actif === false ? "Activer sur l'accueil" : "Verset général sur l'accueil") + "</button>";
    h += '<button class="btn sm" id="perso-del">Supprimer</button>';
    h += "</div>";
    h += '<p class="muted" style="font-size:.82rem;margin:12px 0 0">' +
      (p.actif === false
        ? "L'accueil affiche le verset du jour général."
        : "L'accueil affiche votre méditation personnalisée.") + "</p>";
    h += "</div>";

    // --- versets déjà rencontrés
    if (vus) {
      h += '<div class="card"><div class="card-title">Déjà rencontrés (' + vus + ")</div>";
      p.vus.slice().reverse().slice(0, 12).forEach(function (r) {
        h += '<div class="row"><div class="grow">' +
          '<div class="ttl">' + esc(refLabel(r)) + "</div>" +
          '<div class="meta">' + esc(verseText(r).slice(0, 70)) + "…</div></div>" +
          '<button class="btn sm" data-open="' + r + '">Ouvrir</button></div>';
      });
      if (vus > 12) h += '<p class="muted" style="font-size:.8rem;margin:10px 0 0">' +
        "et " + (vus - 12) + " autre" + (vus - 12 > 1 ? "s" : "") + "…</p>";
      h += "</div>";
    }

    return h;
  }

  function viewPlans() {
    var PLANS = window.PLANS || [];
    var h = '<h2 class="section-h">Plans de lecture</h2>' +
      '<p class="section-sub">Votre progression est enregistrée sur cet appareil.</p>';
    PLANS.forEach(function (p) {
      var st = S.plans[p.id] || { faits: [] };
      var done = st.faits.length;
      var pct = Math.round(done / p.len * 100);
      h += '<button class="card" style="display:block;width:100%;text-align:left" data-plan="' + p.id + '">';
      h += '<div style="display:flex;gap:12px;align-items:flex-start">';
      h += '<span style="font-size:1.6rem;line-height:1">' + p.i + "</span>";
      h += '<div style="flex:1;min-width:0">';
      h += '<div class="ttl" style="font-weight:600">' + esc(loc(p, "n")) + "</div>";
      h += '<div class="muted" style="font-size:.85rem;margin:2px 0 0">' + esc(loc(p, "d")) + "</div>";
      h += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
      h += '<div class="muted" style="font-size:.78rem;margin-top:5px">' +
        done + " / " + p.len + " jours · " + pct + "%</div>";
      h += "</div></div></button>";
    });
    return h;
  }

  function openPlan(id) {
    var p = (window.PLANS || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!S.plans[id]) S.plans[id] = { faits: [], debut: ymd(new Date()) };
    var st = S.plans[id];

    function body() {
      var done = st.faits.length;
      var pct = Math.round(done / p.len * 100);
      var next = 0;
      for (var i = 0; i < p.len; i++) if (st.faits.indexOf(i) === -1) { next = i; break; }
      var h = '<p class="muted" style="font-size:.9rem;margin:.2rem 0 .6rem">' + esc(loc(p, "d")) + "</p>";
      h += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
      h += '<div class="muted" style="font-size:.8rem;margin:6px 0 14px">' +
        done + " / " + p.len + " jours · " + pct + "%</div>";
      h += '<div style="display:flex;gap:8px;margin-bottom:14px">';
      h += '<button class="btn primary" style="flex:1" data-goday="' + next + '">Lire le jour ' + (next + 1) + "</button>";
      h += '<button class="btn" data-reset>Réinitialiser</button></div>';
      h += '<div style="max-height:44vh;overflow:auto;margin:0 -4px">';
      p.days.forEach(function (d, i) {
        var ok = st.faits.indexOf(i) !== -1;
        h += '<div class="row"><button class="icon-btn" data-tog="' + i + '" aria-label="Marquer le jour ' + (i + 1) + '">' +
          (ok ? "✅" : "⬜") + "</button>";
        h += '<button class="grow" style="text-align:left;background:none" data-goday="' + i + '">' +
          '<div class="ttl">Jour ' + (i + 1) + "</div>" +
          '<div class="meta">' + esc(loc(d, "t")) + "</div></button>";
        h += '<span class="chev">›</span></div>';
      });
      h += "</div>";
      return h;
    }

    var sh = sheet(p.i + " " + loc(p, "n"), body());

    sh.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tog],[data-goday],[data-reset]");
      if (!t) return;
      if (t.hasAttribute("data-tog")) {
        var i = +t.dataset.tog;
        var k = st.faits.indexOf(i);
        if (k === -1) { st.faits.push(i); touchStreak(); } else st.faits.splice(k, 1);
        save();
        $(".sheet-body", sh).innerHTML = body();
        traduireArbre(sh);
      } else if (t.hasAttribute("data-goday")) {
        readDay(p, +t.dataset.goday, st);
      } else if (t.hasAttribute("data-reset")) {
        st.faits = [];
        save();
        $(".sheet-body", sh).innerHTML = body();
        traduireArbre(sh);
        toast("Plan réinitialisé");
      }
    });
  }

  function readDay(plan, dayIdx, st) {
    inflate();
    var day = plan.days[dayIdx];
    var h = '<p class="muted" style="font-size:.88rem;margin:.2rem 0 1rem">' +
      esc(plan.n) + " · jour " + (dayIdx + 1) + " sur " + plan.len + "</p>";
    day.r.forEach(function (ref) {
      var p = parseRef(ref);
      var b = BY_ABBR[p.a];
      if (!b) return;
      var ch = b.c[p.c - 1] || [];
      var from = p.v || 1;
      var to = p.v2 || ch.length;
      h += '<h4 style="margin:16px 0 8px;font-size:1.02rem">' + esc(refLabel(ref)) + "</h4>";
      for (var v = from; v <= to && v <= ch.length; v++) {
        h += '<div class="verse-line"><span class="vn">' + v + "</span>" +
          '<span class="vt">' + esc(ch[v - 1]) + "</span></div>";
      }
    });
    var done = st.faits.indexOf(dayIdx) !== -1;
    h += '<div style="display:flex;gap:8px;margin-top:20px;position:sticky;bottom:0;' +
      'background:var(--card);padding:12px 0">' +
      '<button class="btn" style="flex:1" data-back>← Retour</button>' +
      '<button class="btn ' + (done ? "" : "primary") + '" style="flex:1" data-done="' + dayIdx + '">' +
      (done ? "✅ Terminé" : "Marquer comme lu") + "</button></div>";

    var sh = sheet("Jour " + (dayIdx + 1), h);
    sh.addEventListener("click", function (e) {
      if (e.target.closest("[data-back]")) { closeSheet(); openPlan(plan.id); }
      var d = e.target.closest("[data-done]");
      if (d) {
        var i = +d.dataset.done;
        var k = st.faits.indexOf(i);
        if (k === -1) { st.faits.push(i); touchStreak(); toast("Jour " + (i + 1) + " terminé ✓"); }
        else { st.faits.splice(k, 1); }
        save();
        closeSheet();
        openPlan(plan.id);
      }
    });
  }

  function viewThemes() {
    var T = window.THEMES || [];
    var h = '<h2 class="section-h">Thèmes de méditation</h2>' +
      '<p class="section-sub">' + T.length + " thèmes · " +
      T.reduce(function (n, t) { return n + t.v.length; }, 0) + " versets choisis.</p>";
    h += '<div class="grid two">';
    T.forEach(function (t) {
      h += '<button class="tile" data-theme="' + t.id + '">' +
        '<span class="ic">' + t.i + "</span>" +
        '<span class="lb">' + esc(loc(t, "n")) + "</span>" +
        '<span class="sub">' + t.v.length + " versets</span></button>";
    });
    h += "</div>";
    return h;
  }

  function openTheme(id) {
    var t = (window.THEMES || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    inflate();
    var h = "";
    t.v.forEach(function (ref) {
      h += '<div style="padding:14px 0;border-bottom:1px solid var(--line)">';
      h += "<p style=\"margin:0 0 7px\">" + esc(verseText(ref)) + "</p>";
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span class="verse-ref" style="flex:1">' + esc(refLabel(ref)) + "</span>" +
        '<button class="btn sm" data-speak="' + esc(verseText(ref)) + '">🔊</button>' +
        '<button class="btn sm' + (isFav(ref) ? " on" : "") + '" data-fav="' + ref + '">' +
        (isFav(ref) ? "★" : "☆") + "</button>" +
        '<button class="btn sm" data-note="' + ref + '">✍️</button>' +
        '<button class="btn sm" data-share="' + ref + '">↗</button></div></div>';
    });
    sheet(t.i + " " + loc(t, "n"), h);
  }

  // --- Ma progression ------------------------------------------------------
  var BADGES = [
    { id: "premier", ic: "🌱", nom: "Première graine", desc: "Votre première méditation", seuil: 1 },
    { id: "semaine", ic: "🌿", nom: "Une semaine", desc: "7 jours de méditation", seuil: 7 },
    { id: "mois", ic: "🌳", nom: "Un mois", desc: "30 jours de méditation", seuil: 30 },
    { id: "cent", ic: "🏔️", nom: "Cent jours", desc: "100 jours de méditation", seuil: 100 },
    { id: "an", ic: "👑", nom: "Une année", desc: "365 jours de méditation", seuil: 365 }
  ];

  var BADGES_SERIE = [
    { id: "s7", ic: "🔥", nom: "Sept d'affilée", desc: "7 jours consécutifs", seuil: 7 },
    { id: "s30", ic: "⚡", nom: "Trente d'affilée", desc: "30 jours consécutifs", seuil: 30 },
    { id: "s100", ic: "💎", nom: "Cent d'affilée", desc: "100 jours consécutifs", seuil: 100 }
  ];

  function statsProgression() {
    var histo = S.histo || [];
    var chapitresLus = {};
    Object.keys(S.surlignes || {}).forEach(function (r) {
      var p = parseRef(r);
      if (p) chapitresLus[p.a + " " + p.c] = true;
    });
    var joursPlans = 0;
    Object.keys(S.plans || {}).forEach(function (id) {
      joursPlans += (S.plans[id].faits || []).length;
    });
    return {
      total: histo.length,
      serie: S.serie.jours || 0,
      record: Math.max(S.serie.record || 0, S.serie.jours || 0),
      notes: S.notes.length,
      favoris: S.favoris.length,
      surlignes: Object.keys(S.surlignes || {}).length,
      chapitres: Object.keys(chapitresLus).length,
      joursPlans: joursPlans,
      decouverts: (S.perso && S.perso.vus) ? S.perso.vus.length : 0
    };
  }

  function badgesObtenus() {
    var st = statsProgression();
    var out = [];
    BADGES.forEach(function (b) {
      out.push({ b: b, ok: st.total >= b.seuil, val: st.total, type: "jours" });
    });
    BADGES_SERIE.forEach(function (b) {
      out.push({ b: b, ok: st.record >= b.seuil, val: st.record, type: "série" });
    });
    return out;
  }

  // Calendrier des 5 dernières semaines, lundi en première colonne
  function calendrierHtml() {
    var histo = {};
    (S.histo || []).forEach(function (j) { histo[j] = true; });
    var aujourdhui = new Date();
    var jour = (aujourdhui.getDay() + 6) % 7;         // 0 = lundi
    var finSemaine = addDays(aujourdhui, 6 - jour);   // dimanche de la semaine en cours
    var debut = addDays(finSemaine, -34);             // 5 semaines

    var h = '<div class="cal-head">';
    ["L", "M", "M", "J", "V", "S", "D"].forEach(function (d) {
      h += "<span>" + d + "</span>";
    });
    h += '</div><div class="cal">';
    for (var i = 0; i < 35; i++) {
      var d = addDays(debut, i);
      var k = ymd(d);
      var futur = d > aujourdhui;
      var actif = !!histo[k];
      var cls = "cal-d" + (actif ? " on" : "") + (futur ? " fut" : "") +
        (k === ymd(aujourdhui) ? " today" : "");
      h += '<span class="' + cls + '" title="' + esc(frDate(d)) + '">' + d.getDate() + "</span>";
    }
    h += "</div>";
    return h;
  }

  function viewProgres() {
    var st = statsProgression();
    var h = '<h2 class="section-h">Ma progression</h2>' +
      '<p class="section-sub">Votre chemin de méditation, jour après jour.</p>';

    h += '<div class="grid two stats">';
    [
      ["🔥", st.serie, st.serie > 1 ? "jours d'affilée" : "jour d'affilée"],
      ["🏆", st.record, "record de série"],
      ["📅", st.total, st.total > 1 ? "jours médités" : "jour médité"],
      ["📔", st.notes, st.notes > 1 ? "notes écrites" : "note écrite"]
    ].forEach(function (c) {
      h += '<div class="stat"><div class="ic">' + c[0] + "</div>" +
        '<div class="n">' + c[1] + "</div>" +
        '<div class="l">' + esc(c[2]) + "</div></div>";
    });
    h += "</div>";

    h += '<div class="card"><div class="card-title">📅 Ces cinq dernières semaines</div>' +
      calendrierHtml() +
      '<p class="muted" style="font-size:.78rem;margin:12px 0 0">' +
      "Chaque pastille verte est un jour où vous avez ouvert votre méditation.</p></div>";

    h += '<div class="card"><div class="card-title">🎖 Mes badges</div><div class="badges">';
    badgesObtenus().forEach(function (x) {
      var reste = x.b.seuil - x.val;
      h += '<div class="badge' + (x.ok ? " on" : "") + '" data-bdg="' + x.b.id + '">' +
        '<div class="bi">' + x.b.ic + "</div>" +
        '<div class="bn">' + esc(x.b.nom) + "</div>" +
        '<div class="bd">' + esc(x.ok ? x.b.desc : "encore " + reste + " " + x.type) + "</div></div>";
    });
    h += "</div></div>";

    h += '<div class="card"><div class="card-title">📊 En détail</div>';
    [
      ["Versets mis en favori", st.favoris],
      ["Versets surlignés", st.surlignes],
      ["Chapitres annotés", st.chapitres],
      ["Jours de plans validés", st.joursPlans],
      ["Versets découverts en méditation", st.decouverts]
    ].forEach(function (l) {
      h += '<div class="row"><div class="grow"><div class="ttl">' + esc(l[0]) + "</div></div>" +
        '<div class="chip">' + l[1] + "</div></div>";
    });
    h += "</div>";

    if (!st.total) {
      h += '<div class="empty"><span class="ic">🌱</span>Votre progression apparaîtra ici ' +
        "dès votre première méditation.</div>";
    }
    return h;
  }

  // filtres du journal
  var JF = { q: "", tag: "" };

  // Notes écrites à la même date les années précédentes.
  function souvenirs() {
    var auj = new Date();
    return S.notes.filter(function (n) {
      var d = new Date(n.date);
      if (isNaN(d)) return false;
      if (d.getFullYear() >= auj.getFullYear()) return false;
      return d.getMonth() === auj.getMonth() && d.getDate() === auj.getDate();
    });
  }

  function notesFiltrees() {
    var q = norm(JF.q).trim();
    return S.notes.filter(function (n) {
      if (JF.tag && (!n.tags || n.tags.indexOf(JF.tag) === -1)) return false;
      if (!q) return true;
      var foin = norm(n.texte + " " + (n.ref ? refLabel(n.ref) : ""));
      return foin.indexOf(q) !== -1;
    });
  }

  function noteHtml(n) {
    var d = new Date(n.date);
    var h = '<div class="note"><div class="nd">' + esc(frDate(d)) + " · " +
      String(d.getHours()).padStart(2, "0") + (langue === "en" ? ":" : "h") +
      String(d.getMinutes()).padStart(2, "0") + "</div>";
    if (n.ref) h += '<div class="nr">' + esc(refLabel(n.ref)) + "</div>";
    h += '<div class="nt">' + esc(n.texte) + "</div>";
    if (n.tags && n.tags.length) {
      h += '<div class="ntags">';
      n.tags.forEach(function (id) {
        var t = etiquette(id);
        if (t) h += '<span class="tagc on sm">' + t.ic + " " + esc(etiquetteNom(t)) + "</span>";
      });
      h += "</div>";
    }
    h += '<div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap">';
    if (n.ref) h += '<button class="btn sm" data-open="' + n.ref + '">Ouvrir</button>';
    h += '<button class="btn sm" data-nedit="' + n.id + '">Modifier</button>' +
      '<button class="btn sm" data-ndel="' + n.id + '">Supprimer</button></div></div>';
    return h;
  }

  function viewJournal() {
    var h = '<h2 class="section-h">Journal de méditation</h2>' +
      '<p class="section-sub">Vos notes restent sur cet appareil, rien n\'est envoyé sur Internet.</p>';
    h += '<div style="display:flex;gap:8px;margin-bottom:16px">' +
      '<button class="btn primary" style="flex:1" data-note="">✍️ Nouvelle note</button>';
    if (S.notes.length) h += '<button class="btn" id="jexport">⬇ Exporter</button>';
    h += "</div>";

    if (!S.notes.length) {
      h += '<div class="empty"><span class="ic">📔</span>Aucune note pour le moment.<br>' +
        "Commencez par méditer le verset du jour.</div>";
      return h;
    }

    // « il y a un an »
    var vieilles = souvenirs();
    if (vieilles.length) {
      h += '<div class="card souvenir"><div class="card-title">🕰 Il y a un an, jour pour jour</div>';
      vieilles.slice(0, 3).forEach(function (n) {
        var an = new Date().getFullYear() - new Date(n.date).getFullYear();
        h += '<div class="row" style="border:none;padding:6px 0"><div class="grow">' +
          '<div class="meta">' + (an === 1 ? "l\'an dernier" : "il y a " + an + " ans") +
          (n.ref ? " · " + esc(refLabel(n.ref)) : "") + "</div>" +
          '<div class="ttl" style="font-weight:400">' + esc(n.texte.slice(0, 120)) +
          (n.texte.length > 120 ? "…" : "") + "</div></div></div>";
      });
      h += "</div>";
    }

    // recherche et filtres
    h += '<input class="field" id="jq" placeholder="🔍 Rechercher dans mes notes…" ' +
      'autocomplete="off" value="' + esc(JF.q) + '" style="margin-bottom:10px">';

    var compte = {};
    S.notes.forEach(function (n) {
      (n.tags || []).forEach(function (t) { compte[t] = (compte[t] || 0) + 1; });
    });
    var utilisees = ETIQUETTES.filter(function (t) { return compte[t.id]; });
    if (utilisees.length) {
      h += '<div class="tagpick" style="margin-bottom:14px">';
      h += '<button type="button" class="tagc' + (JF.tag ? "" : " on") + '" data-jtag="">Toutes</button>';
      utilisees.forEach(function (t) {
        h += '<button type="button" class="tagc' + (JF.tag === t.id ? " on" : "") +
          '" data-jtag="' + t.id + '">' + t.ic + " " + esc(etiquetteNom(t)) + " (" + compte[t.id] + ")</button>";
      });
      h += "</div>";
    }

    var liste = notesFiltrees();
    h += '<div class="muted" style="font-size:.82rem;margin-bottom:10px">' +
      liste.length + " note" + (liste.length > 1 ? "s" : "") +
      (liste.length !== S.notes.length ? " sur " + S.notes.length : "") + "</div>";

    if (!liste.length) {
      h += '<div class="empty"><span class="ic">🔍</span>Aucune note ne correspond.</div>';
      return h;
    }
    liste.forEach(function (n) { h += noteHtml(n); });
    return h;
  }

  function exportJournal() {
    var lines = ["MÉDITATION BIBLIQUE — MON JOURNAL", ""];
    lines.push("Export du " + frDate(new Date()));
    lines.push("Notes : " + S.notes.length);
    lines.push("");
    S.notes.forEach(function (n) {
      var d = new Date(n.date);
      lines.push("──────────────────────────────");
      lines.push(frDate(d));
      if (n.ref) {
        lines.push(refLabel(n.ref));
        lines.push("« " + verseText(n.ref) + " »");
      }
      lines.push("");
      lines.push(n.texte);
      if (n.tags && n.tags.length) {
        lines.push("");
        lines.push("Étiquettes : " + n.tags.map(function (id) {
          var t = etiquette(id);
          return t ? etiquetteNom(t) : id;
        }).join(", "));
      }
      lines.push("");
    });
    if (S.favoris.length) {
      lines.push("");
      lines.push("★ MES VERSETS FAVORIS");
      lines.push("");
      S.favoris.forEach(function (r) {
        lines.push(refLabel(r) + " — « " + verseText(r) + " »");
      });
    }
    var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journal-meditation-" + ymd(new Date()) + ".txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast("Journal exporté ✓");
  }

  // --- Sauvegarde complète (export / import JSON) --------------------------
  var BACKUP_TAG = "meditation-biblique-sauvegarde";

  function exportSauvegarde() {
    var paquet = {
      format: BACKUP_TAG,
      version: 1,
      app: "1.6.0",
      date: new Date().toISOString(),
      sceau: sceau(S.histo, S.serie ? S.serie.record : 0),
      donnees: S
    };
    var blob = new Blob([JSON.stringify(paquet, null, 1)],
      { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sauvegarde-meditation-" + ymd(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast("Sauvegarde enregistrée ✓");
  }

  // Fusionne (ou remplace) un état importé avec l'état courant.
  function appliquerSauvegarde(paquet, fusion) {
    if (!paquet || paquet.format !== BACKUP_TAG || !paquet.donnees) {
      throw new Error("Fichier de sauvegarde non reconnu");
    }
    var d = paquet.donnees;
    var base = JSON.parse(JSON.stringify(DEFAULTS));
    Object.keys(base).forEach(function (k) {
      if (d[k] !== undefined) base[k] = d[k];
    });
    Object.keys(DEFAULTS.reglages).forEach(function (k) {
      if (!base.reglages || base.reglages[k] === undefined) {
        base.reglages = base.reglages || {};
        base.reglages[k] = DEFAULTS.reglages[k];
      }
    });

    // Une sauvegarde dont le sceau ne correspond pas a été retouchée : on
    // garde les données (notes, favoris — le travail de l'utilisateur) mais on
    // repart de l'historique pour la série, sans faire confiance aux compteurs.
    var scelle = paquet.sceau &&
      paquet.sceau === sceau(base.histo, base.serie ? base.serie.record : 0);
    if (!scelle && base.serie) base.serie.record = 0;

    if (!fusion) {
      S = base;
      verifierIntegrite();
      save();
      return { notes: S.notes.length, favoris: S.favoris.length, scelle: !!scelle };
    }

    // fusion : on ne perd rien de ce qui existe déjà sur l'appareil
    var ids = {};
    S.notes.forEach(function (n) { ids[n.id] = true; });
    base.notes.forEach(function (n) { if (!ids[n.id]) S.notes.push(n); });
    S.notes.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    base.favoris.forEach(function (r) {
      if (S.favoris.indexOf(r) === -1) S.favoris.push(r);
    });
    Object.keys(base.surlignes || {}).forEach(function (r) {
      if (!S.surlignes[r]) S.surlignes[r] = base.surlignes[r];
    });
    Object.keys(base.lu || {}).forEach(function (j) {
      if (!S.lu[j]) S.lu[j] = base.lu[j];
    });
    Object.keys(base.plans || {}).forEach(function (id) {
      var src = base.plans[id];
      var dst = S.plans[id];
      if (!dst) { S.plans[id] = src; return; }
      (src.faits || []).forEach(function (i) {
        if (dst.faits.indexOf(i) === -1) dst.faits.push(i);
      });
      dst.faits.sort(function (a, b) { return a - b; });
      if (src.debut && (!dst.debut || src.debut < dst.debut)) dst.debut = src.debut;
    });
    // On fusionne les jours réellement médités, puis on recalcule : deux
    // appareils utilisés en parallèle donnent ainsi la bonne série, sans
    // qu'un compteur importé puisse gonfler le record.
    (base.histo || []).forEach(function (j) {
      if (S.histo.indexOf(j) === -1) S.histo.push(j);
    });
    if (scelle && base.serie) {
      S.serie.record = Math.max(S.serie.record || 0, base.serie.record || 0);
    }
    if (!S.profil && base.profil) S.profil = base.profil;
    if (!S.perso && base.perso) S.perso = base.perso;
    if (!S.lecture && base.lecture) S.lecture = base.lecture;
    verifierIntegrite();
    save();
    return { notes: base.notes.length, favoris: base.favoris.length, scelle: !!scelle };
  }

  function importSauvegardeSheet() {
    sheet("Restaurer une sauvegarde",
      '<p class="muted" style="font-size:.92rem;margin:.2rem 0 1rem">' +
      "Choisissez un fichier <b>sauvegarde-meditation-….json</b> exporté depuis cette " +
      "application, sur cet appareil ou sur un autre.</p>" +
      '<input class="field" id="imp-file" type="file" accept="application/json,.json">' +
      '<label class="lbl" style="margin-top:14px">Comment l\'appliquer ?</label>' +
      '<div class="grid two">' +
      '<button class="btn on" id="imp-merge" data-imp="fusion">➕ Fusionner</button>' +
      '<button class="btn" id="imp-repl" data-imp="remplacer">↺ Remplacer</button></div>' +
      '<p class="muted" id="imp-help" style="font-size:.82rem;margin:10px 0 0">' +
      "Fusionner : ajoute les notes, favoris et progressions manquants, sans rien supprimer.</p>" +
      '<button class="btn primary block" id="imp-go" style="margin-top:16px">Restaurer</button>' +
      '<button class="btn block" style="margin-top:8px" data-close>Annuler</button>');

    var mode = "fusion";
    $$("[data-imp]").forEach(function (b) {
      b.addEventListener("click", function () {
        mode = b.dataset.imp;
        $$("[data-imp]").forEach(function (o) { o.classList.toggle("on", o === b); });
        $("#imp-help").textContent = tr(mode === "fusion"
          ? "Fusionner : ajoute les notes, favoris et progressions manquants, sans rien supprimer."
          : "Remplacer : efface les données de cet appareil et installe celles du fichier.");
      });
    });

    $("#imp-go").addEventListener("click", function () {
      var f = $("#imp-file").files && $("#imp-file").files[0];
      if (!f) { toast("Choisissez d'abord un fichier"); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var info = appliquerSauvegarde(JSON.parse(String(fr.result)), mode === "fusion");
          closeSheet();
          applySettings();
          render();
          toast("Restauré ✓ " + info.notes + " note(s), " + info.favoris + " favori(s)");
        } catch (err) {
          toast("Fichier illisible : " + err.message);
        }
      };
      fr.onerror = function () { toast("Lecture du fichier impossible"); };
      fr.readAsText(f);
    });
  }

  function viewBible() {
    inflate();
    var h = '<h2 class="section-h">La Bible</h2>' +
      '<p class="section-sub">' + esc(versionNom(version)) + " · 66 " +
      esc(t("misc.books")) + " · 1 189 " + esc(t("misc.chapters")) + "</p>";
    h += '<input class="field" id="q" placeholder="🔍 Rechercher un mot, plusieurs mots, ou « Jean 3:16 »…" ' +
      'autocomplete="off" style="margin-bottom:6px">' +
      '<p class="muted" style="font-size:.78rem;margin:0 0 14px">' +
      "Plusieurs mots : seuls les versets qui les contiennent tous sont affichés. " +
      "Une référence ouvre directement le passage.</p>";
    h += '<div id="qres"></div>';
    h += '<div id="explorer">';

    // reprendre la lecture là où on s'est arrêté
    var L = S.lecture;
    if (L && BY_ABBR[L.a]) {
      h += '<div class="card" style="margin-bottom:14px"><div class="card-title">📖 Reprendre la lecture</div>' +
        '<div class="row" style="border:none;padding:0">' +
        '<div class="grow"><div class="ttl">' + esc(bookName(L.a) + " " + L.c) + "</div>" +
        '<div class="meta">' + esc(verseText(L.a + " " + L.c + ":1").slice(0, 64)) + "…</div></div>" +
        '<button class="btn sm" data-read="' + L.a + " " + L.c + '">Lire ▸</button></div></div>';
    }

    // versets surlignés
    var hlRefs = Object.keys(S.surlignes || {});
    if (hlRefs.length) {
      h += '<div class="card" style="margin-bottom:14px"><div class="card-title">🖍 Mes surlignages (' +
        hlRefs.length + ")</div>";
      hlRefs.slice(-6).reverse().forEach(function (r) {
        h += '<div class="row"><div class="grow">' +
          '<div class="ttl">' + esc(refLabel(r)) + "</div>" +
          '<div class="meta">' + esc(verseText(r).slice(0, 70)) + "…</div></div>" +
          '<button class="btn sm" data-open="' + r + '">Ouvrir</button></div>';
      });
      h += "</div>";
    }

    h += '<div class="card-title" style="margin-top:18px">Ancien Testament</div><div class="grid three">';
    BOOKS.forEach(function (b) {
      if (b.t === 0) h += '<button class="tile" style="min-height:56px" data-book="' + b.a + '">' +
        '<span class="lb">' + esc(b.n) + "</span>" +
        '<span class="sub">' + b.c.length + " ch.</span></button>";
    });
    h += "</div>";
    h += '<div class="card-title" style="margin-top:18px">Nouveau Testament</div><div class="grid three">';
    BOOKS.forEach(function (b) {
      if (b.t === 1) h += '<button class="tile" style="min-height:56px" data-book="' + b.a + '">' +
        '<span class="lb">' + esc(b.n) + "</span>" +
        '<span class="sub">' + b.c.length + " ch.</span></button>";
    });
    h += "</div></div>";
    return h;
  }

  // texte simplifié : minuscules, sans accents, apostrophes unifiées
  function norm(s) {
    return String(s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "'");
  }

  // Reconnaît « Jean 3:16 », « jn 3.16 », « 1 co 13 », « psaume 23 »…
  function chercherReference(q) {
    var m = /^\s*(\d?\s*[^\d:.,\s][^\d:.,]*?)\s*(\d+)\s*(?:[:.,\s]\s*(\d+))?\s*$/.exec(q);
    if (!m) return null;
    var nom = norm(m[1]).replace(/\.$/, "").trim();
    if (nom.length < 2) return null;
    var cand = null;
    for (var i = 0; i < BOOKS.length; i++) {
      var n = norm(BOOKS[i].n);
      var a = norm(BOOKS[i].a);
      if (n === nom || a === nom) { cand = BOOKS[i]; break; }
      if (!cand && (n.indexOf(nom) === 0 || nom.indexOf(a) === 0)) cand = BOOKS[i];
    }
    if (!cand) return null;
    var c = +m[2];
    if (!c || c > cand.c.length) return null;
    var v = m[3] ? +m[3] : null;
    if (v && !cand.c[c - 1][v - 1]) v = null;
    return { a: cand.a, c: c, v: v, nom: cand.n };
  }

  // état des filtres de recherche
  var QF = { portee: "tout" };   // "tout" | "at" | "nt"

  function search(q) {
    inflate();
    q = q.trim();
    var box = $("#qres");
    var exp = $("#explorer");
    if (q.length < 3) {
      box.innerHTML = "";
      if (exp) exp.classList.remove("hide");
      return;
    }
    if (exp) exp.classList.add("hide");

    var h = "";

    // 1) accès direct par référence
    var dir = chercherReference(q);
    if (dir) {
      var refDir = dir.a + " " + dir.c + (dir.v ? ":" + dir.v : "");
      h += '<div class="card" style="margin-bottom:14px"><div class="card-title">📍 Référence</div>' +
        '<div class="verse-ref" style="font-size:.86rem;margin-bottom:4px">' +
        esc(dir.nom + " " + dir.c + (dir.v ? ":" + dir.v : "")) + "</div>" +
        '<div style="font-size:.95rem">' +
        esc(verseText(refDir).slice(0, 190)) + (verseText(refDir).length > 190 ? "…" : "") + "</div>" +
        '<button class="btn sm" style="margin-top:9px" data-open="' + refDir + '">Ouvrir ▸</button></div>';
    }

    // 2) recherche plein texte : tous les mots doivent être présents (ET)
    var mots = norm(q).split(/\s+/).filter(function (m) { return m.length > 1; });
    if (!mots.length) mots = [norm(q)];

    var res = [];
    var tronque = false;
    for (var bi = 0; bi < BOOKS.length && !tronque; bi++) {
      var b = BOOKS[bi];
      if (QF.portee === "at" && b.t !== 0) continue;
      if (QF.portee === "nt" && b.t !== 1) continue;
      for (var ci = 0; ci < b.c.length && !tronque; ci++) {
        var ch = b.c[ci];
        for (var vi = 0; vi < ch.length; vi++) {
          var t = norm(ch[vi]);
          var ok = true;
          for (var mi = 0; mi < mots.length; mi++) {
            if (t.indexOf(mots[mi]) === -1) { ok = false; break; }
          }
          if (ok) {
            res.push({ ref: b.a + " " + (ci + 1) + ":" + (vi + 1), txt: ch[vi] });
            if (res.length >= 300) { tronque = true; break; }
          }
        }
      }
    }

    // filtres de portée
    h += '<div class="qfilters">';
    [["tout", "Toute la Bible"], ["at", "Ancien Testament"], ["nt", "Nouveau Testament"]]
      .forEach(function (f) {
        h += '<button class="btn sm' + (QF.portee === f[0] ? " on" : "") +
          '" data-qf="' + f[0] + '">' + f[1] + "</button>";
      });
    h += "</div>";

    if (!res.length) {
      box.innerHTML = h + '<div class="empty"><span class="ic">🔍</span>Aucun résultat pour « ' +
        esc(q) + " »" + (QF.portee !== "tout" ? " dans cette partie de la Bible" : "") + ".</div>";
      traduireArbre(box);
      brancherFiltres(q);
      return;
    }

    var rx = new RegExp("(" + mots.map(function (m) {
      return m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|") + ")", "gi");

    h += '<div class="muted" style="font-size:.83rem;margin-bottom:10px">' +
      res.length + (tronque ? "+ résultats (affinez la recherche)"
        : " résultat" + (res.length > 1 ? "s" : "")) +
      (mots.length > 1 ? " contenant tous les mots" : "") + "</div>";

    res.forEach(function (r) {
      h += '<div style="padding:11px 0;border-bottom:1px solid var(--line)">' +
        '<div class="verse-ref" style="font-size:.84rem;margin-bottom:3px">' + esc(refLabel(r.ref)) + "</div>" +
        "<div>" + esc(r.txt).replace(rx, "<mark>$1</mark>") + "</div>" +
        '<div style="margin-top:7px;display:flex;gap:6px">' +
        '<button class="btn sm" data-open="' + r.ref + '">Ouvrir</button>' +
        '<button class="btn sm' + (isFav(r.ref) ? " on" : "") + '" data-fav="' + r.ref + '">' +
        (isFav(r.ref) ? "★" : "☆") + "</button>" +
        '<button class="btn sm" data-share="' + r.ref + '">↗</button></div></div>';
    });
    box.innerHTML = h;
    traduireArbre(box);
    brancherFiltres(q);
  }

  function brancherFiltres(q) {
    $$("[data-qf]").forEach(function (b) {
      b.addEventListener("click", function () {
        QF.portee = b.dataset.qf;
        search(q);
      });
    });
  }

  // --- Lecteur plein écran -------------------------------------------------
  var RD = { a: null, c: 1, sel: [] };

  function closeReader() {
    stopLecture(true);
    var r = $(".reader");
    if (r) r.remove();
    document.body.style.overflow = "";
    var sb = $(".selbar");
    if (sb) sb.remove();
  }

  function openReader(abbr, chap, highlight) {
    inflate();
    var b = BY_ABBR[abbr];
    if (!b) return;
    chap = Math.min(Math.max(1, chap || 1), b.c.length);
    RD = { a: abbr, c: chap, sel: [] };
    explorerState = { book: abbr, chap: chap };
    S.lecture = { a: abbr, c: chap };
    save();

    closeSheet();
    closeReader();

    var r = el('<div class="reader" role="dialog" aria-modal="true" aria-label="Lecture de la Bible">' +
      '<div class="reader-top">' +
      '<button class="icon-btn" id="rd-close" aria-label="Fermer la lecture">✕</button>' +
      '<button class="reader-title" id="rd-pick" aria-label="Choisir le livre et le chapitre">' +
      '<span id="rd-name"></span><span class="caret">▼</span></button>' +
      '<button class="icon-btn" id="rd-play" aria-label="Écouter le chapitre" title="Écouter le chapitre">🔊</button>' +
      '<button class="icon-btn" id="rd-lines" aria-label="Changer la présentation" title="Présentation">☰</button>' +
      "</div>" +
      '<div class="reader-body" id="rd-body"><div class="reader-inner" id="rd-inner"></div></div>' +
      "</div>");
    document.body.appendChild(r);
    traduireArbre(r);
    document.body.style.overflow = "hidden";

    r.addEventListener("click", function (e) {
      if (e.target.closest("#rd-close")) { closeReader(); return; }
      if (e.target.closest("#rd-play")) {
        if (LECT.actif) stopLecture(); else lireChapitre(RD.sel.length ? RD.sel[0] : 1);
        return;
      }
      if (e.target.closest("#lec-pause")) { pauseLecture(); return; }
      if (e.target.closest("#lec-speed")) { changerVitesse(); return; }
      if (e.target.closest("#lec-stop")) { stopLecture(); return; }
      if (e.target.closest("#rd-pick")) { pickerSheet(); return; }
      if (e.target.closest("#rd-lines")) {
        S.proseLignes = !S.proseLignes;
        save();
        paintReader();
        toast(S.proseLignes ? "Un verset par ligne" : "Texte au fil");
        return;
      }
      var nav = e.target.closest("[data-rdchap]");
      if (nav) { openReader(RD.a, +nav.dataset.rdchap); return; }
      if (e.target.closest(".lectbar")) return;
      var v = e.target.closest(".v");
      if (v) { toggleSel(+v.dataset.n); return; }
      // clic dans le vide : on désélectionne
      if (RD.sel.length && !e.target.closest(".selbar")) clearSel();
    });

    paintReader();
    if (highlight) {
      setTimeout(function () {
        var t = $("#rv" + highlight, r);
        if (t) t.scrollIntoView({ block: "center" });
        toggleSel(highlight);
      }, 50);
    }
  }

  function paintReader() {
    var b = BY_ABBR[RD.a];
    var ch = b.c[RD.c - 1];
    $("#rd-name").textContent = b.n + " " + RD.c;

    var h = '<h1 class="reader-h">' + esc(b.n) + " " + RD.c + "</h1>";
    h += '<p class="reader-sub">' + esc(versionNom(version)) + " · " +
      ch.length + " " + esc(t("misc.verses")) + "</p>";
    h += '<div class="prose' + (S.proseLignes ? " lines" : "") + '" id="rd-prose">';
    ch.forEach(function (t, i) {
      var n = i + 1;
      var ref = RD.a + " " + RD.c + ":" + n;
      var hl = S.surlignes[ref];
      h += '<span class="v' + (hl ? " hl" + hl : "") + '" id="rv' + n + '" data-n="' + n +
        '" data-vref="' + ref + '"><span class="vn">' + n + "</span>" + esc(t) + "</span> ";
    });
    h += "</div>";

    h += '<div class="reader-nav">';
    if (RD.c > 1) h += '<button class="btn" data-rdchap="' + (RD.c - 1) + '">← ' + esc(b.n) + " " + (RD.c - 1) + "</button>";
    if (RD.c < b.c.length) h += '<button class="btn" data-rdchap="' + (RD.c + 1) + '">' + esc(b.n) + " " + (RD.c + 1) + " →</button>";
    h += "</div>";

    $("#rd-inner").innerHTML = h;
    traduireArbre($("#rd-inner"));
    $("#rd-body").scrollTop = 0;
    RD.sel = [];
    renderSelbar();
    if (LECT.actif) { marquerVersetLu(LECT.n); majBarreLecture(); }
  }

  // --- Sélection de versets -------------------------------------------------
  function toggleSel(n) {
    var i = RD.sel.indexOf(n);
    if (i === -1) RD.sel.push(n); else RD.sel.splice(i, 1);
    RD.sel.sort(function (a, b) { return a - b; });
    $$(".prose .v").forEach(function (v) {
      v.classList.toggle("sel", RD.sel.indexOf(+v.dataset.n) !== -1);
    });
    renderSelbar();
  }
  function clearSel() {
    RD.sel = [];
    $$(".prose .v").forEach(function (v) { v.classList.remove("sel"); });
    renderSelbar();
  }

  // Référence compacte de la sélection : « Jean 3:16-18 »
  function selRef() {
    if (!RD.sel.length) return null;
    var a = RD.sel[0], z = RD.sel[RD.sel.length - 1];
    var contigu = (z - a + 1) === RD.sel.length;
    return RD.a + " " + RD.c + ":" + (contigu && z !== a ? a + "-" + z : a);
  }
  function selTexte() {
    var b = BY_ABBR[RD.a];
    return RD.sel.map(function (n) { return b.c[RD.c - 1][n - 1]; }).join(" ");
  }

  function renderSelbar() {
    var old = $(".selbar");
    if (old) old.remove();
    if (!RD.sel.length) return;
    var ref = selRef();
    var txt = selTexte();
    var bar = el('<div class="selbar">' +
      '<div class="selref">' + esc(refLabel(ref)) +
      (RD.sel.length > 1 ? " · " + RD.sel.length + " versets" : "") + "</div>" +
      '<div class="acts">' +
      '<button class="btn sm" data-speak="' + esc(txt) + '"><span class="ic">🔊</span>Écouter</button>' +
      '<button class="btn sm" data-fav="' + ref + '"><span class="ic">' +
        (isFav(ref) ? "★" : "☆") + "</span>Favori</button>" +
      '<button class="btn sm" data-note="' + ref + '"><span class="ic">✍️</span>Noter</button>' +
      '<button class="btn sm" data-share="' + ref + '"><span class="ic">↗</span>Partager</button>' +
      '<button class="btn sm" data-copy="' + esc("« " + txt + " » — " + refLabel(ref)) +
        '"><span class="ic">⧉</span>Copier</button>' +
      "</div>" +
      '<div class="hl-swatches">' +
      ["j", "v", "b", "r", ""].map(function (c) {
        return '<button class="hl-sw" data-hl="' + c + '" aria-label="' +
          (c ? "Surligner" : "Retirer le surlignage") + '"></button>';
      }).join("") +
      "</div></div>");
    traduireArbre(bar);
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var sw = e.target.closest(".hl-sw");
      if (!sw) return;
      var couleur = sw.dataset.hl;
      RD.sel.forEach(function (n) {
        var r = RD.a + " " + RD.c + ":" + n;
        if (couleur) S.surlignes[r] = couleur;
        else delete S.surlignes[r];
      });
      save();
      var sel = RD.sel.slice();
      paintReader();
      sel.forEach(function (n) {
        var v = $("#rv" + n);
        if (v) v.classList.add("sel");
      });
      RD.sel = sel;
      renderSelbar();
      toast(couleur ? "Surligné" : "Surlignage retiré");
    });
  }

  // --- Sélecteur livre / chapitre ------------------------------------------
  function pickerSheet(mode) {
    inflate();
    var sh = sheet("", '<div class="picker-tabs">' +
      '<button class="btn sm" data-pk="livres">Livres</button>' +
      '<button class="btn sm" data-pk="chapitres">Chapitres</button></div>' +
      '<div id="pk-body"></div>');
    var etat = mode || "livres";
    var choisi = RD.a || "GEN";

    function peindre() {
      $$("[data-pk]", sh).forEach(function (b) {
        b.classList.toggle("on", b.dataset.pk === etat);
      });
      var h = "";
      if (etat === "livres") {
        h += '<div class="book-list">';
        [0, 1].forEach(function (t) {
          h += '<div class="card-title" style="margin:10px 0 6px">' +
            (t === 0 ? "Ancien Testament" : "Nouveau Testament") + "</div>";
          BOOKS.forEach(function (b) {
            if (b.t !== t) return;
            h += '<div class="row" data-pkbook="' + b.a + '"><div class="grow">' +
              '<div class="ttl">' + esc(b.n) + "</div>" +
              '<div class="meta">' + b.c.length + " chapitre" + (b.c.length > 1 ? "s" : "") + "</div></div>" +
              '<span class="chev">›</span></div>';
          });
        });
        h += "</div>";
      } else {
        var b = BY_ABBR[choisi];
        h += '<div class="card-title" style="margin:0 0 10px">' + esc(b.n) + "</div>";
        h += '<div class="chap-grid">';
        for (var i = 1; i <= b.c.length; i++) {
          h += '<button class="btn sm' + (choisi === RD.a && i === RD.c ? " on" : "") +
            '" data-pkchap="' + i + '">' + i + "</button>";
        }
        h += "</div>";
      }
      $("#pk-body", sh).innerHTML = h;
      traduireArbre($("#pk-body", sh));
    }

    sh.addEventListener("click", function (e) {
      var t = e.target.closest("[data-pk]");
      if (t) { etat = t.dataset.pk; peindre(); return; }
      var bk = e.target.closest("[data-pkbook]");
      if (bk) { choisi = bk.dataset.pkbook; etat = "chapitres"; peindre(); return; }
      var cp = e.target.closest("[data-pkchap]");
      if (cp) { closeSheet(); openReader(choisi, +cp.dataset.pkchap); }
    });
    peindre();
  }

  // Toute ouverture de chapitre passe par le lecteur plein écran
  function openChapter(abbr, chap, highlight) {
    openReader(abbr, chap, highlight);
  }

  function verseMenu(ref) {
    var txt = verseText(ref);
    sheet(refLabel(ref),
      "<p style=\"margin:.3rem 0 1rem\">" + esc(txt) + "</p>" +
      '<div class="grid two">' +
      '<button class="btn" data-speak="' + esc(txt) + '">🔊 Écouter</button>' +
      '<button class="btn' + (isFav(ref) ? " on" : "") + '" data-fav="' + ref + '">' +
      (isFav(ref) ? "★ Favori" : "☆ Favori") + "</button>" +
      '<button class="btn" data-note="' + ref + '">✍️ Noter</button>' +
      '<button class="btn" data-share="' + ref + '">↗ Partager</button>' +
      '<button class="btn" data-carte="' + ref + '">🖼 Carte image</button></div>' +
      '<button class="btn block" style="margin-top:12px" data-close>Fermer</button>');
  }

  function viewPlus() {
    var h = '<h2 class="section-h">Plus</h2><p class="section-sub">Profil, favoris, guide et réglages.</p>';

    // --- profil ---
    var pf = S.profil;
    h += '<div class="card"><div class="card-title">👤 Mon profil</div><div class="prof">';
    h += '<div class="big-ava">' + esc((pf && pf.avatar) || "🌿") + "</div>";
    h += '<div class="grow" style="min-width:0">';
    if (pf && pf.nom) {
      h += '<div class="nm">' + esc(pf.nom) + "</div>";
      var det = [];
      if (pf.depuis) det.push("membre depuis le " + esc(pf.depuis.split("-").reverse().join("/")));
      if (pf.heure) det.push("méditation à " + esc(pf.heure));
      h += '<div class="mt">' + det.join(" · ") + "</div>";
    } else {
      h += '<div class="nm">Visiteur</div>' +
        '<div class="mt">Ajoutez votre prénom pour personnaliser l\'accueil</div>';
    }
    h += "</div>";
    h += '<button class="btn sm" id="prof-edit">' + (pf && pf.nom ? "Modifier" : "Créer") + "</button>";
    h += "</div></div>";

    if (installable()) {
      h += '<div class="card"><div class="card-title">📲 Installer l\'application</div>' +
        '<p class="muted" style="font-size:.88rem;margin:0 0 12px">Ajoutez Méditation Biblique ' +
        "à votre écran d'accueil : elle s'ouvrira en plein écran et fonctionnera sans connexion.</p>" +
        '<button class="btn primary block" id="pwa-install">Installer sur mon appareil</button></div>';
    }

    var stp = statsProgression();
    h += '<button class="card wide-link" id="go-progres">' +
      '<div class="card-title">📈 Ma progression</div>' +
      '<p class="muted" style="font-size:.88rem;margin:0">' +
      stp.total + " jour(s) médité(s) · série de " + stp.serie +
      " · record " + stp.record + " · " +
      badgesObtenus().filter(function (x) { return x.ok; }).length + " badge(s)</p></button>";

    h += '<div class="card"><div class="card-title">★ Mes favoris (' + S.favoris.length + ")</div>";
    if (!S.favoris.length) {
      h += '<p class="muted" style="font-size:.9rem;margin:0">Touchez ☆ sur un verset pour le retrouver ici.</p>';
    } else {
      S.favoris.forEach(function (ref) {
        h += '<div style="padding:11px 0;border-bottom:1px solid var(--line)">' +
          '<div class="verse-ref" style="font-size:.85rem;margin-bottom:3px">' + esc(refLabel(ref)) + "</div>" +
          "<div style=\"font-size:.95rem\">" + esc(verseText(ref)) + "</div>" +
          '<div style="margin-top:7px;display:flex;gap:6px">' +
          '<button class="btn sm" data-open="' + ref + '">Ouvrir</button>' +
          '<button class="btn sm" data-share="' + ref + '">↗</button>' +
          '<button class="btn sm" data-fav="' + ref + '">Retirer</button></div></div>';
      });
    }
    h += "</div>";

    h += '<div class="card"><div class="card-title">🕯️ Guide de méditation en 5 étapes</div>';
    [
      ["Se préparer", "Trouvez un lieu calme. Respirez lentement. Demandez à Dieu d'ouvrir votre cœur avant de lire."],
      ["Lire lentement", "Lisez le verset à voix haute, deux ou trois fois. Ne vous pressez pas : laissez les mots se poser."],
      ["Observer", "Que dit ce texte de Dieu ? De l'homme ? Y a-t-il une promesse, un ordre, un exemple à suivre ?"],
      ["Appliquer", "Qu'est-ce que cela change pour ma journée ? Choisissez une seule chose concrète à vivre aujourd'hui."],
      ["Prier", "Répondez à Dieu avec vos propres mots : remerciez, demandez, confiez. Puis notez ce que vous retenez."]
    ].forEach(function (s, i) {
      h += '<div class="step"><div class="num">' + (i + 1) + "</div><div>" +
        "<h4>" + esc(s[0]) + "</h4><p>" + esc(s[1]) + "</p></div></div>";
    });
    h += "</div>";

    // --- Bible : langue de l'interface et version affichée -----------------
    h += '<div class="card"><div class="card-title">📖 ' + esc(t("set.version")) + "</div>";
    h += '<label class="lbl">' + esc(t("set.language")) + '</label>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn sm' + (langue === "fr" ? " on" : "") +
      '" style="flex:1" data-lang="fr">🇫🇷 Français</button>' +
      '<button class="btn sm' + (langue === "en" ? " on" : "") +
      '" style="flex:1" data-lang="en">🇬🇧 English</button></div>';

    h += '<p class="muted" style="font-size:.8rem;margin:12px 0 6px">' +
      esc(t("set.version.sub")) + "</p>";
    [["fr", t("ver.french")], ["en", t("ver.english")]].forEach(function (g) {
      var liste = versionsParLangue(g[0]);
      if (!liste.length) return;
      h += '<label class="lbl">' + esc(g[1]) + "</label>" +
        '<div class="ver-list">';
      liste.forEach(function (v) {
        h += '<button class="btn sm ver-pick' + (version === v.id ? " on" : "") +
          '" data-ver="' + esc(v.id) + '">' +
          '<span class="ver-id">' + esc(v.id) + "</span> " +
          esc(langue === "en" ? v.nen : v.nfr) + "</button>";
      });
      h += "</div>";
    });
    h += '<button class="btn sm block" id="ver-compare" style="margin-top:12px">⚖️ ' +
      esc(t("ver.compare")) + "</button>";
    h += '<p class="muted" style="font-size:.78rem;margin:10px 0 0">' +
      esc(t("ver.note.versification")) + "</p>";
    h += "</div>";

    h += '<div class="card"><div class="card-title">⚙️ ' + esc(t("plus.settings")) + "</div>";
    h += '<label class="lbl">' + esc(t("set.textsize")) + '</label><div style="display:flex;gap:8px">';
    var TAILLES = langue === "en"
      ? [["Small", 0.9], ["Normal", 1], ["Large", 1.15], ["Very large", 1.3]]
      : [["Petit", 0.9], ["Normal", 1], ["Grand", 1.15], ["Très grand", 1.3]];
    TAILLES.forEach(function (t) {
      h += '<button class="btn sm' + (S.reglages.taille === t[1] ? " on" : "") +
        '" style="flex:1" data-size="' + t[1] + '">' + t[0] + "</button>";
    });
    h += "</div>";
    h += '<label class="lbl">Apparence</label><div style="display:flex;gap:8px">' +
      '<button class="btn sm' + (S.reglages.theme === "jour" ? " on" : "") + '" style="flex:1" data-mode2="jour">☀️ Jour</button>' +
      '<button class="btn sm' + (S.reglages.theme === "nuit" ? " on" : "") + '" style="flex:1" data-mode2="nuit">🌙 Nuit</button>' +
      '<button class="btn sm' + (S.reglages.theme === "auto" ? " on" : "") + '" style="flex:1" data-mode2="auto">📱 Auto</button></div>' +
      '<p class="muted" style="font-size:.78rem;margin:8px 0 0">Auto : suit le réglage clair / sombre de votre appareil' +
      (S.reglages.theme === "auto" ? " (actuellement " + (themeEffectif() === "nuit" ? "sombre" : "clair") + ")" : "") + ".</p>";

    if (rappelsDisponibles()) {
      h += '<label class="lbl">Rappel quotidien</label>';
      if (!S.profil || !S.profil.heure) {
        h += '<p class="muted" style="font-size:.84rem;margin:0">' +
          "Indiquez d'abord votre moment de méditation dans votre profil.</p>";
      } else if (rappelsActifs()) {
        h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<span class="chip">⏰ Actif à ' + esc(S.profil.heure) + "</span>" +
          '<button class="btn sm" id="rap-off">Désactiver</button></div>' +
          '<p class="muted" style="font-size:.78rem;margin:8px 0 0">' +
          "Le rappel s'affiche si l'application est ouverte ou installée sur l'appareil.</p>";
      } else {
        h += '<button class="btn sm block" id="rap-on">⏰ M\'avertir à ' + esc(S.profil.heure) + "</button>" +
          '<p class="muted" style="font-size:.78rem;margin:8px 0 0">' +
          "Notification locale, sans compte ni serveur.</p>";
      }
    }
    h += "</div>";

    h += '<div class="card"><div class="card-title">💾 Mes données</div>' +
      '<p class="muted" style="font-size:.86rem;margin:0 0 12px">Tout est stocké sur cet appareil. ' +
      "Faites une sauvegarde avant de changer de téléphone ou de vider le cache du navigateur.</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn sm" id="bkexport">💾 Sauvegarder (JSON)</button>' +
      '<button class="btn sm" id="bkimport">↺ Restaurer</button>' +
      '<button class="btn sm" id="jexport2">⬇ Exporter le journal (texte)</button>' +
      '<button class="btn sm" id="wipe">🗑 Tout effacer</button></div>';
    h += '<p class="muted" style="font-size:.8rem;margin:12px 0 0">' +
      S.notes.length + " note(s) · " + S.favoris.length + " favori(s) · " +
      Object.keys(S.surlignes || {}).length + " surlignage(s) · " +
      Object.keys(S.plans || {}).length + " plan(s) en cours</p>";
    h += "</div>";

    h += '<div class="card center"><div style="font-size:1.8rem">🌿</div>' +
      '<p style="margin:6px 0 2px;font-weight:600">Méditation Biblique</p>' +
      '<p class="muted" style="font-size:.84rem;margin:0">Version 1.5.0 · fonctionne hors-ligne</p>' +
      '<p class="muted" style="font-size:.8rem;margin:10px 0 0">Texte : ' +
      esc(versionNom(version)) + ", " + esc(versionInfo(version) ? versionInfo(version).licence : "") + ".<br>" +
      "Vos données ne quittent jamais cet appareil.</p></div>";
    return h;
  }

  // --- Rendu ---------------------------------------------------------------
  var VIEWS = {
    jour: viewJour,
    plans: viewPlans,
    perso: viewPerso,
    themes: viewThemes,
    bible: viewBible,
    journal: viewJournal,
    progres: viewProgres,
    plus: viewPlus
  };

  function render() {
    var main = $("#main");
    main.innerHTML = VIEWS[current]();
    traduireArbre(main);
    $$("nav.tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.tab === current ? "true" : "false");
    });
    main.scrollTop = 0;
    if (current === "bible") {
      var q = $("#q");
      var t = null;
      q.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () { search(q.value); }, 220);
      });
    }
    if (current === "journal") {
      var jq = $("#jq");
      if (jq) {
        var jt = null;
        jq.addEventListener("input", function () {
          clearTimeout(jt);
          jt = setTimeout(function () {
            JF.q = jq.value;
            var pos = jq.selectionStart;
            render();
            var neuf = $("#jq");
            if (neuf) { neuf.focus(); try { neuf.setSelectionRange(pos, pos); } catch (e) {} }
          }, 260);
        });
      }
      $$("[data-jtag]").forEach(function (b) {
        b.addEventListener("click", function () { JF.tag = b.dataset.jtag; render(); });
      });
    }
  }

  // « auto » suit le réglage clair/sombre du téléphone
  function systemeSombre() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) { return false; }
  }

  function themeEffectif() {
    if (S.reglages.theme === "auto") return systemeSombre() ? "nuit" : "jour";
    return S.reglages.theme === "nuit" ? "nuit" : "jour";
  }

  function applySettings() {
    var eff = themeEffectif();
    document.documentElement.style.setProperty("--fs", S.reglages.taille + "rem");
    document.documentElement.setAttribute("data-theme", eff);
    var mt = $('meta[name="theme-color"]');
    if (mt) mt.setAttribute("content", eff === "nuit" ? "#161a17" : "#faf8f3");

    // langue et version : on valide les valeurs enregistrées
    if (LANGUES.indexOf(S.reglages.langue) === -1) S.reglages.langue = "fr";
    if (!versionInfo(S.reglages.version)) S.reglages.version = VERSION_DEFAUT;
    langue = S.reglages.langue;
    version = S.reglages.version;
    appliquerLangueDocument();
  }

  // --- Traduction de l'interface -------------------------------------------
  // Les vues sont écrites en français ; quand la langue est « en », on traduit
  // les libellés au moment du rendu. On ne touche jamais au texte biblique :
  // les éléments qui le portent sont exclus (.verse-text, .prose, .v…).
  var UI_EN = window.UI_EN || { exact: {}, patterns: [] };
  var UI_RE = null;

  function motifs() {
    if (!UI_RE) {
      UI_RE = (UI_EN.patterns || []).map(function (p) {
        return [new RegExp(p[0]), p[1]];
      });
    }
    return UI_RE;
  }

  // Marqueur « mot|s » : le « s » n'est gardé que si le nombre qui précède
  // vaut autre chose que 1 (l'anglais accorde là où le français ne le fait pas).
  function pluriel(s) {
    if (s.indexOf("|") === -1) return s;
    return s.replace(/(\d[\d\s,.]*)?(\s*)([A-Za-z]+)\|s/g,
      function (m, nb, esp, mot) {
        var n = nb ? parseFloat(String(nb).replace(/[\s,]/g, "")) : 0;
        return (nb || "") + (esp || "") + mot + (n === 1 ? "" : "s");
      });
  }

  // Traduit un libellé isolé (retourne la chaîne d'origine si inconnue).
  function tr(s) {
    if (langue !== "en" || !s) return s;
    var brut = String(s);
    var noyau = brut.trim();
    if (!noyau) return brut;
    var table = UI_EN.exact || {};
    var out = null;
    if (table[noyau] !== undefined) {
      out = table[noyau];
    } else {
      var re = motifs();
      for (var i = 0; i < re.length; i++) {
        if (re[i][0].test(noyau)) {
          out = noyau.replace(re[i][0], re[i][1]);
          break;
        }
      }
    }
    if (out === null) return brut;
    out = pluriel(out);
    // on conserve les espaces qui entouraient le libellé
    var avant = brut.match(/^\s*/)[0];
    var apres = brut.match(/\s*$/)[0];
    return avant + out + apres;
  }

  // Éléments dont le contenu est du texte biblique ou saisi par l'utilisateur.
  var SANS_TRAD = ".verse-text,.prose,.cmp-text,.vt,.ntext,.note-texte," +
    "textarea,input,script,style,[data-notr]";

  function traduireArbre(racine) {
    if (langue !== "en" || !racine) return;
    var doc = racine.ownerDocument || document;
    if (!doc.createTreeWalker) return;
    var w = doc.createTreeWalker(racine, 4 /* SHOW_TEXT */, null, false);
    var lot = [];
    var n;
    while ((n = w.nextNode())) lot.push(n);
    lot.forEach(function (noeud) {
      var s = noeud.textContent;
      if (!s || !s.trim()) return;
      var p = noeud.parentElement;
      if (p && p.closest && p.closest(SANS_TRAD)) return;
      var t2 = tr(s);
      if (t2 !== s) noeud.textContent = t2;
    });
    // libellés portés par des attributs
    var attrs = ["placeholder", "aria-label", "title"];
    var els = racine.querySelectorAll ? racine.querySelectorAll("[placeholder],[aria-label],[title]") : [];
    Array.prototype.forEach.call(els, function (e) {
      attrs.forEach(function (a) {
        var v = e.getAttribute(a);
        if (v) {
          var t3 = tr(v);
          if (t3 !== v) e.setAttribute(a, t3);
        }
      });
    });
  }

  // Traduit le squelette HTML (onglets, en-tête) et l'attribut lang.
  function appliquerLangueDocument() {
    document.documentElement.setAttribute("lang", langue);
    var titre = $(".brand");
    if (titre) titre.innerHTML = '<span class="leaf">🌿</span> ' + esc(t("app.title"));
    $$("nav.tabs button").forEach(function (b) {
      var cle = "tab." + b.dataset.tab;
      var ic = b.querySelector(".ic");
      b.innerHTML = (ic ? ic.outerHTML : "") + esc(t(cle));
    });
    var dk = $("#dark-toggle");
    if (dk) {
      dk.setAttribute("aria-label", t("set.theme"));
      dk.setAttribute("title", t("set.theme"));
    }
  }

  // Change la version affichée : on décompresse à la demande puis on redessine.
  function changerVersion(id) {
    if (!versionInfo(id) || id === version) return;
    S.reglages.version = id;
    version = id;
    save();
    actualiserBooks();
    stopLecture(true);
    render();
    toast(t("ver.changed") + " · " + versionNom(id));
  }

  // Change la langue de l'interface (et bascule vers une version de cette
  // langue si l'utilisateur n'en a pas choisi une explicitement).
  function changerLangue(lg) {
    if (LANGUES.indexOf(lg) === -1 || lg === langue) return;
    S.reglages.langue = lg;
    langue = lg;
    var info = versionInfo(version);
    if (!info || info.lang !== lg) {
      var dispo = versionsParLangue(lg);
      if (dispo.length) {
        version = dispo[0].id;
        S.reglages.version = version;
      }
    }
    save();
    renommerLivres();
    actualiserBooks();
    stopLecture(true);
    appliquerLangueDocument();
    render();
  }

  // en mode auto, on réagit au changement système sans recharger
  try {
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var surChangement = function () {
        if (S.reglages.theme === "auto") { applySettings(); render(); }
      };
      if (mq.addEventListener) mq.addEventListener("change", surChangement);
      else if (mq.addListener) mq.addListener(surChangement);
    }
  } catch (e) { /* sans importance */ }

  // --- Événements globaux --------------------------------------------------
  document.addEventListener("click", function (e) {
    if (e.target.closest("#prof-edit")) { profilSheet(); return; }
    var t = e.target.closest("[data-tab],[data-fav],[data-note],[data-share],[data-speak]," +
      "[data-copy],[data-close],[data-plan],[data-theme],[data-book],[data-open],[data-carte]," +
      "[data-off],[data-size],[data-mode2],[data-ndel],[data-nedit],[data-pstep],[data-pmode],[data-read]," +
      "[data-lang],[data-ver],[data-cmp]");
    if (!t) return;

    if (t.hasAttribute("data-tab")) {
      current = t.dataset.tab;
      offset = 0;
      touchStreak();
      render();
    } else if (t.hasAttribute("data-fav")) {
      toggleFav(t.dataset.fav);
      var sh = t.closest(".sheet");
      var inBar = t.closest(".selbar");
      render();
      if (inBar) { renderSelbar(); return; }
      if (sh) closeSheet();
    } else if (t.hasAttribute("data-note")) {
      noteSheet(t.dataset.note || null);
    } else if (t.hasAttribute("data-share")) {
      openShare(t.dataset.share);
    } else if (t.hasAttribute("data-carte")) {
      carteSheet(t.dataset.carte);
    } else if (t.hasAttribute("data-speak")) {
      speak(t.dataset.speak, t);
    } else if (t.hasAttribute("data-copy")) {
      copy(t.dataset.copy);
    } else if (t.hasAttribute("data-close")) {
      closeSheet();
    } else if (t.hasAttribute("data-plan")) {
      openPlan(t.dataset.plan);
    } else if (t.hasAttribute("data-theme")) {
      openTheme(t.dataset.theme);
    } else if (t.hasAttribute("data-read")) {
      var pr = parseRef(t.dataset.read);
      if (pr) openReader(pr.a, pr.c);
    } else if (t.hasAttribute("data-book")) {
      openChapter(t.dataset.book, 1);
    } else if (t.hasAttribute("data-open")) {
      var p = parseRef(t.dataset.open);
      closeSheet();
      if (p) openChapter(p.a, p.c, p.v);
    } else if (t.hasAttribute("data-off")) {
      var d = +t.dataset.off;
      offset = d === 0 ? 0 : Math.max(0, offset + d);
      render();
    } else if (t.hasAttribute("data-lang")) {
      changerLangue(t.dataset.lang);
    } else if (t.hasAttribute("data-ver")) {
      changerVersion(t.dataset.ver);
    } else if (t.hasAttribute("data-cmp")) {
      comparerSheet(t.dataset.cmp);
    } else if (t.hasAttribute("data-size")) {
      S.reglages.taille = +t.dataset.size;
      save();
      applySettings();
      render();
    } else if (t.hasAttribute("data-mode2")) {
      S.reglages.theme = t.dataset.mode2;
      save();
      applySettings();
      render();
    } else if (t.hasAttribute("data-pstep")) {
      // suivi : avancer / reculer d'un verset à la main
      var st = +t.dataset.pstep;
      var inf0 = persoRefFor(new Date());
      S.perso.pos = (S.perso.pos || 0) + st;
      save();
      var inf1 = persoRefFor(new Date());
      if (inf1) markVu(inf1.ref);
      if (inf0 && inf1 && inf1.cycle > inf0.cycle) toast("Nouveau cycle : on recommence 🌿");
      render();
    } else if (t.hasAttribute("data-pmode")) {
      // bascule suivi / aléatoire sans perdre le passage
      if (S.perso && S.perso.mode !== t.dataset.pmode) {
        S.perso.mode = t.dataset.pmode;
        save();
        var inf2 = persoRefFor(new Date());
        if (inf2) markVu(inf2.ref);
        render();
        toast(t.dataset.pmode === "suivi" ? "Méthode 📆 suivi" : "Méthode 🎲 aléatoire");
      }
    } else if (t.hasAttribute("data-nedit")) {
      noteSheet(null, t.dataset.nedit);
    } else if (t.hasAttribute("data-ndel")) {
      var id = t.dataset.ndel;
      S.notes = S.notes.filter(function (n) { return n.id !== id; });
      save();
      render();
      toast("Note supprimée");
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest("#jexport") || e.target.closest("#jexport2")) exportJournal();
    if (e.target.closest("#go-progres")) { current = "progres"; offset = 0; render(); }
    if (e.target.closest("#pwa-install")) lancerInstallation();
    if (e.target.closest("#rap-on")) demanderRappel();
    if (e.target.closest("#rap-off")) couperRappel();
    if (e.target.closest("#ver-compare")) comparerSheet(null);
    if (e.target.closest("#bkexport")) exportSauvegarde();
    if (e.target.closest("#bkimport")) importSauvegardeSheet();
    if (e.target.closest("#perso-edit")) persoSheet();
    if (e.target.closest("#perso-redraw")) {
      S.perso.tirage = (S.perso.tirage || 0) + 1;
      save();
      var inf = persoRefFor(new Date());
      if (inf) markVu(inf.ref);
      render();
      toast("Nouveau verset 🎲");
    }
    if (e.target.closest("#perso-tog")) {
      S.perso.actif = S.perso.actif === false;
      save();
      render();
    }
    if (e.target.closest("#perso-del")) {
      S.perso = null;
      save();
      render();
      toast("Méditation supprimée");
    }
    if (e.target.closest("#perso-go")) {
      current = "perso";
      offset = 0;
      render();
    }
    if (e.target.closest("#wipe")) {
      sheet("Tout effacer ?",
        '<p class="muted" style="font-size:.92rem">Votre profil, vos notes, favoris, surlignages ' +
        "et progressions seront définitivement supprimés de cet appareil.</p>" +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button class="btn" style="flex:1" data-close>Annuler</button>' +
        '<button class="btn primary" id="wipe2" style="flex:1">Tout effacer</button></div>');
    }
    if (e.target.closest("#wipe2")) {
      localStorage.removeItem(KEY);
      S = JSON.parse(JSON.stringify(DEFAULTS));
      closeSheet();
      applySettings();
      render();
      toast("Données effacées");
      onboarding();
    }
    if (e.target.closest("#dark-toggle")) {
      // depuis « auto », on bascule vers l'inverse de ce qui est affiché
      S.reglages.theme = themeEffectif() === "nuit" ? "jour" : "nuit";
      save();
      applySettings();
      render();
    }
  });

  // --- Installation sur l'écran d'accueil (PWA progressive) ----------------
  // Rien de tout cela n'est requis : ouvert en file://, le fichier fonctionne
  // exactement comme avant. Servi en http(s), l'application devient installable.
  var deferredInstall = null;

  function manifestJSON() {
    var icone = "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>" +
      "<rect width='512' height='512' rx='96' fill='#faf8f3'/>" +
      "<text x='256' y='368' font-size='300' text-anchor='middle'>\uD83C\uDF3F</text></svg>");
    return {
      name: "Méditation Biblique",
      short_name: "Méditation",
      description: "Verset du jour, plans de lecture et journal spirituel — 9 versions bibliques, hors-ligne.",
      lang: "fr",
      start_url: ".",
      scope: ".",
      display: "standalone",
      orientation: "portrait",
      background_color: "#faf8f3",
      theme_color: "#faf8f3",
      icons: [
        { src: icone, sizes: "512x512", type: "image/svg+xml", purpose: "any" },
        { src: icone, sizes: "512x512", type: "image/svg+xml", purpose: "maskable" }
      ]
    };
  }

  function setupPWA() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    try {
      var lien = document.createElement("link");
      lien.rel = "manifest";
      lien.href = URL.createObjectURL(
        new Blob([JSON.stringify(manifestJSON())], { type: "application/manifest+json" }));
      document.head.appendChild(lien);
    } catch (e) { /* manifeste facultatif */ }

    // Service worker : présent uniquement si le site est hébergé avec sw.js.
    // Son absence est sans conséquence, l'application reste utilisable.
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstall = e;
      if (current === "plus") render();
    });
    window.addEventListener("appinstalled", function () {
      deferredInstall = null;
      toast("Application installée 🌿");
      if (current === "plus") render();
    });
  }

  function installable() { return !!deferredInstall; }

  function lancerInstallation() {
    if (!deferredInstall) return;
    var p = deferredInstall;
    deferredInstall = null;
    p.prompt();
    if (p.userChoice && p.userChoice.then) {
      p.userChoice.then(function (r) {
        if (!r || r.outcome !== "accepted") toast("Installation annulée");
        if (current === "plus") render();
      });
    }
  }

  // --- Démarrage -----------------------------------------------------------
  // Décompression dans un Web Worker : l'écran de démarrage reste animé
  // pendant que les 31 170 versets sont décompressés en arrière-plan.
  // Si les workers ne sont pas disponibles (file:// sur certains navigateurs,
  // jsdom…), on retombe simplement sur la décompression synchrone.
  function inflateAsync(onProgress, id) {
    id = id || version;
    return new Promise(function (resolve, reject) {
      if (CACHE[id]) { resolve(CACHE[id]); return; }
      var src = $("#inflate-src");
      if (typeof window.Worker !== "function" || typeof URL.createObjectURL !== "function" || !src) {
        reject(new Error("worker indisponible"));
        return;
      }
      var code = src.textContent +
        "\nself.onmessage=function(e){" +
        "try{var t=self.gunzipToString(e.data);self.postMessage({ok:true,texte:t});}" +
        "catch(err){self.postMessage({ok:false,erreur:String(err)});}};";
      var url, w;
      try {
        url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        w = new Worker(url);
      } catch (e) { reject(e); return; }

      var fini = false;
      var minuteur = setTimeout(function () {
        if (fini) return;
        fini = true;
        try { w.terminate(); } catch (e) {}
        URL.revokeObjectURL(url);
        reject(new Error("délai dépassé"));
      }, 15000);

      w.onmessage = function (ev) {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        try { w.terminate(); } catch (e) {}
        URL.revokeObjectURL(url);
        if (!ev.data || !ev.data.ok) { reject(new Error(ev.data ? ev.data.erreur : "échec")); return; }
        if (onProgress) onProgress(0.85);
        resolve(construireBible(ev.data.texte, id));
      };
      w.onerror = function (e) {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        try { w.terminate(); } catch (er) {}
        URL.revokeObjectURL(url);
        reject(new Error(e.message || "erreur du worker"));
      };

      if (onProgress) onProgress(0.25);
      var bin = atob(BLOBS[id] || BLOBS[VERSION_DEFAUT]);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (onProgress) onProgress(0.45);
      w.postMessage(bytes, [bytes.buffer]);
    });
  }

  function progression(part) {
    var b = $("#load-bar");
    if (b) b.style.width = Math.round(part * 100) + "%";
  }

  function demarrer() {
    touchStreak();
    var l = $("#loader");
    if (l) l.remove();
    $("#app").classList.remove("hide");
    render();
    if (!S.profil) onboarding();
    if ("speechSynthesis" in window) {
      // chargement des voix dès le démarrage (asynchrone dans Chrome)
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener("voiceschanged", function () {
          VOIX_ATTENTES = true;
        });
      } catch (e) { /* ancien moteur de synthèse */ }
    }
    setupPWA();
    planifierRappel();
  }

  function echecChargement(err) {
    var l = $("#loader");
    if (l) {
      l.innerHTML = '<div class="empty"><span class="ic">⚠️</span>' +
        esc(t("app.loadfail")) + "<br><small>" + esc(String(err)) + "</small></div>";
    }
  }

  function boot() {
    verifierIntegrite();
    applySettings();
    progression(0.1);
    var lp = $("#loader p");
    if (lp) lp.textContent = t("app.loading");
    inflateAsync(progression).then(function () {
      progression(1);
      actualiserBooks();
      demarrer();
    }).catch(function () {
      // repli synchrone : identique au comportement d'origine
      try {
        actualiserBooks();
      } catch (err) {
        echecChargement(err);
        return;
      }
      progression(1);
      demarrer();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();

  // exposé pour les tests automatiques
  window.__MB = {
    parseRef: parseRef, refLabel: refLabel, verseText: verseText,
    dailyRefFor: dailyRefFor, persoRefFor: persoRefFor,
    inflate: inflate, ymd: ymd, frDate: frDate,
    saluer: saluer, avatars: function () { return AVATARS; },
    state: function () { return S; },
    chercherReference: chercherReference,
    stats: statsProgression,
    badges: badgesObtenus,
    souvenirs: souvenirs,
    etiquettes: function () { return ETIQUETTES; },
    lecture: function () { return LECT; },
    lireChapitre: lireChapitre,
    stopLecture: stopLecture,
    speak: speak,
    normaliserPonctuation: normaliserPonctuation,
    voixTriees: voixTriees,
    gardeActive: function () { return !!gardeTimer; },
    construireBible: construireBible,
    appliquerSauvegarde: appliquerSauvegarde,
    themeEffectif: themeEffectif,
    manifest: manifestJSON,
    dessinerCarte: dessinerCarte,
    backupTag: BACKUP_TAG,
    verifierIntegrite: verifierIntegrite,
    serieDepuisHisto: serieDepuisHisto,
    sceau: sceau,
    // versions et langues
    versions: function () { return VERSIONS; },
    version: function () { return version; },
    setVersion: changerVersion,
    langue: function () { return langue; },
    setLangue: changerLangue,
    verseTextIn: verseTextIn,
    mapVerset: mapVerset,
    t: t,
    comparerSheet: comparerSheet
  };
})();
