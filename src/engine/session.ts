// Session analysis over settled rounds: casino heat, luck vs. expectation, and pace.
import type { RoundRecord } from './game';

export interface Heat {
  /** 0 (invisible) … 100 (obvious counter). */
  score: number;
  level: 'Cool' | 'Warm' | 'Hot';
  /** Correlation between your bet and the true count. */
  correlation: number;
  /** Largest bet ÷ smallest bet. */
  spread: number;
  rounds: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * How much your betting looks like counting to a pit boss: bet-to-count correlation over
 * the recent rounds, weighted with the size of your spread.
 */
export function heat(rounds: RoundRecord[], window = 50): Heat {
  const r = rounds.slice(-window);
  const bets = r.map((x) => x.bet), tcs = r.map((x) => x.tc);
  const correlation = pearson(tcs, bets);
  const min = Math.min(...bets), max = Math.max(...bets);
  const spread = r.length && min > 0 ? max / min : 1;
  const score = Math.round(Math.max(0, correlation) * 65 + Math.min(1, (spread - 1) / 11) * 35);
  return { score, level: score >= 60 ? 'Hot' : score >= 30 ? 'Warm' : 'Cool', correlation, spread, rounds: r.length };
}

export interface Luck {
  expected: number;
  sd: number;
  actual: number;
  z: number;
  /** Share of sessions played exactly like yours that would have done worse. */
  percentile: number;
}

/** Normal CDF (Abramowitz–Stegun 7.1.26, max error ~1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Your result against what your bets, the counts and your play should have produced. */
export function luck(rounds: RoundRecord[]): Luck {
  let expected = 0, variance = 0, actual = 0;
  for (const r of rounds) { expected += r.ev; variance += r.variance; actual += r.net; }
  const sd = Math.sqrt(variance);
  const z = sd > 0 ? (actual - expected) / sd : 0;
  return { expected, sd, actual, z, percentile: normCdf(z) };
}

export interface Pace {
  /** Rounds per hour over the whole session. */
  overall: number;
  /** Rounds per hour over the last few rounds. */
  recent: number;
}

export function pace(rounds: RoundRecord[], elapsedMs: number, recentN = 10): Pace {
  const hours = elapsedMs / 3_600_000;
  const overall = hours > 0 ? rounds.length / hours : 0;
  const tail = rounds.slice(-(recentN + 1));
  let recent = overall;
  if (tail.length >= 3) {
    const dt = (tail[tail.length - 1].t - tail[0].t) / 3_600_000;
    if (dt > 0) recent = (tail.length - 1) / dt;
  }
  return { overall, recent };
}
