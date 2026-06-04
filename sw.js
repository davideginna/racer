// Service worker: cache-first per l'app shell (funziona offline).
// Le richieste cross-origin (Firebase SDK, jsdelivr) passano sempre dalla rete.
const CACHE = "racer-v2";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./css/style.css",
  "./js/app.js", "./js/game.js", "./js/track.js",
  "./js/net.js", "./js/audio.js", "./js/firebase-config.js",
  "./js/util.js", "./js/rank.js", "./js/vendor/qrcode-generator.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // solo GET stessa origine viene servito dalla cache
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).catch(() => caches.match("./index.html"))
    )
  );
});
