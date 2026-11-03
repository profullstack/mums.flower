// mums.flower service worker: installable PWA with an offline page. Pages are network-first
// (they show your own data), static assets are cache-first.
const VERSION = 'mums-v1';
const SHELL = ['/', '/flowers', '/offline', '/app.css', '/app.js', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/mcp') return;
  // Both fetches below replay the page's own request, in the visitor's browser, and only for this
  // origin (checked above): there is no server-side fetch and no attacker-chosen URL here.
  if (/\.(css|js|svg|png|webmanifest)$/.test(url.pathname)) {
    // threatcrush-disable-next-line
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => (caches.open(VERSION).then((c) => c.put(req, r.clone())), r))));
    return;
  }
  if (req.mode === 'navigate') {
    // threatcrush-disable-next-line
    e.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('/offline'))));
  }
});
