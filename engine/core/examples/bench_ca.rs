use cg::ca;
use cg::cards::fresh_comp;
use cg::rules::Rules;
use std::time::Instant;

fn main() {
    let rules = Rules::default();
    let mut comp = fresh_comp(6);
    for v in 2..=6 { comp[v] -= 6.0; }
    let t = Instant::now();
    let n = 50;
    let mut s = 0.0;
    for _ in 0..n { s += ca::perfect_round_ev(&rules, &comp); }
    println!("perfect_round_ev: {:.2} ms each (ev {:.4}%)", t.elapsed().as_secs_f64() * 1000.0 / n as f64, s / n as f64 * 100.0);
    let t = Instant::now();
    let m = 2000;
    let mut x = 0.0;
    for i in 0..m { let mut c = comp; c[1 + i % 10] -= 1.0; x += ca::dealer_dist(1 + i % 10, &c, false).dist[5]; }
    println!("dealer_dist: {:.1} µs each ({x:.1})", t.elapsed().as_secs_f64() * 1e6 / m as f64);
    let t = Instant::now();
    for _ in 0..m { x += ca::eval_cell(&rules, false, ca::Kind::Hard, 16, 10, &comp)[0]; }
    println!("eval_cell hard16v10: {:.1} µs each ({x:.1})", t.elapsed().as_secs_f64() * 1e6 / m as f64);
}
