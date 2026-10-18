// Shared constants. Cards are integers 1..10 (Ace = 1, ten-valued = 10).
export const ACT = { STAND: 0, HIT: 1, DOUBLE: 2, SPLIT: 3, SURRENDER: 4 };
export const ACT_NAMES = ['Stand', 'Hit', 'Double', 'Split', 'Surrender'];
export const ACT_LETTER = ['S', 'H', 'D', 'P', 'R'];

// Hi-Lo tags indexed by card value (index 0 unused).
export const HI_LO = Int8Array.from([0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1]);

// Bin range for (perceived, rounded) true counts used by simulations & spreads.
export const TC_MIN = -12;
export const TC_MAX = 12;
export const NBINS = TC_MAX - TC_MIN + 1;
export const binOf = (tc) => Math.max(TC_MIN, Math.min(TC_MAX, tc)) - TC_MIN;
export const tcOfBin = (b) => b + TC_MIN;
