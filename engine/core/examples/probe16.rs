use cg::ca::{comp_at_count, eval_cell, Kind, HIT, STAND};
use cg::rules::Rules;
fn main() {
    let rules = Rules::default();
    let tags = [0.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, -1.0];
    for d in [1.0, 3.0, 4.5] {
        print!("decks left {d}: ");
        for tc in [-1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0] {
            let v = eval_cell(&rules, false, Kind::Hard, 16, 10, &comp_at_count(tc, d, &tags));
            print!("tc {tc:+.1}: {:+.4}  ", v[STAND as usize] - v[HIT as usize]);
        }
        println!();
    }
}
