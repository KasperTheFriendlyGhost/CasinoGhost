// Exact-ish expected-value engine for a single blackjack hand against a dealer
// upcard given a *remaining-card composition*.
//
// Model notes (documented approximations):
//  * The dealer's draw distribution is computed EXACTLY with card removal
//    (memoised on the multiset of cards drawn).
//  * The player's FUTURE hit cards are drawn from the composition at decision
//    time (no further depletion). Exact for infinite decks, tiny error for 2+ decks.
//  * Re-splitting is modelled by recursion to the maxHands limit.
//  * Values are in units of the original bet and are UNCONDITIONAL on the dealer
//    having a natural (peek/no-peek handled, see actionValues()).
import { ACT } from '../core/constants.js';
import { canDouble } from '../core/rules.js';

const POW = [0]; for (let v = 1; v <= 10; v++) POW[v] = Math.pow(17, v - 1);
const BUST_VEC = Float64Array.from([0, 0, 0, 0, 0, 1]);
const STAND_VECS = [0, 1, 2, 3, 4].map((i) => { const a = new Float64Array(6); a[i] = 1; return a; });

export function sum(counts) { let n = 0; for (let v = 1; v <= 10; v++) n += counts[v]; return n; }

/** Composition for `decks` decks (fresh shoe). */
export function freshCounts(decks) {
  const c = new Float64Array(11);
  for (let v = 1; v <= 9; v++) c[v] = 4 * decks;
  c[10] = 16 * decks;
  return c;
}

/**
 * Mean-field Hi-Lo composition: `dLeft` decks remaining at true count `tc`.
 * Derivation: remaining count = -RC = -tc*dLeft; scaling every rank by (1 - tag*tc/40)
 * satisfies it exactly (40 = sum over the 10 counted ranks of 4 cards).
 */
export function countsAtTC(tc, dLeft, tags) {
  const c = new Float64Array(11);
  const lam = tc / 40;
  for (let v = 1; v <= 10; v++) c[v] = (v === 10 ? 16 : 4) * dLeft * (1 - tags[v] * lam);
  return c;
}

/**
 * Dealer outcome distribution. `counts` = cards remaining AFTER removing upcard
 * (and any known player cards). Returns { dist: Float64Array(6) [17..21,bust]
 * conditional on dealer NOT having a natural, pBJ }.
 */
export function dealerDist(up, counts, h17) {
  const memo = new Map();
  const cnt = Float64Array.from(counts);
  function rec(total, hasAce, N, key) {
    const eff = hasAce && total + 10 <= 21 ? total + 10 : total;
    if (eff > 21) return BUST_VEC;
    const soft = eff !== total;
    if (eff >= 18 || (eff === 17 && !(soft && h17))) return STAND_VECS[eff - 17];
    const hit = memo.get(key);
    if (hit) return hit;
    const out = new Float64Array(6);
    for (let v = 1; v <= 10; v++) {
      const c = cnt[v];
      if (c <= 0) continue;
      const p = c / N;
      cnt[v] = c - 1;
      const sub = rec(total + v, hasAce || v === 1, N - 1, key + POW[v]);
      cnt[v] = c;
      for (let i = 0; i < 6; i++) out[i] += p * sub[i];
    }
    memo.set(key, out);
    return out;
  }
  const N = sum(cnt);
  const dist = new Float64Array(6);
  let pBJ = 0;
  for (let h = 1; h <= 10; h++) {
    const c = cnt[h];
    if (c <= 0) continue;
    const p = c / N;
    if ((up === 1 && h === 10) || (up === 10 && h === 1)) { pBJ += p; continue; }
    cnt[h] = c - 1;
    const sub = rec(up + h, up === 1 || h === 1, N - 1, POW[h]);
    cnt[h] = c;
    for (let i = 0; i < 6; i++) dist[i] += p * sub[i];
  }
  const keep = 1 - pBJ;
  if (keep > 1e-12) for (let i = 0; i < 6; i++) dist[i] /= keep;
  return { dist, pBJ };
}

/** EV of standing with effective total `eff` against dealer distribution. */
export function standEV(eff, dd) {
  if (eff > 21) return -1;
  let ev = dd[5];
  for (let i = 0; i < 5; i++) {
    const d = 17 + i;
    if (eff > d) ev += dd[i]; else if (eff < d) ev -= dd[i];
  }
  return ev;
}

/**
 * Hit/stand dynamic program with fixed draw probabilities.
 * Returns S[eff] (stand EV), V[a][t] best of hit/stand, H[a][t] hit EV where
 * t = hard total (aces=1), a = has ace.
 */
export function solveDP(counts, dd) {
  const N = sum(counts);
  const S = new Float64Array(22);
  for (let e = 2; e <= 21; e++) S[e] = standEV(e, dd);
  const V = [new Float64Array(22), new Float64Array(22)];
  const H = [new Float64Array(22), new Float64Array(22)];
  const p = new Float64Array(11);
  for (let v = 1; v <= 10; v++) p[v] = counts[v] / N;
  for (let t = 21; t >= 2; t--) {
    for (let a = 0; a < 2; a++) {
      const eff = a && t + 10 <= 21 ? t + 10 : t;
      let h = 0;
      for (let v = 1; v <= 10; v++) {
        const nt = t + v;
        h += nt > 21 ? -p[v] : p[v] * V[a || v === 1 ? 1 : 0][nt];
      }
      H[a][t] = h;
      V[a][t] = Math.max(S[eff], h);
    }
  }
  return { S, V, H, p, N };
}

/**
 * Evaluate every action for the hand (c1,c2) vs `up`.
 * counts must already exclude up, c1, c2.
 * ctx: 'initial' or 'split' (hand created by splitting: no surrender, double needs DAS).
 * Returns Float64Array(5) indexed by ACT (NaN = illegal).
 */
export function actionValues(up, c1, c2, counts, rules, ctx) {
  const vals = new Float64Array(5).fill(NaN);
  const { dist: dd, pBJ } = dealerDist(up, counts, rules.h17);
  const dp = solveDP(counts, dd);
  const pb = up === 1 || up === 10 ? pBJ : 0;
  const peek = rules.peek;
  // unconditional value from value conditional on no dealer natural
  const unc = (evc, risk) => (1 - pb) * evc - pb * (peek ? 1 : risk);
  const oboRisk = (r) => (rules.obo ? 1 : r);

  const t = c1 + c2;
  const ha = c1 === 1 || c2 === 1 ? 1 : 0;
  const eff = ha && t + 10 <= 21 ? t + 10 : t;
  const soft = eff !== t;

  vals[ACT.STAND] = unc(dp.S[eff], 1);
  vals[ACT.HIT] = unc(dp.H[ha][t], 1);

  const ddAllowed = (ctx === 'initial' || rules.das) && canDouble(rules, t, soft);
  if (ddAllowed) {
    let d = 0;
    for (let v = 1; v <= 10; v++) {
      const nt = t + v;
      const nh = ha || v === 1;
      const ne = nh && nt + 10 <= 21 ? nt + 10 : nt;
      d += dp.p[v] * (nt > 21 ? -1 : dp.S[ne]);
    }
    vals[ACT.DOUBLE] = unc(2 * d, oboRisk(2));
  }

  if (ctx === 'initial' && rules.surrender !== 'none') {
    vals[ACT.SURRENDER] = rules.surrender === 'late' && peek ? (1 - pb) * -0.5 - pb : -0.5;
  }

  const splitOK = c1 === c2 && rules.maxHands > 2 || (c1 === c2 && ctx === 'initial' && rules.maxHands >= 2);
  if (c1 === c2 && (ctx === 'initial' ? rules.maxHands >= 2 : rules.maxHands > 2)) {
    vals[ACT.SPLIT] = unc(splitValue(c1, rules, dp, ctx), oboRisk(2));
  }
  void splitOK;
  return vals;
}

/** EV (conditional on no dealer natural) of splitting pair c, both hands together. */
function splitValue(c, rules, dp, ctx) {
  const { S, H, V, p } = dp;
  const maxResplits = Math.max(0, rules.maxHands - 2);
  // play value for hand (c, j) without further splitting
  const play = (j) => {
    const t = c + j;
    const ha = c === 1 || j === 1 ? 1 : 0;
    const eff = ha && t + 10 <= 21 ? t + 10 : t;
    if (c === 1 && !rules.hitSplitAces) return S[eff];
    let best = Math.max(S[eff], H[ha][t]);
    if (rules.das && canDouble(rules, t, eff !== t)) {
      let d = 0;
      for (let v = 1; v <= 10; v++) {
        const nt = t + v;
        const nh = ha || v === 1;
        const ne = nh && nt + 10 <= 21 ? nt + 10 : nt;
        d += p[v] * (nt > 21 ? -1 : S[ne]);
      }
      best = Math.max(best, 2 * d);
    }
    return best;
  };
  const canResplit = c === 1 ? rules.resplitAces : true;
  let T = null; // value of the position with r resplits available
  for (let r = 0; r <= maxResplits; r++) {
    let acc = 0;
    for (let j = 1; j <= 10; j++) {
      let w = play(j);
      if (j === c && r > 0 && canResplit && T !== null) w = Math.max(w, T);
      acc += p[j] * w;
    }
    T = 2 * acc;
  }
  void ctx; void V;
  return T;
}

export const EPS = 1e-9;
/** Best legal action by value; ties break toward the simpler action. */
export function bestAction(vals, exclude = []) {
  let best = -1, bv = -Infinity;
  const order = [ACT.STAND, ACT.HIT, ACT.DOUBLE, ACT.SPLIT, ACT.SURRENDER];
  for (const a of order) {
    if (exclude.includes(a) || Number.isNaN(vals[a])) continue;
    if (vals[a] > bv + EPS) { bv = vals[a]; best = a; }
  }
  return best;
}
