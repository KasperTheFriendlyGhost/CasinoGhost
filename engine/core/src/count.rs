//! Card-counting systems and how a player turns a running count into the number they
//! act on (true count, or running count for unbalanced systems).
//!
//! Tags are stored in half-points so systems like Wong Halves stay integral.

use crate::cards::{CardType, VALUE_OF_TYPE};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CountSystem {
    pub id: String,
    pub name: String,
    /// Tag per card value, in half-points (index 1 = ace … 10 = tens).
    pub tags2: [i32; 11],
    /// Extra half-points for a red seven (Red 7 system), on top of `tags2[7]`.
    pub red_seven2: i32,
    /// Balanced systems sum to zero over a deck and are used as a true count.
    /// Unbalanced ones (KO, Red 7) are used as a running count from an initial value.
    pub balanced: bool,
    /// Unbalanced only: initial running count = `irc_per_deck * decks + irc_const`.
    pub irc_per_deck: i32,
    pub irc_const: i32,
    pub note: String,
}

impl CountSystem {
    #[inline]
    pub fn tag2(&self, t: CardType) -> i32 {
        let v = VALUE_OF_TYPE[t as usize] as usize;
        let mut x = self.tags2[v];
        if self.red_seven2 != 0 && v == 7 && matches!(t % 4, 1 | 2) {
            x += self.red_seven2;
        }
        x
    }

    /// Initial running count, in half-points.
    pub fn irc2(&self, decks: u32) -> i32 {
        if self.balanced { 0 } else { 2 * (self.irc_per_deck * decks as i32 + self.irc_const) }
    }

    /// Sum of tags over one deck, in half-points (0 for a balanced system).
    pub fn deck_sum2(&self) -> i32 {
        let mut s = 0;
        for t in 0..52u8 {
            s += self.tag2(t);
        }
        s
    }

    /// Largest absolute tag (the system's "level").
    pub fn level(&self) -> f64 {
        self.tags2[1..].iter().map(|x| x.abs()).max().unwrap_or(0) as f64 / 2.0
    }

    /// Mean tag per card value, in points (red seven counted as half its extra).
    pub fn mean_tags(&self) -> [f64; 11] {
        let mut m = [0.0; 11];
        for v in 1..=10 {
            m[v] = self.tags2[v] as f64 / 2.0;
        }
        m[7] += self.red_seven2 as f64 / 4.0;
        m
    }

    /// Betting correlation: how well the tags track each card's effect on the player's edge.
    pub fn betting_correlation(&self) -> f64 {
        // Effects of removal for basic strategy, 6 decks S17 DAS (per card, in % of a unit),
        // from the classic Griffin values; used only to rate systems.
        const EOR: [f64; 11] = [0.0, -0.61, 0.38, 0.44, 0.55, 0.69, 0.46, 0.28, 0.00, -0.18, -0.51];
        corr(&self.mean_tags(), &EOR)
    }
}

fn corr(a: &[f64; 11], b: &[f64; 11]) -> f64 {
    // weight tens 4x
    let w = |v: usize| if v == 10 { 4.0 } else { 1.0 };
    let n: f64 = (1..=10).map(w).sum();
    let ma = (1..=10).map(|v| w(v) * a[v]).sum::<f64>() / n;
    let mb = (1..=10).map(|v| w(v) * b[v]).sum::<f64>() / n;
    let mut sab = 0.0;
    let mut saa = 0.0;
    let mut sbb = 0.0;
    for v in 1..=10 {
        let (x, y) = (a[v] - ma, b[v] - mb);
        sab += w(v) * x * y;
        saa += w(v) * x * x;
        sbb += w(v) * y * y;
    }
    if saa == 0.0 || sbb == 0.0 { 0.0 } else { sab / (saa * sbb).sqrt() }
}

fn sys(id: &str, name: &str, tags: [f64; 10], balanced: bool, irc: (i32, i32), red7: f64, note: &str) -> CountSystem {
    let mut tags2 = [0; 11];
    for (i, t) in tags.iter().enumerate() {
        tags2[i + 1] = (t * 2.0).round() as i32;
    }
    CountSystem {
        id: id.into(),
        name: name.into(),
        tags2,
        red_seven2: (red7 * 2.0).round() as i32,
        balanced,
        irc_per_deck: irc.0,
        irc_const: irc.1,
        note: note.into(),
    }
}

/// Built-in systems. Tags listed A, 2, 3 … 9, 10.
pub fn systems() -> Vec<CountSystem> {
    vec![
        sys("hilo", "Hi-Lo", [-1., 1., 1., 1., 1., 1., 0., 0., 0., -1.], true, (0, 0), 0.,
            "The standard level-1 balanced count. Most published indices use it."),
        sys("ko", "KO (Knock-Out)", [-1., 1., 1., 1., 1., 1., 1., 0., 0., -1.], false, (-4, 4), 0.,
            "Unbalanced level 1: no true-count conversion. Bet and play from the running count."),
        sys("red7", "Red 7", [-1., 1., 1., 1., 1., 1., 0., 0., 0., -1.], false, (-2, 0), 1.,
            "Hi-Lo plus red sevens. Unbalanced; bet from the running count."),
        sys("hiopt1", "Hi-Opt I", [0., 0., 1., 1., 1., 1., 0., 0., 0., -1.], true, (0, 0), 0.,
            "Level 1, ace-neutral. Strong for playing decisions."),
        sys("hiopt2", "Hi-Opt II", [0., 1., 1., 2., 2., 1., 1., 0., 0., -2.], true, (0, 0), 0.,
            "Level 2, ace-neutral. Very accurate, harder to keep."),
        sys("omega2", "Omega II", [0., 1., 1., 2., 2., 2., 1., 0., -1., -2.], true, (0, 0), 0.,
            "Level 2, ace-neutral."),
        sys("zen", "Zen Count", [-1., 1., 1., 2., 2., 2., 1., 0., 0., -2.], true, (0, 0), 0.,
            "Level 2 with the ace counted. Good betting correlation."),
        sys("halves", "Wong Halves", [-1., 0.5, 1., 1., 1.5, 1., 0.5, 0., -0.5, -1.], true, (0, 0), 0.,
            "Level 3 with half-points. Among the most accurate betting counts."),
    ]
}

pub fn system(id: &str) -> CountSystem {
    systems().into_iter().find(|s| s.id == id).unwrap_or_else(|| systems().remove(0))
}

// ----- True count ------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Rounding {
    /// Round down (−0.5 → −1). The usual convention for Hi-Lo indices.
    Floor,
    /// Round toward zero (−0.5 → 0).
    Truncate,
    /// Round to nearest.
    Round,
    /// Use the exact ratio.
    Exact,
}

/// How a player converts the running count. `deck_resolution` is the step used to estimate
/// decks remaining from the discard tray (0 = exact, 0.5 = to the half deck, 1 = whole decks).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct TrueCountMode {
    pub rounding: Rounding,
    pub deck_resolution: f64,
}

impl Default for TrueCountMode {
    fn default() -> Self {
        TrueCountMode { rounding: Rounding::Floor, deck_resolution: 0.5 }
    }
}

impl TrueCountMode {
    /// Decks remaining as the player would estimate them.
    #[inline]
    pub fn decks_estimate(&self, cards_left: usize) -> f64 {
        let left = cards_left as f64 / 52.0;
        let res = self.deck_resolution;
        if res > 0.0 { ((left / res).round() * res).max(res) } else { left.max(1.0 / 52.0) }
    }

    /// The count the player acts on: true count (balanced) or running count (unbalanced).
    #[inline]
    pub fn count(&self, sys: &CountSystem, rc2: i32, cards_left: usize) -> f64 {
        if !sys.balanced {
            return rc2 as f64 / 2.0;
        }
        let tc = (rc2 as f64 / 2.0) / self.decks_estimate(cards_left);
        match self.rounding {
            Rounding::Floor => (tc + 1e-9).floor(),
            Rounding::Truncate => tc.trunc(),
            Rounding::Round => tc.round(),
            Rounding::Exact => tc,
        }
    }
}

/// Integer bucket for tables keyed by count: floor of the count, clamped.
#[inline]
pub fn bucket(count: f64, lo: i32, hi: i32) -> i32 {
    ((count + 1e-9).floor() as i32).clamp(lo, hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn balance_and_initial_counts() {
        for s in systems() {
            let sum = s.deck_sum2();
            if s.balanced {
                assert_eq!(sum, 0, "{} should be balanced", s.id);
            } else {
                assert!(sum > 0, "{} should be unbalanced", s.id);
                // Counting a whole shoe from the IRC lands on a fixed pivot
                let end = s.irc2(6) + 6 * sum;
                assert_eq!(end, s.irc2(1) + sum, "{} pivot should not depend on decks", s.id);
            }
        }
        assert_eq!(system("ko").irc2(6), 2 * -20);
        assert_eq!(system("halves").tags2[5], 3);
    }

    #[test]
    fn true_count_modes() {
        let hilo = system("hilo");
        let m = TrueCountMode { rounding: Rounding::Floor, deck_resolution: 0.5 };
        // RC +7 with 3.1 decks left (161 cards): estimate 3.0 decks -> TC 2.33 -> 2
        assert_eq!(m.count(&hilo, 14, 161), 2.0);
        assert_eq!(m.count(&hilo, -2, 156), -1.0); // -0.33 floors to -1
        let t = TrueCountMode { rounding: Rounding::Truncate, ..m };
        assert_eq!(t.count(&hilo, -2, 156), 0.0);
        let ko = system("ko");
        assert_eq!(m.count(&ko, 2 * -12, 100), -12.0);
    }

    #[test]
    fn betting_correlations_rank_sensibly() {
        let bc = |id: &str| system(id).betting_correlation();
        assert!(bc("hilo") > 0.95 && bc("hilo") < 0.98, "hi-lo bc {}", bc("hilo"));
        assert!(bc("halves") > bc("hilo"));
        assert!(bc("hiopt1") < bc("hilo"));
    }
}
