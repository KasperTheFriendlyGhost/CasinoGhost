// Table sounds, synthesised with Web Audio so there are no audio files to license or load.
// iOS only allows audio after a user gesture; the context is created on first use.

let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.6;

export const setSoundEnabled = (on: boolean) => { enabled = on; };
export const setSoundVolume = (v: number) => { volume = Math.max(0, Math.min(1, v)); };

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

let noise: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** A filtered noise burst: the swish of a card or the riffle of a shuffle. */
function swish(c: AudioContext, at: number, dur: number, freq: number, gain: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain * volume, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at, Math.random() * 0.3, dur + 0.02);
}

/** A short decaying tone. */
function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain * volume, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

/** A struck bell: a few inharmonic partials, each decaying at its own rate. */
function bell(c: AudioContext, at: number, freq: number, gain: number) {
  const partials: [number, number, number][] = [[1, 1, 1.4], [2.0, 0.45, 0.9], [2.76, 0.3, 0.6], [5.4, 0.12, 0.3]];
  for (const [mult, amp, dur] of partials) tone(c, at, freq * mult, dur, gain * amp, 'sine');
}

export const sfx = {
  /** A card sliding onto the felt. */
  card(delaySec = 0) {
    const c = audio(); if (!c) return;
    swish(c, c.currentTime + delaySec, 0.09, 2600 + Math.random() * 900, 0.32);
  },
  /** Clay chips touching. */
  chip(delaySec = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delaySec;
    tone(c, t, 2350 + Math.random() * 200, 0.07, 0.12, 'triangle');
    tone(c, t + 0.035, 3150 + Math.random() * 250, 0.06, 0.09, 'triangle');
  },
  /** The dealer riffling a fresh shoe. */
  shuffle() {
    const c = audio(); if (!c) return;
    for (let i = 0; i < 26; i++) swish(c, c.currentTime + i * 0.024 + Math.random() * 0.01, 0.05, 1800 + Math.random() * 1600, 0.16);
  },
  /** A bright bell chime for a winning hand: a rising third that rings out. */
  win(delaySec = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delaySec;
    bell(c, t, 1046.5, 0.16); bell(c, t + 0.12, 1318.5, 0.14);
  },
  /** A fuller chime for blackjack: a major arpeggio up to the octave. */
  blackjack(delaySec = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delaySec;
    [784, 988, 1175, 1568].forEach((f, i) => bell(c, t + i * 0.09, f, 0.13));
  },
  /** A low, gentle note for a graded mistake. */
  mistake() {
    const c = audio(); if (!c) return;
    tone(c, c.currentTime, 196, 0.22, 0.1, 'sine');
  },
};
