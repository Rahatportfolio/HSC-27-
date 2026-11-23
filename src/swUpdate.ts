/** Detects a newly deployed service worker without ever reloading on its own.
 * An open tab keeps running its own bundle (a study timer must never be
 * interrupted); when a waiting worker appears we dispatch
 * `prostuti:sw-update` so the UI can offer a one-tap reload instead. */
export const SW_UPDATE_EVENT = 'prostuti:sw-update';

export function watchServiceWorkerUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(registration => {
    const announce = () => window.dispatchEvent(new Event(SW_UPDATE_EVENT));
    if (registration.waiting) { announce(); return; }
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) announce();
      });
    });
    const check = () => { registration.update().catch(() => { /* Offline: keep the running version. */ }); };
    // A tab left open still learns about a deploy when the student returns.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    check();
  }).catch(() => { /* The planner still works without offline caching. */ });
}

/** Switch to the waiting worker, then reload onto the fresh shell. Falls back
 * to a plain reload (navigations are network-first) when no worker is waiting. */
export function applyServiceWorkerUpdate(): void {
  if (!('serviceWorker' in navigator)) { window.location.reload(); return; }
  let done = false;
  const reload = () => { if (!done) { done = true; window.location.reload(); } };
  navigator.serviceWorker.ready.then(registration => {
    const waiting = registration.waiting;
    if (!waiting) { reload(); return; }
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    // Safety net: never leave the student staring at a dead button.
    window.setTimeout(reload, 4000);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }).catch(reload);
}
