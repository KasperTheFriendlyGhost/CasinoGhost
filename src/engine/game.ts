// Table game: one seat (up to four hands after splits), Hi-Lo running count, side bets,
// and grading of every decision against the generated strategy + index plays.

import { Shoe, valueOf, type Card } from './cards';
import { ACT, ACT_NAMES, Advisor, handInfo, houseEdge, type ActionCode, type DevMode, type Rules } from './strategy';
import { SIDE_BETS, evaluate, settleSideBet, sideBetSD, type Paytable, type SideBetId, type SideBetResult } from './sidebets';

const HI_LO = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];

export type Phase = 'betting' | 'insurance' | 'player' | 'settled';
export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  aceSplit: boolean;
  done: boolean;
  surrendered: boolean;
  outcome?: HandOutcome;
  net?: number;
}

export type DecisionCategory = 'hard' | 'soft' | 'pair' | 'insurance';

export interface Decision {
  spot: string;
  chosen: string;
  best: string;
  correct: boolean;
  evCost: number;
  index: string | null;
  tc: number;
  category: DecisionCategory;
  /** The spot has a Hi-Lo index play (whether or not the count changed the play). */
  indexSpot: boolean;
}

/** One settled round, kept for charts and session analysis. */
export interface RoundRecord {
  n: number;
  /** Active session time (ms, pauses excluded) when the round settled. */
  t: number;
  /** Main bet at the deal. */
  bet: number;
  sideStake: number;
  /** True count (floored, as the player sees it) before the deal. */
  tc: number;
  net: number;
  bankroll: number;
  /** Cumulative cost of mistakes after this round ($). */
  errorCost: number;
  /** Expected result of the round given the count and your play ($). */
  ev: number;
  /** Variance of the round's result ($²). */
  variance: number;
}

export interface SideBetSettlement extends SideBetResult {
  stake: number;
  /** Exact EV per unit before the deal. */
  evBefore: number;
}

export interface TableLimits {
  min: number;
  max: number;
}

export interface GameSettings {
  rules: Rules;
  deviations: DevMode;
  pays: Record<SideBetId, Paytable>;
  limits?: TableLimits;
}

export interface Tally { n: number; ok: number }

export interface Stats {
  rounds: number;
  decisions: number;
  correct: number;
  evLost: number;
  net: number;
  sideNet: number;
  sideStaked: number;
  /** Total money put in action: main bets incl. doubles and splits, side bets, insurance. */
  wagered: number;
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  busts: number;
  surrenders: number;
  doubles: number;
  splits: number;
  insurances: number;
  sideWins: number;
  byCategory: Record<DecisionCategory | 'index', Tally>;
}

export const emptyStats = (): Stats => ({
  rounds: 0, decisions: 0, correct: 0, evLost: 0, net: 0, sideNet: 0, sideStaked: 0, wagered: 0,
  hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, busts: 0, surrenders: 0, doubles: 0, splits: 0, insurances: 0, sideWins: 0,
  byCategory: { hard: { n: 0, ok: 0 }, soft: { n: 0, ok: 0 }, pair: { n: 0, ok: 0 }, insurance: { n: 0, ok: 0 }, index: { n: 0, ok: 0 } },
});

/** What is saved between visits. */
export interface SessionSnapshot {
  bankroll: number;
  mainBet: number;
  sideStakes: Record<SideBetId, number>;
  stats: Stats;
  log: Decision[];
  rounds: RoundRecord[];
  elapsed: number;
}

/** Standard deviation of one blackjack round per unit bet (multi-deck, basic strategy). */
const MAIN_SD = 1.15;
/** Approximate Hi-Lo edge gained per +1 true count. */
const EDGE_PER_TC = 0.005;
const MAX_ROUNDS = 2000;

export const SIDE_IDS: SideBetId[] = ['pp', 't213', 'll'];

export class Game {
  settings: GameSettings;
  shoe: Shoe;
  advisor: Advisor;
  phase: Phase = 'betting';
  dealer: Card[] = [];
  holeRevealed = false;
  hands: Hand[] = [];
  active = 0;
  bankroll = 1000;
  mainBet = 10;
  sideStakes: Record<SideBetId, number> = { pp: 0, t213: 0, ll: 0 };
  sideResults: Partial<Record<SideBetId, SideBetSettlement>> = {};
  insurance: number | null = null;
  rc = 0;
  justShuffled = true;
  lastDecision: Decision | null = null;
  log: Decision[] = [];
  stats: Stats = emptyStats();
  rounds: RoundRecord[] = [];
  /** Basic-strategy edge for these rules (negative = house edge). */
  readonly baseEdge: number;
  /** Bumps on every change so React can re-render. */
  version = 0;
  private listeners = new Set<() => void>();
  private sideEVBefore: Record<SideBetId, number> = { pp: 0, t213: 0, ll: 0 };
  /** Net result of the current/last round, side bets included. */
  roundNet = 0;
  private roundStart = { bet: 0, sideStake: 0, tc: 0, sideEV: 0, sideVar: 0 };
  // Session clock: active time excludes pauses.
  private clockBase = 0;
  private clockStartedAt: number | null = Date.now();

  constructor(settings: GameSettings, rand: () => number = Math.random) {
    this.settings = settings;
    this.shoe = new Shoe(settings.rules.decks, settings.rules.penetration, rand);
    this.advisor = new Advisor(settings.rules, settings.deviations);
    this.baseEdge = -houseEdge(settings.rules, this.advisor.S);
  }

  // ----- session clock and persistence ---------------------------------------------------

  get paused() { return this.clockStartedAt === null; }
  /** Active session time in ms. */
  elapsed(now = Date.now()) { return this.clockBase + (this.clockStartedAt === null ? 0 : now - this.clockStartedAt); }
  pause() { if (this.clockStartedAt !== null) { this.clockBase = this.elapsed(); this.clockStartedAt = null; this.emit(); } }
  resume() { if (this.clockStartedAt === null) { this.clockStartedAt = Date.now(); this.emit(); } }

  get limits(): TableLimits { return this.settings.limits ?? { min: 1, max: 100000 }; }

  snapshot(): SessionSnapshot {
    return { bankroll: this.bankroll, mainBet: this.mainBet, sideStakes: { ...this.sideStakes }, stats: this.stats, log: this.log, rounds: this.rounds, elapsed: this.elapsed() };
  }

  restore(s: Partial<SessionSnapshot>) {
    if (typeof s.bankroll === 'number') this.bankroll = s.bankroll;
    if (typeof s.mainBet === 'number') this.mainBet = s.mainBet;
    if (s.sideStakes) this.sideStakes = { ...this.sideStakes, ...s.sideStakes };
    if (s.stats) this.stats = { ...emptyStats(), ...s.stats, byCategory: { ...emptyStats().byCategory, ...s.stats.byCategory } };
    if (Array.isArray(s.log)) this.log = s.log;
    if (Array.isArray(s.rounds)) this.rounds = s.rounds;
    if (typeof s.elapsed === 'number') { this.clockBase = s.elapsed; this.clockStartedAt = this.clockStartedAt === null ? null : Date.now(); }
    this.emit();
  }

  /** Clear session statistics and history (bankroll back to the given amount). */
  resetSession(bankroll = 1000) {
    this.stats = emptyStats(); this.rounds = []; this.log = []; this.lastDecision = null;
    this.bankroll = bankroll; this.clockBase = 0; this.clockStartedAt = Date.now();
    this.emit();
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.version++; for (const fn of this.listeners) fn(); }

  // ----- derived state -------------------------------------------------------------------

  get up(): Card | undefined { return this.dealer[0]; }
  get decksEst() { return Math.max(0.5, Math.round(this.shoe.decksLeft * 2) / 2); }
  get tc() { return Math.floor(this.rc / this.decksEst + 1e-9); }
  get tcExact() { return this.rc / Math.max(this.shoe.decksLeft, 0.25); }
  get activeHand(): Hand | undefined { return this.phase === 'player' ? this.hands[this.active] : undefined; }
  /** Cards on the felt right now (dealer and every player hand). */
  get onTable() { return this.dealer.length + this.hands.reduce((n, h) => n + h.cards.length, 0); }
  /** Cards in the discard tray: dealt from this shoe and already picked up. */
  get inTray() { return Math.max(0, this.shoe.dealt - this.onTable); }

  /** Exact side-bet EVs for the next round, from the cards not yet dealt. */
  sideBetEVs(): Record<SideBetId, number> {
    const out = {} as Record<SideBetId, number>;
    for (const id of SIDE_IDS) out[id] = evaluate(id, this.shoe.remaining, this.settings.pays[id]).ev;
    return out;
  }

  legal() {
    const h = this.activeHand;
    if (!h || !this.up) return null;
    return this.advisor.legal(this.advHand(h), valueOf(this.up.rank), this.hands.length);
  }

  /** The correct play for the active hand (for hints). */
  advice(): { action: ActionCode; index: string | null } | null {
    const h = this.activeHand;
    if (!h || !this.up) return null;
    const { action, index } = this.correctPlay(h);
    return { action, index };
  }

  /** Correct play and per-action EVs for a hand (index plays applied when enabled). */
  private correctPlay(h: Hand) {
    const upV = valueOf(this.up!.rank);
    const useDev = this.settings.deviations !== 'none';
    const adv = this.advisor.advise(this.advHand(h), upV, this.hands.length, this.tc, useDev);
    const vals: Float64Array = this.advisor.values(this.advHand(h), upV, this.hands.length, this.tc, useDev);
    let action = adv.action as number;
    // The upstream tables have no entry for an unsplittable 10,10 (hand limit reached):
    // fall back to the best legal non-split action by EV.
    if (!(action >= 0 && action <= 4)) {
      const lg = this.legal()!;
      const allowed: number[] = [ACT.STAND, ACT.HIT, ...(lg.double ? [ACT.DOUBLE] : [])];
      action = allowed.reduce((b, a) => (vals[a] > vals[b] ? a : b), ACT.STAND);
    }
    const dev = adv.dev && !adv.dev.held ? adv.dev : null;
    const index = dev ? `TC ${this.tc >= dev.idx ? '≥' : '<'} ${dev.idx > 0 ? '+' : ''}${dev.idx}` : null;
    return { action: action as ActionCode, index, vals, kind: adv.kind as 'hard' | 'soft' | 'pair', indexSpot: !!adv.dev };
  }

  private advHand(h: Hand) {
    return { cards: h.cards.map((c) => valueOf(c.rank)), fromSplit: h.fromSplit, aceSplit: h.aceSplit };
  }

  // ----- setup -----------------------------------------------------------------------------

  setBet(amount: number) {
    if (this.phase === 'betting' || this.phase === 'settled') { this.mainBet = Math.max(0, Math.min(this.limits.max, amount)); this.emit(); }
  }
  setSideStake(id: SideBetId, amount: number) {
    if (this.phase === 'betting' || this.phase === 'settled') { this.sideStakes[id] = Math.max(0, amount); this.emit(); }
  }

  newShoe() {
    this.shoe.shuffle(); this.rc = 0; this.justShuffled = true;
    this.phase = 'betting'; this.dealer = []; this.hands = []; this.sideResults = {};
    this.emit();
  }

  private see(c: Card) { this.rc += HI_LO[valueOf(c.rank)]; return c; }
  private draw(faceUp = true) { const c = this.shoe.draw(); return faceUp ? this.see(c) : c; }

  // ----- round flow ----------------------------------------------------------------------

  deal() {
    if ((this.phase !== 'betting' && this.phase !== 'settled') || this.mainBet <= 0 || this.mainBet < this.limits.min) return;
    this.resume();
    this.justShuffled = false;
    if (this.shoe.needsShuffle) { this.shoe.shuffle(); this.rc = 0; this.justShuffled = true; }
    this.sideEVBefore = this.sideBetEVs();
    let sideStake = 0, sideEV = 0, sideVar = 0;
    for (const id of SIDE_IDS) {
      const st = this.sideStakes[id];
      if (!st) continue;
      const e = evaluate(id, this.shoe.remaining, this.settings.pays[id]);
      sideStake += st; sideEV += st * e.ev; sideVar += (st * sideBetSD(e)) ** 2;
    }
    this.roundStart = { bet: this.mainBet, sideStake, tc: this.tc, sideEV, sideVar };
    this.stats.wagered += this.mainBet + sideStake;
    this.sideResults = {};
    this.insurance = null;
    this.lastDecision = null;
    this.roundNet = 0;
    this.holeRevealed = false;

    const p1 = this.draw(), up = this.draw(), p2 = this.draw(), hole = this.draw(false);
    this.dealer = [up, hole];
    this.hands = [{ cards: [p1, p2], bet: this.mainBet, doubled: false, fromSplit: false, aceSplit: false, done: false, surrendered: false }];
    this.active = 0;

    for (const id of ['pp', 't213'] as SideBetId[]) this.settleSide(id);

    if (valueOf(up.rank) === 1 && this.settings.rules.peek) { this.phase = 'insurance'; this.emit(); return; }
    this.afterInsurance();
  }

  takeInsurance(take: boolean) {
    if (this.phase !== 'insurance') return;
    const correctTake = this.advisor.insuranceCorrect(this.tc);
    this.record({
      spot: 'Insurance', chosen: take ? 'Take' : 'Decline', best: correctTake ? 'Take' : 'Decline',
      correct: take === correctTake, evCost: 0, index: correctTake ? `Insurance at TC ≥ ${this.advisor.insIdx}` : null, tc: this.tc,
      category: 'insurance', indexSpot: this.advisor.insIdx !== null,
    });
    this.insurance = take ? this.mainBet / 2 : null;
    if (take) { this.stats.insurances++; this.stats.wagered += this.mainBet / 2; }
    this.afterInsurance();
  }

  private dealerHasBJ() {
    const [a, b] = this.dealer;
    const va = valueOf(a.rank), vb = valueOf(b.rank);
    return (va === 1 && vb === 10) || (va === 10 && vb === 1);
  }

  private isNatural(h: Hand) {
    return !h.fromSplit && h.cards.length === 2 && handInfo(h.cards.map((c) => valueOf(c.rank))).eff === 21;
  }

  private afterInsurance() {
    const R = this.settings.rules;
    const upV = valueOf(this.dealer[0].rank);
    const peeked = R.peek && (upV === 1 || upV === 10);
    if (peeked && this.dealerHasBJ()) { this.finish(); return; }
    if (this.isNatural(this.hands[0])) { this.hands[0].done = true; this.finish(); return; }
    this.phase = 'player';
    this.emit();
  }

  act(action: ActionCode) {
    const h = this.activeHand, lg = this.legal();
    if (!h || !lg || !this.up) return;
    const ok = action === ACT.HIT ? lg.hit : action === ACT.STAND ? lg.stand : action === ACT.DOUBLE ? lg.double : action === ACT.SPLIT ? lg.split : lg.surrender;
    if (!ok) return;

    // Grade before acting.
    const best = this.correctPlay(h);
    const vals = best.vals;
    const cost = Number.isFinite(vals[best.action]) && Number.isFinite(vals[action]) ? Math.max(0, vals[best.action] - vals[action]) : 0;
    this.record({
      spot: this.advisor.describe(this.advHand(h), valueOf(this.up.rank)),
      chosen: ACT_NAMES[action], best: ACT_NAMES[best.action],
      correct: action === best.action, evCost: action === best.action ? 0 : cost,
      index: best.index, tc: this.tc, category: best.kind, indexSpot: best.indexSpot,
    });

    switch (action) {
      case ACT.HIT: {
        h.cards.push(this.draw());
        const t = handInfo(h.cards.map((c) => valueOf(c.rank))).eff;
        if (t >= 21) h.done = true;
        break;
      }
      case ACT.STAND: h.done = true; break;
      case ACT.DOUBLE: this.stats.wagered += h.bet; this.stats.doubles++; h.bet *= 2; h.doubled = true; h.cards.push(this.draw()); h.done = true; break;
      case ACT.SURRENDER: h.surrendered = true; h.done = true; break;
      case ACT.SPLIT: {
        const [a, b] = h.cards;
        const aces = a.rank === 1;
        const mk = (c: Card): Hand => ({ cards: [c], bet: this.mainBet, doubled: false, fromSplit: true, aceSplit: aces, done: false, surrendered: false });
        this.stats.wagered += this.mainBet; this.stats.splits++;
        this.hands.splice(this.active, 1, mk(a), mk(b));
        break;
      }
    }
    this.advance();
  }

  /** Move to the next live hand, dealing second cards to split hands as they come up. */
  private advance() {
    while (this.active < this.hands.length) {
      const h = this.hands[this.active];
      if (h.cards.length === 1) h.cards.push(this.draw());
      if (!h.done) {
        const lg = this.legal()!;
        const t = handInfo(h.cards.map((c) => valueOf(c.rank))).eff;
        if (lg.forced || t === 21) h.done = true;
      }
      if (!h.done) { this.emit(); return; }
      this.active++;
    }
    this.finish();
  }

  /** Dealer reveals and draws (if needed); everything settles. */
  private finish() {
    const R = this.settings.rules;
    this.phase = 'settled';
    this.holeRevealed = true;
    this.see(this.dealer[1]);
    const dealerBJ = this.dealerHasBJ();
    const bust = (h: Hand) => handInfo(h.cards.map((c) => valueOf(c.rank))).eff > 21;
    const live = this.hands.some((h) => !h.surrendered && !bust(h) && !this.isNatural(h));
    if (!dealerBJ && live) {
      for (;;) {
        const { eff, soft } = handInfo(this.dealer.map((c) => valueOf(c.rank)));
        if (eff > 17 || (eff === 17 && !(soft && R.h17))) break;
        this.dealer.push(this.draw());
      }
    }
    const d = handInfo(this.dealer.map((c) => valueOf(c.rank))).eff;

    let net = 0;
    for (const h of this.hands) {
      const t = handInfo(h.cards.map((c) => valueOf(c.rank))).eff;
      if (h.surrendered) { h.outcome = 'surrender'; h.net = -h.bet / 2; }
      else if (this.isNatural(h)) {
        if (dealerBJ) { h.outcome = 'push'; h.net = 0; }
        else { h.outcome = 'blackjack'; h.net = h.bet * R.bjPay; }
      } else if (t > 21) { h.outcome = 'bust'; h.net = -h.bet; }
      else if (dealerBJ) {
        // No-hole-card games with "original bets only" refund doubles and splits.
        h.outcome = 'lose';
        h.net = !R.peek && R.obo ? (h === this.hands[0] ? -this.mainBet : 0) : -h.bet;
      } else if (d > 21 || t > d) { h.outcome = 'win'; h.net = h.bet; }
      else if (t === d) { h.outcome = 'push'; h.net = 0; }
      else { h.outcome = 'lose'; h.net = -h.bet; }
      net += h.net;
      this.stats.hands++;
      if (h.outcome === 'blackjack') { this.stats.blackjacks++; this.stats.wins++; }
      else if (h.outcome === 'win') this.stats.wins++;
      else if (h.outcome === 'push') this.stats.pushes++;
      else if (h.outcome === 'bust') { this.stats.busts++; this.stats.losses++; }
      else if (h.outcome === 'surrender') this.stats.surrenders++;
      else this.stats.losses++;
    }
    if (this.insurance) net += dealerBJ ? this.insurance * 2 : -this.insurance;
    this.settleSide('ll');

    this.roundNet += net;
    this.stats.net += net;
    this.stats.rounds++;
    this.bankroll += this.roundNet;

    // Expected result given the count at the deal, minus what this round's mistakes cost.
    const rs = this.roundStart;
    const mistakes = this.stats.evLost - (this.rounds.at(-1)?.errorCost ?? 0);
    this.rounds.push({
      n: this.stats.rounds, t: this.elapsed(), bet: rs.bet, sideStake: rs.sideStake, tc: rs.tc,
      net: this.roundNet, bankroll: this.bankroll, errorCost: this.stats.evLost,
      ev: rs.bet * (this.baseEdge + EDGE_PER_TC * rs.tc) + rs.sideEV - mistakes,
      variance: (MAIN_SD * rs.bet) ** 2 + rs.sideVar,
    });
    if (this.rounds.length > MAX_ROUNDS) this.rounds.shift();
    this.emit();
  }

  private settleSide(id: SideBetId) {
    const stake = this.sideStakes[id];
    if (!stake) return;
    const res = settleSideBet(id, this.settings.pays[id], [this.hands[0].cards[0], this.hands[0].cards[1]], this.dealer[0], this.dealerHasBJ());
    this.sideResults[id] = { ...res, stake, evBefore: this.sideEVBefore[id] };
    this.roundNet += res.net * stake;
    this.stats.sideNet += res.net * stake;
    this.stats.sideStaked += stake;
    if (res.key) this.stats.sideWins++;
  }

  private record(d: Decision) {
    this.lastDecision = d;
    this.log.unshift(d);
    if (this.log.length > 50) this.log.pop();
    this.stats.decisions++;
    if (d.correct) this.stats.correct++;
    this.stats.evLost += d.evCost * this.mainBet;
    const tally = (t: Tally) => { t.n++; if (d.correct) t.ok++; };
    tally(this.stats.byCategory[d.category]);
    if (d.indexSpot) tally(this.stats.byCategory.index);
  }
}

export const sideBetName = (id: SideBetId) => SIDE_BETS[id].name;
