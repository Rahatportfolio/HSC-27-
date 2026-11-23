import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/500.css';
import '@fontsource/hind-siliguri/600.css';
import '@fontsource/hind-siliguri/700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
import App from './App';
import { isNativeApp } from './native';
import { watchServiceWorkerUpdates } from './swUpdate';

// Vite's Chrome 107 baseline includes these APIs; a stale WebView must not
// render/normalize a saved profile and then crash on a later setup/dialog path.
// Static HTML recovery remains available even if this entire module fails.
const supported = typeof Array.prototype.at === 'function' && typeof Object.hasOwn === 'function' && typeof structuredClone === 'function';
if (supported) ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (supported && import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator && window.isSecureContext) {
  const registerOffline = () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' }).then(
      () => watchServiceWorkerUpdates(),
      () => { /* The planner still works without offline caching. */ },
    );
  };
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline, { once: true });
}
