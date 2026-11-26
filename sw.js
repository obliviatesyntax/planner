// sw.js — makes Planner installable as an app, and lets it start without a connection.
//
// Network first: every page, script and style comes fresh from the site when online (so a new
// version is never stuck behind an old copy); the last copy is kept and used only when offline.
// Requests to other sites (Supabase, fonts, CDNs) are left alone, except the pinned CDN scripts.

const CACHE = 'planner-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const pinnedCdn = url.hostname === 'cdn.jsdelivr.net';   // versions are in the address: safe to keep
  if (req.method !== 'GET' || (url.origin !== location.origin && !pinnedCdn)) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })));
});
