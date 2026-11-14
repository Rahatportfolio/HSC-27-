/* HSC 2027 Study App — service worker
 * Caches the app shell so the app works fully offline on Android.
 * Data lives locally; optional authenticated sync uses network-only API requests.
 */
'use strict';

const CACHE = 'hsc27-v5';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/utils.js',
  'js/store.js',
  'js/views/dashboard.js',
  'js/views/subjects.js',
  'js/views/planner.js',
  'js/views/focus.js',
  'js/views/progress.js',
  'js/views/library.js',
  'js/views/more.js',
  'js/views/quiz.js',
  'js/i18n.js',
  'js/sync.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('hsc27-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin app files; external links (YouTube, AI) go to network.
  if (url.origin !== self.location.origin || url.pathname.startsWith(new URL('api/', self.registration.scope).pathname)) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});

// Background delivery is best-effort and requires an explicit push subscription.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = typeof data.title === 'string' ? data.title.slice(0, 80) : 'Study reminders';
  const body = typeof data.body === 'string' ? data.body.slice(0, 220) : 'Open the app to review your study plan.';
  event.waitUntil(self.registration.showNotification(title, { body, icon:'icons/icon-192.png', tag:'hsc27-daily' }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then((windows) => {
    const client = windows.find((w) => w.url.startsWith(self.registration.scope));
    return client ? client.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
