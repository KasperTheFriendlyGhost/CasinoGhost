// Generates total-dependent strategy tables for ANY rule set from the EV engine.
//
// Tables are Uint8Array(22*11) indexed [total*11 + upcard] (upcard 1=Ace..10).
//   initial: first two cards of a fresh hand (hard / soft / pair)
//   split:   first two cards of a hand created by a split
//   multi:   3+ cards (hit/stand only)
// Each table also has an `alt` twin holding the 2nd-best legal action
// (used to model strategy mistakes) and `fb` (best action excluding double/surrender,
// used for display e.g. "Ds"/"Dh").
import { ACT } from '../core/constants.js';
import { actionValues, bestAction, freshCounts, dealerDist, solveDP } from './engine.js';

const SZ = 22 * 11;
const mk = () => new Uint8Array(SZ);
const idx = (t, u) => t * 11 + u;

function emptyCtx() {
  return { hard: mk(), soft: mk(), pair: mk(), hardAlt: mk(), softAlt: mk(), pairAlt: mk(),
    hardFb: mk(), softFb: mk(), pairFb: mk() };
}

/** Weighted-average action values for a "cell". cell = {kind:'hard'|'soft'|'pair', key}. */
export function evalCell(rules, ctx, kind, key, up, base) {
  const acc = new Float64Array(5);
  const ok = new Uint8Array(5);
  let wsum = 0;
  const N0 = base.reduce((a, b, i) => (i ? a + b : a), 0);
  const rem = Float64Array.from(base);
  rem[up] -= 1;
  const combos = [];
  if (kind === 'pair') combos.push([key, key, 1]);
  else if (kind === 'soft') combos.push([1, key - 11, 1]);
  else {
    for (let a = 2; a <= 10; a++) {
      const b = key - a;
      if (b < a || b > 10 || a === b) continue; // unordered, non-pair, no aces
      combos.push([a, b, 2]);
    }
  }
  for (const [a, b, mult] of combos) {
    const n1 = rem[a], n2 = rem[b] - (a === b ? 1 : 0);
    if (n1 <= 0 || n2 <= 0) continue;
    const w = mult * n1 * n2;
    rem[a] -= 1; rem[b] -= 1;
    const vals = actionValues(up, a, b, rem, rules, ctx);
    rem[a] += 1; rem[b] += 1;
    for (let i = 0; i < 5; i++) if (!Number.isNaN(vals[i])) { acc[i] += w * vals[i]; ok[i] = 1; }
    wsum += w;
  }
  void N0;
  const vals = new Float64Array(5).fill(NaN);
  for (let i = 0; i < 5; i++) if (ok[i]) vals[i] = acc[i] / wsum;
  return vals;
}

function cellActions(vals, kind) {
  const best = bestAction(vals);
  const alt = bestAction(vals, [best]);
  const fb = bestAction(vals, [ACT.DOUBLE, ACT.SURRENDER]);
  void kind;
  return { best, alt: alt < 0 ? best : alt, fb };
}

/** Build the three table sets for given rules and (optionally) a custom composition. */
export function buildStrategy(rules, base = freshCounts(rules.decks)) {
  const out = { initial: emptyCtx(), split: emptyCtx(), multi: { hard: mk(), soft: mk(), hardAlt: mk(), softAlt: mk() } };
  for (const ctx of ['initial', 'split']) {
    const T = out[ctx];
    for (let u = 1; u <= 10; u++) {
      for (let t = 5; t <= 21; t++) put(T, 'hard', t, u, evalCell(rules, ctx, 'hard', t, u, base));
      for (let t = 13; t <= 20; t++) put(T, 'soft', t, u, evalCell(rules, ctx, 'soft', t, u, base));
      for (let r = 1; r <= 10; r++) {
        const vals = evalCell(rules, ctx, 'pair', r, u, base);
        put(T, 'pair', r, u, vals);
        // A,A unsplit play stored as soft 12 (no split option) for the fallback path
        if (r === 1) { const v2 = Float64Array.from(vals); v2[ACT.SPLIT] = NaN; put(T, 'soft', 12, u, v2); }
        // fallback for pairs that can't be split: hard 2r (r>1) played as non-pair total
      }
      // hard 4 (2,2) / 2-card hard totals below 5 only exist as pairs; mirror for lookup safety
      const v4 = evalCell(rules, ctx, 'pair', 2, u, base); v4[ACT.SPLIT] = NaN; put(T, 'hard', 4, u, v4);
    }
  }
  // multi-card tables: hit/stand with total-dependent decisions
  for (let u = 1; u <= 10; u++) {
    const rem = Float64Array.from(base); rem[u] -= 1;
    const { dist } = dealerDist(u, rem, rules.h17);
    const dp = solveDP(rem, dist);
    for (let t = 4; t <= 21; t++) {
      for (let a = 0; a < 2; a++) {
        const eff = a && t + 10 <= 21 ? t + 10 : t;
        const hit = dp.H[a][t] > dp.S[eff] + 1e-9;
        const tab = a ? out.multi.soft : out.multi.hard;
        const tabAlt = a ? out.multi.softAlt : out.multi.hardAlt;
        const key = a ? eff : t;
        if (a && eff === t) continue;
        tab[idx(key, u)] = hit ? ACT.HIT : ACT.STAND;
        tabAlt[idx(key, u)] = hit ? ACT.STAND : ACT.HIT;
      }
    }
  }
  return out;
}

function put(T, kind, key, u, vals) {
  const { best, alt, fb } = cellActions(vals, kind);
  const i = idx(key, u);
  T[kind][i] = best; T[kind + 'Alt'][i] = alt; T[kind + 'Fb'][i] = fb;
}

/** Display code for a table cell: S H D Ds P R Rh Rs Rp etc. */
export function cellCode(T, kind, key, u) {
  const i = idx(key, u);
  const b = T[kind][i], fb = T[kind + 'Fb'][i];
  const L = { [ACT.STAND]: 'S', [ACT.HIT]: 'H', [ACT.SPLIT]: 'P' };
  if (b === ACT.DOUBLE) return fb === ACT.STAND ? 'Ds' : 'D';
  if (b === ACT.SURRENDER) return fb === ACT.STAND ? 'Rs' : fb === ACT.SPLIT ? 'Rp' : 'R';
  return L[b];
}
export { idx as tableIndex };
