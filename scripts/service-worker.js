/* This template is versioned and populated by build-pwa.mjs after Expo export. */
const CACHE = 'tabi-shell-__VERSION__';
const PRECACHE = __PRECACHE__;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
// An update waits until the user explicitly accepts it, preserving active forms.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith('tabi-shell-') && key !== CACHE);
    // Retain one previous shell for tabs that still run its code.
    await Promise.all(keys.slice(0, -1).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/v1/') || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    // Only the public app shell is cached. Identity/data live in account-scoped storage.
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match('/index.html')) || fetch(request)));
    return;
  }
  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) || (await caches.match(request)) || fetch(request)));
});
