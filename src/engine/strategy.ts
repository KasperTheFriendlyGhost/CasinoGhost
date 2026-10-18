// Typed façade over the vendored cutcard engine (src/engine/vendor/cutcard, MIT).
import { ACT, ACT_NAMES } from './vendor/cutcard/core/constants.js';
import { defaultRules, BJ_PAYS, SURRENDER_OPTIONS, DOUBLE_OPTIONS } from './vendor/cutcard/core/rules.js';
import { parseRules } from './vendor/cutcard/core/rulesParser.js';
import { buildStrategy, cellCode } from './vendor/cutcard/strategy/basicStrategy.js';
import { strategyEV } from './vendor/cutcard/strategy/houseEdge.js';
import { compileDeviations } from './vendor/cutcard/strategy/deviations.js';
import { Advisor, handInfo } from './vendor/cutcard/trainer/advisor.js';

export type Rules = ReturnType<typeof defaultRules>;
export type DevMode = 'none' | 'i18' | 'i18fab4';
export type ActionCode = 0 | 1 | 2 | 3 | 4;
export type Strategy = ReturnType<typeof buildStrategy>;

export { ACT, ACT_NAMES, BJ_PAYS, SURRENDER_OPTIONS, DOUBLE_OPTIONS, defaultRules, parseRules, buildStrategy, cellCode, Advisor, handInfo };

export function houseEdge(rules: Rules, strategy: Strategy = buildStrategy(rules)): number {
  return -strategyEV(rules, strategy);
}

export interface IndexPlay {
  label: string;
  idx: number;
  above: number;
  below: number;
  kind: string;
  key: number;
  up: number;
}

export function indexPlays(rules: Rules, strategy: Strategy, mode: DevMode): { list: IndexPlay[]; insurance: number | null } {
  const d = compileDeviations(rules, strategy, { deviations: mode, disabledDeviations: [], tcRounding: 'floor' }, null);
  return { list: d.list, insurance: d.insuranceIdx };
}

export const RULE_PRESETS: { name: string; tag: string; rules: Partial<Rules> }[] = [
  { name: 'Vegas Strip 6-deck', tag: 'Common', rules: { decks: 6, h17: true, das: true, surrender: 'late', bjPay: 1.5, penetration: 0.75 } },
  { name: 'Solid 6-deck S17', tag: 'Good', rules: { decks: 6, h17: false, das: true, surrender: 'late', bjPay: 1.5, penetration: 0.8 } },
  { name: 'Double deck', tag: 'Good', rules: { decks: 2, h17: false, das: true, surrender: 'none', bjPay: 1.5, penetration: 0.7 } },
  { name: '8-deck shoe', tag: 'Poor', rules: { decks: 8, h17: true, das: true, surrender: 'none', bjPay: 1.5, penetration: 0.7 } },
  { name: '6:5 six-deck', tag: 'Avoid', rules: { decks: 6, h17: true, das: true, surrender: 'none', bjPay: 1.2, penetration: 0.75 } },
  { name: 'European no-hole-card', tag: 'Poor', rules: { decks: 6, h17: false, das: true, surrender: 'none', bjPay: 1.5, peek: false, obo: false, penetration: 0.75 } },
];

export function rulesSummary(r: Rules): string {
  const bj = (BJ_PAYS as Record<string, string>)[String(r.bjPay)] ?? `${r.bjPay}:1`;
  return [
    `${r.decks}D`, r.h17 ? 'H17' : 'S17', r.das ? 'DAS' : 'No DAS',
    r.surrender === 'late' ? 'LS' : r.surrender === 'early' ? 'ES' : 'No surr.', bj,
    r.peek ? null : 'ENHC', `${Math.round(r.penetration * 100)}% pen`,
  ].filter(Boolean).join(' · ');
}
