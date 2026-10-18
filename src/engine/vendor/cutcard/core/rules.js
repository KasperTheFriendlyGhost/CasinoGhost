// Rule schema, defaults, validation. A "config" is the whole app state:
//   { rules, table, player, costs, spread }  (see defaultConfig()).

export const DOUBLE_OPTIONS = {
  any: 'Any two cards',
  '9-11': 'Hard 9, 10, 11 only',
  '10-11': 'Hard 10, 11 only',
  none: 'No doubling',
};
export const SURRENDER_OPTIONS = { none: 'None', late: 'Late surrender', early: 'Early surrender' };
export const BJ_PAYS = { '1.5': '3:2', '1.2': '6:5', '1.4': '7:5', '2': '2:1', '1': '1:1' };

export function defaultRules() {
  return {
    decks: 6,
    h17: false,            // dealer hits soft 17
    peek: true,            // US hole-card peek (false = European no-hole-card)
    obo: true,             // no-peek only: lose original bet only vs dealer BJ
    bjPay: 1.5,
    das: true,             // double after split
    doubleOn: 'any',
    maxHands: 4,           // max hands after resplits (2 = no resplit)
    resplitAces: false,
    hitSplitAces: false,
    surrender: 'none',
    penetration: 0.75,     // fraction of shoe dealt before shuffle
    csm: false,            // continuous shuffling machine (reshuffle every round)
  };
}

export function defaultTable() {
  return {
    minBet: 25, maxBet: 1000, increment: 5,
    roundsPerHour: 100,    // rounds the dealer deals per hour at your table
    otherPlayers: 1,
  };
}

export function defaultPlayer() {
  return {
    bankroll: 20000,
    deviations: 'i18fab4',   // none | insurance | i18 | i18fab4 | engine | custom
    disabledDeviations: [],  // keys switched off by the user
    tcRounding: 'floor',     // floor | round | none
    deckResolution: 0.5,     // deck-estimation granularity (0 = exact)
    countErrorRate: 0,       // prob per round of +-1 error that persists until shuffle
    mistakeRate: 0,          // prob per decision of playing the 2nd best action
    wongOutBelow: null,      // leave table when TC below this (null = never)
  };
}

export function defaultCosts() {
  return {
    hourlyCost: 0,         // travel, food, tips, etc. ($/hr)
    rakePerHand: 0,        // flat fee per hand played ($)
    winCommission: 0,      // % taken from winning hands
    compPct: 0,            // % of total wagered returned as comps/cashback
  };
}

export const DEFAULT_SPREAD = { unit: 25, bets: [1, 1, 2, 4, 6, 8, 8, 8, 8, 8] };
// bets[i] = units at true count i (i=0 means TC<=0; last entry applies to all higher TCs)

export function defaultConfig() {
  return {
    rules: defaultRules(),
    table: defaultTable(),
    player: defaultPlayer(),
    costs: defaultCosts(),
    spread: { unit: 25, bets: [...DEFAULT_SPREAD.bets] },
  };
}

/** Number of cards dealt before the cut card. */
export function cutCard(rules, table) {
  const total = rules.decks * 52;
  if (rules.csm) return 0;
  const reserve = 8 + 6 * (table.otherPlayers + 1);
  return Math.max(10, Math.min(Math.floor(total * rules.penetration), total - reserve));
}

export function canDouble(rules, hardTotal, soft) {
  switch (rules.doubleOn) {
    case 'any': return true;
    case '9-11': return !soft && hardTotal >= 9 && hardTotal <= 11;
    case '10-11': return !soft && hardTotal >= 10 && hardTotal <= 11;
    default: return false;
  }
}

export function validateConfig(cfg) {
  const w = [];
  const r = cfg.rules;
  if (![1, 2, 3, 4, 5, 6, 7, 8].includes(r.decks)) w.push('Decks should be between 1 and 8.');
  if (r.penetration < 0.3 || r.penetration > 0.95) w.push('Penetration outside 30%-95% is unusual.');
  if (cfg.table.maxBet < cfg.table.minBet) w.push('Max bet is below min bet.');
  if (cfg.player.wongOutBelow != null && cfg.table.otherPlayers < 1)
    w.push('Wonging out needs at least one other player (the dealer must keep dealing).');
  if (r.csm) w.push('Continuous shuffler: the count carries no information; expect no edge.');
  return w;
}

/** Stable key of everything that changes how a *round* plays (not bets). */
export function simKey(cfg) {
  const { rules, table, player, costs } = cfg;
  return JSON.stringify([rules, table.otherPlayers, table.minBet, table.maxBet,
    player.deviations, player.disabledDeviations, player.tcRounding, player.deckResolution,
    player.countErrorRate, player.mistakeRate, costs.winCommission]);
}
