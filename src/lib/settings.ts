import { useCallback, useEffect, useState } from 'react';
import { defaultRules, type DevMode, type Rules } from '../engine/strategy';
import { defaultPaytable, type Paytable, type SideBetId } from '../engine/sidebets';
import type { TableLimits } from '../engine/game';

export interface AppSettings {
  rules: Rules;
  deviations: DevMode;
  pays: Record<SideBetId, Paytable>;
  limits: TableLimits;
}

const KEY = 'casinoghost:settings:v1';

export function defaultSettings(): AppSettings {
  return {
    rules: { ...defaultRules(), decks: 6, h17: true, surrender: 'late', penetration: 0.75 },
    deviations: 'i18fab4',
    pays: { pp: defaultPaytable('pp'), t213: defaultPaytable('t213'), ll: defaultPaytable('ll') },
    limits: { min: 5, max: 1000 },
  };
}

function load(): AppSettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return { ...base, ...s, rules: { ...base.rules, ...s.rules }, pays: { ...base.pays, ...s.pays }, limits: { ...base.limits, ...s.limits } };
  } catch {
    return base;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings]);
  const update = useCallback((patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateRules = useCallback((patch: Partial<Rules>) => setSettings((s) => ({ ...s, rules: { ...s.rules, ...patch } })), []);
  return { settings, update, updateRules, reset: () => setSettings(defaultSettings()) };
}

/** Per-viewer UI preference stored in localStorage, tolerant of blocked storage. */
export function usePref<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(`casinoghost:${key}`); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(`casinoghost:${key}`, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [key, v]);
  return [v, setV] as const;
}
