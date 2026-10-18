//! Table rules, table conditions, presets and the shorthand parser
//! ("6D H17 DAS LS 3:2 PEN:80%").

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DoubleOn {
    Any,
    NineToEleven,
    TenToEleven,
    None,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Surrender {
    None,
    Late,
    /// Early surrender against any upcard, before the dealer checks for blackjack.
    Early,
}

/// The rules of the game. Defaults: 6 decks, S17, DAS, split to 4, 3:2, peek, 75% dealt.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rules {
    pub decks: u32,
    /// Dealer hits soft 17.
    pub h17: bool,
    /// Dealer checks for blackjack (US hole card). False = European no-hole-card.
    pub peek: bool,
    /// No-hole-card games only: lose only the original bet to a dealer blackjack.
    pub obo: bool,
    /// Blackjack payout as a multiple of the bet: 1.5 (3:2), 1.2 (6:5), 1.4 (7:5), 1.0, 2.0.
    pub bj_pays: f64,
    /// Double after split.
    pub das: bool,
    pub double_on: DoubleOn,
    /// Most hands a player can reach by splitting (1 = no splitting, 2 = no resplits).
    pub max_hands: u32,
    pub resplit_aces: bool,
    pub hit_split_aces: bool,
    pub surrender: Surrender,
    /// Fraction of the shoe dealt before the shuffle.
    pub penetration: f64,
    /// Continuous shuffling machine: every round comes from a full shoe.
    pub csm: bool,
}

impl Default for Rules {
    fn default() -> Self {
        Rules {
            decks: 6,
            h17: false,
            peek: true,
            obo: true,
            bj_pays: 1.5,
            das: true,
            double_on: DoubleOn::Any,
            max_hands: 4,
            resplit_aces: false,
            hit_split_aces: false,
            surrender: Surrender::None,
            penetration: 0.75,
            csm: false,
        }
    }
}

/// Conditions at the table that change speed and how many cards each round uses.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct TableConditions {
    /// Other players at the table, each playing basic strategy.
    pub other_players: u32,
    /// Rounds the dealer deals per hour at this table.
    pub rounds_per_hour: f64,
    pub min_bet: f64,
    pub max_bet: f64,
}

impl Default for TableConditions {
    fn default() -> Self {
        TableConditions { other_players: 2, rounds_per_hour: 90.0, min_bet: 25.0, max_bet: 1000.0 }
    }
}

impl Rules {
    #[inline]
    pub fn can_double(&self, hard_total: u32, soft: bool) -> bool {
        match self.double_on {
            DoubleOn::Any => true,
            DoubleOn::NineToEleven => !soft && (9..=11).contains(&hard_total),
            DoubleOn::TenToEleven => !soft && (10..=11).contains(&hard_total),
            DoubleOn::None => false,
        }
    }

    pub fn shoe_size(&self) -> usize {
        self.decks as usize * 52
    }

    /// Cards dealt before the cut card, leaving enough for a last round at a full table.
    pub fn cut_card(&self, other_players: u32) -> usize {
        let total = self.shoe_size();
        if self.csm {
            return 0;
        }
        let reserve = 8 + 6 * (other_players as usize + 1);
        let want = (total as f64 * self.penetration).floor() as usize;
        want.min(total.saturating_sub(reserve)).max(10)
    }

    /// Clamp everything into valid ranges.
    pub fn sanitized(mut self) -> Rules {
        self.decks = self.decks.clamp(1, 8);
        self.max_hands = self.max_hands.clamp(1, 4);
        self.penetration = self.penetration.clamp(0.1, 0.97);
        if !(self.bj_pays > 0.0 && self.bj_pays <= 3.0) {
            self.bj_pays = 1.5;
        }
        if self.peek {
            self.obo = true;
        }
        self
    }

    pub fn bj_pays_label(&self) -> String {
        let r = self.bj_pays;
        for (v, s) in [(1.5, "3:2"), (1.2, "6:5"), (1.4, "7:5"), (2.0, "2:1"), (1.0, "1:1")] {
            if (r - v).abs() < 1e-9 {
                return s.to_string();
            }
        }
        format!("{r}:1")
    }

    /// Normalised one-line description, e.g. `6D H17 DAS LS 3:2 PEN:75%`.
    pub fn shorthand(&self) -> String {
        let mut p = vec![format!("{}D", self.decks), if self.h17 { "H17" } else { "S17" }.into()];
        p.push(if self.das { "DAS" } else { "NoDAS" }.into());
        match self.double_on {
            DoubleOn::Any => {}
            DoubleOn::NineToEleven => p.push("D9".into()),
            DoubleOn::TenToEleven => p.push("D10".into()),
            DoubleOn::None => p.push("NoDbl".into()),
        }
        match self.surrender {
            Surrender::Late => p.push("LS".into()),
            Surrender::Early => p.push("ES".into()),
            Surrender::None => {}
        }
        if self.resplit_aces {
            p.push("RSA".into());
        }
        if self.hit_split_aces {
            p.push("HSA".into());
        }
        if self.max_hands != 4 {
            p.push(format!("SPL{}", self.max_hands));
        }
        p.push(self.bj_pays_label());
        if !self.peek {
            p.push(if self.obo { "ENHC-OBO".into() } else { "ENHC".into() });
        }
        if self.csm {
            p.push("CSM".into());
        } else {
            p.push(format!("PEN:{}%", (self.penetration * 100.0).round()));
        }
        p.join(" ")
    }

    /// Plain-English summary.
    pub fn describe(&self) -> String {
        let decks = if self.decks == 1 { "Single deck".to_string() } else { format!("{} decks", self.decks) };
        let mut parts = vec![
            decks,
            if self.h17 { "dealer hits soft 17".into() } else { "dealer stands on soft 17".into() },
        ];
        parts.push(format!("blackjack pays {}", self.bj_pays_label()));
        parts.push(if self.das { "double after split".into() } else { "no double after split".into() });
        match self.double_on {
            DoubleOn::Any => {}
            DoubleOn::NineToEleven => parts.push("double on 9–11 only".into()),
            DoubleOn::TenToEleven => parts.push("double on 10–11 only".into()),
            DoubleOn::None => parts.push("no doubling".into()),
        }
        match self.max_hands {
            1 => parts.push("no splitting".into()),
            2 => parts.push("no resplitting".into()),
            n => parts.push(format!("split to {n} hands")),
        }
        if self.resplit_aces {
            parts.push("resplit aces".into());
        }
        if self.hit_split_aces {
            parts.push("hit split aces".into());
        }
        match self.surrender {
            Surrender::Late => parts.push("late surrender".into()),
            Surrender::Early => parts.push("early surrender".into()),
            Surrender::None => {}
        }
        if !self.peek {
            parts.push(if self.obo {
                "no hole card (original bets only)".into()
            } else {
                "no hole card (lose doubles and splits to blackjack)".into()
            });
        }
        if self.csm {
            parts.push("continuous shuffler".into());
        } else {
            parts.push(format!("{}% dealt", (self.penetration * 100.0).round()));
        }
        parts.join(", ")
    }
}

// ----- Presets -----------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    /// Beatable, Marginal, Great, Poor, Avoid, Unbeatable.
    pub verdict: &'static str,
    pub blurb: &'static str,
    pub rules: Rules,
    pub table: TableConditions,
}

fn r(f: impl FnOnce(&mut Rules)) -> Rules {
    let mut x = Rules::default();
    f(&mut x);
    x
}
fn t(other_players: u32, rph: f64, min: f64, max: f64) -> TableConditions {
    TableConditions { other_players, rounds_per_hour: rph, min_bet: min, max_bet: max }
}

pub fn presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "solid-6d",
            name: "Solid 6-deck shoe",
            verdict: "Beatable",
            blurb: "6 decks, S17, DAS, late surrender, 3:2, 80% dealt. A realistic good shoe game.",
            rules: r(|x| {
                x.surrender = Surrender::Late;
                x.penetration = 0.8;
            }),
            table: t(2, 90.0, 25.0, 1000.0),
        },
        Preset {
            id: "vegas-strip",
            name: "Vegas Strip 6-deck",
            verdict: "Marginal",
            blurb: "6 decks, H17, DAS, no surrender, 3:2, 75% dealt, busy table.",
            rules: r(|x| {
                x.h17 = true;
            }),
            table: t(3, 80.0, 25.0, 2000.0),
        },
        Preset {
            id: "downtown-2d",
            name: "Double deck, pitched",
            verdict: "Great",
            blurb: "2 decks, S17, DAS, late surrender, resplit aces, 3:2, 80% dealt.",
            rules: r(|x| {
                x.decks = 2;
                x.surrender = Surrender::Late;
                x.resplit_aces = true;
                x.penetration = 0.8;
            }),
            table: t(1, 150.0, 25.0, 1000.0),
        },
        Preset {
            id: "single-deck",
            name: "Single deck 3:2",
            verdict: "Great",
            blurb: "1 deck, S17, double any two, no DAS, 3:2, 65% dealt.",
            rules: r(|x| {
                x.decks = 1;
                x.das = false;
                x.max_hands = 2;
                x.penetration = 0.65;
            }),
            table: t(2, 140.0, 25.0, 500.0),
        },
        Preset {
            id: "single-deck-65",
            name: "Single deck 6:5",
            verdict: "Avoid",
            blurb: "Single deck that pays 6:5 for blackjack. The payout wipes out a counter's edge.",
            rules: r(|x| {
                x.decks = 1;
                x.das = false;
                x.max_hands = 2;
                x.bj_pays = 1.2;
                x.double_on = DoubleOn::NineToEleven;
                x.penetration = 0.5;
            }),
            table: t(2, 150.0, 15.0, 300.0),
        },
        Preset {
            id: "eight-deck",
            name: "8-deck, shallow cut",
            verdict: "Poor",
            blurb: "8 decks, H17, DAS, no surrender, 3:2, about 60% dealt.",
            rules: r(|x| {
                x.decks = 8;
                x.h17 = true;
                x.penetration = 0.6;
            }),
            table: t(3, 85.0, 15.0, 1000.0),
        },
        Preset {
            id: "enhc",
            name: "European no-hole-card",
            verdict: "Poor",
            blurb: "6 decks, S17, no peek (lose doubles and splits to blackjack), double 9–11, 3:2.",
            rules: r(|x| {
                x.peek = false;
                x.obo = false;
                x.double_on = DoubleOn::NineToEleven;
            }),
            table: t(2, 90.0, 25.0, 1000.0),
        },
        Preset {
            id: "six-five-shoe",
            name: "6:5 six-deck shoe",
            verdict: "Avoid",
            blurb: "6 decks, H17, 6:5 blackjack. Over 2% house edge before counting.",
            rules: r(|x| {
                x.h17 = true;
                x.bj_pays = 1.2;
            }),
            table: t(3, 85.0, 15.0, 1000.0),
        },
        Preset {
            id: "csm",
            name: "Continuous shuffler",
            verdict: "Unbeatable",
            blurb: "Cards return to the shoe every round. Counting gains nothing.",
            rules: r(|x| {
                x.decks = 8;
                x.csm = true;
            }),
            table: t(0, 200.0, 10.0, 1000.0),
        },
    ]
}

// ----- Shorthand parser --------------------------------------------------------------------

/// The result of parsing a rules description.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ParsedRules {
    pub understood: Vec<String>,
    pub ignored: Vec<String>,
}

/// Apply a description such as `6D H17 DAS LS 3:2 PEN:80%` or
/// "six decks, dealer hits soft 17, late surrender" to `rules` and `table`.
pub fn parse_rules(text: &str, rules: &mut Rules, table: &mut TableConditions) -> ParsedRules {
    let mut out = ParsedRules::default();
    let lower = format!(" {} ", text.to_lowercase().replace([',', ';', '|', '\n', '\t', '(', ')'], " "));
    let mut s = lower.clone();

    // Phrases first (they contain words the token pass would misread).
    let phrases: &[(&str, &str)] = &[
        ("single deck", "1d"),
        ("single-deck", "1d"),
        ("double deck", "2d"),
        ("double-deck", "2d"),
        ("hits soft 17", "h17"),
        ("hit soft 17", "h17"),
        ("hits on soft 17", "h17"),
        ("stands on soft 17", "s17"),
        ("stand on soft 17", "s17"),
        ("stands soft 17", "s17"),
        ("no double after split", "nodas"),
        ("double after split", "das"),
        ("no resplit aces", "norsa"),
        ("resplit aces", "rsa"),
        ("hit split aces", "hsa"),
        ("late surrender", "ls"),
        ("early surrender", "es"),
        ("no surrender", "nosur"),
        ("no hole card", "enhc"),
        ("no peek", "enhc"),
        ("original bets only", "obo"),
        ("continuous shuffler", "csm"),
        ("continuous shuffling", "csm"),
        ("no resplit", "spl2"),
    ];
    for (p, tok) in phrases {
        if s.contains(p) {
            s = s.replace(p, &format!(" {tok} "));
        }
    }
    let words = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
    for (i, w) in words.iter().enumerate() {
        for suffix in [" decks", " deck", "-deck", "-decks"] {
            let p = format!("{w}{suffix}");
            if s.contains(&p) {
                s = s.replace(&p, &format!(" {}d ", i + 1));
            }
        }
    }

    let toks: Vec<String> = s.split_whitespace().map(|x| x.to_string()).collect();
    let mut i = 0;
    while i < toks.len() {
        let tok = toks[i].as_str();
        let next = toks.get(i + 1).map(|x| x.as_str());
        let mut took = 1;
        let ok: Option<String> = (|| {
            // "6d", "6", "decks"
            if let Some(n) = tok.strip_suffix('d').and_then(|d| d.parse::<u32>().ok()) {
                rules.decks = n;
                return Some(format!("{n} deck(s)"));
            }
            if let Ok(n) = tok.parse::<u32>() {
                if matches!(next, Some("decks") | Some("deck") | Some("d")) && (1..=8).contains(&n) {
                    rules.decks = n;
                    took = 2;
                    return Some(format!("{n} deck(s)"));
                }
            }
            match tok {
                "s17" => { rules.h17 = false; Some("Dealer stands on soft 17".into()) }
                "h17" => { rules.h17 = true; Some("Dealer hits soft 17".into()) }
                "das" => { rules.das = true; Some("Double after split".into()) }
                "nodas" | "ndas" | "no-das" => { rules.das = false; Some("No double after split".into()) }
                "rsa" => { rules.resplit_aces = true; Some("Resplit aces".into()) }
                "norsa" | "no-rsa" => { rules.resplit_aces = false; Some("No resplitting aces".into()) }
                "hsa" => { rules.hit_split_aces = true; Some("Hit split aces".into()) }
                "nohsa" => { rules.hit_split_aces = false; Some("No hitting split aces".into()) }
                "ls" => { rules.surrender = Surrender::Late; Some("Late surrender".into()) }
                "es" => { rules.surrender = Surrender::Early; Some("Early surrender".into()) }
                "nosur" | "nols" | "no-sur" => { rules.surrender = Surrender::None; Some("No surrender".into()) }
                "3:2" | "6:5" | "7:5" | "2:1" | "1:1" => {
                    let (a, b) = tok.split_once(':').unwrap();
                    rules.bj_pays = a.parse::<f64>().unwrap() / b.parse::<f64>().unwrap();
                    Some(format!("Blackjack pays {tok}"))
                }
                "peek" => { rules.peek = true; rules.obo = true; Some("Dealer peeks for blackjack".into()) }
                "enhc" | "nopeek" | "no-peek" => { rules.peek = false; rules.obo = false; Some("No hole card".into()) }
                "enhc-obo" | "obo" => { rules.peek = false; rules.obo = true; Some("No hole card, original bets only".into()) }
                "allbets" => { rules.obo = false; Some("Lose all bets to dealer blackjack".into()) }
                "csm" => { rules.csm = true; Some("Continuous shuffler".into()) }
                "d9" | "dbl:9-11" | "db9" => { rules.double_on = DoubleOn::NineToEleven; Some("Double on 9–11 only".into()) }
                "d10" | "dbl:10-11" | "db10" => { rules.double_on = DoubleOn::TenToEleven; Some("Double on 10–11 only".into()) }
                "da2" | "dbl:any" | "doa" => { rules.double_on = DoubleOn::Any; Some("Double on any two cards".into()) }
                "nodbl" | "dbl:none" => { rules.double_on = DoubleOn::None; Some("No doubling".into()) }
                _ => {
                    if let Some(n) = tok.strip_prefix("spl").and_then(|x| x.trim_start_matches(':').parse::<u32>().ok()) {
                        rules.max_hands = n;
                        return Some(format!("Split up to {n} hands"));
                    }
                    if let Some(v) = tok.strip_prefix("pen").map(|x| x.trim_start_matches(|c| c == ':' || c == '=')) {
                        if let Some(p) = parse_pen(v, rules.decks) {
                            rules.penetration = p;
                            return Some(format!("{}% dealt", (p * 100.0).round()));
                        }
                    }
                    for (key, field) in [("min:", 0), ("max:", 1), ("rph:", 2), ("players:", 3)] {
                        if let Some(v) = tok.strip_prefix(key).and_then(|x| x.trim_start_matches('$').parse::<f64>().ok()) {
                            match field {
                                0 => table.min_bet = v,
                                1 => table.max_bet = v,
                                2 => table.rounds_per_hour = v,
                                _ => table.other_players = v as u32,
                            }
                            return Some(tok.to_string());
                        }
                    }
                    None
                }
            }
        })();
        match ok {
            Some(label) => out.understood.push(label),
            None => {
                let filler = ["decks", "deck", "dealer", "and", "the", "on", "pays", "blackjack", "bj", "with", "a"];
                if !filler.contains(&tok) {
                    out.ignored.push(tok.to_string());
                }
            }
        }
        i += took;
    }
    let sane = rules.clone().sanitized();
    *rules = sane;
    out
}

fn parse_pen(v: &str, decks: u32) -> Option<f64> {
    let p = if let Some(x) = v.strip_suffix('%') {
        x.parse::<f64>().ok()? / 100.0
    } else if let Some(x) = v.strip_suffix('d') {
        x.parse::<f64>().ok()? / decks.max(1) as f64
    } else if let Some((a, b)) = v.split_once('/') {
        a.parse::<f64>().ok()? / b.parse::<f64>().ok()?
    } else {
        let x = v.parse::<f64>().ok()?;
        if x > 1.0 { x / 100.0 } else { x }
    };
    Some(p.clamp(0.1, 0.97))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shorthand_and_phrases() {
        let mut r = Rules::default();
        let mut t = TableConditions::default();
        let p = parse_rules("8D H17 NoDAS LS RSA 6:5 ENHC PEN:4.5d SPL3 MIN:15 players:4", &mut r, &mut t);
        assert_eq!(r.decks, 8);
        assert!(r.h17 && !r.das && r.resplit_aces && !r.peek);
        assert_eq!(r.surrender, Surrender::Late);
        assert!((r.bj_pays - 1.2).abs() < 1e-12);
        assert!((r.penetration - 4.5 / 8.0).abs() < 1e-12);
        assert_eq!(r.max_hands, 3);
        assert_eq!(t.min_bet, 15.0);
        assert_eq!(t.other_players, 4);
        assert!(p.ignored.is_empty(), "ignored {:?}", p.ignored);

        let mut r = Rules::default();
        parse_rules("Six decks, dealer hits soft 17, late surrender, double after split, 3:2", &mut r, &mut t);
        assert_eq!(r.decks, 6);
        assert!(r.h17 && r.das);
        assert_eq!(r.surrender, Surrender::Late);
    }

    #[test]
    fn shorthand_round_trips() {
        for p in presets() {
            let mut r = Rules::default();
            let mut t = TableConditions::default();
            let parsed = parse_rules(&p.rules.shorthand(), &mut r, &mut t);
            assert!(parsed.ignored.is_empty(), "{}: {:?}", p.id, parsed.ignored);
            let expect = p.rules.clone().sanitized();
            assert_eq!(r.peek, expect.peek, "{}", p.id);
            assert_eq!(r.obo, expect.obo, "{}", p.id);
            assert_eq!(r.decks, expect.decks, "{}", p.id);
            assert_eq!(r.h17, expect.h17, "{}", p.id);
            assert_eq!(r.surrender, expect.surrender, "{}", p.id);
            assert_eq!(r.double_on, expect.double_on, "{}", p.id);
            assert_eq!(r.csm, expect.csm, "{}", p.id);
            assert!((r.bj_pays - expect.bj_pays).abs() < 1e-9, "{}", p.id);
        }
    }

    #[test]
    fn cut_card_leaves_room_for_a_round() {
        let r = Rules { decks: 1, penetration: 0.95, ..Rules::default() };
        assert_eq!(r.cut_card(1), 52 - 20);
        assert_eq!(Rules { csm: true, ..Rules::default() }.cut_card(2), 0);
    }
}
