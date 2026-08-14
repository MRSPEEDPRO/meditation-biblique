<div align="center">

# 🌿 Méditation Biblique

**Application web de méditation biblique quotidienne — 100 % hors-ligne, en français.**

Bible **Louis Segond 1910** (domaine public) · Version 1.2.0 · Licence MIT

</div>

---

## ✨ En bref

Un **fichier `index.html` unique** (1,85 Mo) qui contient toute la Bible, tous les plans
et toute l'application. Téléchargez-le, ouvrez-le dans n'importe quel navigateur : ça marche.
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
| 🔊 **Écoute audio** | Synthèse vocale française (Web Speech API) |
| 📖 **11 plans de lecture** | Bible en 1 an (1 189 chapitres, ~4/jour) · NT en 90 j · Évangiles en 40 j · Psaumes en 30 j · Proverbes en 31 j · 6 plans thématiques de 7 j |
| 🌸 **19 thèmes** | 266 versets sélectionnés : foi, pardon, joie, prière, épreuve, humilité… |
| 📔 **Journal de méditation** | Notes privées, gardées sur l'appareil · export en fichier texte |
| ⭐ **Favoris** | Vos versets marqués, retrouvés en un geste |
| 🔍 **Recherche instantanée** | Dans les 31 170 versets, résultats surlignés |
| 📚 **Explorateur** | Les 66 livres, chapitre par chapitre |
| 📖 **Lecteur plein écran** | Lecture du texte au fil, typographie sérif et versets en exposant · touchez un verset (ou plusieurs à la suite) pour l'écouter, le mettre en favori, l'annoter, le partager ou le copier · **surlignage** en 4 couleurs conservé d'une session à l'autre · navigation chapitre par chapitre, sélecteur livre/chapitre, présentation « un verset par ligne », reprise là où vous vous êtes arrêté |
| 🧭 **Guide de méditation** | La méthode en 5 étapes |
| ⚙️ **Réglages** | Taille du texte · mode nuit |
| ↗ **Partage en un clic** | WhatsApp, Facebook, Telegram, X, e-mail · verset pré-rempli · fonctionne même sans l'API de partage du navigateur |

---

## 🔒 Vie privée

**Rien ne sort de votre téléphone.** Aucune requête réseau, aucun traceur, aucun serveur.
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
| `data/themes.json` · `daily_verses.json` · `plans.json` | Contenu éditorial |
| `data/embed_data.js` | Données embarquées : Bible compressée + thèmes + plans + versets du jour |
| `data/gen_plans.py` | Régénère les plans et `embed_data.js` |
| `tools/parse_usfm.py` | Convertit les sources USFM en `bible_lsg.json` |
| `tools/gen_content.py` | Génère et valide thèmes et versets du jour |
| `build.py` | Assemble `index.html` |
| `test_smoke.js` | 300 vérifications automatiques (jsdom) |

---

## 🛠 Développement

```bash
npm install          # jsdom, pour les tests uniquement
python3 build.py     # assemble index.html
npm test             # 185 vérifications
```

Pour régénérer les données éditoriales :

```bash
python3 data/gen_plans.py    # plans.json + embed_data.js
```

### Comment ça tient dans un seul fichier

Les 31 170 versets pèsent 4,4 Mo en JSON. Ils sont réduits en texte compact
(séparateurs `\x1e` / `\x1d` / `\x1c`), compressés en **gzip niveau 9**, puis encodés
en base64 → **1,78 Mo**. Au démarrage, `src/inflate.js` (une implémentation DEFLATE
maison, sans dépendance) les décompresse en mémoire en une fraction de seconde.

---

## ✅ Tests

`npm test` charge le `index.html` produit dans un vrai DOM et vérifie, entre autres :

- 66 livres · 1 189 chapitres · 31 170 versets · aucun verset vide
- l'exactitude du texte sur des versets témoins (Genèse 1:1, Jean 3:16, Psaume 23:1…)
- 247 versets du jour sans doublon, rotation complète et déterministe
- 19 thèmes / 266 versets · 11 plans · couverture exacte de la Bible par le plan 1 an
- les 7 onglets, le journal, les favoris, la recherche, le partage, les réglages
- le profil local : création, accueil personnalisé, modification, persistance entre deux sessions
- le lecteur plein écran : sélection de versets, surlignage persistant, navigation et reprise de lecture
- la méditation personnalisée : suivi séquentiel, cycle, tirage aléatoire ≠ veille
- l'autonomie du fichier : aucun script, style ou appel réseau externe

---

## 📖 Source du texte

Louis Segond 1910, **domaine public**, éditions USFM du dépôt
[`BibleCorps/FRA-B-LSG1910-PD-UBS`](https://github.com/BibleCorps/FRA-B-LSG1910-PD-UBS).

---

## 📄 Licence

Code sous licence **MIT** (voir `LICENSE`). Texte biblique dans le domaine public.
