// "What should I do here?" oracle for the trainer: basic strategy for the user's rules,
// optional Hi-Lo deviations, legality, and EV cost of mistakes.
import { ACT, HI_LO } from '../core/constants.js';
import { canDouble } from '../core/rules.js';
import { buildStrategy, evalCell } from '../strategy/basicStrategy.js';
import { compileDeviations, deriveIndices, INSURANCE_INDEX } from '../strategy/deviations.js';
import { countsAtTC, freshCounts, dealerDist, solveDP } from '../strategy/engine.js';

export const handInfo = (cards) => {
  let t = 0, ha = false;
  for (const c of cards) { t += c; if (c === 1) ha = true; }
  const eff = ha && t + 10 <= 21 ? t + 10 : t;
  return { total: t, ha, eff, soft: eff !== t };
};
export const upName = (u) => (u === 1 ? 'A' : String(u));

export class Advisor {
  /** devMode: 'none' | 'i18' | 'i18fab4' | 'engine' */
  constructor(rules, devMode = 'none', derived = null) {
    this.R = rules;
    this.S = buildStrategy(rules);
    this.devMode = devMode;
    if (devMode === 'engine' && !derived) derived = deriveIndices(rules);
    this.devs = compileDeviations(rules, this.S, { deviations: devMode, disabledDeviations: [], tcRounding: 'floor' }, derived);
    this.devMap = new Map(this.devs.list.map((d) => [d.k, d]));
    this.insIdx = this.devs.insuranceIdx ?? (devMode === 'none' ? null : INSURANCE_INDEX);
    this.evCache = new Map();
  }

  legal(hand, up, nHands) {
    const R = this.R, n = hand.cards.length, { total, soft } = handInfo(hand.cards);
    const [c1, c2] = hand.cards;
    const canPair = n === 2 && c1 === c2 && nHands < R.maxHands && !(c1 === 1 && hand.fromSplit && !R.resplitAces);
    if (hand.aceSplit && !R.hitSplitAces) {
      const rs = n === 2 && c2 === 1 && R.resplitAces && nHands < R.maxHands;
      return { hit: false, stand: true, double: false, split: rs, surrender: false, forced: !rs };
    }
    return {
      hit: true, stand: true,
      double: n === 2 && (!hand.fromSplit || R.das) && canDouble(R, total, soft),
      split: canPair,
      surrender: n === 2 && !hand.fromSplit && R.surrender !== 'none',
      forced: false,
    };
  }

  /** Cell lookup mirroring the simulator. */
  cell(hand, up, nHands) {
    const R = this.R, n = hand.cards.length, { total, eff, soft } = handInfo(hand.cards);
    const [c1, c2] = hand.cards;
    const lg = this.legal(hand, up, nHands);
    let A, kind, key;
    if (n === 2) {
      const T = hand.fromSplit ? this.S.split : this.S.initial;
      if (lg.split || (c1 === c2 && nHands < R.maxHands && !(c1 === 1 && hand.fromSplit && !R.resplitAces))) { A = T.pair; kind = 'pair'; key = c1; }
      else if (soft) { A = T.soft; kind = 'soft'; key = eff; }
      else { A = T.hard; kind = 'hard'; key = total; }
    } else if (soft) { A = this.S.multi.soft; kind = 'soft'; key = eff; }
    else { A = this.S.multi.hard; kind = 'hard'; key = total; }
    return { A, kind, key, base: A[key * 11 + up], lg };
  }

  /**
   * Correct play. tc = floored true count (only used when deviations are on).
   * Returns { action, base, dev, kind, key, lg } where dev is the deviation that changed the play (or null).
   */
  advise(hand, up, nHands, tc = 0, useDev = false) {
    const c = this.cell(hand, up, nHands);
    const { lg } = c;
    if (lg.forced) return { action: ACT.STAND, base: ACT.STAND, dev: null, ...c };
    let act = c.base, dev = null;
    if (useDev) {
      const d = this.devMap.get(`${c.kind}:${c.key}:${up}`);
      if (d && (c.base === d.above || c.base === d.below)) {
        const want = tc >= d.idx ? d.above : d.below;
        const ok = want === ACT.DOUBLE ? lg.double : want === ACT.SURRENDER ? lg.surrender : want === ACT.SPLIT ? lg.split : true;
        if (ok && want !== act) { act = want; dev = d; }
        else if (ok) dev = { ...d, held: true };
      }
    }
    // never return an illegal action
    const legal = (a) => (a === ACT.DOUBLE ? lg.double : a === ACT.SPLIT ? lg.split : a === ACT.SURRENDER ? lg.surrender : true);
    if (!legal(act)) act = ACT.HIT;
    return { action: act, base: c.base, dev, ...c };
  }

  insuranceCorrect(tc) { return this.insIdx !== null && tc >= this.insIdx; }

  /** Describe a hand like "Hard 16 vs 10". */
  describe(hand, up) {
    const { total, eff, soft } = handInfo(hand.cards);
    const [c1, c2] = hand.cards;
    const pair = hand.cards.length === 2 && c1 === c2;
    const label = pair ? `Pair of ${c1 === 1 ? 'aces' : c1 === 10 ? 'tens' : c1 + 's'}` : soft ? `Soft ${eff}` : `Hard ${total}`;
    return `${label} vs ${upName(up)}`;
  }

  /** EV (units of the bet) of each action for this spot, used to price mistakes. */
  values(hand, up, nHands, tc = 0, useDev = false) {
    const R = this.R, n = hand.cards.length;
    const { total, eff, soft, ha } = handInfo(hand.cards);
    const tcc = useDev ? Math.max(-10, Math.min(10, tc)) : 0;
    const dLeft = Math.max(1, R.decks / 2);
    const key = `${n === 2 ? hand.cards.join(',') : total + (soft ? 's' : 'h')}|${up}|${hand.fromSplit ? 1 : 0}|${tcc}`;
    if (this.evCache.has(key)) return this.evCache.get(key);
    const base = useDev ? countsAtTC(tcc, dLeft, HI_LO) : freshCounts(R.decks);
    let vals;
    if (n === 2) {
      const ctx = hand.fromSplit ? 'split' : 'initial';
      const [c1, c2] = hand.cards;
      const pair = c1 === c2;
      vals = pair ? evalCell(R, ctx, 'pair', c1, up, base) : soft ? evalCell(R, ctx, 'soft', eff, up, base) : evalCell(R, ctx, 'hard', total, up, base);
    } else {
      const rem = Float64Array.from(base); rem[up] -= 1;
      const { dist } = dealerDist(up, rem, R.h17);
      const dp = solveDP(rem, dist);
      vals = new Float64Array(5).fill(NaN);
      vals[ACT.STAND] = dp.S[eff]; vals[ACT.HIT] = dp.H[ha ? 1 : 0][total];
    }
    this.evCache.set(key, vals);
    return vals;
  }
}
