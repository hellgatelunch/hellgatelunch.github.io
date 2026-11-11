// Service worker: lets the app open offline (showing the last menu it saw) and lets
// Android offer "Install app". Bump VERSION when the app's own files change shape.
var VERSION = "v26";
var SHELL = "hellgate-shell-" + VERSION;
var DATA = "hellgate-data";
var SHELL_FILES = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "img/hawks-logo.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("hellgate-shell-") === 0 && k !== SHELL; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Network first, falling back to the saved copy (for the menu, which changes).
function networkFirst(req, cacheName) {
  return fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(cacheName).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); });
}

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/data/menu.json")) return e.respondWith(networkFirst(req, DATA));
  // Day pictures: fresh when online too (a re-cut month reuses the same names), saved copy offline.
  if (url.pathname.indexOf("/data/cells") >= 0) return e.respondWith(networkFirst(req, DATA));
  // The app's own files: fresh when online (so a new page never meets an old script), saved copy offline.
  e.respondWith(networkFirst(req, SHELL));
});
