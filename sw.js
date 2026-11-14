/* HSC 2027 Study App — service worker
 * Caches the app shell so the app works fully offline on Android.
 * Data lives in localStorage (local-first), so no sync queue is needed;
 * JSON backup/restore covers multi-device transfer.
 */
'use strict';

const CACHE = 'hsc27-v2';
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
  if (url.origin !== self.location.origin) return;
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
