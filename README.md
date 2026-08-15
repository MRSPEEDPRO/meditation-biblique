<div align="center">

# 🌿 Méditation Biblique

**Application web de méditation biblique quotidienne — 100 % hors-ligne, en français et en anglais.**

**9 versions de la Bible** (domaine public) · interface **bilingue FR/EN** · Version 1.6.0 · Licence MIT

</div>

---

## ✨ En bref

Un **fichier `index.html` unique** (15,4 Mo) qui contient **9 versions complètes de la Bible**,
tous les plans et toute l'application. Téléchargez-le, ouvrez-le dans n'importe quel navigateur : ça marche.
Sans internet, sans serveur, sans installation, sans compte.

```
Double-cliquez sur index.html  →  l'application démarre
```

Publiable tel quel sur GitHub Pages, Netlify, une clé USB ou envoyé par WhatsApp.

---

## 🙏 Fonctionnalités

| | |
|---|---|
| 👤 **Mon profil** | Inscription **locale** à la première ouverture : prénom, image parmi 12, moment de méditation · l'accueil vous salue par votre prénom et affiche votre série de jours · modifiable à tout moment · **aucun compte en ligne, aucun mot de passe**, l'étape peut être passée |
| 🌅 **Verset du jour** | Rotation sur **247 versets** choisis · navigation vers les jours précédents |
| 🎯 **Ma méditation personnalisée** | Choisissez un **chapitre** ou un **livre entier** · méthode 📆 **Suivi** (dans l'ordre, avec cycle en fin de passage) ou 🎲 **Aléatoire** (jamais le verset de la veille, découvertes comptabilisées) · bascule à tout moment avec le verset du jour général |
| 🔊 **Écoute audio** | Synthèse vocale française (Web Speech API) · **chapitre entier** lu d'un trait, verset surligné au fil de la lecture, pause, vitesse réglable · ponctuation adaptée à l'oral, respiration entre les versets, garde anti-coupure Chrome |
| 📖 **16 plans de lecture** | Bible en 1 an (1 189 chapitres, ~4/jour) · NT en 90 j · Évangiles en 40 j · Psaumes en 30 j · Proverbes en 31 j · **Sagesse en 30 j** · **Épîtres en 60 j** · 9 plans thématiques de 7 j |
| 🌸 **24 thèmes** | 336 versets sélectionnés : foi, pardon, joie, prière, épreuve, humilité, **deuil, travail, argent, identité, persévérance**… |
| 📔 **Journal de méditation** | Notes privées gardées sur l'appareil · **recherche**, **6 étiquettes** (promesse, prière, exaucé…), modification · rappel « **il y a un an, jour pour jour** » · export en fichier texte |
| ⭐ **Favoris** | Vos versets marqués, retrouvés en un geste |
| 🔍 **Recherche instantanée** | Dans les 31 170 versets, résultats surlignés |
| 📚 **Explorateur** | Les 66 livres, chapitre par chapitre |
| 📖 **Lecteur plein écran** | Lecture du texte au fil, typographie sérif et versets en exposant · touchez un verset (ou plusieurs à la suite) pour l'écouter, le mettre en favori, l'annoter, le partager ou le copier · **surlignage** en 4 couleurs conservé d'une session à l'autre · navigation chapitre par chapitre, sélecteur livre/chapitre, présentation « un verset par ligne », reprise là où vous vous êtes arrêté |
| 🧭 **Guide de méditation** | La méthode en 5 étapes |
| ⚙️ **Réglages** | Taille du texte · jour / nuit / auto · rappel · sauvegarde des données |
| ↗ **Partage en un clic** | WhatsApp, Facebook, Telegram, X, e-mail · verset pré-rempli · fonctionne même sans l'API de partage du navigateur |
| 🖼 **Carte-verset en image** | Génère une image carrée (1080×1080) du verset, 4 fonds au choix, à enregistrer ou partager · dessinée sur place, **sans réseau** |
| 💾 **Sauvegarde & restauration** | Export complet en `.json` (profil, notes, favoris, surlignages, plans, série) · restauration par **fusion** ou **remplacement**, pour changer de téléphone sans rien perdre |
| 📲 **Installable** | Ajout à l'écran d'accueil et lancement plein écran quand l'application est hébergée · manifeste embarqué, service worker facultatif |
| ⏰ **Rappel quotidien** | Notification locale à l'heure choisie, sans compte ni serveur (facultatif) |
| 🔍 **Recherche avancée** | Plusieurs mots (tous requis) · filtre Ancien / Nouveau Testament · saisie d'une **référence** (« Jean 3:16 », « ps 23 ») pour ouvrir le passage |
| 📚 **9 versions de la Bible** | **Français** : Louis Segond 1910, Darby, Ostervald, Martin · **Anglais** : King James, World English Bible, American Standard, Young's Literal, Bible in Basic English · toutes dans le **domaine public**, toutes embarquées, changement instantané |
| 🔀 **Comparaison de versions** | Un même verset affiché dans les 9 traductions côte à côte, groupées par langue |
| 🌍 **Interface bilingue FR/EN** | Sélecteur de langue qui traduit **toute** l'application : onglets, titres, boutons, plans, thèmes, dates et noms des livres bibliques |
| 🌗 **Thème auto** | Jour, nuit, ou **auto** suivant le réglage clair/sombre du téléphone |
| 📈 **Ma progression** | Calendrier des 5 dernières semaines · série en cours et record · **8 badges** · statistiques détaillées · séries **recalculées depuis les jours réellement médités** et sauvegardes scellées, pour que les chiffres veuillent dire quelque chose |

---

## 🎯 Une progression qui veut dire quelque chose

Les séries et les badges ne sont pas de simples compteurs que l'on incrémente : ils sont
**recalculés à partir des jours réellement médités** (`histo`). Un compteur modifié à la main
est donc ramené à la réalité au prochain démarrage, les jours postérieurs à aujourd'hui
(horloge avancée puis remise à l'heure) sont écartés, et les doublons fusionnés.

Les fichiers de sauvegarde portent un **sceau** calculé sur l'historique. À la restauration,
un fichier retouché est détecté : vos **notes et favoris sont intégralement conservés** —
c'est votre travail — mais le record de série n'est pas repris sur parole, il est recalculé.
Restaurer une sauvegarde honnête sur un nouveau téléphone fonctionne normalement.

Tout ceci tourne sur l'appareil. Ce n'est donc **pas inviolable**, et ce n'est pas le but :
qui lit ce code peut le contourner. L'objectif est d'empêcher les incohérences accidentelles
et la triche facile, pour que le chiffre affiché reste honnête vis-à-vis de soi-même.

> **À noter** — l'application n'a pas de comptes : le profil est purement local. Rien ne peut
> empêcher une même personne d'avoir plusieurs profils (autre navigateur, autre appareil,
> données effacées), et le vérifier supposerait un serveur et une identité vérifiée, à
> rebours de la promesse « rien ne sort de votre téléphone ».

---

## 🔒 Vie privée

**Rien ne sort de votre téléphone.** Aucune requête réseau, aucun traceur, aucun serveur.
La carte-image est dessinée sur l'appareil, le rappel est un simple minuteur local,
et la sauvegarde est un fichier que **vous** enregistrez où vous voulez.
Profil, journal, favoris, surlignages et progression vivent dans le `localStorage` du navigateur.
Le code ne contient ni `fetch`, ni `XMLHttpRequest` — c'est vérifié par les tests.

L'« inscription » est **purement locale** : elle ne demande ni e-mail, ni mot de passe, et ne crée
aucun compte en ligne. C'est un profil d'affichage, stocké sur l'appareil, que l'on peut passer,
modifier ou supprimer (« Tout effacer ») à tout moment.

---

## 🗂 Structure du projet

| Chemin | Rôle |
|---|---|
| `index.html` | **L'application complète en un fichier** (produite par `build.py`) |
| `src/index.template.html` | Squelette HTML |
| `src/styles.css` | Feuille de style |
| `src/app.js` | Logique de l'application |
| `src/inflate.js` | Décompresseur gzip en JavaScript pur (aucune dépendance) |
| `data/bible_lsg.json` | Bible LS1910 complète (4,4 Mo) |
| `data/versions/*.b64` | Les 9 versions compressées (gzip + base64) + `index.json` |
| `data/i18n.json` | Libellés de l'interface (clés × fr/en) |
| `data/ui_en.json` | Traduction anglaise des phrases affichées (`exact` + `patterns`) |
| `data/plans_en.json` | Noms et descriptions des plans en anglais |
| `tools/import_versions.py` | Importe et normalise les 9 versions depuis les sources |
| `tools/align_versions.py` | Calcule les tables de versification LSG → chaque version |
| `tools/check_alignment.py` | Vérifie l'alignement sur des références témoins |
| `data/themes.json` · `daily_verses.json` · `plans.json` | Contenu éditorial |
| `data/embed_data.js` | Données embarquées : Bible compressée + thèmes + plans + versets du jour |
| `data/gen_plans.py` | Régénère les 16 plans et `embed_data.js` |
| `tools/parse_usfm.py` | Convertit les sources USFM en `bible_lsg.json` |
| `tools/gen_content.py` | Génère et valide les 24 thèmes et les versets du jour |
| `build.py` | Assemble `index.html` |
| `sw.js` | Service worker **facultatif**, utile seulement si le site est hébergé |
| `tools/ci.workflow.yml` | Workflow d'intégration continue prêt à l'emploi (voir ci-dessous) |
| `test_smoke.js` | 462 vérifications automatiques (jsdom) |

---

## 🛠 Développement

```bash
npm install          # jsdom, pour les tests uniquement
python3 build.py     # assemble index.html
npm test             # 462 vérifications
```

Pour régénérer les données éditoriales :

```bash
python3 data/gen_plans.py    # plans.json + embed_data.js
```

### Comment ça tient dans un seul fichier

Chaque version (~31 000 versets) est réduite en texte compact
(séparateurs `\x1e` / `\x1d` / `\x1c`), compressée en **gzip niveau 9**, puis encodée
en base64 → ~1,7 Mo par version, **15,2 Mo** pour les neuf. Seule la version affichée est
décompressée, **à la demande** : changer de version décompresse la nouvelle et garde
les précédentes en cache mémoire. Au démarrage, `src/inflate.js` (une implémentation DEFLATE
maison, sans dépendance) les décompresse en mémoire en une fraction de seconde — dans un
**Web Worker**, pour que l'écran de démarrage reste fluide, avec repli synchrone automatique
si les workers ne sont pas disponibles.

---

## 🤖 Intégration continue

Un workflow GitHub Actions est fourni dans `tools/ci.workflow.yml` : il assemble `index.html`,
vérifie qu'il est bien à jour par rapport à `src/`, lance les 462 tests et contrôle qu'aucune
ressource externe n'a été introduite. Pour l'activer :

```bash
mkdir -p .github/workflows
cp tools/ci.workflow.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "CI" && git push
```

---

## ✅ Tests

`npm test` charge le `index.html` produit dans un vrai DOM et vérifie, entre autres :

- 66 livres · 1 189 chapitres · 31 170 versets · aucun verset vide
- l'exactitude du texte sur des versets témoins (Genèse 1:1, Jean 3:16, Psaume 23:1…)
- 247 versets du jour sans doublon, rotation complète et déterministe
- 24 thèmes / 336 versets · 16 plans · couverture exacte de la Bible par le plan 1 an
- les 7 onglets, le journal, les favoris, la recherche, le partage, les réglages
- le profil local : création, accueil personnalisé, modification, persistance entre deux sessions
- le lecteur plein écran : sélection de versets, surlignage persistant, navigation et reprise de lecture
- la méditation personnalisée : suivi séquentiel, cycle, tirage aléatoire ≠ veille
- la recherche avancée : multi-mots, filtres AT/NT, reconnaissance des références
- la sauvegarde : export/import JSON, fusion idempotente, refus des fichiers étrangers
- le thème automatique et la carte-verset en image (4 fonds, aperçu, enregistrement)
- le manifeste d'installation : icônes embarquées, aucun fichier externe
- la progression : calendrier, séries, badges et statistiques
- l'intégrité de la progression : série déduite de l'historique, compteur gonflé ramené
  à la réalité, jours futurs et doublons écartés, sauvegarde retouchée détectée par son sceau
- le journal enrichi : recherche, filtres par étiquette, modification, souvenirs d'un an
- la lecture audio du chapitre et le surlignage du verset prononcé
- la décompression en Web Worker et son repli synchrone
- les 9 versions : texte non vide sur des références clés, textes bien distincts entre versions
- la versification : conversion LSG → KJV (Ésaïe 9:5→9:6, Jonas 2:1→1:17, Ecclésiaste 4:17→5:1)
- l'interface bilingue : bascule FR/EN, traduction des vues, des plans, des thèmes et des noms de livres
- l'autonomie du fichier : aucun script, style ou appel réseau externe

---

## 📖 Sources des textes

Les 9 versions sont dans le **domaine public**.

| Version | Langue | Année | Source |
|---|---|---|---|
| Louis Segond | fr | 1910 | [`BibleCorps/FRA-B-LSG1910-PD-UBS`](https://github.com/BibleCorps/FRA-B-LSG1910-PD-UBS) (USFM) |
| Darby | fr | 1885 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| Ostervald | fr | 1867 | [`splitant/php-bible-api`](https://github.com/splitant/php-bible-api) |
| Martin | fr | 1744 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| King James Version | en | 1769 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| World English Bible | en | 2000 | [`world-english-bible`](https://www.npmjs.com/package/world-english-bible) (npm) |
| American Standard Version | en | 1901 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| Young's Literal Translation | en | 1898 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |
| Bible in Basic English | en | 1949 | [`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases) |

### Versification

Les traductions ne numérotent pas toujours les versets de la même façon : Ésaïe 9:5 (LSG)
correspond à Ésaïe 9:6 (KJV), Jonas 2:1 à Jonas 1:17, etc. `tools/align_versions.py`
calcule pour chaque version une **table de correspondance** depuis la numérotation Louis
Segond ; l'application la consulte à l'affichage, de sorte qu'une référence enregistrée en
favori ou citée dans une note pointe toujours sur le bon verset, quelle que soit la version
sélectionnée. `tools/check_alignment.py` contrôle ces tables sur des cas témoins.

---

## 📄 Licence

Code sous licence **MIT** (voir `LICENSE`). Texte biblique dans le domaine public.
