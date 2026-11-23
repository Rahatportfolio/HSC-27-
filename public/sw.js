/* Production-only offline shell. User data stays in localStorage, never in this cache. */
const CACHE = 'prostuti-hsc27-v4';
const SHELL = ['./', './index.html', './icon.svg', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', event => {
  // Do not skipWaiting: an open tab keeps its old precache until it is safe to activate.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('message', event => {
  // User-initiated only, from the update banner's Reload button. Install still
  // never skips waiting on its own, so a running study timer is never cut off.
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('prostuti-hsc27-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Recovery is a real independent document, not an app route. Caching it as
    // index.html would strand the next offline launch on the recovery page.
    const url = new URL(request.url), root = new URL('./', self.location.href);
    const appDocument = url.pathname === root.pathname || url.pathname === root.pathname + 'index.html';
    const target = appDocument ? './index.html' : request;
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(target, copy)).catch(() => {})); }
      return response;
    }).catch(() => caches.match(target, { ignoreVary: true, ignoreSearch: true }).then(cached => cached || (appDocument ? caches.match('./', { ignoreVary: true }) : Response.error()))));
    return;
  }
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
    if (response.ok && response.type === 'basic') { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {})); }
    return response;
  })));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./#today', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(c => c.url.startsWith(self.registration.scope));
    if (client) { client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
