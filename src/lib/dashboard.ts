import { createContext, useContext } from 'react';
import { usePref } from './settings';

export type WidgetId =
  | 'counts' | 'gauges' | 'decks' | 'errors' | 'accuracy' | 'stats' | 'stopwatch' | 'speed' | 'heat' | 'curve'
  | 'sidebets' | 'chart-bankroll' | 'chart-count' | 'chart-bets' | 'chart-errors' | 'log';

export type Side = 'left' | 'right';
export type Position = 'none' | 'left' | 'right' | 'both';
export type DealSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type ResetRule = 'open' | 'manual';

export interface WidgetPref { id: WidgetId; on: boolean; side: Side }

export interface DashboardConfig {
  position: Position;
  /** Order in this list is the order on screen. */
  widgets: WidgetPref[];
  /** Rounds shown in the charts. */
  dataPoints: number;
  speed: DealSpeed;
  reset: ResetRule;
  /** Running and true count shown on the felt. */
  pinCount: boolean;
  /** Exact decks-left numbers on the shoe and in the counts widget (off = estimate from the tray). */
  deckNumbers: boolean;
  /** Deck marks on the side of the discard tray. */
  trayMarks: boolean;
  startBankroll: number;
}

export const WIDGETS: Record<WidgetId, { name: string; blurb: string }> = {
  counts: { name: 'Counts', blurb: 'Running count, true count and decks left' },
  gauges: { name: 'Gauges', blurb: 'True count, your edge, shoe dealt and accuracy as dials' },
  decks: { name: 'Deck estimation', blurb: 'Judge the decks left from the discard tray, graded' },
  errors: { name: 'Cost of errors', blurb: 'What your mistakes have cost, in dollars' },
  sidebets: { name: 'Side-bet edges', blurb: 'Exact edge of each side bet for the next round' },
  accuracy: { name: 'Accuracy rates', blurb: 'Hard, soft, pairs, insurance and index plays' },
  stats: { name: 'Statistics grid', blurb: 'Hands, wins, losses, wagered, win rate' },
  stopwatch: { name: 'Stopwatch', blurb: 'Session time, with pause' },
  speed: { name: 'Speedometer', blurb: 'Rounds per hour, like a real table' },
  heat: { name: 'Heat', blurb: 'How much your betting looks like counting' },
  curve: { name: 'Probability curve', blurb: 'Your result against luck' },
  'chart-bankroll': { name: 'Bankroll chart', blurb: 'Bankroll after each round' },
  'chart-count': { name: 'True count chart', blurb: 'True count at each deal' },
  'chart-bets': { name: 'Bet vs. count', blurb: 'Your bet at each true count' },
  'chart-errors': { name: 'Error cost chart', blurb: 'Cumulative cost of mistakes' },
  log: { name: 'Recent decisions', blurb: 'Your last decisions, graded' },
};

const ORDER: WidgetId[] = ['counts', 'gauges', 'decks', 'errors', 'sidebets', 'accuracy', 'log', 'stats', 'stopwatch', 'speed', 'heat', 'curve', 'chart-bankroll', 'chart-count', 'chart-bets', 'chart-errors'];
const DEFAULT_ON = new Set<WidgetId>(['counts', 'gauges', 'decks', 'errors', 'sidebets', 'accuracy', 'log', 'speed', 'heat', 'chart-bankroll']);
const DEFAULT_LEFT = new Set<WidgetId>(['speed', 'heat', 'chart-bankroll', 'stats', 'stopwatch', 'curve', 'chart-count', 'chart-bets', 'chart-errors']);

export function defaultDashboard(): DashboardConfig {
  return {
    position: 'right',
    widgets: ORDER.map((id) => ({ id, on: DEFAULT_ON.has(id), side: DEFAULT_LEFT.has(id) ? 'left' : 'right' })),
    dataPoints: 40,
    speed: 'normal',
    reset: 'manual',
    pinCount: true,
    deckNumbers: true,
    trayMarks: true,
    startBankroll: 1000,
  };
}

/** Saved config plus any widgets added since it was saved. */
function normalize(c: Partial<DashboardConfig>): DashboardConfig {
  const base = defaultDashboard();
  const saved = (c.widgets ?? []).filter((w) => w.id in WIDGETS);
  const missing = base.widgets.filter((w) => !saved.some((s) => s.id === w.id));
  return { ...base, ...c, widgets: [...saved, ...missing] };
}

export function useDashboard() {
  const [raw, setRaw] = usePref<Partial<DashboardConfig>>('dashboard', defaultDashboard());
  const cfg = normalize(raw);
  const update = (patch: Partial<DashboardConfig>) => setRaw({ ...cfg, ...patch });
  return { cfg, update, reset: () => setRaw(defaultDashboard()) };
}

/** Widgets to show in a column, in order. */
export function widgetsFor(cfg: DashboardConfig, column: Side): WidgetId[] {
  if (cfg.position === 'none') return [];
  if (cfg.position !== 'both' && cfg.position !== column) return [];
  return cfg.widgets.filter((w) => w.on && (cfg.position !== 'both' || w.side === column)).map((w) => w.id);
}

const SPEED_FACTOR: Record<DealSpeed, number> = { slow: 1.7, normal: 1, fast: 0.45, instant: 0 };
export const SpeedContext = createContext(1);
export const speedFactor = (s: DealSpeed) => SPEED_FACTOR[s];
export const useSpeed = () => useContext(SpeedContext);
