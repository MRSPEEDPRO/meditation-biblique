/* Méditation Biblique — service worker facultatif.
 *
 * Il n'est utile que si l'application est HÉBERGÉE (GitHub Pages, Netlify…).
 * Ouvert directement depuis le disque (file://), index.html fonctionne
 * exactement comme avant : ce fichier n'est alors jamais chargé.
 *
 * Stratégie : « cache first » sur la coquille de l'application. Tout tient
 * dans index.html, il n'y a donc rien d'autre à mettre en cache.
 */
var CACHE = "meditation-biblique-v1.3.0";
var SHELL = ["./", "./index.html"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* hors-ligne à l'installation : sans gravité */ })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(noms.map(function (n) {
          return n === CACHE ? null : caches.delete(n);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        // rafraîchissement silencieux en arrière-plan
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copie = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copie); });
          }
          return res;
        })
        .catch(function () { return caches.match("./index.html"); });
    })
  );
});
