// Side-bet counting simulator: deals shoes, and before every round records the true count
// (from a chosen tag set) alongside the side bet's exact EV for the cards actually left.
// That answers two questions:
//   - With this count, at what true count does the bet turn positive, and what is it worth?
//   - What is the ceiling if you knew the exact remaining composition (a computer-perfect count)?

import { Shoe, makeRng, valueOf } from './cards';
import { sideBetEV, type Paytable, type SideBetId } from './sidebets';

export interface SimConfig {
  bet: SideBetId;
  pays: Paytable;
  decks: number;
  penetration: number;
  /** Seats at the table, including you. */
  seats: number;
  /** Tags by value 1..10 (index 0 unused). */
  tags: number[];
  shoes: number;
  seed: number;
}

export interface TcBin {
  tc: number;
  rounds: number;
  meanEV: number;
  /** Share of rounds in this bin where the exact EV was positive. */
  pPositive: number;
}

export interface SimResult {
  rounds: number;
  baseEV: number;
  bins: TcBin[];
  /** Lowest true count from which every (well-populated) bin is +EV; null if never. */
  threshold: number | null;
  /** Share of rounds dealt at or above the threshold. */
  playFreq: number;
  /** Average EV per unit when betting at or above the threshold. */
  evWhenPlaying: number;
  /** Units won per 100 rounds observed, betting 1 unit only at or above the threshold. */
  gainPer100: number;
  /** Same, betting whenever the exact composition says +EV. */
  perfectGainPer100: number;
  perfectPlayFreq: number;
}

export const TC_LO = -12;
export const TC_HI = 20;

export function runSideCountSim(cfg: SimConfig, onProgress?: (done: number) => void): SimResult {
  const rng = makeRng(cfg.seed);
  const shoe = new Shoe(cfg.decks, cfg.penetration, rng);
  const nb = TC_HI - TC_LO + 1;
  const n = new Float64Array(nb), sum = new Float64Array(nb), pos = new Float64Array(nb);
  let rounds = 0, perfectSum = 0, perfectRounds = 0, totalEV = 0;
  const tags = cfg.tags;

  for (let s = 0; s < cfg.shoes; s++) {
    shoe.shuffle();
    let rc = 0;
    const see = (rank: number) => { rc += tags[valueOf(rank)]; return valueOf(rank); };
    while (!shoe.needsShuffle) {
      const ev = sideBetEV(cfg.bet, shoe.remaining, cfg.pays);
      const tc = Math.floor(rc / Math.max(shoe.decksLeft, 0.25));
      const b = Math.max(TC_LO, Math.min(TC_HI, tc)) - TC_LO;
      n[b]++; sum[b] += ev; if (ev > 0) { pos[b]++; perfectSum += ev; perfectRounds++; }
      rounds++; totalEV += ev;
      dealRound(shoe, cfg.seats, see);
    }
    if (onProgress && (s & 255) === 255) onProgress(s + 1);
  }

  const bins: TcBin[] = [];
  for (let b = 0; b < nb; b++) {
    if (n[b] === 0) continue;
    bins.push({ tc: b + TC_LO, rounds: n[b], meanEV: sum[b] / n[b], pPositive: pos[b] / n[b] });
  }

  // Threshold: lowest TC such that it and every populated higher bin is +EV.
  const minRounds = Math.max(50, rounds * 0.0005);
  const solid = bins.filter((x) => x.rounds >= minRounds);
  let threshold: number | null = null;
  for (let i = solid.length - 1; i >= 0; i--) {
    if (solid[i].meanEV > 0) threshold = solid[i].tc;
    else break;
  }
  let playRounds = 0, playSum = 0;
  if (threshold !== null) {
    for (const x of bins) if (x.tc >= threshold) { playRounds += x.rounds; playSum += x.meanEV * x.rounds; }
  }

  return {
    rounds,
    baseEV: totalEV / rounds,
    bins,
    threshold,
    playFreq: playRounds / rounds,
    evWhenPlaying: playRounds ? playSum / playRounds : 0,
    gainPer100: (playSum / rounds) * 100,
    perfectGainPer100: (perfectSum / rounds) * 100,
    perfectPlayFreq: perfectRounds / rounds,
  };
}

/**
 * Deal one round's worth of cards. Players stand on 17+ (hit soft 17), or on 12+ against a
 * dealer 2-6 — close to basic strategy in how many cards it uses, which is all that matters here.
 */
function dealRound(shoe: Shoe, seats: number, see: (rank: number) => number) {
  const up = see(shoe.draw().rank);
  const hands: number[][] = [];
  for (let i = 0; i < seats; i++) hands.push([see(shoe.draw().rank), see(shoe.draw().rank)]);
  const hole = shoe.draw().rank;
  for (const h of hands) {
    for (;;) {
      const { total, soft } = score(h);
      const standAt = up >= 2 && up <= 6 ? 12 : 17;
      if (total > 21 || total > standAt || (total === standAt && !(soft && total === 17)) || total === 21) break;
      if (shoe.cardsLeft === 0) break;
      h.push(see(shoe.draw().rank));
    }
  }
  const dealer = [up, see(hole)];
  while (score(dealer).total < 17 && shoe.cardsLeft > 0) dealer.push(see(shoe.draw().rank));
}

function score(values: number[]) {
  let t = 0, ace = false;
  for (const v of values) { t += v; if (v === 1) ace = true; }
  const soft = ace && t + 10 <= 21;
  return { total: soft ? t + 10 : t, soft };
}
