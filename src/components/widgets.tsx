import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Eye, EyeOff, Pause, Play as PlayIcon, X, Flame, Snowflake, ThermometerSun } from 'lucide-react';
import type { Game } from '../engine/game';
import { SIDE_IDS } from '../engine/game';
import { SIDE_BETS, type SideBetId } from '../engine/sidebets';
import { heat, luck, pace } from '../engine/session';
import { WIDGETS, type DashboardConfig, type WidgetId } from '../lib/dashboard';
import { cx, edgePct, money, signed } from '../lib/format';
import { BellCurve, Gauge, MiniLine, MiniScatter } from './MiniCharts';

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

function CountsWidget({ game, hideCount, setHideCount }: WidgetProps) {
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
            <button className="rounded-lg bg-brass px-3 font-semibold text-brass-ink">Check</button>
          </div>
          {verdict && <p className={cx('text-sm font-semibold', verdict.ok ? 'text-good' : 'text-bad')}>{verdict.ok ? 'Correct.' : `Not quite: the running count is ${signed(verdict.rc)}.`}</p>}
        </form>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Running" value={signed(game.rc)} big />
          <Stat label="True" value={signed(game.tc)} big accent={game.tc >= 2} />
          <Stat label="Decks left" value={game.decksEst.toFixed(1)} big />
        </div>
      )}
    </WidgetCard>
  );
}

// ----- Cost of errors ---------------------------------------------------------------------

function ErrorsWidget({ game }: WidgetProps) {
  const s = game.stats;
  const perHundred = s.rounds ? (s.evLost / s.rounds) * 100 : 0;
  return (
    <WidgetCard title="Cost of errors">
      <div className="rounded-xl bg-[#0b0d0c] px-4 py-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d8a80]">Your mistakes have cost</div>
        <div className={cx('tnum font-data text-[38px] font-bold leading-tight', s.evLost > 0 ? 'text-[#ff6b5e]' : 'text-[#5ee07f]')} style={{ textShadow: '0 0 12px currentColor' }}>
          ${s.evLost.toFixed(2).padStart(7, '0')}
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
      <Gauge value={v} max={300} label={`${Math.round(v)} rounds per hour`} bands={[{ to: 300, color: 'var(--series-pos)' }]} />
      <div className="-mt-1 text-center">
        <div className="tnum font-display text-3xl font-bold leading-none">{v ? Math.round(v) : '—'}</div>
        <div className="mt-1 text-xs text-muted">rounds per hour · a busy casino table deals about 60–100</div>
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
      <div className="relative h-3 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg, var(--good), var(--warn) 50%, var(--bad))', opacity: 0.85 }} aria-hidden>
        <div className="absolute inset-y-0 right-0 bg-panel-2" style={{ left: `${h.score}%`, transition: 'left .5s' }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Score" value={`${h.score}`} />
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
