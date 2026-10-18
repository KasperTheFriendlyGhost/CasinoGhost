import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrateStorage, isNative } from './lib/native';
import './fonts.css';
import './index.css';

// Offline support and "Install app" when served over http(s). The single-file build and the
// native app (which bundles its files) skip it.
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && !isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

// In the native app, restore saved settings and the session before the first render.
void hydrateStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
