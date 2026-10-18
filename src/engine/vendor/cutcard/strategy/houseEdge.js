// Exact expected value of one round (per unit bet) when the player follows the
// given strategy tables, from a given shoe composition. Negative = house edge.
import { ACT } from '../core/constants.js';
import { actionValues, freshCounts, sum, dealerDist } from './engine.js';
import { tableIndex } from './basicStrategy.js';

export function strategyEV(rules, strategy, base = freshCounts(rules.decks)) {
  const T = strategy.initial;
  const N = sum(base);
  let total = 0;
  for (let up = 1; up <= 10; up++) {
    const pUp = base[up] / N;
    if (pUp <= 0) continue;
    const r1 = Float64Array.from(base); r1[up] -= 1;
    const N1 = N - 1;
    let evUp = 0;
    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) {
        const n1 = r1[a], n2 = r1[b] - (a === b ? 1 : 0);
        if (n1 <= 0 || n2 <= 0) continue;
        const p = (a === b ? 1 : 2) * (n1 / N1) * (n2 / (N1 - 1));
        const r2 = Float64Array.from(r1); r2[a] -= 1; r2[b] -= 1;
        let ev;
        if (a + b === 11 && (a === 1 || b === 1)) {
          // player natural
          let pb = 0;
          if (up === 1 || up === 10) pb = dealerDist(up, r2, rules.h17).pBJ;
          ev = (1 - pb) * rules.bjPay;
        } else {
          const vals = actionValues(up, a, b, r2, rules, 'initial');
          const t = a + b, soft = (a === 1 || b === 1) && t + 10 <= 21;
          let act;
          if (a === b) act = T.pair[tableIndex(a, up)];
          else if (soft) act = T.soft[tableIndex(t + 10, up)];
          else act = T.hard[tableIndex(t, up)];
          if (Number.isNaN(vals[act])) act = ACT.HIT;
          ev = vals[act];
        }
        evUp += p * ev;
      }
    }
    total += pUp * evUp;
  }
  return total;
}
