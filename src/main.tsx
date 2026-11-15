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

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator && window.isSecureContext) {
  const registerOffline = () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' }).catch(() => { /* The planner still works without offline caching. */ });
  };
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline, { once: true });
}
