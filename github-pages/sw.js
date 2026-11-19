// Replaces the old app's service worker on the old address: clears its saved copy of the app
// and removes itself, so phones that installed the old app load the redirect to Netlify.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys()
    .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: "window" }); })
    .then(function (list) { list.forEach(function (c) { c.navigate(c.url).catch(function () {}); }); }));
});
