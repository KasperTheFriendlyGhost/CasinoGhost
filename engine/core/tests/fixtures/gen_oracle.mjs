// Generates cutcard_oracle.json from the original JavaScript engine (src/engine/vendor/cutcard),
// so the Rust port can be checked against it exactly. Run: node gen_oracle.mjs
import { writeFileSync } from 'node:fs';
import { defaultRules } from '../../../../src/engine/vendor/cutcard/core/rules.js';
import { buildStrategy, cellCode } from '../../../../src/engine/vendor/cutcard/strategy/basicStrategy.js';
import { strategyEV } from '../../../../src/engine/vendor/cutcard/strategy/houseEdge.js';

const variants = [
  {},
  { decks: 8 }, { decks: 2 }, { decks: 1, maxHands: 2, das: false },
  { h17: true }, { surrender: 'late' }, { h17: true, surrender: 'late' },
  { bjPay: 1.2 }, { das: false }, { doubleOn: '9-11' }, { doubleOn: '10-11', das: false },
  { peek: false, obo: false }, { peek: false, obo: true },
  { resplitAces: true }, { hitSplitAces: true, resplitAces: true }, { maxHands: 2 },
  { decks: 2, h17: true, surrender: 'late', resplitAces: true },
  { surrender: 'early' },
];
const out = variants.map((v) => {
  const rules = { ...defaultRules(), ...v };
  const s = buildStrategy(rules);
  const T = s.initial;
  const chart = {};
  for (const [kind, from, to] of [['hard', 5, 21], ['soft', 13, 20], ['pair', 1, 10]]) {
    for (let k = from; k <= to; k++) {
      chart[`${kind}:${k}`] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((u) => cellCode(T, kind, k, u)).join(' ');
    }
  }
  const multi = {};
  for (let t = 4; t <= 21; t++) multi[`hard:${t}`] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((u) => s.multi.hard[t * 11 + u]).join(' ');
  for (let t = 13; t <= 21; t++) multi[`soft:${t}`] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((u) => s.multi.soft[t * 11 + u]).join(' ');
  return { rules, ev: strategyEV(rules, s), chart, multi };
});
writeFileSync(new URL('./cutcard_oracle.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`wrote ${out.length} rule sets`);
