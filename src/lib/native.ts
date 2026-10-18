// Bridge to native iOS/Android features via Capacitor, with web fallbacks.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Preferences } from '@capacitor/preferences';
import { Browser } from '@capacitor/browser';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

/** Where the web build, privacy policy and support page are hosted (GitHub Pages). */
export const SITE_URL = 'https://kasperthefriendlyghost.github.io/CasinoGhost/';

// ----- Durable storage ---------------------------------------------------------------------
// The app reads and writes synchronously through localStorage. In the native app every write
// is mirrored to Preferences (UserDefaults on iOS), which the OS does not purge, and on launch
// Preferences is copied back into localStorage before the first render.

const PREFIX = 'casinoghost:';

export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
    if (isNative) void Preferences.set({ key, value });
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    if (isNative) void Preferences.remove({ key });
  },
  /** Remove every CasinoGhost key (settings, session, drills). */
  clearAll() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
      }
    } catch { /* storage unavailable */ }
    if (isNative) void Preferences.clear();
  },
};

/** Copy durable native storage into localStorage. Call before the first render. */
export async function hydrateStorage(): Promise<void> {
  if (!isNative) return;
  try {
    const { keys } = await Preferences.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map(async (key) => {
      const { value } = await Preferences.get({ key });
      if (value !== null) localStorage.setItem(key, value);
    }));
  } catch { /* first launch or storage unavailable */ }
}

// ----- Haptics -----------------------------------------------------------------------------

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'heavy';
let hapticsOn = true;
export const setHapticsEnabled = (on: boolean) => { hapticsOn = on; };

export function haptic(kind: HapticKind) {
  if (!hapticsOn) return;
  if (isNative) {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success });
    else if (kind === 'warning') void Haptics.notification({ type: NotificationType.Warning });
    else if (kind === 'error') void Haptics.notification({ type: NotificationType.Error });
    else if (kind === 'select') void Haptics.selectionChanged();
    else void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light });
    return;
  }
  const ms = kind === 'warning' || kind === 'error' ? [18, 40, 18] : kind === 'success' ? [10, 30, 10] : 8;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

// ----- Status bar --------------------------------------------------------------------------

/** Light status-bar text on the dark theme, dark text on the light theme. */
export function syncStatusBar(dark: boolean) {
  if (!isNative) return;
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

// ----- External links ----------------------------------------------------------------------

/** Open a web page: an in-app Safari sheet in the native app, a new tab on the web. */
export function openExternal(url: string) {
  if (isNative) void Browser.open({ url, presentationStyle: 'popover' });
  else window.open(url, '_blank', 'noopener');
}
