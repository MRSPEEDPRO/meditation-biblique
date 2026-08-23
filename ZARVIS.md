# ZARVIS autonome

`zarvis.html` est une application indépendante de Méditation Biblique. Elle peut être
ouverte directement dans un navigateur ou servie à côté de l'application Bible :

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Puis ouvrir `/zarvis.html`.

## Ce que fait le prototype

Le noyau texte fonctionne sans serveur ni clé API :

- tâches locales : `ajoute une tâche préparer le dossier`, `mes tâches`, `termine la tâche 1` ;
- notes locales : `note appeler maman`, `mes notes` ;
- calcul : `calcule 12 × 4` ;
- minuteur : `minuteur 5 minutes` ;
- diagnostic : `scanne le système` ;
- identité locale : `je m'appelle Alex` ;
- apparence : `mode sombre` ou `mode clair` ;
- aide et inspiration.

Les tâches, notes, nom d'opérateur et préférences sont enregistrés dans le `localStorage`
du navigateur, sur l'appareil utilisé.

L'entrée vocale est optionnelle et utilise l'API de reconnaissance proposée par le navigateur
lorsqu'elle est disponible. Pour un fonctionnement strictement hors-ligne, le champ texte est
le mode garanti.
