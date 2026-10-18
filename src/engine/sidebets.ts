// Exact side-bet expected values from any shoe composition, plus settlement.
//
// Every calculator is closed-form over the 52 card types, so a full evaluation costs a few
// hundred operations — cheap enough to run before every round, and millions of times in
// the counting simulator.

import { type Card, type Composition, compTotal, isRed, typeIndex, valueOf } from './cards';

export type SideBetId = 'pp' | 't213' | 'll';

export interface Outcome {
  key: string;
  label: string;
  pays: number;
  prob: number;
}

export interface SideBetEval {
  outcomes: Outcome[];
  pLose: number;
  /** Expected value per unit wagered (negative = house edge). */
  ev: number;
}

export interface SideBetDef {
  id: SideBetId;
  name: string;
  short: string;
  blurb: string;
  outcomes: { key: string; label: string }[];
  presets: { name: string; pays: Record<string, number> }[];
}

export type Paytable = Record<string, number>;

export const SIDE_BETS: Record<SideBetId, SideBetDef> = {
  pp: {
    id: 'pp',
    name: 'Perfect Pairs',
    short: 'PP',
    blurb: 'Pays when your first two cards are a pair.',
    outcomes: [
      { key: 'perfect', label: 'Perfect pair (same suit)' },
      { key: 'colored', label: 'Coloured pair (same colour)' },
      { key: 'mixed', label: 'Mixed pair' },
    ],
    presets: [
      { name: '25 / 12 / 6', pays: { perfect: 25, colored: 12, mixed: 6 } },
      { name: '30 / 10 / 5', pays: { perfect: 30, colored: 10, mixed: 5 } },
      { name: '25 / 10 / 5', pays: { perfect: 25, colored: 10, mixed: 5 } },
    ],
  },
  t213: {
    id: 't213',
    name: '21+3',
    short: '21+3',
    blurb: 'Your two cards plus the dealer upcard as a three-card poker hand.',
    outcomes: [
      { key: 'suitedTrips', label: 'Suited three of a kind' },
      { key: 'straightFlush', label: 'Straight flush' },
      { key: 'trips', label: 'Three of a kind' },
      { key: 'straight', label: 'Straight' },
      { key: 'flush', label: 'Flush' },
    ],
    presets: [
      { name: '100 / 40 / 30 / 10 / 5', pays: { suitedTrips: 100, straightFlush: 40, trips: 30, straight: 10, flush: 5 } },
      { name: 'Classic 9:1', pays: { suitedTrips: 9, straightFlush: 9, trips: 9, straight: 9, flush: 9 } },
    ],
  },
  ll: {
    id: 'll',
    name: 'Lucky Ladies',
    short: 'LL',
    blurb: 'Pays when your first two cards total 20; the top prize needs a pair of Q♥ and a dealer blackjack.',
    outcomes: [
      { key: 'qhBj', label: 'Q♥ pair + dealer blackjack' },
      { key: 'qh', label: 'Q♥ pair' },
      { key: 'matched', label: 'Matched 20 (same rank and suit)' },
      { key: 'suited', label: 'Suited 20' },
      { key: 'any', label: 'Any 20' },
    ],
    presets: [
      { name: '1000 / 125 / 19 / 9 / 4', pays: { qhBj: 1000, qh: 125, matched: 19, suited: 9, any: 4 } },
      { name: '1000 / 200 / 25 / 10 / 4', pays: { qhBj: 1000, qh: 200, matched: 25, suited: 10, any: 4 } },
    ],
  },
};

export const defaultPaytable = (id: SideBetId): Paytable => ({ ...SIDE_BETS[id].presets[0].pays });

const c2 = (n: number) => (n * (n - 1)) / 2;
const c3 = (n: number) => (n * (n - 1) * (n - 2)) / 6;

// Three-rank straights: A23 … JQK, plus QKA (ace high). KA2 does not wrap.
const STRAIGHTS: [number, number, number][] = [];
for (let r = 1; r <= 11; r++) STRAIGHTS.push([r, r + 1, r + 2]);
STRAIGHTS.push([12, 13, 1]);

const QH = typeIndex(12, 1);

/** Raw (unnormalised) combination counts per outcome. */
function ppCombos(comp: Composition) {
  let perfect = 0, colored = 0, mixed = 0;
  for (let r = 1; r <= 13; r++) {
    const b = r * 4 - 4;
    const s = comp[b], h = comp[b + 1], d = comp[b + 2], c = comp[b + 3];
    perfect += c2(s) + c2(h) + c2(d) + c2(c);
    colored += s * c + h * d;
    mixed += (s + c) * (h + d);
  }
  return { perfect, colored, mixed };
}

function t213Combos(comp: Composition) {
  const R = new Float64Array(14); // by rank
  const S = new Float64Array(4); // by suit
  let suitedTrips = 0;
  for (let i = 0; i < 52; i++) {
    const n = comp[i];
    R[(i >> 2) + 1] += n;
    S[i & 3] += n;
    suitedTrips += c3(n);
  }
  let trips = -suitedTrips;
  for (let r = 1; r <= 13; r++) trips += c3(R[r]);
  let straightFlush = 0, straightAll = 0;
  for (const [a, b, c] of STRAIGHTS) {
    straightAll += R[a] * R[b] * R[c];
    for (let s = 0; s < 4; s++) straightFlush += comp[typeIndex(a, s)] * comp[typeIndex(b, s)] * comp[typeIndex(c, s)];
  }
  let flushAll = 0;
  for (let s = 0; s < 4; s++) flushAll += c3(S[s]);
  return {
    suitedTrips,
    straightFlush,
    trips,
    straight: straightAll - straightFlush,
    flush: flushAll - straightFlush - suitedTrips,
  };
}

/** Lucky Ladies combos; qhBj/qh are split by the dealer-blackjack probability. */
function llCombos(comp: Composition, N: number) {
  let tens = 0;
  for (let r = 10; r <= 13; r++) for (let s = 0; s < 4; s++) tens += comp[typeIndex(r, s)];
  let aces = 0, nines = 0;
  for (let s = 0; s < 4; s++) { aces += comp[typeIndex(1, s)]; nines += comp[typeIndex(9, s)]; }

  const qhPair = c2(comp[QH]);
  let matched = 0, suited = 0;
  for (let s = 0; s < 4; s++) {
    for (let r = 10; r <= 13; r++) {
      const i = typeIndex(r, s);
      if (i !== QH) matched += c2(comp[i]);
      for (let r2 = r + 1; r2 <= 13; r2++) suited += comp[i] * comp[typeIndex(r2, s)];
    }
    suited += comp[typeIndex(1, s)] * comp[typeIndex(9, s)];
  }
  const total20 = c2(tens) + aces * nines;
  const any = total20 - qhPair - matched - suited;

  // Given a Q♥ pair, the dealer's two cards come from the other N-2 cards.
  const n2 = N - 2;
  const pDealerBj = n2 >= 2 ? (2 * (tens - 2) * aces) / (n2 * (n2 - 1)) : 0;
  return { qhBj: qhPair * pDealerBj, qh: qhPair * (1 - pDealerBj), matched, suited, any };
}

export function evaluate(id: SideBetId, comp: Composition, pays: Paytable): SideBetEval {
  const N = compTotal(comp);
  let combos: Record<string, number>;
  let denom: number;
  if (id === 'pp') { combos = ppCombos(comp); denom = c2(N); }
  else if (id === 't213') { combos = t213Combos(comp); denom = c3(N); }
  else { combos = llCombos(comp, N); denom = c2(N); }

  const outcomes: Outcome[] = [];
  let pWin = 0, ev = 0;
  for (const { key, label } of SIDE_BETS[id].outcomes) {
    const prob = denom > 0 ? combos[key] / denom : 0;
    const p = pays[key] ?? 0;
    outcomes.push({ key, label, pays: p, prob });
    pWin += prob;
    ev += prob * p;
  }
  const pLose = 1 - pWin;
  return { outcomes, pLose, ev: ev - pLose };
}

/** EV only — the hot path for simulations. */
export function sideBetEV(id: SideBetId, comp: Composition, pays: Paytable): number {
  return evaluate(id, comp, pays).ev;
}

/** Per-unit standard deviation of one side bet, from its outcome distribution. */
export function sideBetSD(e: SideBetEval): number {
  let m2 = e.pLose;
  for (const o of e.outcomes) m2 += o.prob * o.pays * o.pays;
  return Math.sqrt(Math.max(0, m2 - e.ev * e.ev));
}

// ---------------------------------------------------------------------------------------
// Settlement

export interface SideBetResult {
  key: string | null;
  label: string;
  /** Net units won per unit wagered (-1 on a loss). */
  net: number;
}

function classifyPP(a: Card, b: Card): string | null {
  if (a.rank !== b.rank) return null;
  if (a.suit === b.suit) return 'perfect';
  return isRed(a.suit) === isRed(b.suit) ? 'colored' : 'mixed';
}

function classify213(cards: Card[]): string | null {
  const [a, b, c] = cards;
  const sameRank = a.rank === b.rank && b.rank === c.rank;
  const flush = a.suit === b.suit && b.suit === c.suit;
  if (sameRank && flush) return 'suitedTrips';
  const ranks = new Set(cards.map((x) => x.rank));
  const straight = ranks.size === 3 && STRAIGHTS.some((s) => s.every((r) => ranks.has(r as Card['rank'])));
  if (straight && flush) return 'straightFlush';
  if (sameRank) return 'trips';
  if (straight) return 'straight';
  if (flush) return 'flush';
  return null;
}

function classifyLL(a: Card, b: Card, dealerBlackjack: boolean): string | null {
  if (valueOf(a.rank) + valueOf(b.rank) !== 20 && !(a.rank === 1 && b.rank === 9) && !(a.rank === 9 && b.rank === 1)) return null;
  const isQH = (x: Card) => x.rank === 12 && x.suit === 1;
  if (isQH(a) && isQH(b)) return dealerBlackjack ? 'qhBj' : 'qh';
  if (a.rank === b.rank && a.suit === b.suit) return 'matched';
  if (a.suit === b.suit) return 'suited';
  return 'any';
}

export function settleSideBet(
  id: SideBetId,
  pays: Paytable,
  player: [Card, Card],
  dealerUp: Card,
  dealerBlackjack: boolean,
): SideBetResult {
  let key: string | null;
  if (id === 'pp') key = classifyPP(player[0], player[1]);
  else if (id === 't213') key = classify213([player[0], player[1], dealerUp]);
  else key = classifyLL(player[0], player[1], dealerBlackjack);
  if (!key) return { key: null, label: 'No win', net: -1 };
  const label = SIDE_BETS[id].outcomes.find((o) => o.key === key)!.label;
  return { key, label, net: pays[key] ?? 0 };
}

// ---------------------------------------------------------------------------------------
// Counting: effects of removal and a derived linear count

/**
 * Effect of removing one card of each blackjack value (1..10) on the side bet's EV,
 * averaged over the suits and ranks that share that value.
 */
export function effectsOfRemoval(id: SideBetId, comp: Composition, pays: Paytable): Float64Array {
  const base = sideBetEV(id, comp, pays);
  const eor = new Float64Array(11);
  const weight = new Float64Array(11);
  const work = Int32Array.from(comp);
  for (let i = 0; i < 52; i++) {
    if (comp[i] === 0) continue;
    const v = valueOf((i >> 2) + 1);
    work[i]--;
    eor[v] += comp[i] * (sideBetEV(id, work, pays) - base);
    weight[v] += comp[i];
    work[i]++;
  }
  for (let v = 1; v <= 10; v++) eor[v] = weight[v] ? eor[v] / weight[v] : 0;
  return eor;
}

export interface DerivedCount {
  /** Tags by value 1..10 (index 0 unused). A seen card adds its tag to the running count. */
  tags: Int8Array;
  /** False when no linear count captures the bet (e.g. Perfect Pairs, where all ranks are symmetric). */
  countable: boolean;
  /** Sum of tags over one deck; 0 means balanced (true count conversion is valid). */
  deckSum: number;
}

const FREQ = (v: number) => (v === 10 ? 4 : 1);

/**
 * Turn effects of removal into an integer count of the given level. Ideal tags are each
 * value's EOR minus the frequency-weighted mean, scaled so the largest is ±level. Each tag
 * is then rounded up or down — all 2^10 choices are tried — preferring a balanced deck sum,
 * then the smallest squared rounding error.
 */
export function deriveCount(eor: Float64Array, level = 2): DerivedCount {
  let mean = 0;
  for (let v = 1; v <= 10; v++) mean += FREQ(v) * eor[v];
  mean /= 13;
  let maxDev = 0, maxAbs = 0;
  for (let v = 1; v <= 10; v++) {
    maxDev = Math.max(maxDev, Math.abs(eor[v] - mean));
    maxAbs = Math.max(maxAbs, Math.abs(eor[v]));
  }
  const tags = new Int8Array(11);
  const countable = maxAbs > 0 && maxDev / maxAbs > 1e-6;
  if (!countable) return { tags, countable, deckSum: 0 };

  const ideal = new Float64Array(11);
  for (let v = 1; v <= 10; v++) ideal[v] = ((eor[v] - mean) / maxDev) * level;
  let best = Infinity, bestMask = 0;
  for (let mask = 0; mask < 1024; mask++) {
    let sum = 0, err = 0;
    for (let v = 1; v <= 10; v++) {
      const t = (mask >> (v - 1)) & 1 ? Math.ceil(ideal[v]) : Math.floor(ideal[v]);
      sum += FREQ(v) * t;
      err += FREQ(v) * (t - ideal[v]) ** 2;
    }
    const score = Math.abs(sum) * 1000 + err;
    if (score < best) { best = score; bestMask = mask; }
  }
  let deckSum = 0;
  for (let v = 1; v <= 10; v++) {
    tags[v] = (bestMask >> (v - 1)) & 1 ? Math.ceil(ideal[v]) : Math.floor(ideal[v]);
    deckSum += FREQ(v) * tags[v];
  }
  return { tags, countable, deckSum };
}
