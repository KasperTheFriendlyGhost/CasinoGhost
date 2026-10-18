//! Small, fast, seedable random numbers: xoshiro256++ seeded through SplitMix64.
//!
//! Every simulation thread gets its own generator, derived from the run seed and the thread
//! index, so results are reproducible for a given seed regardless of scheduling.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rng {
    s: [u64; 4],
}

#[inline]
fn splitmix64(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut x = seed;
        let s = [splitmix64(&mut x), splitmix64(&mut x), splitmix64(&mut x), splitmix64(&mut x)];
        Rng { s }
    }

    /// An independent stream for worker `index` of a run seeded with `seed`.
    pub fn stream(seed: u64, index: u64) -> Self {
        let mut x = seed ^ index.wrapping_mul(0xD1B5_4A32_D192_ED03);
        let _ = splitmix64(&mut x);
        Rng::new(splitmix64(&mut x))
    }

    /// Seed from the clock, for interactive play.
    pub fn from_entropy() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x5EED);
        let addr = &nanos as *const u64 as u64;
        Rng::new(nanos ^ addr.rotate_left(32))
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let s = &mut self.s;
        let result = s[0].wrapping_add(s[3]).rotate_left(23).wrapping_add(s[0]);
        let t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(45);
        result
    }

    /// Uniform integer in `0..n` (Lemire's method, unbiased). `n` must be > 0.
    #[inline]
    pub fn below(&mut self, n: u32) -> u32 {
        let mut m = (self.next_u64() >> 32) * n as u64;
        let mut l = m as u32;
        if l < n {
            let t = n.wrapping_neg() % n;
            while l < t {
                m = (self.next_u64() >> 32) * n as u64;
                l = m as u32;
            }
        }
        (m >> 32) as u32
    }

    /// Uniform float in `[0, 1)`.
    #[inline]
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reproducible_and_uniform() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
        let mut r = Rng::new(7);
        let mut hist = [0u32; 13];
        let n = 1_300_000;
        for _ in 0..n {
            hist[r.below(13) as usize] += 1;
        }
        for h in hist {
            let dev = (h as f64 - 100_000.0).abs();
            assert!(dev < 1_500.0, "bucket {h} too far from 100,000");
        }
        let mean: f64 = (0..100_000).map(|_| r.f64()).sum::<f64>() / 100_000.0;
        assert!((mean - 0.5).abs() < 0.005);
    }

    #[test]
    fn streams_differ() {
        let mut a = Rng::stream(1, 0);
        let mut b = Rng::stream(1, 1);
        assert_ne!(a.next_u64(), b.next_u64());
    }
}
