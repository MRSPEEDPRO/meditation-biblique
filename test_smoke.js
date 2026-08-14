/* ==========================================================================
   Suite de tests automatiques — vérifie index.html dans un vrai DOM (jsdom).
   Usage : npm test
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? " → " + detail : "")); }
}
function eq(a, b, label) { ok(a === b, label, `attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); }
function section(t) { console.log("\n\x1b[36m" + t + "\x1b[0m"); }

const FILE = path.join(__dirname, "index.html");
if (!fs.existsSync(FILE)) {
  console.error("❌ index.html absent — lancez d'abord : python3 build.py");
  process.exit(1);
}
const html = fs.readFileSync(FILE, "utf8");
// code seul, blob base64 de la Bible retiré (il contient fortuitement
// n'importe quelle suite de lettres)
const code = html.replace(/window\.BIBLE_BLOB\s*=\s*"[^"]*"/, 'window.BIBLE_BLOB=""');

// ---------------------------------------------------------------------------
section("1. Fichier unique et autonomie");
ok(html.startsWith("<!DOCTYPE html>"), "doctype présent");
ok(/<html lang="fr"/.test(html), "langue française déclarée");
ok(html.includes("<title>"), "titre présent");
ok(/name="viewport"/.test(html), "meta viewport (mobile)");
ok(/name="theme-color"/.test(html), "meta theme-color");
ok(/name="description"/.test(html), "meta description");
ok(!/<script[^>]+\ssrc=/i.test(html), "aucun script externe");
ok(!/<link[^>]+stylesheet/i.test(html), "aucune feuille de style externe");
ok(!/https?:\/\/(?!wa\.me|t\.me|www\.facebook|twitter\.com|www\.w3\.org)[^"'\s]+/
  .test(code.replace(/<svg[\s\S]*?<\/svg>/g, "")), "aucune ressource distante chargée");
eq((html.match(/<script>/g) || []).length, (html.match(/<\/script>/g) || []).length,
  "balises <script> équilibrées");
ok(html.length > 1_000_000, "taille cohérente avec la Bible embarquée");

// ---------------------------------------------------------------------------
async function main() {
section("2. Chargement dans un navigateur simulé");
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => jsErrors.push(e.message));
vc.on("error", (m) => jsErrors.push(String(m)));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  virtualConsole: vc,
  url: "https://exemple.test/",
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

await new Promise(r => {
  if (document.readyState === "complete") return r();
  window.addEventListener("load", r, { once: true });
});

ok(jsErrors.length === 0, "aucune erreur JavaScript au chargement", jsErrors.join(" | "));
ok(typeof window.gunzipToString === "function", "décompresseur gzip exposé");
ok(Array.isArray(window.BIBLE_META), "métadonnées de la Bible présentes");
ok(typeof window.BIBLE_BLOB === "string" && window.BIBLE_BLOB.length > 100000,
  "texte biblique compressé embarqué");
ok(!!window.__MB, "API interne exposée pour les tests");

const MB = window.__MB;

// ---------------------------------------------------------------------------
section("3. Intégrité de la Bible (Louis Segond 1910)");
const BOOKS = MB.inflate();
eq(BOOKS.length, 66, "66 livres");
eq(BOOKS.reduce((n, b) => n + b.c.length, 0), 1189, "1 189 chapitres");
const totalVerses = BOOKS.reduce((n, b) => n + b.c.reduce((m, c) => m + c.length, 0), 0);
ok(totalVerses > 31000 && totalVerses < 31400, "environ 31 100 versets", String(totalVerses));
ok(BOOKS.every(b => b.n && b.a && b.c.length > 0), "chaque livre a un nom et des chapitres");
ok(BOOKS.every(b => b.c.every(c => c.every(v => typeof v === "string" && v.length > 0))),
  "aucun verset vide");
eq(BOOKS.filter(b => b.t === 0).length, 39, "39 livres de l'Ancien Testament");
eq(BOOKS.filter(b => b.t === 1).length, 27, "27 livres du Nouveau Testament");
eq(BOOKS[0].n, "Genèse", "premier livre : Genèse");
eq(BOOKS[65].n, "Apocalypse", "dernier livre : Apocalypse");
eq(BOOKS.find(b => b.a === "PSA").c.length, 150, "150 psaumes");
eq(BOOKS.find(b => b.a === "PSA").c[118].length, 176, "Psaume 119 : 176 versets");
eq(BOOKS.find(b => b.a === "PRO").c.length, 31, "31 chapitres des Proverbes");

section("4. Exactitude du texte");
const samples = [
  ["GEN 1:1", "Au commencement, Dieu créa les cieux et la terre."],
  ["JHN 3:16", /Car Dieu a tant aimé le monde/],
  ["PSA 23:1", /L’Éternel est mon berger/],
  ["PHP 4:13", "Je puis tout par celui qui me fortifie."],
  ["ROM 8:28", /toutes choses concourent au bien/],
  ["JOS 1:9", /Fortifie-toi et prends courage/],
  ["REV 22:21", /Que la grâce du Seigneur Jésus soit avec tous/]
];
samples.forEach(([ref, expect]) => {
  const t = MB.verseText(ref);
  ok(typeof expect === "string" ? t === expect : expect.test(t),
    `texte exact : ${ref}`, t.slice(0, 60));
});
ok(!/\\[a-z]+\*?/.test(BOOKS.map(b => b.c[0][0]).join(" ")),
  "aucun marqueur USFM résiduel");
ok(!/\s{2,}/.test(MB.verseText("JHN 1:1")), "espaces normalisés");

section("5. Références et libellés");
eq(MB.refLabel("JHN 3:16"), "Jean 3:16", "libellé français d'une référence");
eq(MB.refLabel("1CO 13:4"), "1 Corinthiens 13:4", "libellé d'un livre numéroté");
eq(MB.refLabel("PSA 23"), "Psaumes 23", "libellé d'un chapitre entier");
eq(MB.refLabel("MAT 5:3-10"), "Matthieu 5:3-10", "libellé d'un intervalle");
ok(MB.parseRef("XXX 1:1") !== null, "référence syntaxiquement valide acceptée");
eq(MB.parseRef("pas une référence"), null, "référence invalide rejetée");
const multi = MB.verseText("MAT 5:3-5");
ok(multi.length > MB.verseText("MAT 5:3").length, "intervalle de versets concaténé");

// ---------------------------------------------------------------------------
section("6. Versets du jour");
const DAILY = window.DAILY;
eq(DAILY.length, 247, "247 versets du jour");
eq(new Set(DAILY).size, 247, "aucun doublon");
ok(DAILY.every(r => MB.verseText(r).length > 0), "tous les versets du jour existent");
const d1 = new window.Date(2026, 0, 1), d2 = new window.Date(2026, 0, 2);
ok(MB.dailyRefFor(d1) !== MB.dailyRefFor(d2), "le verset change d'un jour à l'autre");
eq(MB.dailyRefFor(d1), MB.dailyRefFor(new window.Date(2026, 0, 1)),
  "même jour → même verset (déterministe)");
const cycle = new Set();
for (let i = 0; i < 247; i++) cycle.add(MB.dailyRefFor(new window.Date(2026, 0, 1 + i)));
eq(cycle.size, 247, "rotation complète sur 247 jours sans répétition");

section("7. Thèmes de méditation");
const THEMES = window.THEMES;
eq(THEMES.length, 19, "19 thèmes");
eq(THEMES.reduce((n, t) => n + t.v.length, 0), 266, "266 versets thématiques");
ok(THEMES.every(t => t.n && t.i && t.v.length === 14), "chaque thème : nom, icône, 14 versets");
ok(THEMES.every(t => t.v.every(r => MB.verseText(r).length > 0)),
  "tous les versets thématiques existent");
eq(new Set(THEMES.map(t => t.id)).size, 19, "identifiants de thèmes uniques");

section("8. Plans de lecture");
const PLANS = window.PLANS;
eq(PLANS.length, 11, "11 plans");
eq(new Set(PLANS.map(p => p.id)).size, 11, "identifiants de plans uniques");
const byId = Object.fromEntries(PLANS.map(p => [p.id, p]));
eq(byId["bible-1an"].len, 365, "Bible en 1 an : 365 jours");
eq(byId["nt-90"].len, 90, "Nouveau Testament : 90 jours");
eq(byId["evangiles-40"].len, 40, "Évangiles : 40 jours");
eq(byId["psaumes-30"].len, 30, "Psaumes : 30 jours");
eq(byId["proverbes-31"].len, 31, "Proverbes : 31 jours");
eq(PLANS.filter(p => p.len === 7).length, 6, "6 plans thématiques de 7 jours");
ok(PLANS.every(p => p.days.length === p.len), "nombre de jours cohérent pour chaque plan");
ok(PLANS.every(p => p.days.every(d => d.r.length > 0 && d.t)),
  "chaque jour a une lecture et un titre");

const coverage = byId["bible-1an"].days.flatMap(d => d.r);
eq(coverage.length, 1189, "plan 1 an : 1 189 chapitres au total");
eq(new Set(coverage).size, 1189, "plan 1 an : aucun chapitre en double");
const allChapters = new Set();
BOOKS.forEach(b => b.c.forEach((_, i) => allChapters.add(`${b.a} ${i + 1}`)));
eq(coverage.filter(r => !allChapters.has(r)).length, 0,
  "plan 1 an : toutes les références existent");
eq([...allChapters].filter(r => !coverage.includes(r)).length, 0,
  "plan 1 an : la Bible entière est couverte");

eq(byId["nt-90"].days.flatMap(d => d.r).length, 260, "NT : 260 chapitres");
eq(byId["psaumes-30"].days.flatMap(d => d.r).length, 150, "Psaumes : 150 chapitres");
eq(byId["proverbes-31"].days.flatMap(d => d.r).length, 31, "Proverbes : 31 chapitres");
ok(PLANS.filter(p => p.len === 7).every(p =>
  p.days.every(d => MB.verseText(d.r[0]).length > 0)),
  "plans thématiques : tous les passages existent");
ok(byId["bible-1an"].days[0].t.includes("Genèse"), "titre du 1er jour lisible en français");

// ---------------------------------------------------------------------------
section("9. Interface et navigation");
const tabs = [...document.querySelectorAll("nav.tabs button")];
eq(tabs.length, 7, "7 onglets de navigation");
eq(tabs.filter(t => t.getAttribute("aria-selected") === "true").length, 1,
  "un seul onglet actif à la fois");
ok(document.getElementById("loader") === null, "écran de chargement retiré après démarrage");
ok(!document.getElementById("app").classList.contains("hide"), "application affichée");
ok(document.getElementById("main").innerHTML.length > 500, "vue « Aujourd'hui » rendue");

function clickTab(name) {
  const b = tabs.find(t => t.dataset.tab === name);
  b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return document.getElementById("main").innerHTML;
}
const views = {
  jour: /verse-text/,
  perso: /Ma méditation/,
  plans: /Plans de lecture/,
  themes: /Thèmes de méditation/,
  bible: /Rechercher/,
  journal: /Journal de méditation/,
  plus: /Guide de méditation/
};
Object.entries(views).forEach(([tab, rx]) => {
  ok(rx.test(clickTab(tab)), `onglet « ${tab} » affiche son contenu`);
});
clickTab("jour");
ok(/Aujourd|verse-ref/.test(document.getElementById("main").innerHTML),
  "retour à l'onglet du jour");

section("10. Verset du jour : affichage et navigation");
let main = document.getElementById("main").innerHTML;
ok(/verse-date/.test(main), "date du jour affichée");
ok(/data-speak/.test(main), "bouton d'écoute audio");
ok(/data-fav/.test(main), "bouton favori");
ok(/data-note/.test(main), "bouton de note");
ok(/data-share/.test(main), "bouton de partage");
ok(/Ma méditation/.test(main), "bloc « Ma méditation »");
ok(/Ma régularité/.test(main), "compteur de régularité");

const prevBtn = document.querySelector('[data-off="1"]');
ok(!!prevBtn, "bouton « jour précédent » présent");
prevBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
main = document.getElementById("main").innerHTML;
ok(/data-off="-1"/.test(main), "navigation vers le jour suivant proposée");
ok(/Aujourd'hui/.test(main), "retour à aujourd'hui proposé");
document.querySelector('[data-off="0"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!/data-off="-1"/.test(document.getElementById("main").innerHTML),
  "retour effectif à aujourd'hui");

section("11. Favoris");
const favBtn = document.querySelector("[data-fav]");
const favRef = favBtn.dataset.fav;
favBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(MB.state().favoris.includes(favRef), "ajout aux favoris");
ok(clickTab("plus").includes(MB.refLabel(favRef)), "le favori apparaît dans « Plus »");
document.querySelector(`[data-fav="${favRef}"]`)
  .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!MB.state().favoris.includes(favRef), "retrait des favoris");

section("12. Journal");
clickTab("journal");
ok(/Aucune note/.test(document.getElementById("main").innerHTML), "journal vide au départ");
document.querySelector('[data-note=""]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!!document.querySelector(".sheet"), "fenêtre de saisie ouverte");
const ta = document.getElementById("nt");
ok(!!ta, "zone de texte présente");
ta.value = "Dieu m'a parlé aujourd'hui par ce verset.";
document.getElementById("nsave").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().notes.length, 1, "note enregistrée");
ok(/Dieu m'a parlé/.test(document.getElementById("main").innerHTML), "note affichée dans le journal");
ok(/Exporter/.test(document.getElementById("main").innerHTML), "export proposé quand il y a des notes");
document.querySelector("[data-ndel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().notes.length, 0, "note supprimée");

section("13. Recherche dans la Bible");
clickTab("bible");
const q = document.getElementById("q");
ok(!!q, "champ de recherche présent");
ok(/Ancien Testament/.test(document.getElementById("main").innerHTML), "explorateur AT");
ok(/Nouveau Testament/.test(document.getElementById("main").innerHTML), "explorateur NT");
eq(document.querySelectorAll("[data-book]").length, 66, "66 livres listés");

function searchNow(text) {
  const field = document.getElementById("q");
  field.value = text;
  field.dispatchEvent(new window.Event("input", { bubbles: true }));
  return new Promise(r => setTimeout(r, 320));
}

section("14. Plans : progression");
clickTab("plans");
eq(document.querySelectorAll("[data-plan]").length, 11, "11 plans affichés");
document.querySelector('[data-plan="psaumes-30"]')
  .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!!document.querySelector(".sheet"), "fiche du plan ouverte");
ok(/Jour 1/.test(document.querySelector(".sheet").innerHTML), "liste des jours affichée");
document.querySelector('[data-tog="0"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().plans["psaumes-30"].faits.length, 1, "jour marqué comme lu");
document.querySelector('[data-tog="0"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().plans["psaumes-30"].faits.length, 0, "jour démarqué");
document.querySelector('[data-goday="0"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const dayHtml = document.querySelector(".sheet").innerHTML;
ok(/verse-line/.test(dayHtml), "texte biblique du jour affiché");
ok(/Marquer comme lu/.test(dayHtml), "action « marquer comme lu » disponible");
ok(dayHtml.includes("Psaumes"), "titre du passage affiché");

section("15. Thèmes : ouverture");
document.querySelector(".sheet-bg").remove();
clickTab("themes");
eq(document.querySelectorAll("#main [data-theme]").length, 19, "19 thèmes affichés");
document.querySelector('#main [data-theme="paix"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const themeHtml = document.querySelector(".sheet").innerHTML;
ok(/Jean 14:27/.test(themeHtml), "versets du thème affichés avec leur référence");
ok((themeHtml.match(/data-share/g) || []).length >= 14, "actions disponibles sur chaque verset");
document.querySelector(".sheet-bg").remove();

section("16. Ma méditation personnalisée");
clickTab("jour");
document.getElementById("perso-edit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
let psheet = document.querySelector(".sheet");
ok(!!psheet, "fenêtre « Ma méditation personnalisée » ouverte");
eq(psheet.querySelectorAll("#p-book option").length, 66, "les 66 livres proposés");
ok(!!psheet.querySelector('[data-mode="suivi"]'), "méthode 📆 Suivi proposée");
ok(!!psheet.querySelector('[data-mode="aleatoire"]'), "méthode 🎲 Aléatoire proposée");
const bookSel = document.getElementById("p-book");
bookSel.value = "JHN";
bookSel.dispatchEvent(new window.Event("change", { bubbles: true }));
eq(document.querySelectorAll("#p-chap option").length, 22,
  "chapitres de Jean + option « tout le livre »");
document.getElementById("p-chap").value = "3";
psheet.querySelector('[data-mode="suivi"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
document.getElementById("p-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

let perso = MB.state().perso;
ok(!!perso, "méditation personnalisée enregistrée");
eq(perso.livre, "JHN", "livre retenu");
eq(perso.chapitre, 3, "chapitre retenu");
eq(perso.mode, "suivi", "méthode « suivi » retenue");
main = document.getElementById("main").innerHTML;
ok(/🎯 Ma méditation/.test(main), "badge « Ma méditation » sur le verset du jour");
ok(/Jean 3:/.test(main), "le verset du jour provient du passage choisi");
ok(/suivi/.test(main), "méthode affichée");

// mode suivi : progression séquentiel + cycle en fin de passage
const j3 = BOOKS.find(b => b.a === "JHN").c[2].length;
const suite = [];
for (let i = 0; i < 5; i++) suite.push(MB.persoRefFor(new window.Date(2026, 0, 10 + i)).ref);
eq(suite.join(" | "),
  [0, 1, 2, 3, 4].map(i => "JHN 3:" + (((MB.persoRefFor(new window.Date(2026, 0, 10)).index + i) % j3) + 1)).join(" | "),
  "suivi : versets consécutifs jour après jour");
const wrap = MB.persoRefFor(new window.Date(2026, 0, 10 + j3));
eq(wrap.ref, suite[0], "suivi : cycle au bout du passage");
eq(wrap.total, j3, "suivi : total = nombre de versets du chapitre");

// bascule avec le verset du jour général
document.getElementById("perso-tog").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.actif, false, "bascule vers le verset du jour général");
ok(!/🎯 Ma méditation<\/span>/.test(document.getElementById("main").innerHTML),
  "le verset général est de nouveau affiché");
document.getElementById("perso-tog").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.actif, true, "retour à la méditation personnalisée");

// mode aléatoire : tirage différent de la veille, découvertes comptées
document.getElementById("perso-edit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
document.getElementById("p-book").value = "PSA";
document.getElementById("p-book").dispatchEvent(new window.Event("change", { bubbles: true }));
document.getElementById("p-chap").value = "";
document.querySelector('.sheet [data-mode="aleatoire"]')
  .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
document.getElementById("p-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
perso = MB.state().perso;
eq(perso.mode, "aleatoire", "méthode « aléatoire » retenue");
eq(perso.chapitre, null, "livre entier accepté");
eq(MB.persoRefFor(new window.Date(2026, 2, 1)).total,
  BOOKS.find(b => b.a === "PSA").c.reduce((n, c) => n + c.length, 0),
  "aléatoire : tirage sur tout le livre");
let differents = 0;
for (let i = 0; i < 30; i++) {
  const a = MB.persoRefFor(new window.Date(2026, 2, 1 + i)).ref;
  const b = MB.persoRefFor(new window.Date(2026, 2, 2 + i)).ref;
  if (a !== b) differents++;
}
eq(differents, 30, "aléatoire : jamais le même verset que la veille");
eq(MB.persoRefFor(new window.Date(2026, 2, 1)).ref, MB.persoRefFor(new window.Date(2026, 2, 1)).ref,
  "aléatoire : stable au sein d'une même journée");
ok((MB.state().perso.vus || []).length >= 1, "découvertes comptabilisées");
ok(/découvert/.test(document.getElementById("main").innerHTML),
  "compteur de découvertes affiché");

document.getElementById("perso-del").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso, null, "méditation personnalisée supprimée");
ok(/Créer ma méditation/.test(document.getElementById("main").innerHTML),
  "proposition de création après suppression");

section("17. Onglet « Ma méditation » : pilotage");
// (re)créer une méditation en mode suivi sur un chapitre court
clickTab("perso");
ok(/Créer ma méditation/.test(document.getElementById("main").innerHTML),
  "écran vide proposant la création");
ok(/Suivi/.test(document.getElementById("main").innerHTML) &&
   /Aléatoire/.test(document.getElementById("main").innerHTML),
  "les deux méthodes sont expliquées avant de commencer");

document.getElementById("perso-edit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
document.getElementById("p-book").value = "JUD";      // Jude : 1 seul chapitre, 25 versets
document.getElementById("p-book").dispatchEvent(new window.Event("change", { bubbles: true }));
document.getElementById("p-chap").value = "1";
document.querySelector('.sheet [data-mode="suivi"]')
  .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
document.getElementById("p-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

ok(document.querySelector('nav.tabs button[data-tab="perso"]').getAttribute("aria-selected") === "true",
  "l'enregistrement ouvre l'onglet Ma méditation");
let pm = document.getElementById("main").innerHTML;
ok(/📆 Suivi/.test(pm), "méthode « suivi » affichée");
ok(/Jude/.test(pm), "passage choisi affiché");
ok(/class="bar"/.test(pm), "barre de progression du passage");
ok(/Verset 1 sur 25/.test(pm), "position dans le passage : verset 1 sur 25");

// avancer / reculer à la main
const refDep = MB.persoRefFor(new window.Date()).ref;
document.querySelector('[data-pstep="1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.persoRefFor(new window.Date()).index, 1, "bouton « Suivant » avance d'un verset");
ok(/Verset 2 sur 25/.test(document.getElementById("main").innerHTML), "position mise à jour");
document.querySelector('[data-pstep="-1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.persoRefFor(new window.Date()).ref, refDep, "bouton « Précédent » revient en arrière");

// cycle en fin de passage
for (let i = 0; i < 24; i++)
  document.querySelector('[data-pstep="1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(/Verset 25 sur 25/.test(document.getElementById("main").innerHTML), "dernier verset atteint");
ok(/cycle recommence/.test(document.getElementById("main").innerHTML),
  "l'utilisateur est prévenu que le cycle va recommencer");
document.querySelector('[data-pstep="1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.persoRefFor(new window.Date()).ref, refDep, "cycle : retour au premier verset");
ok(/cycle n° 2/.test(document.getElementById("main").innerHTML), "compteur de cycle affiché");

// versets déjà rencontrés
ok(/Déjà rencontrés/.test(document.getElementById("main").innerHTML),
  "historique des versets rencontrés");
ok(MB.state().perso.vus.length >= 25, "les 25 versets parcourus sont mémorisés");

// bascule de méthode depuis l'écran, sans reperdre le passage
document.querySelector('[data-pmode="aleatoire"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.mode, "aleatoire", "bascule vers 🎲 aléatoire en un geste");
eq(MB.state().perso.livre, "JUD", "le passage est conservé");
pm = document.getElementById("main").innerHTML;
ok(/découvert/.test(pm), "compteur de découvertes affiché");
ok(/Tirer un autre verset/.test(pm), "bouton de nouveau tirage");

// nouveau tirage
const avant = MB.persoRefFor(new window.Date()).ref;
let change = false;
for (let i = 0; i < 6 && !change; i++) {
  document.getElementById("perso-redraw").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (MB.persoRefFor(new window.Date()).ref !== avant) change = true;
}
ok(change, "« Tirer un autre verset » change le verset du jour");
ok(MB.state().perso.tirage >= 1, "le tirage manuel est mémorisé");

document.querySelector('[data-pmode="suivi"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.mode, "suivi", "retour à 📆 suivi");

// l'accueil suit la méditation, et peut la mettre de côté
document.getElementById("perso-tog").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.actif, false, "l'accueil repasse au verset général");
ok(/verse-text/.test(clickTab("jour")), "accueil toujours fonctionnel");
ok(!/🎯 Ma méditation<\/span>/.test(document.getElementById("main").innerHTML),
  "badge retiré de l'accueil");
clickTab("perso");
document.getElementById("perso-tog").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso.actif, true, "réactivation sur l'accueil");
ok(/🎯 Ma méditation/.test(clickTab("jour")), "badge de retour sur l'accueil");
clickTab("perso");
document.getElementById("perso-del").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().perso, null, "suppression depuis l'onglet");

section("18. Partage");
clickTab("jour");
document.querySelector("[data-share]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const shareHtml = document.querySelector(".sheet").innerHTML;
["wa.me", "t.me", "facebook.com", "twitter.com", "mailto:"].forEach(host => {
  ok(shareHtml.includes(host), `lien de partage : ${host}`);
});
ok(/data-copy/.test(shareHtml), "bouton copier");
const wa = [...document.querySelectorAll(".share-btn")].find(a => (a.href || "").includes("wa.me"));
ok(wa && decodeURIComponent(wa.href).includes("Louis Segond"),
  "le verset et la version sont pré-remplis dans le partage");
document.querySelector(".sheet-bg").remove();

section("19. Réglages");
clickTab("plus");
document.querySelector('[data-size="1.3"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().reglages.taille, 1.3, "taille du texte modifiée");
eq(document.documentElement.style.getPropertyValue("--fs"), "1.3rem", "taille appliquée au document");
document.querySelector('[data-mode2="nuit"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(MB.state().reglages.theme, "nuit", "mode nuit activé");
eq(document.documentElement.getAttribute("data-theme"), "nuit", "thème nuit appliqué");
document.getElementById("dark-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
eq(document.documentElement.getAttribute("data-theme"), "jour", "bascule jour/nuit depuis l'en-tête");
document.querySelector('[data-size="1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

function sectionsFinales() {
section("20. Persistance locale");
const stored = window.localStorage.getItem("meditation-biblique");
ok(!!stored, "données enregistrées dans localStorage");
const parsed = JSON.parse(stored);
["favoris", "notes", "plans", "reglages", "serie", "profil", "surlignes"].forEach(k => {
  ok(k in parsed, `clé « ${k} » persistée`);
});
ok(MB.state().serie.jours >= 1, "série de jours démarrée");

section("21. Vie privée et accessibilité");
ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(code),
  "aucun appel réseau dans le code");
ok(!/google-analytics|gtag\(|googletagmanager|facebook\.net/.test(code),
  "aucun traceur");
ok(/lang="fr"/.test(html), "langue déclarée pour les lecteurs d'écran");
ok(document.querySelectorAll('nav.tabs button[role="tab"]').length === 7,
  "rôles ARIA sur les onglets");
ok([...document.querySelectorAll(".icon-btn")].every(b => b.getAttribute("aria-label")),
  "boutons icônes étiquetés");
ok(/prefers-reduced-motion/.test(html), "respect des animations réduites");
ok(/env\(safe-area-inset-bottom/.test(html), "zone sûre iPhone prise en compte");
}

// ---------------------------------------------------------------------------
(async function run() {
  await new Promise(r => setTimeout(r, 300));
  sectionsFinales();

  section("22. Recherche : exécution");
  clickTab("bible");
  await searchNow("berger");
  const res = document.getElementById("qres").innerHTML;
  ok(/résultat/.test(res), "recherche : résultats annoncés");
  ok(/<mark>/.test(res), "recherche : termes surlignés");
  ok(/Psaumes 23:1/.test(res), "recherche : Psaume 23 trouvé pour « berger »");
  await searchNow("zzzqxw");
  ok(/Aucun résultat/.test(document.getElementById("qres").innerHTML),
    "recherche : message quand rien n'est trouvé");
  await searchNow("");
  ok(document.getElementById("qres").innerHTML === "",
    "recherche : effacement remet l'explorateur");
  ok(!document.getElementById("explorer").classList.contains("hide"),
    "explorateur réaffiché après recherche");

  section("23. Lecteur plein écran");
  const click = (sel) => document.querySelector(sel)
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const JHN = BOOKS.find(b => b.a === "JHN");

  click('[data-book="JHN"]');
  const rd = document.querySelector(".reader");
  ok(!!rd, "le lecteur s'ouvre en plein écran depuis l'explorateur");
  ok(!document.querySelector(".sheet"), "plus de modale étriquée pour lire");
  eq(document.getElementById("rd-name").textContent, "Jean 1", "titre du chapitre en cours");
  eq(rd.querySelectorAll(".prose .v").length, JHN.c[0].length,
    "tous les versets de Jean 1 affichés");
  ok(/<span class="vn">1<\/span>/.test(rd.innerHTML), "numéros de versets en exposant");
  ok(/reader-h/.test(rd.innerHTML), "en-tête de chapitre");
  ok(document.body.style.overflow === "hidden", "l'arrière-plan ne défile plus");

  // sélection d'un verset -> barre d'actions
  ok(!document.querySelector(".selbar"), "aucune barre d'action sans sélection");
  click("#rv16");
  let bar = document.querySelector(".selbar");
  ok(!!bar, "toucher un verset ouvre la barre d'actions");
  ok(/Jean 1:16/.test(bar.innerHTML), "référence du verset sélectionné");
  ["data-speak", "data-fav", "data-note", "data-share", "data-copy"].forEach(a =>
    ok(bar.querySelector("[" + a + "]"), "action disponible : " + a));
  ok(document.querySelector("#rv16").classList.contains("sel"), "verset mis en évidence");

  // sélection multiple contiguë
  click("#rv17");
  bar = document.querySelector(".selbar");
  ok(/Jean 1:16-17/.test(bar.innerHTML), "sélection de plusieurs versets : plage 16-17");
  ok(/2 versets/.test(bar.innerHTML), "nombre de versets sélectionnés");
  const partage = bar.querySelector("[data-share]").dataset.share;
  ok(MB.verseText(partage).length > MB.verseText("JHN 1:16").length,
    "le partage porte sur les deux versets");

  // désélection
  click("#rv17");
  ok(/Jean 1:16/.test(document.querySelector(".selbar").innerHTML), "retrait d'un verset de la sélection");
  click("#rv16");
  ok(!document.querySelector(".selbar"), "barre refermée quand plus rien n'est sélectionné");

  section("24. Surlignage");
  click("#rv12");
  document.querySelector('.hl-sw[data-hl="j"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(MB.state().surlignes["JHN 1:12"], "j", "surlignage jaune enregistré");
  ok(document.querySelector("#rv12").classList.contains("hlj"), "verset surligné à l'écran");
  document.querySelector('.hl-sw[data-hl="v"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(MB.state().surlignes["JHN 1:12"], "v", "changement de couleur");
  ok(document.querySelector("#rv12").classList.contains("hlv"), "nouvelle couleur appliquée");
  document.querySelector('.hl-sw[data-hl=""]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok(!("JHN 1:12" in MB.state().surlignes), "surlignage retiré");
  ok(!document.querySelector("#rv12").className.includes("hl"), "couleur retirée à l'écran");

  // persistance du surlignage d'un chapitre à l'autre
  click("#rv14");
  document.querySelector('.hl-sw[data-hl="b"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  click('[data-rdchap="2"]');
  eq(document.getElementById("rd-name").textContent, "Jean 2", "passage au chapitre suivant");
  click('[data-rdchap="1"]');
  ok(document.querySelector("#rv14").classList.contains("hlb"),
    "le surlignage est retrouvé au retour");

  section("25. Navigation dans le lecteur");
  ok(!!document.querySelector('[data-rdchap="2"]'), "bouton chapitre suivant");
  ok(!document.querySelector('[data-rdchap="0"]'), "pas de chapitre 0 au premier chapitre");
  click('[data-rdchap="2"]');
  ok(!!document.querySelector('[data-rdchap="1"]'), "bouton chapitre précédent");
  eq(MB.state().lecture.c, 2, "position de lecture mémorisée");

  // présentation : un verset par ligne
  click("#rd-lines");
  ok(document.getElementById("rd-prose").classList.contains("lines"), "présentation en lignes");
  eq(MB.state().proseLignes, true, "préférence enregistrée");
  click("#rd-lines");
  ok(!document.getElementById("rd-prose").classList.contains("lines"), "retour au texte au fil");

  // sélecteur livre / chapitre
  click("#rd-pick");
  ok(!!document.querySelector(".sheet"), "sélecteur ouvert");
  eq(document.querySelectorAll("[data-pkbook]").length, 66, "les 66 livres proposés");
  document.querySelector('[data-pkbook="PSA"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(document.querySelectorAll("[data-pkchap]").length, 150, "150 chapitres pour les Psaumes");
  document.querySelector('[data-pkchap="23"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(document.getElementById("rd-name").textContent, "Psaumes 23", "navigation vers Psaumes 23");
  ok(/berger/.test(document.getElementById("rd-prose").textContent), "texte du Psaume 23 affiché");

  // fermeture
  click("#rd-close");
  ok(!document.querySelector(".reader"), "le lecteur se ferme");
  eq(document.body.style.overflow, "", "le défilement de la page est rendu");

  section("26. Reprise de lecture");
  clickTab("bible");
  ok(/Reprendre la lecture/.test(document.getElementById("main").innerHTML),
    "carte de reprise de lecture");
  ok(/Psaumes 23/.test(document.getElementById("main").innerHTML), "dernière position affichée");
  ok(/Mes surlignages/.test(document.getElementById("main").innerHTML),
    "les surlignages sont regroupés dans l'onglet Bible");
  click("[data-read]");
  eq(document.getElementById("rd-name").textContent, "Psaumes 23", "la reprise rouvre le bon chapitre");
  click("#rd-close");

  // un verset du jour s'ouvre dans son contexte
  clickTab("jour");
  click("[data-share]");
  document.querySelector(".sheet-bg").remove();

  section("27. Profil : écran de bienvenue");
  const onb = document.querySelector(".onb");
  ok(!!onb, "l'écran de bienvenue s'affiche au tout premier lancement");
  ok(/Bienvenue/.test(onb.textContent), "message d'accueil");
  ok(!!onb.querySelector("#onb-nom"), "champ prénom");
  eq(onb.querySelectorAll(".ava").length, 12, "12 images de profil proposées");
  eq(onb.querySelector("#onb-h").type, "time", "choix de l'heure de méditation");
  ok(!!onb.querySelector("#onb-skip"), "l'étape peut être passée");
  ok(/aucun mot de passe|Aucune inscription en ligne/i.test(onb.textContent),
    "l'écran précise qu'il n'y a pas de compte en ligne");
  ok(/ne quittent jamais cet appareil/i.test(onb.textContent), "promesse de confidentialité");
  eq(MB.state().profil, null, "aucun profil tant que rien n'est validé");

  // création du profil
  onb.querySelector("#onb-nom").value = "  Sarah  ";
  onb.querySelector('[data-ava="🕊️"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok(onb.querySelector('[data-ava="🕊️"]').classList.contains("on"), "image sélectionnée");
  onb.querySelector("#onb-h").value = "06:30";
  onb.querySelector("#onb-go").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const P = MB.state().profil;
  ok(!!P, "profil créé");
  eq(P.nom, "Sarah", "prénom enregistré et nettoyé des espaces");
  eq(P.avatar, "🕊️", "image enregistrée");
  eq(P.heure, "06:30", "heure de méditation enregistrée");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(P.depuis), "date d'inscription enregistrée");
  ok(!document.querySelector(".onb"), "l'écran de bienvenue se referme");

  section("28. Accueil personnalisé");
  const jour = clickTab("jour");
  ok(/hello/.test(jour), "bloc de salutation affiché");
  ok(/Sarah/.test(jour), "l'utilisateur est accueilli par son prénom");
  ok(/🕊️/.test(jour), "son image apparaît");
  ok(/Bonjour|Bonsoir|Bon après-midi|Belle nuit/.test(jour), "salutation selon l'heure");
  ok(["Bonjour", "Bonsoir", "Bon après-midi", "Belle nuit"].includes(MB.saluer()),
    "salutation cohérente avec l'heure du jour");

  section("29. Profil : consultation et modification");
  const plus = clickTab("plus");
  ok(/Mon profil/.test(plus), "carte profil dans l'onglet « Plus »");
  ok(/Sarah/.test(plus), "prénom affiché");
  ok(/membre depuis/.test(plus), "ancienneté affichée");
  ok(/06:30/.test(plus), "heure de méditation affichée");

  click("#prof-edit");
  const psh = document.querySelector(".sheet");
  ok(!!psh, "la fiche de profil s'ouvre");
  eq(psh.querySelector("#pf-nom").value, "Sarah", "prénom pré-rempli");
  ok(psh.querySelector('[data-ava="🕊️"]').classList.contains("on"), "image courante pré-sélectionnée");
  psh.querySelector("#pf-nom").value = "Marie";
  psh.querySelector('[data-ava="🌻"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  psh.querySelector("#pf-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(MB.state().profil.nom, "Marie", "prénom modifié");
  eq(MB.state().profil.avatar, "🌻", "image modifiée");
  eq(MB.state().profil.depuis, P.depuis, "date d'inscription conservée");
  ok(!document.querySelector(".sheet"), "la fiche se referme après enregistrement");
  ok(/Marie/.test(clickTab("jour")), "l'accueil reflète le nouveau prénom");

  // un profil sans prénom reste discret
  MB.state().profil = { nom: "", avatar: "🌿", heure: null, depuis: "2026-01-01" };
  ok(!/class="hello"/.test(clickTab("jour")), "pas de salutation sans prénom");
  ok(/Visiteur/.test(clickTab("plus")), "profil anonyme identifié comme visiteur");
  MB.state().profil = { nom: "Marie", avatar: "🌻", heure: "06:30", depuis: P.depuis };
  clickTab("jour");

  section("30. Retour de l'utilisateur (2e lancement)");
  // on relance l'application avec le stockage d'un utilisateur déjà inscrit
  const sauvegarde = JSON.stringify({
    ...JSON.parse(window.localStorage.getItem("meditation-biblique") || "{}"),
    profil: { nom: "Paul", avatar: "🔥", heure: "06:00", depuis: "2026-01-15" }
  });
  const dom2 = new JSDOM(html, {
    runScripts: "dangerously", url: "https://exemple.test/", pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) { w.localStorage.setItem("meditation-biblique", sauvegarde); }
  });
  await new Promise(r => dom2.window.addEventListener("load", r));
  const d2 = dom2.window.document;
  ok(!d2.querySelector(".onb"), "l'écran de bienvenue ne réapparaît pas au 2e lancement");
  ok(!!d2.querySelector(".hello"), "l'utilisateur est reconnu au retour");
  ok(/Paul/.test(d2.querySelector(".hello-txt .h").textContent), "accueilli par son prénom");
  ok(/🔥/.test(d2.querySelector(".hello-ava").textContent), "son image est restaurée");
  ok(/membre depuis le 15\/01\/2026/.test(
    [...d2.querySelectorAll("nav.tabs button")].find(b => b.dataset.tab === "plus") &&
    (() => {
      [...d2.querySelectorAll("nav.tabs button")].find(b => b.dataset.tab === "plus")
        .dispatchEvent(new dom2.window.MouseEvent("click", { bubbles: true }));
      return d2.getElementById("main").textContent;
    })()), "ancienneté conservée entre deux sessions");
  dom2.window.close();

  console.log("\n" + "─".repeat(54));
  if (fail) {
    console.log(`\x1b[31m❌ ${fail} test(s) en échec\x1b[0m sur ${pass + fail}`);
    failures.forEach(f => console.log("   • " + f));
    process.exit(1);
  }
  console.log(`\x1b[32m✅ ${pass} vérifications réussies\x1b[0m`);
  process.exit(0);
})();
}

main().catch(e => { console.error(e); process.exit(1); });
