import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, Grid3x3, Settings as SettingsIcon, SlidersHorizontal, Spade } from 'lucide-react';
import { defaultAppPrefs, usePref, useSettings, type AppPrefs } from './lib/settings';
import { rulesSummary } from './engine/strategy';
import { cx } from './lib/format';
import { haptic, isNative, setHapticsEnabled, syncStatusBar } from './lib/native';
import { setSoundEnabled, setSoundVolume } from './lib/sound';
import { Play } from './views/Play';
import { ExtLink } from './components/ExtLink';

// Secondary screens load on first visit, so the table opens faster.
const Lab = lazy(() => import('./views/Lab').then((m) => ({ default: m.Lab })));
const Strategy = lazy(() => import('./views/Strategy').then((m) => ({ default: m.Strategy })));
const Rules = lazy(() => import('./views/Rules').then((m) => ({ default: m.Rules })));
const Settings = lazy(() => import('./views/Settings').then((m) => ({ default: m.Settings })));

type Route = 'play' | 'lab' | 'strategy' | 'rules' | 'settings';
const ROUTES: { id: Route; label: string; short: string; icon: typeof Spade }[] = [
  { id: 'play', label: 'Table', short: 'Table', icon: Spade },
  { id: 'lab', label: 'Side Bet Lab', short: 'Lab', icon: FlaskConical },
  { id: 'strategy', label: 'Strategy', short: 'Strategy', icon: Grid3x3 },
  { id: 'rules', label: 'Rules', short: 'Rules', icon: SlidersHorizontal },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: SettingsIcon },
];

const fromHash = (): Route => {
  const h = location.hash.replace('#', '');
  return (ROUTES.some((r) => r.id === h) ? h : 'play') as Route;
};

function useAppPrefs() {
  const [prefs, setPrefs] = usePref<AppPrefs>('app', defaultAppPrefs());
  const p = { ...defaultAppPrefs(), ...prefs };
  useEffect(() => {
    setSoundEnabled(p.sound);
    setSoundVolume(p.volume);
    setHapticsEnabled(p.haptics);
    const root = document.documentElement;
    if (p.appearance === 'system') delete root.dataset.theme; else root.dataset.theme = p.appearance;
    const dark = p.appearance === 'dark' || (p.appearance === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
    syncStatusBar(dark);
  }, [p.sound, p.volume, p.haptics, p.appearance]);
  useEffect(() => { if (isNative) document.documentElement.classList.add('native'); }, []);
  return [p, (patch: Partial<AppPrefs>) => setPrefs({ ...p, ...patch })] as const;
}

export function App() {
  const { settings, update, updateRules } = useSettings();
  const [prefs, setPrefs] = useAppPrefs();
  const [route, setRoute] = useState<Route>(fromHash);
  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    if (r !== route) haptic('select');
    setRoute(r);
    try { history.replaceState(null, '', `#${r}`); } catch { /* sandboxed */ }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="relative z-30 border-b border-line bg-panel/90 backdrop-blur sm:sticky" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter mx-auto flex max-w-[1400px] items-center gap-x-6 py-2.5">
          <button onClick={() => go('play')} className="flex items-baseline gap-2" aria-label="CasinoGhost home">
            <span className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.06em] sm:text-[26px]"><span className="text-fg">Casino</span><span className="text-brass">Ghost</span></span>
            <span className="hidden text-xs font-medium text-muted sm:inline">blackjack trainer &amp; lab</span>
          </button>
          <nav className="hidden gap-1 sm:flex" aria-label="Sections">
            {ROUTES.filter((r) => r.id !== 'settings').map((r) => (
              <button key={r.id} onClick={() => go(r.id)} aria-current={route === r.id ? 'page' : undefined}
                className={cx('relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors', route === r.id ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
                {route === r.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-panel-2 ring-1 ring-line-strong" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </nav>
          <button onClick={() => go('rules')} className="ml-auto hidden truncate rounded-full border border-line px-3 py-1 font-data text-xs text-fg-2 hover:border-brass md:block" title="Table rules">
            {rulesSummary(settings.rules)}
          </button>
          <button onClick={() => go('settings')} aria-label="Settings" aria-current={route === 'settings' ? 'page' : undefined}
            className={cx('ml-auto hidden size-9 place-items-center rounded-full border transition-colors sm:grid md:ml-0', route === 'settings' ? 'border-line-strong bg-panel-2 text-fg' : 'border-line text-fg-2 hover:border-brass hover:text-fg')}>
            <SettingsIcon size={17} aria-hidden />
          </button>
        </div>
      </header>

      <main className="gutter mx-auto w-full max-w-[1400px] flex-1 pb-[calc(76px+env(safe-area-inset-bottom,0px))] pt-4 sm:py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
            <Suspense fallback={<div className="grid h-64 place-items-center text-sm text-muted">Loading…</div>}>
              {route === 'play' && <Play settings={settings} />}
              {route === 'lab' && <Lab settings={settings} setPays={(id, pays) => update({ pays: { ...settings.pays, [id]: pays } })} />}
              {route === 'strategy' && <Strategy settings={settings} />}
              {route === 'rules' && <Rules settings={settings} updateRules={updateRules} setDeviations={(deviations) => update({ deviations })} setLimits={(limits) => update({ limits })} />}
              {route === 'settings' && <Settings prefs={prefs} setPrefs={setPrefs} />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="gutter mx-auto hidden w-full max-w-[1400px] pb-6 text-xs text-muted sm:block">
        <p>
          A training and analysis tool. No real money is wagered. Results are mathematical estimates; casinos may restrict or bar card counters. Strategy engine adapted from{' '}
          <ExtLink className="underline hover:text-fg" href="https://github.com/noahskahn/cutcard">cutcard</ExtLink> (MIT). Card faces by{' '}
          <ExtLink className="underline hover:text-fg" href="https://www.me.uk/cards/">Adrian Kennard</ExtLink> (CC0).
        </p>
      </footer>

      {/* iPhone-style tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/92 backdrop-blur-xl sm:hidden" aria-label="Sections"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <div className="grid h-[58px] grid-cols-5">
          {ROUTES.map((r) => {
            const on = route === r.id;
            const Icon = r.icon;
            return (
              <button key={r.id} onClick={() => go(r.id)} aria-current={on ? 'page' : undefined}
                className={cx('flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors', on ? 'text-brass' : 'text-muted')}>
                <Icon size={22} strokeWidth={on ? 2.4 : 1.8} aria-hidden />
                {r.short}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
