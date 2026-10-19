#!/usr/bin/env python3
"""Synthesise the table sounds for the native app (no recorded or licensed audio).

Writes 44.1 kHz mono 16-bit WAVs to apple/CasinoGhost/Sounds. Several variations of the
card and chip sounds are made so repeated plays don't sound identical.
"""
import math
import os
import random
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "apple", "CasinoGhost", "Sounds")


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.89 / peak if peak > 0.89 else 1.0
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * scale)) * 32767)) for s in samples))


def bandpass(x, f, q):
    """RBJ biquad band-pass."""
    w0 = 2 * math.pi * f / SR
    alpha = math.sin(w0) / (2 * q)
    b0, b1, b2 = alpha, 0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * math.cos(w0), 1 - alpha
    y, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for s in x:
        o = (b0 * s + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1, y2, y1 = x1, s, y1, o
        y.append(o)
    return y


def env(n, attack, total):
    out = []
    for i in range(n):
        t = i / SR
        a = min(1.0, t / attack) if attack > 0 else 1.0
        d = math.exp(-5.5 * t / total)
        out.append(a * d)
    return out


def swish(dur, freq, gain, rnd):
    n = int(dur * SR)
    noise = [rnd.uniform(-1, 1) for _ in range(n)]
    f = bandpass(noise, freq, 0.9)
    e = env(n, 0.008, dur)
    return [gain * a * b for a, b in zip(f, e)]


def tone(freq, dur, gain, shape="sine"):
    n = int(dur * SR)
    out = []
    for i in range(n):
        t = i / SR
        ph = (freq * t) % 1.0
        if shape == "triangle":
            v = 4 * abs(ph - 0.5) - 1
        else:
            v = math.sin(2 * math.pi * freq * t)
        a = min(1.0, t / 0.005) * math.exp(-5.5 * t / dur)
        out.append(gain * a * v)
    return out


def bell(freq, gain):
    """A struck bell: a few inharmonic partials, each decaying at its own rate."""
    partials = [(1.0, 1.0, 1.4), (2.0, 0.45, 0.9), (2.76, 0.3, 0.6), (5.4, 0.12, 0.3)]
    n = int(max(d for _, _, d in partials) * SR)
    out = [0.0] * n
    for mult, amp, dur in partials:
        for i, v in enumerate(tone(freq * mult, dur, gain * amp)):
            out[i] += v
    return out


def mix(length, parts):
    buf = [0.0] * int(length * SR)
    for start, s in parts:
        o = int(start * SR)
        for i, v in enumerate(s):
            if o + i < len(buf):
                buf[o + i] += v
    return buf


def main():
    os.makedirs(OUT, exist_ok=True)
    rnd = random.Random(7)
    for k in range(4):
        write(f"card{k}", mix(0.14, [(0, swish(0.11, 2600 + rnd.uniform(0, 900), 0.9, rnd))]))
    for k in range(3):
        a, b = 2350 + rnd.uniform(0, 200), 3150 + rnd.uniform(0, 250)
        write(f"chip{k}", mix(0.14, [(0, tone(a, 0.07, 0.5, "triangle")), (0.035, tone(b, 0.06, 0.38, "triangle"))]))
    write("shuffle", mix(0.9, [(i * 0.024 + rnd.uniform(0, 0.01), swish(0.05, 1800 + rnd.uniform(0, 1600), 0.5, rnd)) for i in range(30)]))
    # a bright bell chime for a winning hand (a rising third), a fuller arpeggio for blackjack
    write("win", mix(1.6, [(0, bell(1046.5, 0.24)), (0.12, bell(1318.5, 0.21))]))
    write("blackjack", mix(1.9, [(i * 0.09, bell(f, 0.2)) for i, f in enumerate([784, 988, 1175, 1568])]))
    write("mistake", mix(0.3, [(0, tone(196, 0.22, 0.6))]))
    write("flip", mix(0.1, [(0, swish(0.06, 1500, 0.7, rnd))]))
    print("wrote", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
