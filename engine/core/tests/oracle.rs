//! The Rust analysis engine must reproduce the original JavaScript engine (which was checked
//! against published strategy charts and house edges) for every rule set in the fixture.

use cg::ca::Kind;
use cg::rules::{DoubleOn, Rules, Surrender};
use cg::strategy::{basic_strategy, cell_code, house_edge, idx};
use serde_json::Value;

fn rules_from(js: &Value) -> Rules {
    Rules {
        decks: js["decks"].as_u64().unwrap() as u32,
        h17: js["h17"].as_bool().unwrap(),
        peek: js["peek"].as_bool().unwrap(),
        obo: js["obo"].as_bool().unwrap(),
        bj_pays: js["bjPay"].as_f64().unwrap(),
        das: js["das"].as_bool().unwrap(),
        double_on: match js["doubleOn"].as_str().unwrap() {
            "any" => DoubleOn::Any,
            "9-11" => DoubleOn::NineToEleven,
            "10-11" => DoubleOn::TenToEleven,
            _ => DoubleOn::None,
        },
        max_hands: js["maxHands"].as_u64().unwrap() as u32,
        resplit_aces: js["resplitAces"].as_bool().unwrap(),
        hit_split_aces: js["hitSplitAces"].as_bool().unwrap(),
        surrender: match js["surrender"].as_str().unwrap() {
            "late" => Surrender::Late,
            "early" => Surrender::Early,
            _ => Surrender::None,
        },
        penetration: js["penetration"].as_f64().unwrap(),
        csm: js["csm"].as_bool().unwrap(),
    }
}

#[test]
fn matches_the_javascript_engine_exactly() {
    let data: Vec<Value> = serde_json::from_str(include_str!("fixtures/cutcard_oracle.json")).unwrap();
    assert!(data.len() >= 18);
    for case in &data {
        let rules = rules_from(&case["rules"]);
        let label = rules.shorthand();
        let s = basic_strategy(&rules);
        let ev = -house_edge(&rules, &s);
        let want = case["ev"].as_f64().unwrap();
        assert!((ev - want).abs() < 1e-9, "{label}: EV {ev} vs JS {want}");

        for (key, codes) in case["chart"].as_object().unwrap() {
            if codes.as_str().unwrap().trim().is_empty() {
                continue; // hard 20/21 can't be two non-pair cards
            }
            let (kind, k) = key.split_once(':').unwrap();
            let k: usize = k.parse().unwrap();
            let kind = match kind {
                "hard" => Kind::Hard,
                "soft" => Kind::Soft,
                _ => Kind::Pair,
            };
            let ours = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map(|u| cell_code(s.initial.get(kind), k, u)).join(" ");
            assert_eq!(&ours, codes.as_str().unwrap(), "{label}: {key}");
        }
        for (key, codes) in case["multi"].as_object().unwrap() {
            let (kind, t) = key.split_once(':').unwrap();
            let t: usize = t.parse().unwrap();
            let tab = if kind == "hard" { &s.multi_hard } else { &s.multi_soft };
            let ours = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map(|u| tab[idx(t, u)].to_string()).join(" ");
            assert_eq!(&ours, codes.as_str().unwrap(), "{label}: multi {key}");
        }
    }
}
