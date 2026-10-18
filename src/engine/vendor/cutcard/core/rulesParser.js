// Human-writable table-rules syntax <-> rules objects.
//
//   6D S17 DAS NoRSA LS 3:2 PEEK SPL4 DBL:ANY PEN:75% MIN:25 MAX:1000 RPH:100 PLAYERS:2
//
// Tokens are case-insensitive, order-free, separated by spaces/commas/newlines.
// Natural phrases ("six decks, dealer hits soft 17, late surrender") are also understood.
import { BJ_PAYS } from './rules.js';

const WORD_NUM = { single: 1, one: 1, double: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/** @returns {{rules:Object, table:Object, understood:string[], ignored:string[]}} */
export function parseRules(text) {
  const rules = {}, table = {};
  const understood = [];
  let s = ' ' + String(text).toLowerCase().replace(/[,;|\n\r\t]+/g, ' ') + ' ';
  const take = (re, fn, label) => {
    const m = s.match(re);
    if (!m) return false;
    s = s.replace(re, ' ');
    const out = fn(m);
    understood.push(label ? (typeof label === 'function' ? label(m, out) : label) : m[0].trim());
    return true;
  };
  // decks
  take(/\b(single|double|one|two|three|four|five|six|seven|eight)[- ]decks?\b/, (m) => { rules.decks = WORD_NUM[m[1]]; }, (m) => `${WORD_NUM[m[1]]} deck(s)`);
  take(/\b(\d)\s*(?:d|decks?|-deck)\b/, (m) => { rules.decks = +m[1]; }, (m) => `${m[1]} deck(s)`);
  take(/\bdecks?\s*[:=]\s*(\d)\b/, (m) => { rules.decks = +m[1]; }, (m) => `${m[1]} deck(s)`);
  // dealer soft 17
  take(/\bs17\b|stands?\s+(?:on\s+)?(?:a\s+)?soft\s*17/, () => { rules.h17 = false; }, 'Dealer stands soft 17');
  take(/\bh17\b|hits?\s+(?:on\s+)?(?:a\s+)?soft\s*17/, () => { rules.h17 = true; }, 'Dealer hits soft 17');
  // das
  take(/\b(?:no[- ]?das|ndas|no\s+double\s+after\s+split)\b/, () => { rules.das = false; }, 'No double after split');
  take(/\bdas\b|double\s+after\s+split/, () => { rules.das = true; }, 'Double after split');
  // resplit / hit split aces
  take(/\b(?:no[- ]?rsa|no\s+resplit\s+aces)\b/, () => { rules.resplitAces = false; }, 'No resplit aces');
  take(/\brsa\b|resplit\s+aces/, () => { rules.resplitAces = true; }, 'Resplit aces');
  take(/\b(?:no[- ]?hsa|no\s+hit\s+split\s+aces)\b/, () => { rules.hitSplitAces = false; }, 'No hitting split aces');
  take(/\bhsa\b|hit\s+split\s+aces/, () => { rules.hitSplitAces = true; }, 'Hit split aces');
  // surrender
  take(/\b(?:no[- ]?sur(?:render)?|nosur|no[- ]?ls)\b/, () => { rules.surrender = 'none'; }, 'No surrender');
  take(/\b(?:early\s+surrender|es)\b/, () => { rules.surrender = 'early'; }, 'Early surrender');
  take(/\b(?:late\s+surrender|ls)\b/, () => { rules.surrender = 'late'; }, 'Late surrender');
  take(/\bsur(?:render)?\s*[:=]\s*(none|late|early)\b/, (m) => { rules.surrender = m[1]; }, (m) => `Surrender: ${m[1]}`);
  // blackjack payout
  take(/\b(?:bj|blackjack(?:\s+pays)?)?\s*[:=]?\s*(3:2|6:5|7:5|2:1|1:1)\b/, (m) => {
    const [a, b] = m[1].split(':').map(Number); rules.bjPay = a / b; }, (m) => `Blackjack pays ${m[1]}`);
  // peek
  take(/\b(?:enhc|no[- ]?peek|no[- ]?hole(?:[- ]?card)?)\b/, () => { rules.peek = false; }, 'No hole card (ENHC)');
  take(/\bpeek\b|\bhole\s*card\b/, () => { rules.peek = true; }, 'Dealer peeks');
  take(/\b(?:obo|original\s+bets?\s+only)\b/, () => { rules.obo = true; }, 'Original bets only vs dealer BJ');
  take(/\ballbets\b|\blose\s+all\b/, () => { rules.obo = false; }, 'Lose all bets vs dealer BJ');
  // splits
  take(/\bno[- ]?resplit\b/, () => { rules.maxHands = 2; }, 'No resplitting');
  take(/\bspl(?:it)?\s*[:=]?\s*(\d)\b/, (m) => { rules.maxHands = +m[1]; }, (m) => `Split up to ${m[1]} hands`);
  // doubling
  take(/\bdbl\s*[:=]\s*(any|9-11|10-11|none)\b|\bdouble\s*(?:on\s*)?(any|9-11|10-11)\b/, (m) => { rules.doubleOn = (m[1] || m[2]); }, (m) => `Double: ${m[1] || m[2]}`);
  // csm
  take(/\bcsm\b|continuous\s+shuffl\w*/, () => { rules.csm = true; }, 'Continuous shuffler');
  // penetration
  take(/\bpen(?:etration)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(%|\/\s*(\d+(?:\.\d+)?)|d\b)?/, (m) => {
    let v = +m[1];
    if (m[2] === '%') v /= 100;
    else if (m[2] && m[2][0] === '/') v /= +m[3];
    else if (m[2] === 'd') v = v / (rules.decks || 6);
    else if (v > 1) v /= 100;
    rules.penetration = Math.max(0.1, Math.min(0.97, v));
  }, (m) => `Penetration ${m[0].trim()}`);
  // table numbers
  const nums = { min: 'minBet', max: 'maxBet', rph: 'roundsPerHour', hph: 'roundsPerHour', players: 'otherPlayers', others: 'otherPlayers', inc: 'increment' };
  for (const [k, field] of Object.entries(nums)) {
    take(new RegExp(`\\b${k}\\s*[:=]\\s*\\$?(\\d+(?:\\.\\d+)?)`), (m) => { table[field] = +m[1]; }, (m) => `${field} = ${m[1]}`);
  }
  const ignored = s.replace(/[^a-z0-9:/.%-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return { rules, table, understood, ignored };
}

/** Normalised one-line rules string for sharing. */
export function toRulesString(cfg) {
  const r = cfg.rules, t = cfg.table;
  const bj = BJ_PAYS[String(r.bjPay)] || `${r.bjPay}:1`;
  const parts = [
    `${r.decks}D`, r.h17 ? 'H17' : 'S17', r.das ? 'DAS' : 'NoDAS',
    r.resplitAces ? 'RSA' : 'NoRSA', r.hitSplitAces ? 'HSA' : 'NoHSA',
    r.surrender === 'late' ? 'LS' : r.surrender === 'early' ? 'ES' : 'NoSur',
    bj, r.peek ? 'PEEK' : `ENHC ${r.obo ? 'OBO' : 'ALLBETS'}`,
    `SPL${r.maxHands}`, `DBL:${r.doubleOn.toUpperCase()}`,
    r.csm ? 'CSM' : `PEN:${Math.round(r.penetration * 1000) / 10}%`,
    `MIN:${t.minBet}`, `MAX:${t.maxBet}`, `RPH:${t.roundsPerHour}`, `PLAYERS:${t.otherPlayers}`,
  ];
  return parts.join(' ');
}

/** Apply a parse result to a config (mutates). */
export function applyParsed(cfg, parsed) {
  Object.assign(cfg.rules, parsed.rules);
  Object.assign(cfg.table, parsed.table);
  return cfg;
}
