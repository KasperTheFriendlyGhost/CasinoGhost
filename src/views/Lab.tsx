import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { freshComposition } from '../engine/cards';
import { SIDE_BETS, deriveCount, effectsOfRemoval, evaluate, sideBetSD, type Paytable, type SideBetId } from '../engine/sidebets';
import type { SimConfig, SimResult } from '../engine/sidecountSim';
import SimWorker from '../engine/sim.worker?worker&inline';
import type { AppSettings } from '../lib/settings';
import { usePref } from '../lib/settings';
import { cx, edgePct, oneIn } from '../lib/format';
import { EorChart, EvByCountChart } from '../components/charts';

type TagMode = 'derived' | 'hilo' | 'custom';
const HI_LO = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
const NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SHOES = 20000;

interface Props {
  settings: AppSettings;
  setPays: (id: SideBetId, pays: Paytable) => void;
}

export function Lab({ settings, setPays }: Props) {
  const [bet, setBet] = usePref<SideBetId>('lab.bet', 'll');
  const [decks, setDecks] = useState(settings.rules.decks);
  const [pen, setPen] = useState(settings.rules.penetration);
  const [seats, setSeats] = usePref('lab.seats', 3);
  const [mode, setMode] = usePref<TagMode>('lab.mode', 'derived');
  const [level, setLevel] = usePref('lab.level', 2);
  const [custom, setCustom] = usePref<number[]>('lab.custom', [...HI_LO]);
  const pays = settings.pays[bet];
  const def = SIDE_BETS[bet];

  const comp = useMemo(() => freshComposition(decks), [decks]);
  const ev = useMemo(() => evaluate(bet, comp, pays), [bet, comp, pays]);
  const eor = useMemo(() => effectsOfRemoval(bet, comp, pays), [bet, comp, pays]);
  const derived = useMemo(() => deriveCount(eor, level), [eor, level]);
  const tags = mode === 'derived' ? Array.from(derived.tags) : mode === 'hilo' ? HI_LO : custom;
  const deckSum = tags.reduce((a, t, v) => a + (v === 10 ? 4 : v ? 1 : 0) * t, 0);

  // Run the simulator in a worker whenever inputs settle.
  const [sim, setSim] = useState<{ result: SimResult | null; running: boolean; progress: number }>({ result: null, running: false, progress: 0 });
  const workerRef = useRef<Worker | null>(null);
  const cfgKey = JSON.stringify([bet, pays, decks, pen, seats, tags]);
  useEffect(() => {
    const t = setTimeout(() => {
      workerRef.current?.terminate();
      const w = new SimWorker();
      workerRef.current = w;
      setSim((s) => ({ ...s, running: true, progress: 0 }));
      w.onmessage = (e) => {
        if (e.data.type === 'progress') setSim((s) => ({ ...s, progress: e.data.done / e.data.total }));
        else { setSim({ result: e.data.result, running: false, progress: 1 }); w.terminate(); }
      };
      const cfg: SimConfig = { bet, pays, decks, penetration: pen, seats, tags, shoes: SHOES, seed: 20261018 };
      w.postMessage(cfg);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const r = sim.result;
  const presetName = def.presets.find((p) => def.outcomes.every((o) => p.pays[o.key] === pays[o.key]))?.name ?? 'Custom';

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Controls */}
      <aside className="panel flex h-fit flex-col gap-5 p-4" style={{ boxShadow: 'var(--shadow)' }}>
        <div>
          <h2 className="label mb-2">Side bet</h2>
          <Segmented value={bet} onChange={setBet} options={(['pp', 't213', 'll'] as SideBetId[]).map((id) => ({ value: id, label: SIDE_BETS[id].name }))} />
          <p className="mt-2 text-sm text-fg-2">{def.blurb}</p>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Paytable (to 1)</h2>
            <span className="text-xs text-muted">{presetName}</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {def.presets.map((p) => (
              <button key={p.name} onClick={() => setPays(bet, { ...p.pays })} className={cx('rounded-full border px-2.5 py-1 text-xs', presetName === p.name ? 'border-brass bg-brass-soft text-fg' : 'border-line-strong text-fg-2 hover:border-brass')}>{p.name}</button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {def.outcomes.map((o) => (
              <label key={o.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-fg-2">{o.label}</span>
                <input id={`pay-${bet}-${o.key}`} type="number" min={0} value={pays[o.key] ?? 0}
                  onChange={(e) => setPays(bet, { ...pays, [o.key]: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-20 rounded-md border border-line-strong bg-panel-2 px-2 py-1 text-right font-data text-fg" />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Paytables vary by casino. Enter the one printed on your table.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="label">Decks</span>
            <select id="lab-decks" value={decks} onChange={(e) => setDecks(Number(e.target.value))} className="rounded-md border border-line-strong bg-panel-2 px-2 py-1.5 text-fg">
              {[1, 2, 4, 5, 6, 8].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="label">Players</span>
            <select id="lab-seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="rounded-md border border-line-strong bg-panel-2 px-2 py-1.5 text-fg">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            <span className="flex justify-between"><span className="label">Penetration</span><span className="tnum text-fg-2">{Math.round(pen * 100)}% dealt</span></span>
            <input id="lab-pen" type="range" min={0.5} max={0.92} step={0.01} value={pen} onChange={(e) => setPen(Number(e.target.value))} />
          </label>
        </div>

        <div>
          <h2 className="label mb-2">Count to test</h2>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'derived', label: 'Best fit' }, { value: 'hilo', label: 'Hi-Lo' }, { value: 'custom', label: 'Custom' }]} />
          {mode === 'derived' && (
            <div className="mt-2 flex items-center gap-2 text-sm text-fg-2">
              <span>Level</span>
              {[1, 2, 3].map((l) => (
                <button key={l} onClick={() => setLevel(l)} className={cx('size-8 rounded-full border font-data', level === l ? 'border-brass bg-brass-soft text-fg' : 'border-line-strong')}>{l}</button>
              ))}
              <span className="text-xs text-muted">Higher is more accurate, harder to keep.</span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-10 gap-1 text-center">
            {NAMES.map((n, i) => (
              <div key={n} className="flex min-w-0 flex-col items-center gap-1">
                <span className="font-display text-sm font-bold">{n}</span>
                {mode === 'custom' ? (
                  <input id={`tag-${i + 1}`} aria-label={`Tag for ${n}`} type="number" value={custom[i + 1]} onChange={(e) => { const c = [...custom]; c[i + 1] = Math.round(Number(e.target.value) || 0); setCustom(c); }}
                    className="w-full rounded border border-line-strong bg-panel-2 py-1 text-center font-data text-xs text-fg" />
                ) : (
                  <span className="w-full rounded bg-panel-2 py-1 font-data text-xs">{tags[i + 1] > 0 ? `+${tags[i + 1]}` : tags[i + 1]}</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {deckSum === 0 ? 'Balanced: divide by decks left for the true count.' : `Unbalanced by ${deckSum > 0 ? '+' : ''}${deckSum} per deck, so true counts drift.`}
          </p>
        </div>
      </aside>

      {/* Results */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel p-5" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="label">House edge, full shoe</div>
              <div className="tnum font-display text-[56px] font-extrabold leading-none">{edgePct(ev.ev)}</div>
              <div className="text-sm text-fg-2">{def.name} · {decks} {decks === 1 ? 'deck' : 'decks'} · {presetName}</div>
            </div>
            <Mini label="Hit rate" value={oneIn(1 - ev.pLose)} />
            <Mini label="Std. deviation" value={`${sideBetSD(ev).toFixed(2)} units`} />
            <Mini label="Countable" value={mode === 'derived' && !derived.countable ? 'No' : r?.threshold != null ? 'Yes' : r ? 'Not with this count' : '…'} />
          </div>
          <Verdict name={def.name} result={r} countable={!(mode === 'derived' && !derived.countable)} running={sim.running} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="panel min-w-0 p-4" style={{ boxShadow: 'var(--shadow)' }}>
            <h3 className="label mb-3">Outcomes</h3>
            <div className="overflow-x-auto">
              <table className="tnum w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Hand</th><th className="pb-2 text-right font-medium">Pays</th><th className="pb-2 text-right font-medium">Chance</th><th className="pb-2 text-right font-medium">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.outcomes.map((o) => (
                    <tr key={o.key} className="border-t border-line">
                      <td className="py-1.5 pr-2">{o.label}</td>
                      <td className="py-1.5 text-right font-data">{o.pays}:1</td>
                      <td className="py-1.5 text-right text-fg-2">{oneIn(o.prob)}</td>
                      <td className="py-1.5 text-right font-data">{(o.prob * o.pays * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line text-fg-2">
                    <td className="py-1.5">Lose</td><td className="py-1.5 text-right font-data">−1</td><td className="py-1.5 text-right">{(ev.pLose * 100).toFixed(1)}%</td><td className="py-1.5 text-right font-data">−{(ev.pLose * 100).toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel min-w-0 p-4" style={{ boxShadow: 'var(--shadow)' }}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="label">Effect of removing one card</h3>
              <div className="flex gap-3 text-xs text-fg-2">
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--series-pos)' }} />Helps the bet</span>
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--series-neg)' }} />Hurts the bet</span>
              </div>
            </div>
            <p className="mb-2 text-xs text-muted">How the edge moves when one card of each value leaves the shoe. The numbers under each card are the count tags in use.</p>
            <EorChart eor={eor} tags={tags} />
          </div>
        </div>

        <div className="panel min-w-0 p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="label">Edge by true count · {SHOES.toLocaleString()} simulated shoes</h3>
            {sim.running && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 size={13} className="animate-spin" aria-hidden /> Dealing… {Math.round(sim.progress * 100)}%</span>}
          </div>
          {r ? <EvByCountChart bins={r.bins} threshold={r.threshold} /> : <div className="grid h-[300px] place-items-center text-sm text-muted">Dealing the first shoes…</div>}
          {r && (
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Mini label="Bet from" value={r.threshold != null ? `TC ${r.threshold > 0 ? '+' : ''}${r.threshold}` : 'Never'} />
              <Mini label="Rounds you bet" value={`${(r.playFreq * 100).toFixed(1)}%`} />
              <Mini label="Edge when betting" value={r.threshold != null ? `+${(r.evWhenPlaying * 100).toFixed(1)}%` : '—'} />
              <Mini label="Units / 100 rounds" value={`${r.gainPer100.toFixed(2)} of ${r.perfectGainPer100.toFixed(2)} max`} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Verdict({ name, result: r, countable, running }: { name: string; result: SimResult | null; countable: boolean; running: boolean }) {
  if (!r) return null;
  const share = r.perfectGainPer100 > 0 ? Math.round((r.gainPer100 / r.perfectGainPer100) * 100) : 0;
  let text: string;
  if (!countable) {
    text = `No card count tracks ${name}: every rank affects it the same way. Only tracking every remaining card finds good rounds, ${(r.perfectPlayFreq * 100).toFixed(1)}% of the time, worth ${r.perfectGainPer100.toFixed(2)} units per 100 rounds.`;
  } else if (r.threshold === null) {
    text = `With this count, ${name} never turns positive at any true count dealt. Perfect card tracking would find ${(r.perfectPlayFreq * 100).toFixed(1)}% good rounds, worth ${r.perfectGainPer100.toFixed(2)} units per 100.`;
  } else {
    text = `Bet ${name} at a true count of ${r.threshold > 0 ? '+' : ''}${r.threshold} or higher. That comes up in ${(r.playFreq * 100).toFixed(1)}% of rounds at an average ${(r.evWhenPlaying * 100).toFixed(1)}% edge for you, worth ${r.gainPer100.toFixed(2)} units per 100 rounds: ${share}% of what perfect card tracking earns.`;
  }
  return <p className={cx('mt-4 max-w-[70ch] border-t border-line pt-4 text-[15px] text-fg', running && 'opacity-60')}>{text}</p>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="tnum mt-0.5 font-display text-2xl font-bold leading-tight">{value}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-full border border-line-strong bg-panel-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors', value === o.value ? 'bg-brass text-brass-ink' : 'text-fg-2 hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
