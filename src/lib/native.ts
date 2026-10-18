// Browser features with graceful fallbacks. The iPhone and iPad app is native SwiftUI (apple/),
// so the web build only ever runs in a browser.

export const isNative = false;
export const platform = 'web';

/** Where the web build, privacy policy and support page are hosted (GitHub Pages). */
export const SITE_URL = 'https://kasperthefriendlyghost.github.io/CasinoGhost/';

// ----- Storage -----------------------------------------------------------------------------

const PREFIX = 'casinoghost:';

export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
  /** Remove every CasinoGhost key (settings, session, drills). */
  clearAll() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
      }
    } catch { /* storage unavailable */ }
  },
};

/** Kept for the app's start-up sequence; browser storage needs no hydration. */
export async function hydrateStorage(): Promise<void> {}

// ----- Haptics -----------------------------------------------------------------------------

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'heavy';
let hapticsOn = true;
export const setHapticsEnabled = (on: boolean) => { hapticsOn = on; };

export function haptic(kind: HapticKind) {
  if (!hapticsOn) return;
  const ms = kind === 'warning' || kind === 'error' ? [18, 40, 18] : kind === 'success' ? [10, 30, 10] : 8;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

// ----- Status bar --------------------------------------------------------------------------

/** No status bar to style in a browser. */
export function syncStatusBar(_dark: boolean) {}

// ----- External links ----------------------------------------------------------------------

/** Open a web page in a new tab. */
export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener');
}
