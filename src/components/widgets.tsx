import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Eye, EyeOff, Pause, Play as PlayIcon, X, Flame, Snowflake, ThermometerSun } from 'lucide-react';
import type { Game } from '../engine/game';
import { SIDE_IDS } from '../engine/game';
import { SIDE_BETS, type SideBetId } from '../engine/sidebets';
import { heat, luck, pace } from '../engine/session';
import { WIDGETS, type DashboardConfig, type WidgetId } from '../lib/dashboard';
import { usePref } from '../lib/settings';
import { useTween } from '../lib/useTween';
import { cx, edgePct, money, signed } from '../lib/format';
import { BellCurve, Dial, MiniLine, MiniScatter } from './MiniCharts';

export interface WidgetProps {
  game: Game;
  cfg: DashboardConfig;
  hideCount: boolean;
  setHideCount: (v: boolean) => void;
  evs: Record<SideBetId, number>;
  onPickSide: (id: SideBetId) => void;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
const compactMoney = (v: number) => {
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  return a >= 10000 ? `${sign}$${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}K` : `${sign}$${Math.round(a).toLocaleString()}`;
};

export function WidgetCard({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('panel p-4', className)} style={{ boxShadow: 'var(--shadow)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, big, accent, tone }: { label: string; value: string; big?: boolean; accent?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={cx('tnum font-display font-bold leading-none', big ? 'mt-1 text-[34px]' : 'mt-0.5 text-xl', accent ? 'text-brass' : tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-fg')}>{value}</div>
    </div>
  );
}

// ----- Counts -----------------------------------------------------------------------------

function CountsWidget({ game, cfg, hideCount, setHideCount }: WidgetProps) {
  const [guess, setGuess] = useState('');
  const [verdict, setVerdict] = useState<null | { ok: boolean; rc: number }>(null);
  useEffect(() => setVerdict(null), [game.stats.rounds]);
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(guess.replace('−', '-'));
    if (!Number.isFinite(n) || guess.trim() === '') return;
    setVerdict({ ok: n === game.rc, rc: game.rc });
    setGuess('');
  };
  return (
    <WidgetCard title="Hi-Lo count" action={
      <button onClick={() => setHideCount(!hideCount)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-fg-2 hover:bg-panel-2">
        {hideCount ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} {hideCount ? 'Show' : 'Practice: hide'}
      </button>
    }>
      {hideCount ? (
        <form onSubmit={check} className="flex flex-col gap-2">
          <label htmlFor="rc-guess" className="text-sm text-fg-2">Keep the count yourself. What is the running count now?</label>
          <div className="flex gap-2">
            <input id="rc-guess" inputMode="numeric" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="e.g. −3" className="w-full min-w-0 rounded-lg border border-line-strong bg-panel-2 px-3 py-2 font-data text-fg" />
            <button className="rounded-lg btn-brass px-3 font-semibold">Check</button>
          </div>
          {verdict && <p className={cx('text-sm font-semibold', verdict.ok ? 'text-good' : 'text-bad')}>{verdict.ok ? 'Correct.' : `Not quite: the running count is ${signed(verdict.rc)}.`}</p>}
        </form>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Running" value={signed(game.rc)} big />
          <Stat label="True" value={signed(game.tc)} big accent={game.tc >= 2} />
          <Stat label="Decks left" value={cfg.deckNumbers ? game.decksEst.toFixed(1) : '?'} big />
        </div>
      )}
    </WidgetCard>
  );
}

// ----- Gauges -------------------------------------------------------------------------------

function GaugesWidget({ game }: WidgetProps) {
  const tc = game.tcExact;
  const edge = game.baseEdge + 0.005 * game.tc; // Hi-Lo rule of thumb: about +0.5% per true count
  const dealt = (game.shoe.dealt / game.shoe.size) * 100;
  const cut = (game.shoe.cut / game.shoe.size) * 100;
  const s = game.stats;
  const acc = s.decisions ? (s.correct / s.decisions) * 100 : 100;
  const pctTick = (v: number) => `${v > 0 ? '+' : ''}${v}%`;
  return (
    <WidgetCard title="Gauges">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <Dial value={tc} min={-6} max={6} display={signed(game.tc)} label="True count" ticks={[-6, 0, 6]} tickFormat={(v) => signed(v)}
          zones={[{ from: -6, to: -1, color: 'var(--series-neg)' }, { from: 1, to: 6, color: 'var(--good)' }]} />
        <Dial value={edge * 100} min={-2} max={3} display={`${edge >= 0 ? '+' : '−'}${Math.abs(edge * 100).toFixed(2)}%`} label="Your edge" sub="Estimated from the count"
          ticks={[-2, 0, 3]} tickFormat={pctTick} zones={[{ from: -2, to: 0, color: 'var(--series-neg)' }, { from: 0, to: 3, color: 'var(--good)' }]} />
        <Dial value={dealt} min={0} max={100} display={`${Math.round(dealt)}%`} label="Shoe dealt" sub={`Cut card at ${Math.round(cut)}%`}
          ticks={[0, 50, 100]} tickFormat={(v) => `${v}%`} marker={{ at: cut, label: 'Cut card' }}
          zones={[{ from: 0, to: cut, color: 'var(--series-pos)' }, { from: cut, to: 100, color: 'var(--warn)' }]} />
        <Dial value={acc} min={50} max={100} display={s.decisions ? `${Math.round(acc)}%` : '—'} label="Accuracy" sub={`${s.decisions} decisions`}
          ticks={[50, 75, 100]} tickFormat={(v) => `${v}%`}
          zones={[{ from: 50, to: 85, color: 'var(--series-neg)' }, { from: 85, to: 95, color: 'var(--warn)' }, { from: 95, to: 100, color: 'var(--good)' }]} />
      </div>
    </WidgetCard>
  );
}

// ----- Deck estimation ----------------------------------------------------------------------

export const DECK_GUESS_ID = 'deck-guess';

function DeckDrillWidget({ game }: WidgetProps) {
  const [guess, setGuess] = useState('');
  const [tally, setTally] = usePref('deckDrill', { n: 0, ok: 0, err: 0 });
  const [last, setLast] = useState<null | { guess: number; actual: number }>(null);
  useEffect(() => setLast(null), [game.stats.rounds]);
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const g = Number(guess.replace(',', '.'));
    if (!Number.isFinite(g) || guess.trim() === '') return;
    const actual = game.shoe.cardsLeft / 52;
    const ok = Math.abs(g - actual) <= 0.25; // right to the nearest half deck
    setTally({ n: tally.n + 1, ok: tally.ok + (ok ? 1 : 0), err: tally.err + Math.abs(g - actual) });
    setLast({ guess: g, actual });
    setGuess('');
  };
  const ok = last && Math.abs(last.guess - last.actual) <= 0.25;
  return (
    <WidgetCard title="Deck estimation" action={tally.n > 0 ? <button onClick={() => setTally({ n: 0, ok: 0, err: 0 })} className="text-xs text-muted hover:text-fg">Reset</button> : undefined}>
      <form onSubmit={check} className="flex flex-col gap-2">
        <label htmlFor={DECK_GUESS_ID} className="text-sm text-fg-2">Look at the discard tray. How many decks are left in the shoe? <span className="text-muted">(press E)</span></label>
        <div className="flex gap-2">
          <input id={DECK_GUESS_ID} inputMode="decimal" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="e.g. 3.5"
            className="w-full min-w-0 rounded-lg border border-line-strong bg-panel-2 px-3 py-2 font-data text-fg" />
          <button className="rounded-lg btn-brass px-3 font-semibold">Check</button>
        </div>
      </form>
      {last && (
        <p className={cx('mt-2 text-sm font-semibold', ok ? 'text-good' : 'text-bad')}>
          {ok ? 'Right to the half deck.' : `Off by ${Math.abs(last.guess - last.actual).toFixed(1)} decks.`} <span className="font-normal text-fg-2">Actual {last.actual.toFixed(2)} decks ({game.shoe.cardsLeft} cards).</span>
        </p>
      )}
      {tally.n > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Within ½ deck" value={`${Math.round((tally.ok / tally.n) * 100)}% (${tally.n})`} />
          <Stat label="Average miss" value={`${(tally.err / tally.n).toFixed(2)} decks`} />
        </div>
      )}
    </WidgetCard>
  );
}

// ----- Cost of errors ---------------------------------------------------------------------

function ErrorsWidget({ game }: WidgetProps) {
  const s = game.stats;
  const shown = useTween(s.evLost);
  const perHundred = s.rounds ? (s.evLost / s.rounds) * 100 : 0;
  return (
    <WidgetCard title="Cost of errors">
      <div className="rounded-xl bg-[#0b0d0c] px-4 py-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d8a80]">Your mistakes have cost</div>
        <div className={cx('tnum font-data text-[38px] font-bold leading-tight', s.evLost > 0 ? 'text-[#ff6b5e]' : 'text-[#5ee07f]')} style={{ textShadow: '0 0 12px currentColor' }}>
          ${shown.toFixed(2).padStart(7, '0')}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Per 100 rounds" value={money(-perHundred)} tone={perHundred > 0 ? 'bad' : undefined} />
        <Stat label="Mistakes" value={`${s.decisions - s.correct} of ${s.decisions}`} />
      </div>
    </WidgetCard>
  );
}

// ----- Side bets --------------------------------------------------------------------------

function SideBetsWidget({ game, evs, onPickSide }: WidgetProps) {
  return (
    <WidgetCard title="Side bets · exact edge now">
      <p className="-mt-1 mb-3 text-xs text-muted">From every card left in the shoe. Positive means the bet favours you this round.</p>
      <ul className="flex flex-col gap-3">
        {SIDE_IDS.map((id) => {
          const ev = evs[id];
          const positive = ev > 0;
          const lo = -0.3, hi = 0.1, zero = (0 - lo) / (hi - lo);
          const pos = Math.min(1, Math.max(0, (ev - lo) / (hi - lo)));
          const res = game.sideResults[id];
          return (
            <li key={id}>
              <button onClick={() => onPickSide(id)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{SIDE_BETS[id].name}</span>
                  <span className={cx('tnum font-data text-sm font-bold', positive ? 'text-good' : 'text-fg-2')}>{positive ? `+${edgePct(ev)} player` : `${edgePct(ev)} house`}</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-panel-2" aria-hidden>
                  <div className="absolute top-[-3px] h-[14px] w-[2px] bg-fg-2" style={{ left: `${zero * 100}%` }} />
                  <motion.div className="absolute top-0 h-2 rounded-full" animate={{ left: `${Math.min(pos, zero) * 100}%`, width: `${Math.abs(pos - zero) * 100}%` }}
                    style={{ background: positive ? 'var(--good)' : 'var(--series-neg)' }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
                  <span>{game.sideStakes[id] ? `Betting ${money(game.sideStakes[id])}` : 'Not betting'}</span>
                  {res && <span className={cx('truncate', res.key && 'font-semibold text-brass')}>{res.key ? `${res.label} · ${money(res.net * res.stake)}` : 'Last: no win'}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

// ----- Accuracy ---------------------------------------------------------------------------

function AccuracyWidget({ game }: WidgetProps) {
  const c = game.stats.byCategory;
  const rows: { label: string; t: { n: number; ok: number } }[] = [
    { label: 'Hard totals', t: c.hard }, { label: 'Soft totals', t: c.soft }, { label: 'Pairs', t: c.pair },
    { label: 'Insurance', t: c.insurance }, { label: 'Index plays', t: c.index },
    { label: 'Overall', t: { n: game.stats.decisions, ok: game.stats.correct } },
  ];
  return (
    <WidgetCard title="Accuracy rates">
      <ul className="flex flex-col gap-2">
        {rows.map(({ label, t }, i) => {
          const p = t.n ? t.ok / t.n : null;
          return (
            <li key={label} className={cx('grid grid-cols-[92px_1fr_auto] items-center gap-3 text-sm', i === rows.length - 1 && 'border-t border-line pt-2 font-semibold')}>
              <span className="truncate">{label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-2" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${(p ?? 0) * 100}%`, background: p === null ? 'transparent' : p >= 0.95 ? 'var(--good)' : p >= 0.85 ? 'var(--warn)' : 'var(--series-neg)' }} />
              </div>
              <span className="tnum w-[76px] text-right font-data text-xs">{p === null ? '—' : `${Math.round(p * 100)}%`} <span className="text-muted">({t.n})</span></span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

// ----- Statistics grid --------------------------------------------------------------------

function StatsWidget({ game }: WidgetProps) {
  const s = game.stats;
  const winRate = s.rounds ? ((s.net + s.sideNet) / s.rounds) * 100 : 0;
  const avgBet = game.rounds.length ? game.rounds.reduce((a, r) => a + r.bet, 0) / game.rounds.length : game.mainBet;
  const cells: [string, string, ('good' | 'bad')?][] = [
    ['Rounds', String(s.rounds)], ['Hands', String(s.hands)],
    ['Won', String(s.wins)], ['Lost', String(s.losses)],
    ['Pushed', String(s.pushes)], ['Blackjacks', String(s.blackjacks)],
    ['Doubles', String(s.doubles)], ['Splits', String(s.splits)],
    ['Wagered', compactMoney(s.wagered)], ['Average bet', compactMoney(avgBet)],
    ['Main game', compactMoney(s.net), s.net > 0 ? 'good' : s.net < 0 ? 'bad' : undefined],
    ['Side bets', compactMoney(s.sideNet), s.sideNet > 0 ? 'good' : s.sideNet < 0 ? 'bad' : undefined],
    ['Per 100 rounds', compactMoney(winRate), winRate > 0 ? 'good' : winRate < 0 ? 'bad' : undefined],
    ['Bankroll', compactMoney(game.bankroll)],
  ];
  return (
    <WidgetCard title="Statistics">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {cells.map(([l, v, tone]) => <Stat key={l} label={l} value={v} tone={tone} />)}
      </div>
    </WidgetCard>
  );
}

// ----- Stopwatch & speedometer --------------------------------------------------------------

function StopwatchWidget({ game }: WidgetProps) {
  const now = useNow();
  const ms = game.elapsed(now);
  const p = pace(game.rounds, ms);
  return (
    <WidgetCard title="Stopwatch" action={
      <button onClick={() => (game.paused ? game.resume() : game.pause())} className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold hover:border-brass">
        {game.paused ? <><PlayIcon size={12} aria-hidden /> Resume</> : <><Pause size={12} aria-hidden /> Pause</>}
      </button>
    }>
      <div className={cx('tnum font-data text-[40px] font-bold leading-none', game.paused && 'text-muted')}>{fmtTime(ms)}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Rounds" value={String(game.stats.rounds)} />
        <Stat label="Per hour" value={p.overall ? String(Math.round(p.overall)) : '—'} />
      </div>
      {game.paused && <p className="mt-2 text-xs text-muted">Paused. Dealing resumes the clock.</p>}
    </WidgetCard>
  );
}

function SpeedWidget({ game }: WidgetProps) {
  const now = useNow();
  const p = pace(game.rounds, game.elapsed(now));
  const v = game.rounds.length >= 3 ? p.recent : 0;
  return (
    <WidgetCard title="Speedometer">
      <div className="mx-auto max-w-[240px]">
        <Dial value={v} min={0} max={300} display={v ? String(Math.round(v)) : '—'} label="Rounds per hour" sub="A busy casino table deals about 60–100"
          ticks={[0, 100, 200, 300]} zones={[{ from: 60, to: 120, color: 'var(--good)' }, { from: 120, to: 300, color: 'var(--series-pos)' }]} />
      </div>
    </WidgetCard>
  );
}

// ----- Heat ---------------------------------------------------------------------------------

function HeatWidget({ game, cfg }: WidgetProps) {
  const h = heat(game.rounds, Math.max(20, cfg.dataPoints));
  const Icon = h.level === 'Hot' ? Flame : h.level === 'Warm' ? ThermometerSun : Snowflake;
  const color = h.level === 'Hot' ? 'var(--bad)' : h.level === 'Warm' ? 'var(--warn)' : 'var(--good)';
  return (
    <WidgetCard title="Heat" action={<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color, background: 'var(--panel-2)' }}><Icon size={13} aria-hidden /> {h.rounds >= 10 ? h.level : 'Not enough rounds'}</span>}>
      <div className="mx-auto max-w-[220px]">
        <Dial value={h.score} min={0} max={100} display={String(h.score)} label="Heat score" ticks={[0, 30, 60, 100]}
          zones={[{ from: 0, to: 30, color: 'var(--good)' }, { from: 30, to: 60, color: 'var(--warn)' }, { from: 60, to: 100, color: 'var(--bad)' }]} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Bet ↔ count" value={h.rounds >= 3 ? h.correlation.toFixed(2) : '—'} />
        <Stat label="Spread" value={`1–${h.spread % 1 ? h.spread.toFixed(1) : h.spread}`} />
      </div>
      <p className="mt-2 text-xs text-muted">How closely your bets follow the count over the last {h.rounds} rounds. A pit boss watches the same thing.</p>
    </WidgetCard>
  );
}

// ----- Probability curve ------------------------------------------------------------------

function CurveWidget({ game }: WidgetProps) {
  const l = luck(game.rounds);
  const pctl = Math.round(l.percentile * 100);
  return (
    <WidgetCard title="Probability curve">
      {game.rounds.length < 5 ? (
        <p className="text-sm text-muted">Play a few rounds to see how your result compares with luck.</p>
      ) : (
        <>
          <BellCurve expected={l.expected} sd={l.sd} actual={l.actual} format={compactMoney} />
          <p className="mt-2 text-sm">
            {pctl >= 50 ? `Luckier than ${pctl}%` : `Unluckier than ${100 - pctl}%`} of sessions played exactly like yours.
          </p>
          <p className="mt-1 text-xs text-muted">Expected {compactMoney(l.expected)} from your bets, the counts and your mistakes; one standard deviation is {compactMoney(l.sd)}.</p>
        </>
      )}
    </WidgetCard>
  );
}

// ----- Charts -------------------------------------------------------------------------------

function ChartWidget({ game, cfg, kind }: WidgetProps & { kind: 'bankroll' | 'count' | 'errors' }) {
  const rs = game.rounds.slice(-cfg.dataPoints);
  const title = kind === 'bankroll' ? 'Bankroll' : kind === 'count' ? 'True count at the deal' : 'Cost of errors';
  const points = rs.map((r) => ({ x: r.n, y: kind === 'bankroll' ? r.bankroll : kind === 'count' ? r.tc : r.errorCost }));
  return (
    <WidgetCard title={`${title} · last ${rs.length} rounds`}>
      <MiniLine points={points} zero={kind !== 'bankroll'} xLabel={(x) => `#${x}`} format={kind === 'count' ? (v) => signed(v) : compactMoney} />
    </WidgetCard>
  );
}

function BetsChartWidget({ game, cfg }: WidgetProps) {
  const rs = game.rounds.slice(-cfg.dataPoints);
  return (
    <WidgetCard title={`Bet vs. true count · last ${rs.length} rounds`}>
      <MiniScatter points={rs.map((r) => ({ tc: r.tc, bet: r.bet }))} />
    </WidgetCard>
  );
}

// ----- Recent decisions -------------------------------------------------------------------

function LogWidget({ game }: WidgetProps) {
  return (
    <WidgetCard title="Recent decisions">
      {game.log.length === 0 ? <p className="text-sm text-muted">Your decisions appear here, graded.</p> : (
        <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 text-[13px]">
          {game.log.slice(0, 15).map((d, i) => (
            <li key={game.stats.decisions - i} className="flex items-center gap-2">
              <span className={cx('grid size-4 shrink-0 place-items-center rounded-full', d.correct ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>{d.correct ? <Check size={11} /> : <X size={11} />}</span>
              <span className="min-w-0 flex-1 truncate">{d.spot}</span>
              <span className="shrink-0 text-muted">{d.correct ? d.chosen : `${d.chosen} → ${d.best}`}</span>
              <span className="w-10 shrink-0 text-right font-data text-[11px] text-muted">TC {signed(d.tc)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ----- Column -------------------------------------------------------------------------------

const RENDER: Record<WidgetId, (p: WidgetProps) => React.ReactNode> = {
  counts: (p) => <CountsWidget {...p} />,
  gauges: (p) => <GaugesWidget {...p} />,
  decks: (p) => <DeckDrillWidget {...p} />,
  errors: (p) => <ErrorsWidget {...p} />,
  sidebets: (p) => <SideBetsWidget {...p} />,
  accuracy: (p) => <AccuracyWidget {...p} />,
  stats: (p) => <StatsWidget {...p} />,
  stopwatch: (p) => <StopwatchWidget {...p} />,
  speed: (p) => <SpeedWidget {...p} />,
  heat: (p) => <HeatWidget {...p} />,
  curve: (p) => <CurveWidget {...p} />,
  'chart-bankroll': (p) => <ChartWidget {...p} kind="bankroll" />,
  'chart-count': (p) => <ChartWidget {...p} kind="count" />,
  'chart-errors': (p) => <ChartWidget {...p} kind="errors" />,
  'chart-bets': (p) => <BetsChartWidget {...p} />,
  log: (p) => <LogWidget {...p} />,
};

export function DashboardColumn({ ids, ...props }: WidgetProps & { ids: WidgetId[] }) {
  return (
    <>
      {ids.map((id) => (
        <div key={id} aria-label={WIDGETS[id].name}>{RENDER[id](props)}</div>
      ))}
    </>
  );
}
