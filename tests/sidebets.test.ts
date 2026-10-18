import { describe, expect, it } from 'vitest';
import { Shoe, freshComposition, makeRng, type Card } from '../src/engine/cards';
import {
  SIDE_BETS, deriveCount, effectsOfRemoval, evaluate, settleSideBet, sideBetSD, type SideBetId,
} from '../src/engine/sidebets';

const preset = (id: SideBetId, i = 0) => SIDE_BETS[id].presets[i].pays;

describe('exact side-bet math', () => {
  it('Perfect Pairs 25/12/6, six decks: published 6.11% house edge', () => {
    const e = evaluate('pp', freshComposition(6), preset('pp'));
    expect(e.ev).toBeCloseTo(-0.0611, 4);
  });

  it('probabilities sum to one for every bet and deck count', () => {
    for (const id of ['pp', 't213', 'll'] as SideBetId[]) {
      for (const d of [1, 2, 6, 8]) {
        const e = evaluate(id, freshComposition(d), preset(id));
        const total = e.pLose + e.outcomes.reduce((a, o) => a + o.prob, 0);
        expect(total).toBeCloseTo(1, 12);
        expect(e.pLose).toBeGreaterThan(0);
      }
    }
  });

  it('21+3 single-deck outcome counts match hand enumeration of C(52,3)', () => {
    const e = evaluate('t213', freshComposition(1), preset('t213'));
    const n = 22100;
    const count = (k: string) => Math.round(e.outcomes.find((o) => o.key === k)!.prob * n);
    expect(count('suitedTrips')).toBe(0);
    expect(count('straightFlush')).toBe(48); // 12 straights x 4 suits
    expect(count('trips')).toBe(52); // 13 x C(4,3)
    expect(count('straight')).toBe(12 * 64 - 48);
    expect(count('flush')).toBe(4 * 286 - 48);
  });
});

// Deal real rounds from a shuffled shoe and settle them; the average must match the exact EV.
function monteCarlo(id: SideBetId, decks: number, rounds: number, seed: number) {
  const pays = preset(id);
  const rng = makeRng(seed);
  const shoe = new Shoe(decks, 1, rng);
  let sum = 0;
  for (let i = 0; i < rounds; i++) {
    shoe.shuffle();
    const p: [Card, Card] = [shoe.draw(), shoe.draw()];
    const up = shoe.draw();
    const hole = shoe.draw();
    const v = (c: Card) => (c.rank > 10 ? 10 : c.rank);
    const dealerBj = (v(up) === 1 && v(hole) === 10) || (v(up) === 10 && v(hole) === 1);
    sum += settleSideBet(id, pays, p, up, dealerBj).net;
  }
  return sum / rounds;
}

describe('settlement agrees with the exact calculator', () => {
  for (const id of ['pp', 't213', 'll'] as SideBetId[]) {
    it(`${SIDE_BETS[id].name}: Monte Carlo within 4 standard errors`, () => {
      const rounds = 400_000;
      const e = evaluate(id, freshComposition(6), preset(id));
      const mc = monteCarlo(id, 6, rounds, 7 + id.length);
      const se = sideBetSD(e) / Math.sqrt(rounds);
      expect(Math.abs(mc - e.ev)).toBeLessThan(4 * se);
    });
  }
});

describe('derived counts', () => {
  it('Perfect Pairs has no useful linear count (ranks are symmetric)', () => {
    const comp = freshComposition(6);
    const d = deriveCount(effectsOfRemoval('pp', comp, preset('pp')));
    expect(d.countable).toBe(false);
  });

  it('Lucky Ladies count values tens most highly', () => {
    const comp = freshComposition(6);
    const eor = effectsOfRemoval('ll', comp, preset('ll'));
    const d = deriveCount(eor, 2);
    expect(d.countable).toBe(true);
    // Removing small cards makes 20s more likely: positive tags; removing tens hurts.
    expect(d.tags[10]).toBeLessThan(0);
    expect(d.tags[5]).toBeGreaterThan(0);
  });
});

import { runSideCountSim } from '../src/engine/sidecountSim';

describe('side-count simulator', () => {
  it('21+3 Classic 9:1, six decks: commonly published 3.24% house edge', () => {
    expect(evaluate('t213', freshComposition(6), preset('t213', 1)).ev).toBeCloseTo(-0.0324, 4);
  });

  it('average exact EV over dealt rounds stays near the fresh-shoe EV', () => {
    const pays = preset('ll');
    const { tags, deckSum } = deriveCount(effectsOfRemoval('ll', freshComposition(6), pays), 2);
    expect(deckSum).toBe(0);
    const r = runSideCountSim({ bet: 'll', pays, decks: 6, penetration: 0.8, seats: 3, tags: Array.from(tags), shoes: 4000, seed: 3 });
    expect(Math.abs(r.baseEV - evaluate('ll', freshComposition(6), pays).ev)).toBeLessThan(0.01);
    // A ten-heavy count makes Lucky Ladies better at high counts.
    const hi = r.bins.filter((b) => b.tc >= 4 && b.rounds > 100);
    const lo = r.bins.filter((b) => b.tc <= -2 && b.rounds > 100);
    expect(hi.length).toBeGreaterThan(0);
    expect(lo.length).toBeGreaterThan(0);
    expect(Math.min(...hi.map((b) => b.meanEV))).toBeGreaterThan(Math.max(...lo.map((b) => b.meanEV)));
    expect(r.perfectGainPer100).toBeGreaterThanOrEqual(r.gainPer100);
  });
});
