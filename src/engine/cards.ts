// Cards with suits. Side bets (21+3, Perfect Pairs, Lucky Ladies) need rank and suit, so
// the shoe tracks all 52 card types; the strategy engine only sees blackjack values 1..10.

export type Suit = 0 | 1 | 2 | 3; // spades, hearts, diamonds, clubs
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // A=1, J=11, Q=12, K=13

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Unique within the session; used as a React key. */
  uid: number;
}

export const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const isRed = (s: Suit) => s === 1 || s === 2;
/** Blackjack value: A=1, faces=10. */
export const valueOf = (rank: number) => (rank > 10 ? 10 : rank);
/** Index of a card type in a 52-slot composition. */
export const typeIndex = (rank: number, suit: number) => (rank - 1) * 4 + suit;
export const cardLabel = (c: Pick<Card, 'rank' | 'suit'>) => `${RANK_LABEL[c.rank]}${SUIT_SYMBOL[c.suit]}`;

/** Remaining cards by type: comp[typeIndex(rank, suit)]. */
export type Composition = Int32Array;

export function freshComposition(decks: number): Composition {
  return new Int32Array(52).fill(decks);
}

export function compTotal(comp: Composition): number {
  let n = 0;
  for (let i = 0; i < 52; i++) n += comp[i];
  return n;
}

/** Collapse to blackjack values (index 1..10) for the strategy engine. */
export function valueCounts(comp: Composition): Float64Array {
  const out = new Float64Array(11);
  for (let i = 0; i < 52; i++) out[valueOf((i >> 2) + 1)] += comp[i];
  return out;
}

/** Seedable PRNG (mulberry32). */
export function makeRng(seed = Date.now()): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextUid = 1;

/** Multi-deck shoe with a cut card, lazy Fisher-Yates draws and a live composition. */
export class Shoe {
  readonly decks: number;
  readonly size: number;
  readonly cut: number;
  private order: Uint8Array; // card type indices
  private ptr = 0;
  readonly remaining: Composition;
  private rand: () => number;

  constructor(decks: number, penetration: number, rand: () => number = Math.random) {
    this.decks = decks;
    this.size = decks * 52;
    this.rand = rand;
    this.order = new Uint8Array(this.size);
    for (let i = 0; i < this.size; i++) this.order[i] = i % 52;
    this.remaining = freshComposition(decks);
    this.cut = Math.max(10, Math.min(Math.floor(this.size * penetration), this.size - 26));
  }

  get dealt() { return this.ptr; }
  get cardsLeft() { return this.size - this.ptr; }
  get decksLeft() { return this.cardsLeft / 52; }
  get needsShuffle() { return this.ptr >= this.cut; }

  shuffle() {
    this.ptr = 0;
    this.remaining.fill(this.decks);
  }

  draw(): Card {
    if (this.ptr >= this.size) this.shuffle();
    const p = this.ptr;
    const j = p + Math.floor(this.rand() * (this.size - p));
    const t = this.order[j];
    this.order[j] = this.order[p];
    this.order[p] = t;
    this.ptr = p + 1;
    this.remaining[t]--;
    return { rank: ((t >> 2) + 1) as Rank, suit: (t & 3) as Suit, uid: nextUid++ };
  }
}
