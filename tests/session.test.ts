import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/cards';
import { Game, type RoundRecord } from '../src/engine/game';
import { heat, luck, normCdf, pace } from '../src/engine/session';
import { defaultRules } from '../src/engine/strategy';
import { defaultPaytable } from '../src/engine/sidebets';

const pays = { pp: defaultPaytable('pp'), t213: defaultPaytable('t213'), ll: defaultPaytable('ll') };
const rec = (o: Partial<RoundRecord>): RoundRecord => ({ n: 0, t: 0, bet: 10, sideStake: 0, tc: 0, net: 0, bankroll: 0, errorCost: 0, ev: 0, variance: 1, ...o });

describe('session analysis', () => {
  it('flat betting is cool; a bet that tracks the count is hot', () => {
    const flat = Array.from({ length: 40 }, (_, i) => rec({ tc: (i % 9) - 4, bet: 25 }));
    expect(heat(flat).level).toBe('Cool');
    const ramp = Array.from({ length: 40 }, (_, i) => { const tc = (i % 9) - 4; return rec({ tc, bet: tc >= 2 ? 25 * Math.min(12, tc * 3) : 25 }); });
    const h = heat(ramp);
    expect(h.correlation).toBeGreaterThan(0.8);
    expect(h.level).toBe('Hot');
  });

  it('normal CDF matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it('luck compares the result with expectation in standard deviations', () => {
    const r = [rec({ ev: -1, variance: 100, net: 9 }), rec({ ev: -1, variance: 300, net: 11 })];
    const l = luck(r);
    expect(l.expected).toBe(-2);
    expect(l.sd).toBeCloseTo(20, 9);
    expect(l.z).toBeCloseTo(1.1, 9);
  });

  it('pace counts rounds per hour', () => {
    const r = Array.from({ length: 21 }, (_, i) => rec({ t: i * 36_000 })); // one round every 36 s
    const p = pace(r, 20 * 36_000);
    expect(p.recent).toBeCloseTo(100, 6);
    expect(p.overall).toBeCloseTo(105, 6);
  });
});

describe('game session tracking', () => {
  it('records every round, tallies outcomes and categories, and restores from a snapshot', () => {
    const g = new Game({ rules: defaultRules(), deviations: 'i18fab4', pays, limits: { min: 5, max: 500 } }, makeRng(4));
    g.setBet(10000);
    expect(g.mainBet).toBe(500); // clamped to the table maximum
    g.setBet(25);
    for (let i = 0; i < 400; i++) {
      g.deal();
      if (g.phase === 'insurance') g.takeInsurance(false);
      while (g.phase === 'player') g.act(g.advice()!.action);
    }
    const s = g.stats;
    expect(g.rounds.length).toBe(400);
    expect(s.wins + s.losses + s.pushes + s.surrenders).toBe(s.hands);
    const cats = s.byCategory;
    expect(cats.hard.n + cats.soft.n + cats.pair.n + cats.insurance.n).toBe(s.decisions);
    expect(cats.index.n).toBeGreaterThan(0);
    expect(g.rounds.at(-1)!.bankroll).toBe(g.bankroll);
    expect(s.wagered).toBeGreaterThanOrEqual(400 * 25);

    const g2 = new Game({ rules: defaultRules(), deviations: 'i18fab4', pays }, makeRng(5));
    g2.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.bankroll).toBe(g.bankroll);
    expect(g2.rounds.length).toBe(400);
    expect(g2.stats.byCategory.index.n).toBe(cats.index.n);
  });

  it('will not deal below the table minimum', () => {
    const g = new Game({ rules: defaultRules(), deviations: 'none', pays, limits: { min: 25, max: 500 } }, makeRng(1));
    g.setBet(10);
    g.deal();
    expect(g.phase).toBe('betting');
  });
});
