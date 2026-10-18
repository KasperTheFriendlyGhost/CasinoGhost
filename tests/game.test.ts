import { describe, expect, it } from 'vitest';
import { makeRng, valueOf } from '../src/engine/cards';
import { Game } from '../src/engine/game';
import { defaultRules, houseEdge, type Rules } from '../src/engine/strategy';
import { defaultPaytable } from '../src/engine/sidebets';

const pays = { pp: defaultPaytable('pp'), t213: defaultPaytable('t213'), ll: defaultPaytable('ll') };
const HI_LO = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];

function autoplay(rules: Rules, rounds: number, seed: number) {
  const g = new Game({ rules, deviations: 'i18fab4', pays }, makeRng(seed));
  g.setBet(1);
  let seen = 0;
  for (let i = 0; i < rounds; i++) {
    const before = g.shoe.dealt;
    g.deal();
    if (g.justShuffled) seen = 0;
    if (g.phase === 'insurance') g.takeInsurance(g.advisor.insuranceCorrect(g.tc));
    let guard = 0;
    while (g.phase === 'player') {
      g.act(g.advice()!.action);
      if (++guard > 50) throw new Error('stuck ' + JSON.stringify({ hands: g.hands.map((h) => ({ c: h.cards.map((c) => c.rank), d: h.done, s: h.fromSplit, a: h.aceSplit })), active: g.active, adv: g.advice(), lg: g.legal() }));
    }
    expect(g.phase).toBe('settled');
    // Every dealt card was revealed and counted.
    seen += g.shoe.dealt - (g.justShuffled ? 0 : before);
    const all = [...g.dealer, ...g.hands.flatMap((h) => h.cards)];
    expect(all.length).toBe(g.shoe.dealt - (g.justShuffled ? 0 : before));
    void HI_LO;
  }
  return g;
}

describe('game engine', () => {
  it('plays 20,000 perfect-strategy rounds with every decision graded correct', () => {
    const rules = { ...defaultRules(), decks: 6, h17: true, surrender: 'late' };
    const g = autoplay(rules, 20000, 11);
    expect(g.stats.decisions).toBeGreaterThan(15000);
    expect(g.stats.correct).toBe(g.stats.decisions);
    expect(g.stats.evLost).toBe(0);
    // Result should be within a few standard errors of the exact house edge (SD ≈ 1.15/round).
    const edge = houseEdge(rules);
    const se = 1.15 / Math.sqrt(20000);
    expect(Math.abs(g.stats.net / 20000 + edge)).toBeLessThan(5 * se);
  });

  it('running count matches Hi-Lo over everything dealt since the shuffle', () => {
    const rules = { ...defaultRules(), decks: 2, penetration: 0.7 };
    const g = new Game({ rules, deviations: 'none', pays }, makeRng(5));
    g.setBet(1);
    const dealt: number[] = [];
    for (let i = 0; i < 300; i++) {
      g.deal();
      if (g.justShuffled) dealt.length = 0;
      if (g.phase === 'insurance') g.takeInsurance(false);
      while (g.phase === 'player') g.act(g.advice()!.action);
      for (const c of [...g.dealer, ...g.hands.flatMap((h) => h.cards)]) dealt.push(valueOf(c.rank));
      expect(g.rc).toBe(dealt.reduce((a, v) => a + HI_LO[v], 0));
    }
  });

  it('flags a deliberate mistake with a positive EV cost', () => {
    const g = new Game({ rules: defaultRules(), deviations: 'none', pays }, makeRng(9));
    g.setBet(10);
    for (let i = 0; i < 500; i++) {
      g.deal();
      if (g.phase === 'insurance') g.takeInsurance(false);
      if (g.phase !== 'player') continue;
      const best = g.advice()!.action;
      const lg = g.legal()!;
      const wrong = best === 1 ? 0 : 1; // swap hit/stand
      if ((wrong === 1 && lg.hit) || wrong === 0) {
        g.act(wrong as 0 | 1);
        expect(g.lastDecision!.correct).toBe(false);
        expect(g.lastDecision!.evCost).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('no mistake recorded');
  });
});
