import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { WIDGETS, type DashboardConfig, type DealSpeed, type Position, type ResetRule, type Side } from '../lib/dashboard';
import { cx } from '../lib/format';

interface Props {
  cfg: DashboardConfig;
  update: (p: Partial<DashboardConfig>) => void;
  restoreDefaults: () => void;
  onResetSession: () => void;
  onClose: () => void;
}

function Choice<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; name: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold', value === o.value ? 'border-brass bg-brass text-brass-ink' : 'border-line-strong text-fg-2 hover:border-brass hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CustomizeDashboard({ cfg, update, restoreDefaults, onResetSession, onClose }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ws = cfg.widgets;
  const setW = (i: number, patch: Partial<(typeof ws)[number]>) => update({ widgets: ws.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ws.length) return;
    const next = [...ws];
    [next[i], next[j]] = [next[j], next[i]];
    update({ widgets: next });
  };
  const both = cfg.position === 'both';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-6" onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="dash-title"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 id="dash-title" className="font-display text-2xl font-extrabold uppercase tracking-wide">Customize dashboard</h2>
            <p className="text-sm text-fg-2">Choose the widgets beside the table, where they sit, and how the table behaves.</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-panel-2" aria-label="Close"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_340px]">
          {/* Widgets */}
          <section className="min-w-0 border-line p-5 md:border-r">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="label">Widgets</h3>
              <span className="text-xs text-muted">{both ? 'Pick a side for each widget' : 'Order is top to bottom'}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {ws.map((w, i) => (
                <li key={w.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2', w.on ? 'border-line-strong bg-panel-2' : 'border-line')}>
                  <input id={`w-${w.id}`} type="checkbox" checked={w.on} onChange={(e) => setW(i, { on: e.target.checked })} className="size-4 accent-[var(--brass)]" />
                  <label htmlFor={`w-${w.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className={cx('block font-semibold', !w.on && 'text-fg-2')}>{WIDGETS[w.id].name}</span>
                    <span className="block truncate text-xs text-muted">{WIDGETS[w.id].blurb}</span>
                  </label>
                  {both && w.on && (
                    <div className="flex rounded-full border border-line-strong p-0.5 text-xs font-semibold" role="radiogroup" aria-label={`${WIDGETS[w.id].name} side`}>
                      {(['left', 'right'] as Side[]).map((sd) => (
                        <button key={sd} role="radio" aria-checked={w.side === sd} onClick={() => setW(i, { side: sd })}
                          className={cx('rounded-full px-2 py-0.5', w.side === sd ? 'bg-brass text-brass-ink' : 'text-fg-2')}>{sd === 'left' ? 'Left' : 'Right'}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-full text-fg-2 hover:bg-panel disabled:opacity-25" aria-label={`Move ${WIDGETS[w.id].name} up`}><ArrowUp size={14} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === ws.length - 1} className="grid size-7 place-items-center rounded-full text-fg-2 hover:bg-panel disabled:opacity-25" aria-label={`Move ${WIDGETS[w.id].name} down`}><ArrowDown size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Settings */}
          <section className="flex flex-col gap-6 p-5">
            <div>
              <h3 className="label mb-2">Dashboard position</h3>
              <Choice<Position> name="Dashboard position" value={cfg.position} onChange={(position) => update({ position })}
                options={[{ value: 'none', label: 'None' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both sides' }]} />
            </div>
            <div>
              <h3 className="label mb-2">Deal speed</h3>
              <Choice<DealSpeed> name="Deal speed" value={cfg.speed} onChange={(speed) => update({ speed })}
                options={[{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }, { value: 'instant', label: 'Instant' }]} />
            </div>
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">Show the count on the table</span>
                <span className="block text-xs text-muted">Running and true count pinned to the felt</span>
              </span>
              <input id="pin-count" type="checkbox" checked={cfg.pinCount} onChange={(e) => update({ pinCount: e.target.checked })} className="size-5 accent-[var(--brass)]" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">Rounds in charts</span>
                <span className="block text-xs text-muted">How far back the charts and heat look</span>
              </span>
              <input id="data-points" type="number" min={10} max={500} step={10} value={cfg.dataPoints}
                onChange={(e) => update({ dataPoints: Math.max(10, Math.min(500, Number(e.target.value) || 40)) })}
                className="w-20 rounded-md border border-line-strong bg-panel-2 px-2 py-1 text-right font-data text-fg" />
            </label>

            <div className="border-t border-line pt-5">
              <h3 className="label mb-2">Session stats reset</h3>
              <Choice<ResetRule> name="Session stats reset" value={cfg.reset} onChange={(reset) => update({ reset })}
                options={[{ value: 'open', label: 'Every time I open the app' }, { value: 'manual', label: 'Only when I reset' }]} />
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">Starting bankroll</span>
                <input id="start-bankroll" type="number" min={100} step={100} value={cfg.startBankroll}
                  onChange={(e) => update({ startBankroll: Math.max(1, Number(e.target.value) || 1000) })}
                  className="w-28 rounded-md border border-line-strong bg-panel-2 px-2 py-1 text-right font-data text-fg" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {confirmReset ? (
                  <>
                    <button onClick={() => { onResetSession(); setConfirmReset(false); }} className="rounded-full bg-bad px-3.5 py-1.5 text-sm font-semibold text-white">Clear stats and bankroll</button>
                    <button onClick={() => setConfirmReset(false)} className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm">Keep them</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmReset(true)} className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-semibold hover:border-bad hover:text-bad">Reset session stats…</button>
                )}
                <button onClick={restoreDefaults} className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-fg-2 hover:border-brass">Default layout</button>
              </div>
            </div>
          </section>
        </div>
        <footer className="flex justify-end border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-full bg-brass px-5 py-2 font-semibold text-brass-ink">Done</button>
        </footer>
      </motion.div>
    </div>
  );
}
