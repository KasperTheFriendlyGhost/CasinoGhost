//! Cards, compositions and the shoe.
//!
//! A card type is `0..52`: rank `t / 4 + 1` (1 = ace … 13 = king) and suit `t % 4`
//! (0 spades, 1 hearts, 2 diamonds, 3 clubs; hearts and diamonds are red).
//! For play, only the value matters: 1 (ace) to 10 (ten and faces).

use crate::rng::Rng;
use serde::{Deserialize, Serialize};

pub type CardType = u8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Card {
    pub rank: u8,
    pub suit: u8,
}

impl Card {
    #[inline]
    pub fn from_type(t: CardType) -> Card {
        Card { rank: t / 4 + 1, suit: t % 4 }
    }
    #[inline]
    pub fn card_type(self) -> CardType {
        (self.rank - 1) * 4 + self.suit
    }
    #[inline]
    pub fn value(self) -> u8 {
        value_of_rank(self.rank)
    }
    #[inline]
    pub fn is_red(self) -> bool {
        self.suit == 1 || self.suit == 2
    }
}

#[inline]
pub fn value_of_rank(rank: u8) -> u8 {
    if rank > 10 { 10 } else { rank }
}

/// Value (1..=10) of a card type, by lookup.
pub const VALUE_OF_TYPE: [u8; 52] = {
    let mut v = [0u8; 52];
    let mut t = 0;
    while t < 52 {
        let r = (t / 4 + 1) as u8;
        v[t] = if r > 10 { 10 } else { r };
        t += 1;
    }
    v
};

/// Cards remaining by value, index 1..=10 (index 0 unused). `f64` so it can also hold
/// fractional "mean-field" compositions.
pub type Comp = [f64; 11];

pub fn fresh_comp(decks: u32) -> Comp {
    let mut c = [0.0; 11];
    for v in 1..=9 {
        c[v] = 4.0 * decks as f64;
    }
    c[10] = 16.0 * decks as f64;
    c
}

#[inline]
pub fn comp_total(c: &Comp) -> f64 {
    c[1..].iter().sum()
}

/// A shoe dealt by lazy Fisher–Yates: each draw picks uniformly from the undealt cards,
/// so the order is never fixed in advance.
#[derive(Clone, Debug)]
pub struct Shoe {
    pub decks: u32,
    order: Vec<CardType>,
    ptr: usize,
    cut: usize,
    /// Undealt cards by value (1..=10).
    pub by_value: [u16; 11],
    /// Undealt cards by type (0..52).
    pub by_type: [u16; 52],
    rng: Rng,
}

/// A shoe saved between sessions.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ShoeState {
    pub decks: u32,
    pub ptr: usize,
    pub order: Vec<CardType>,
}

impl Shoe {
    /// `cut` = number of cards dealt before the cut card comes out.
    pub fn new(decks: u32, cut: usize, rng: Rng) -> Shoe {
        let size = decks as usize * 52;
        let order = (0..size).map(|i| (i % 52) as CardType).collect();
        let mut s = Shoe { decks, order, ptr: 0, cut: cut.min(size), by_value: [0; 11], by_type: [0; 52], rng };
        s.reset_counts();
        s
    }

    fn reset_counts(&mut self) {
        self.by_type = [self.decks as u16; 52];
        self.by_value = [0; 11];
        for v in 1..=9 {
            self.by_value[v] = 4 * self.decks as u16;
        }
        self.by_value[10] = 16 * self.decks as u16;
    }

    #[inline]
    pub fn size(&self) -> usize {
        self.order.len()
    }
    #[inline]
    pub fn dealt(&self) -> usize {
        self.ptr
    }
    #[inline]
    pub fn cards_left(&self) -> usize {
        self.order.len() - self.ptr
    }
    #[inline]
    pub fn decks_left(&self) -> f64 {
        self.cards_left() as f64 / 52.0
    }
    #[inline]
    pub fn cut(&self) -> usize {
        self.cut
    }
    pub fn set_cut(&mut self, cut: usize) {
        self.cut = cut.min(self.order.len());
    }
    #[inline]
    pub fn needs_shuffle(&self) -> bool {
        self.ptr >= self.cut
    }

    pub fn shuffle(&mut self) {
        self.ptr = 0;
        self.reset_counts();
    }

    /// Deal one card. An exhausted shoe is reshuffled silently (only possible with
    /// pathological cut positions).
    #[inline]
    pub fn draw_type(&mut self) -> CardType {
        if self.ptr >= self.order.len() {
            self.shuffle();
        }
        let p = self.ptr;
        let j = p + self.rng.below((self.order.len() - p) as u32) as usize;
        self.order.swap(p, j);
        let t = self.order[p];
        self.ptr = p + 1;
        self.by_type[t as usize] -= 1;
        self.by_value[VALUE_OF_TYPE[t as usize] as usize] -= 1;
        t
    }

    #[inline]
    pub fn draw(&mut self) -> Card {
        Card::from_type(self.draw_type())
    }

    /// Undealt composition by value.
    pub fn comp(&self) -> Comp {
        let mut c = [0.0; 11];
        for v in 1..=10 {
            c[v] = self.by_value[v] as f64;
        }
        c
    }

    pub fn rng_mut(&mut self) -> &mut Rng {
        &mut self.rng
    }

    pub fn save(&self) -> ShoeState {
        ShoeState { decks: self.decks, ptr: self.ptr, order: self.order.clone() }
    }

    /// Restore a saved shoe. Returns false (leaving the shoe unchanged) if the state does not
    /// fit: a different number of decks, a bad position, or cards that are not a full shoe.
    pub fn load(&mut self, s: &ShoeState) -> bool {
        if s.decks != self.decks || s.order.len() != self.order.len() || s.ptr > s.order.len() {
            return false;
        }
        let mut counts = [0u32; 52];
        for &t in &s.order {
            if t >= 52 {
                return false;
            }
            counts[t as usize] += 1;
        }
        if counts.iter().any(|&c| c != self.decks) {
            return false;
        }
        self.order.copy_from_slice(&s.order);
        self.ptr = s.ptr;
        self.by_type = [0; 52];
        self.by_value = [0; 11];
        for &t in &self.order[self.ptr..] {
            self.by_type[t as usize] += 1;
            self.by_value[VALUE_OF_TYPE[t as usize] as usize] += 1;
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deals_a_full_shoe_exactly_once() {
        let mut s = Shoe::new(2, 104, Rng::new(3));
        let mut seen = [0u32; 52];
        for _ in 0..104 {
            seen[s.draw_type() as usize] += 1;
        }
        assert!(seen.iter().all(|&c| c == 2));
        assert_eq!(s.cards_left(), 0);
        assert!(s.by_value.iter().all(|&c| c == 0));
    }

    #[test]
    fn save_and_load_round_trip_and_reject_bad_states() {
        let mut s = Shoe::new(6, 234, Rng::new(9));
        for _ in 0..50 {
            s.draw();
        }
        let saved = s.save();
        let mut t = Shoe::new(6, 234, Rng::new(1));
        assert!(t.load(&saved));
        assert_eq!(t.dealt(), 50);
        assert_eq!(t.by_value, s.by_value);
        let mut wrong_decks = Shoe::new(2, 80, Rng::new(1));
        assert!(!wrong_decks.load(&saved));
        let mut tampered = saved.clone();
        tampered.order.iter_mut().for_each(|t| *t = 0);
        assert!(!t.load(&tampered));
    }

    #[test]
    fn card_types_round_trip() {
        for t in 0..52u8 {
            let c = Card::from_type(t);
            assert_eq!(c.card_type(), t);
            assert_eq!(c.value(), VALUE_OF_TYPE[t as usize]);
        }
    }
}
