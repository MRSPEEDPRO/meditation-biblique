/* ==========================================================================
   Méditation Biblique — logique de l'application
   Tout fonctionne hors-ligne : aucune requête réseau n'est effectuée.
   Données injectées par build.py : BIBLE_META, BIBLE_BLOB, THEMES, DAILY, PLANS
   ========================================================================== */
(function () {
  "use strict";

  // --- Bible : décompression paresseuse ------------------------------------
  var META = window.BIBLE_META || [];
  var BOOKS = null;          // [{a,n,t,c:[[verset,...],...]}]
  var BY_ABBR = {};

  function inflate() {
    if (BOOKS) return BOOKS;
    var bin = atob(window.BIBLE_BLOB);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var text = window.gunzipToString(bytes);
    var rawBooks = text.split("\u001c");
    BOOKS = META.map(function (m, bi) {
      return {
        a: m.a, n: m.n, t: m.t,
        c: rawBooks[bi].split("\u001d").map(function (ch) {
          return ch.split("\u001e");
        })
      };
    });
    BOOKS.forEach(function (b) { BY_ABBR[b.a] = b; });
    return BOOKS;
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
    for (var i = 0; i < META.length; i++) if (META[i].a === abbr) return META[i].n;
    return abbr;
  }

  function refLabel(ref) {
    var p = parseRef(ref);
    if (!p) return ref;
    var s = bookName(p.a) + " " + p.c;
    if (p.v) s += ":" + p.v + (p.v2 && p.v2 !== p.v ? "-" + p.v2 : "");
    return s;
  }

  function verseText(ref) {
    inflate();
    var p = parseRef(ref);
    if (!p) return "";
    var b = BY_ABBR[p.a];
    if (!b || !b.c[p.c - 1]) return "";
    var ch = b.c[p.c - 1];
    if (!p.v) return ch.join(" ");
    var out = [];
    for (var v = p.v; v <= (p.v2 || p.v); v++) if (ch[v - 1]) out.push(ch[v - 1]);
    return out.join(" ");
  }

  // --- Stockage local ------------------------------------------------------
  var KEY = "meditation-biblique";
  var DEFAULTS = {
    favoris: [],          // ["JHN 3:16", ...]
    notes: [],            // [{id, date, ref, texte}]
    plans: {},            // {planId: {faits: [n° de jour], debut: "AAAA-MM-JJ"}}
    reglages: { taille: 1, theme: "jour" },
    perso: null,          // {mode:"suivi"|"aleatoire", livre, chapitre|null, pos, vus}
    surlignes: {},        // {"JHN 3:16": "j"|"v"|"b"|"r"}
    lecture: null,        // {a, c} dernière position de lecture
    proseLignes: false,   // affichage « un verset par ligne »
    lu: {},               // {"AAAA-MM-JJ": "REF"} — historique verset du jour
    serie: { dernier: null, jours: 0, record: 0 },
    profil: null          // {nom, avatar, heure|null, depuis:"AAAA-MM-JJ"}
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

  function ymd(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function frDate(d) {
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
    var t = el('<div class="toast" role="status">' + esc(msg) + "</div>");
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
    return "« " + verseText(ref) + " »\n— " + refLabel(ref) + " (Louis Segond 1910)";
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

  function openShare(ref) {
    var sh = sheet("Partager ce verset",
      '<p class="muted" style="font-size:.9rem;margin:.2rem 0 1rem">' +
      esc(refLabel(ref)) + "</p>" + shareRow(ref) +
      '<button class="btn block" style="margin-top:16px" data-close>Fermer</button>');
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
  var speaking = false;
  function speak(text, btn) {
    if (!("speechSynthesis" in window)) { toast("Lecture audio non disponible"); return; }
    if (speaking) { window.speechSynthesis.cancel(); speaking = false; if (btn) btn.classList.remove("on"); return; }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.9;
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (/^fr/i.test(voices[i].lang)) { u.voice = voices[i]; break; }
    }
    u.onend = u.onerror = function () { speaking = false; if (btn) btn.classList.remove("on"); };
    speaking = true;
    if (btn) btn.classList.add("on");
    window.speechSynthesis.speak(u);
  }

  // --- Favoris / notes -----------------------------------------------------
  function isFav(ref) { return S.favoris.indexOf(ref) !== -1; }
  function toggleFav(ref) {
    var i = S.favoris.indexOf(ref);
    if (i === -1) { S.favoris.unshift(ref); toast("Ajouté aux favoris ★"); }
    else { S.favoris.splice(i, 1); toast("Retiré des favoris"); }
    save();
  }

  function addNote(ref, texte) {
    S.notes.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      date: new Date().toISOString(),
      ref: ref || "",
      texte: texte
    });
    save();
  }

  function noteSheet(ref) {
    var sh = sheet("Note de méditation",
      (ref ? '<p class="muted" style="font-size:.9rem;margin:.2rem 0 .8rem">' + esc(refLabel(ref)) + "</p>" : "") +
      '<textarea class="field" id="nt" placeholder="Ce que Dieu me dit aujourd\'hui…"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn grow" data-close style="flex:1">Annuler</button>' +
      '<button class="btn primary" id="nsave" style="flex:1">Enregistrer</button></div>');
    var ta = $("#nt", sh);
    setTimeout(function () { ta.focus(); }, 120);
    $("#nsave", sh).addEventListener("click", function () {
      var v = ta.value.trim();
      if (!v) { toast("Note vide"); return; }
      addNote(ref, v);
      closeSheet();
      toast("Note enregistrée ✓");
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
  function touchStreak() {
    var today = ymd(new Date());
    var st = S.serie;
    if (st.dernier === today) return;
    var y = ymd(addDays(new Date(), -1));
    st.jours = (st.dernier === y) ? st.jours + 1 : 1;
    st.dernier = today;
    if (st.jours > st.record) st.record = st.jours;
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
      h += '<div class="ttl" style="font-weight:600">' + esc(p.n) + "</div>";
      h += '<div class="muted" style="font-size:.85rem;margin:2px 0 0">' + esc(p.d) + "</div>";
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
      var h = '<p class="muted" style="font-size:.9rem;margin:.2rem 0 .6rem">' + esc(p.d) + "</p>";
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
          '<div class="meta">' + esc(d.t) + "</div></button>";
        h += '<span class="chev">›</span></div>';
      });
      h += "</div>";
      return h;
    }

    var sh = sheet(p.i + " " + p.n, body());

    sh.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tog],[data-goday],[data-reset]");
      if (!t) return;
      if (t.hasAttribute("data-tog")) {
        var i = +t.dataset.tog;
        var k = st.faits.indexOf(i);
        if (k === -1) { st.faits.push(i); touchStreak(); } else st.faits.splice(k, 1);
        save();
        $(".sheet-body", sh).innerHTML = body();
      } else if (t.hasAttribute("data-goday")) {
        readDay(p, +t.dataset.goday, st);
      } else if (t.hasAttribute("data-reset")) {
        st.faits = [];
        save();
        $(".sheet-body", sh).innerHTML = body();
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
        '<span class="lb">' + esc(t.n) + "</span>" +
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
    sheet(t.i + " " + t.n, h);
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
    S.notes.forEach(function (n) {
      var d = new Date(n.date);
      h += '<div class="note"><div class="nd">' + esc(frDate(d)) + " · " +
        String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0") + "</div>";
      if (n.ref) h += '<div class="nr">' + esc(refLabel(n.ref)) + "</div>";
      h += '<div class="nt">' + esc(n.texte) + "</div>";
      h += '<div style="margin-top:9px;display:flex;gap:8px">' +
        '<button class="btn sm" data-ndel="' + n.id + '">Supprimer</button></div></div>';
    });
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

  function viewBible() {
    inflate();
    var h = '<h2 class="section-h">La Bible</h2>' +
      '<p class="section-sub">Louis Segond 1910 · 66 livres · 1 189 chapitres</p>';
    h += '<input class="field" id="q" placeholder="🔍 Rechercher un mot, une phrase…" ' +
      'autocomplete="off" style="margin-bottom:14px">';
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
    var norm = q.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "'");
    var res = [];
    for (var bi = 0; bi < BOOKS.length && res.length < 300; bi++) {
      var b = BOOKS[bi];
      for (var ci = 0; ci < b.c.length && res.length < 300; ci++) {
        var ch = b.c[ci];
        for (var vi = 0; vi < ch.length; vi++) {
          var t = ch[vi].toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[’']/g, "'");
          if (t.indexOf(norm) !== -1) {
            res.push({ ref: b.a + " " + (ci + 1) + ":" + (vi + 1), txt: ch[vi] });
            if (res.length >= 300) break;
          }
        }
      }
    }
    if (!res.length) {
      box.innerHTML = '<div class="empty"><span class="ic">🔍</span>Aucun résultat pour « ' +
        esc(q) + " ».</div>";
      return;
    }
    var rx = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    var h = '<div class="muted" style="font-size:.83rem;margin-bottom:10px">' +
      res.length + (res.length >= 300 ? "+ résultats (affinez la recherche)" : " résultat" + (res.length > 1 ? "s" : "")) + "</div>";
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
  }

  // --- Lecteur plein écran -------------------------------------------------
  var RD = { a: null, c: 1, sel: [] };

  function closeReader() {
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
      '<button class="icon-btn" id="rd-lines" aria-label="Changer la présentation" title="Présentation">☰</button>' +
      "</div>" +
      '<div class="reader-body" id="rd-body"><div class="reader-inner" id="rd-inner"></div></div>' +
      "</div>");
    document.body.appendChild(r);
    document.body.style.overflow = "hidden";

    r.addEventListener("click", function (e) {
      if (e.target.closest("#rd-close")) { closeReader(); return; }
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
    h += '<p class="reader-sub">Louis Segond 1910 · ' + ch.length + " versets</p>";
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
    $("#rd-body").scrollTop = 0;
    RD.sel = [];
    renderSelbar();
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
      '<button class="btn" data-share="' + ref + '">↗ Partager</button></div>' +
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

    h += '<div class="card"><div class="card-title">⚙️ Réglages</div>';
    h += '<label class="lbl">Taille du texte</label><div style="display:flex;gap:8px">';
    [["Petit", 0.9], ["Normal", 1], ["Grand", 1.15], ["Très grand", 1.3]].forEach(function (t) {
      h += '<button class="btn sm' + (S.reglages.taille === t[1] ? " on" : "") +
        '" style="flex:1" data-size="' + t[1] + '">' + t[0] + "</button>";
    });
    h += "</div>";
    h += '<label class="lbl">Apparence</label><div style="display:flex;gap:8px">' +
      '<button class="btn sm' + (S.reglages.theme === "jour" ? " on" : "") + '" style="flex:1" data-mode2="jour">☀️ Jour</button>' +
      '<button class="btn sm' + (S.reglages.theme === "nuit" ? " on" : "") + '" style="flex:1" data-mode2="nuit">🌙 Nuit</button></div>';
    h += '<label class="lbl">Mes données</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn sm" id="jexport2">⬇ Exporter le journal</button>' +
      '<button class="btn sm" id="wipe">🗑 Tout effacer</button></div>';
    h += "</div>";

    h += '<div class="card center"><div style="font-size:1.8rem">🌿</div>' +
      '<p style="margin:6px 0 2px;font-weight:600">Méditation Biblique</p>' +
      '<p class="muted" style="font-size:.84rem;margin:0">Version 1.2.0 · fonctionne hors-ligne</p>' +
      '<p class="muted" style="font-size:.8rem;margin:10px 0 0">Texte : Louis Segond 1910, domaine public.<br>' +
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
    plus: viewPlus
  };

  function render() {
    var main = $("#main");
    main.innerHTML = VIEWS[current]();
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
  }

  function applySettings() {
    document.documentElement.style.setProperty("--fs", S.reglages.taille + "rem");
    document.documentElement.setAttribute("data-theme", S.reglages.theme);
    var mt = $('meta[name="theme-color"]');
    if (mt) mt.setAttribute("content", S.reglages.theme === "nuit" ? "#161a17" : "#faf8f3");
  }

  // --- Événements globaux --------------------------------------------------
  document.addEventListener("click", function (e) {
    if (e.target.closest("#prof-edit")) { profilSheet(); return; }
    var t = e.target.closest("[data-tab],[data-fav],[data-note],[data-share],[data-speak]," +
      "[data-copy],[data-close],[data-plan],[data-theme],[data-book],[data-open]," +
      "[data-off],[data-size],[data-mode2],[data-ndel],[data-pstep],[data-pmode],[data-read]");
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
      S.reglages.theme = S.reglages.theme === "nuit" ? "jour" : "nuit";
      save();
      applySettings();
      render();
    }
  });

  // --- Démarrage -----------------------------------------------------------
  function boot() {
    applySettings();
    try {
      inflate();
    } catch (err) {
      $("#loader").innerHTML = '<div class="empty"><span class="ic">⚠️</span>' +
        "Impossible de charger la Bible.<br><small>" + esc(String(err)) + "</small></div>";
      return;
    }
    touchStreak();
    var l = $("#loader");
    if (l) l.remove();
    $("#app").classList.remove("hide");
    render();
    if (!S.profil) onboarding();
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
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
    state: function () { return S; }
  };
})();
