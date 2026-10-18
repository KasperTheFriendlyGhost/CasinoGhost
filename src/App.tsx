import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useSettings } from './lib/settings';
import { rulesSummary } from './engine/strategy';
import { cx } from './lib/format';
import { Play } from './views/Play';
import { Lab } from './views/Lab';
import { Strategy } from './views/Strategy';
import { Rules } from './views/Rules';

type Route = 'play' | 'lab' | 'strategy' | 'rules';
const ROUTES: { id: Route; label: string }[] = [
  { id: 'play', label: 'Table' },
  { id: 'lab', label: 'Side Bet Lab' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'rules', label: 'Rules' },
];

const fromHash = (): Route => {
  const h = location.hash.replace('#', '');
  return (ROUTES.some((r) => r.id === h) ? h : 'play') as Route;
};

export function App() {
  const { settings, update, updateRules } = useSettings();
  const [route, setRoute] = useState<Route>(fromHash);
  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => { setRoute(r); try { history.replaceState(null, '', `#${r}`); } catch { /* sandboxed */ } };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky z-30 border-b border-line bg-panel/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 py-2.5">
          <button onClick={() => go('play')} className="flex items-baseline gap-2" aria-label="CasinoGhost home">
            <span className="font-display text-[26px] font-extrabold uppercase leading-none tracking-[0.06em]"><span className="text-fg">Casino</span><span className="text-brass">Ghost</span></span>
            <span className="hidden text-xs font-medium text-muted sm:inline">blackjack trainer &amp; lab</span>
          </button>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto" aria-label="Sections">
            {ROUTES.map((r) => (
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
        </div>
      </header>

      <main className="gutter mx-auto w-full max-w-[1400px] flex-1 py-4 sm:py-6">
        {route === 'play' && <Play settings={settings} />}
        {route === 'lab' && <Lab settings={settings} setPays={(id, pays) => update({ pays: { ...settings.pays, [id]: pays } })} />}
        {route === 'strategy' && <Strategy settings={settings} />}
        {route === 'rules' && <Rules settings={settings} updateRules={updateRules} setDeviations={(deviations) => update({ deviations })} />}
      </main>

      <footer className="gutter mx-auto w-full max-w-[1400px] pb-6 text-xs text-muted">
        <p>
          A training and analysis tool. Results are mathematical estimates; casinos may restrict or bar card counters. Strategy engine adapted from{' '}
          <a className="underline hover:text-fg" href="https://github.com/noahskahn/cutcard" target="_blank" rel="noreferrer">cutcard</a> (MIT).
        </p>
      </footer>
    </div>
  );
}
