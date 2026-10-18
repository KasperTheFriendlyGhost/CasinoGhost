// Hi-Lo count-based strategy deviations ("indices").
//
// Two sources:
//  1. PUBLISHED: Illustrious 18 + Fab 4 (Schlesinger / Wong; cross-checked against
//     Wizard of Odds Hi-Lo page and the engine-derived values -- see docs/STRATEGY_SOURCES.md).
//     Index convention: TC (floored) >= index -> 'above' action, else 'below'.
//  2. ENGINE-DERIVED: indices computed from the EV engine for the user's exact rules
//     using a mean-field Hi-Lo composition (countsAtTC). Covers many more plays.
import { ACT, HI_LO } from '../core/constants.js';
import { buildStrategy, evalCell, tableIndex } from './basicStrategy.js';
import { countsAtTC, bestAction } from './engine.js';

const A = ACT;
// baseSide: which of above/below the *basic strategy* normally is (used to reject entries
// that don't apply under the user's rules).
const P = (set, kind, key, up, idx, above, below, baseSide = 'below', h17) =>
  ({ set, kind, key, up, idx, above, below, baseSide, source: 'published', ...(h17 === undefined ? {} : { h17 }) });

export const PUBLISHED = [
  P('i18', 'hard', 16, 10, 0, A.STAND, A.HIT),
  P('i18', 'hard', 15, 10, 4, A.STAND, A.HIT),
  P('i18', 'pair', 10, 5, 5, A.SPLIT, A.STAND),
  P('i18', 'pair', 10, 6, 4, A.SPLIT, A.STAND),
  P('i18', 'hard', 10, 10, 4, A.DOUBLE, A.HIT),
  P('i18', 'hard', 12, 3, 2, A.STAND, A.HIT),
  P('i18', 'hard', 12, 2, 3, A.STAND, A.HIT),
  P('i18', 'hard', 11, 1, 1, A.DOUBLE, A.HIT),
  P('i18', 'hard', 9, 2, 1, A.DOUBLE, A.HIT),
  P('i18', 'hard', 10, 1, 4, A.DOUBLE, A.HIT),
  P('i18', 'hard', 9, 7, 3, A.DOUBLE, A.HIT),
  P('i18', 'hard', 16, 9, 5, A.STAND, A.HIT),
  P('i18', 'hard', 13, 2, -1, A.STAND, A.HIT, 'above'),
  P('i18', 'hard', 12, 4, 0, A.STAND, A.HIT, 'above'),
  P('i18', 'hard', 12, 5, -2, A.STAND, A.HIT, 'above'),
  P('i18', 'hard', 12, 6, -1, A.STAND, A.HIT, 'above'),
  P('i18', 'hard', 13, 3, -2, A.STAND, A.HIT, 'above'),
  // Fab 4 (late surrender games)
  P('fab4', 'hard', 14, 10, 3, A.SURRENDER, A.HIT),
  P('fab4', 'hard', 15, 10, 0, A.SURRENDER, A.HIT, 'above'),
  P('fab4', 'hard', 15, 9, 2, A.SURRENDER, A.HIT),
  P('fab4', 'hard', 15, 1, 1, A.SURRENDER, A.HIT),
];

// Extra published plays (set 'ext') from a Hi-Lo H17 / late-surrender index chart. Entries tagged
// h17 only apply to (and override the generic I18 value in) games with that dealer rule.
export const EXTRA = [
  P('ext', 'pair', 10, 4, 6, A.SPLIT, A.STAND),
  P('ext', 'soft', 19, 4, 3, A.DOUBLE, A.STAND),   // A,8 v4
  P('ext', 'soft', 19, 5, 1, A.DOUBLE, A.STAND),   // A,8 v5
  P('ext', 'soft', 19, 6, 0, A.DOUBLE, A.STAND, 'below', false), // A,8 v6 (basic strategy stands only under S17)
  P('ext', 'soft', 17, 2, 1, A.DOUBLE, A.HIT),     // A,6 v2
  P('ext', 'hard', 8, 6, 2, A.DOUBLE, A.HIT),
  { ...P('ext', 'hard', 15, 1, 5, A.STAND, A.HIT), noSur: true },   // 15 vs A stand (games without surrender)
  { ...P('ext', 'hard', 16, 1, 3, A.STAND, A.HIT), noSur: true },   // 16 vs A stand (games without surrender)
  P('ext', 'hard', 16, 8, 4, A.SURRENDER, A.HIT),
  P('ext', 'hard', 16, 9, -1, A.SURRENDER, A.HIT, 'above'),
  // H17-specific values from the same chart
  P('ext', 'hard', 16, 9, 4, A.STAND, A.HIT, 'below', true),
  P('ext', 'hard', 10, 1, 3, A.DOUBLE, A.HIT, 'below', true),
  P('ext', 'hard', 15, 1, -1, A.SURRENDER, A.HIT, 'above', true),
];
export const INSURANCE_INDEX = 3;

export const devKey = (d) => `${d.kind}:${d.key}:${d.up}`;
const UP = (u) => (u === 1 ? 'A' : u);
export function devLabel(d) {
  const nm = d.kind === 'hard' ? `Hard ${d.key}` : d.kind === 'soft' ? `Soft ${d.key}` : `${d.key === 1 ? 'A' : d.key},${d.key === 1 ? 'A' : d.key}`;
  return `${nm} vs ${UP(d.up)}`;
}

const tableOf = (strategy, kind) => strategy.initial[kind];

/** Convert a continuous crossing point to an integer index for a TC rounding mode. */
export function indexFromCrossing(tStar, rounding) {
  if (rounding === 'none') return Math.round(tStar * 10) / 10;
  if (rounding === 'round') return Math.ceil(tStar - 1e-9);
  return Math.ceil(tStar - 0.5 - 1e-9);
}

/** Insurance crossing point t* where P(ten) = 1/3 under the mean-field composition. */
export function insuranceCrossing() {
  const p = (t) => { const c = countsAtTC(t, 3, HI_LO); c[1] -= 1; let n = 0; for (let v = 1; v <= 10; v++) n += c[v]; return c[10] / n; };
  let lo = -20, hi = 30;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (p(m) > 1 / 3) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

/**
 * Derive indices for the given rules from the EV engine.
 * Returns array of deviation objects {kind,key,up,tStar,above,below,baseSide,source:'engine'}.
 */
export function deriveIndices(rules, { range = 10 } = {}) {
  const dLeft = Math.max(0.5, rules.decks / 2);
  const baseAt = (t) => countsAtTC(t, dLeft, HI_LO);
  const byT = new Map();
  for (let t = -range; t <= range; t++) byT.set(t, buildStrategy(rules, baseAt(t)));
  const s0 = byT.get(0);
  const out = [];
  const cells = [];
  for (let u = 1; u <= 10; u++) {
    for (let t = 5; t <= 21; t++) cells.push(['hard', t, u]);
    for (let t = 13; t <= 20; t++) cells.push(['soft', t, u]);
    for (let r = 1; r <= 10; r++) cells.push(['pair', r, u]);
  }
  const refine = (kind, key, up, tFrom, tTo, target) => {
    let a = tFrom, b = tTo;
    for (let i = 0; i < 10; i++) {
      const m = (a + b) / 2;
      const act = bestAction(evalCell(rules, 'initial', kind, key, up, baseAt(m)));
      if (act === target) b = m; else a = m;
    }
    return (a + b) / 2;
  };
  for (const [kind, key, up] of cells) {
    const i = tableIndex(key, up);
    const a0 = tableOf(s0, kind)[i];
    for (const dir of [1, -1]) {
      for (let t = dir; Math.abs(t) <= range; t += dir) {
        const a = tableOf(byT.get(t), kind)[i];
        if (a !== a0) {
          const tStar = refine(kind, key, up, t - dir, t, a);
          if (dir > 0) out.push({ kind, key, up, tStar, above: a, below: a0, baseSide: 'below', source: 'engine' });
          else out.push({ kind, key, up, tStar, above: a0, below: a, baseSide: 'above', source: 'engine' });
          break;
        }
      }
    }
  }
  return out;
}

/** Is a deviation usable under the rules / current basic strategy? */
function usable(d, rules, strategy) {
  if (d.noSur && rules.surrender !== 'none') return false;
  if ((d.above === ACT.SURRENDER || d.below === ACT.SURRENDER) && rules.surrender === 'none') return false;
  const base = tableOf(strategy, d.kind)[tableIndex(d.key, d.up)];
  return d.baseSide === 'below' ? base === d.below : base === d.above;
}

/**
 * Build the active deviation list for the simulator.
 * Returns { list:[{kind,key,up,idx,above,below,label,k,source}], insuranceIdx|null }.
 */
export function compileDeviations(rules, strategy, player, derived) {
  const mode = player.deviations;
  const disabled = new Set(player.disabledDeviations || []);
  const out = { list: [], insuranceIdx: null };
  if (mode === 'none') return out;
  const insOK = rules.peek && !disabled.has('insurance');
  if (insOK) out.insuranceIdx = mode === 'engine' ? indexFromCrossing(insuranceCrossing(), player.tcRounding) : INSURANCE_INDEX;
  if (mode === 'insurance') return out;
  let src;
  if (mode === 'engine') {
    src = (derived || []).map((d) => ({ ...d, idx: indexFromCrossing(d.tStar, player.tcRounding) }));
  } else if (mode === 'full') {
    src = [...PUBLISHED, ...EXTRA];
  } else {
    src = PUBLISHED.filter((d) => mode === 'i18fab4' || d.set === 'i18');
  }
  // rule-tagged entries apply only under matching dealer rule and override generic duplicates
  src = src.filter((d) => d.h17 === undefined || d.h17 === rules.h17);
  const pick = new Map();
  for (const d of src) {
    const id = `${devKey(d)}|${d.baseSide}|${d.above}`;
    const cur = pick.get(id);
    if (!cur || (d.h17 !== undefined && cur.h17 === undefined)) pick.set(id, d);
  }
  for (const d of pick.values()) {
    if (!usable(d, rules, strategy)) continue;
    const k = devKey(d);
    if (disabled.has(k)) continue;
    out.list.push({ ...d, k, label: devLabel(d) });
  }
  return out;
}
