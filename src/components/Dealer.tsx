// The dealer's side of the table: the dealer, the chip rack (float), a nameplate and what they say.
import { AnimatePresence, motion } from 'motion/react';

/** Upper body of the dealer standing behind the table: vest, white shirt, bow tie. */
export function DealerFigure() {
  return (
    <svg viewBox="0 0 160 92" className="block w-full" aria-hidden>
      <defs>
        <linearGradient id="dl-vest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#23262c" /><stop offset="1" stopColor="#111316" /></linearGradient>
        <linearGradient id="dl-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c99a7b" /><stop offset="1" stopColor="#a87a5d" /></linearGradient>
        <linearGradient id="dl-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f3ec" /><stop offset="1" stopColor="#d9d4c8" /></linearGradient>
        <radialGradient id="dl-glow" cx="50%" cy="100%" r="70%"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="80" cy="92" rx="78" ry="16" fill="url(#dl-glow)" />
      {/* shoulders and sleeves */}
      <path d="M14 92c2-22 16-34 38-38l28-4 28 4c22 4 36 16 38 38z" fill="url(#dl-shirt)" />
      {/* vest */}
      <path d="M40 92c1-18 6-30 18-36l22 26 22-26c12 6 17 18 18 36z" fill="url(#dl-vest)" />
      <path d="M80 82v10" stroke="#3a3d44" strokeWidth="1" />
      <circle cx="80" cy="86" r="1.3" fill="#c9a14e" />
      {/* collar, bow tie, name tag */}
      <path d="M68 50l12 14 12-14-4-4H72z" fill="url(#dl-shirt)" />
      <path d="M70 58l10 4-10 4zM90 58l-10 4 10 4z" fill="#7a1420" /><rect x="77.5" y="59.8" width="5" height="4.4" rx="1" fill="#5c0f18" />
      <rect x="99" y="70" width="14" height="5" rx="1" fill="#c9a14e" />
      {/* neck and head (no face: the dealer is a presence, not a portrait) */}
      <path d="M72 40h16v10l-8 5-8-5z" fill="url(#dl-skin)" />
      <ellipse cx="80" cy="26" rx="15" ry="18" fill="url(#dl-skin)" />
      <path d="M64.5 24c0-11 7-18 15.5-18s15.5 7 15.5 17c-3-5-8-8-15-8-7 0-12 4-16 9z" fill="#2a1d16" />
    </svg>
  );
}

const RACK = [
  { bg: '#6b3fa0', edge: '#e6dbf5' }, { bg: '#6b3fa0', edge: '#e6dbf5' },
  { bg: '#1c1c1e', edge: '#e8e8e8' }, { bg: '#1c1c1e', edge: '#e8e8e8' },
  { bg: '#1f8a4c', edge: '#d5f0de' }, { bg: '#1f8a4c', edge: '#d5f0de' },
  { bg: '#c62f2f', edge: '#f3d7d7' }, { bg: '#c62f2f', edge: '#f3d7d7' },
];

/** The dealer's float: tubes of chips in a smoked-acrylic tray. */
export function ChipRack() {
  return (
    <div className="relative mx-auto flex w-[min(230px,52vw)] gap-[3px] rounded-[7px] p-[4px]" aria-hidden
      style={{ background: 'linear-gradient(180deg, rgba(20,22,24,.75), rgba(8,9,10,.85))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 6px 14px rgba(0,0,0,.35)' }}>
      {RACK.map((c, i) => (
        <div key={i} className="h-[18px] flex-1 rounded-[3px]"
          style={{ background: `repeating-linear-gradient(90deg, ${c.bg} 0 3px, ${c.edge} 3px 4px, ${c.bg} 4px 6px)`, boxShadow: 'inset 0 2px 3px rgba(255,255,255,.25), inset 0 -3px 4px rgba(0,0,0,.45)' }} />
      ))}
    </div>
  );
}

/** Nameplate and the dealer's latest line, on one row. */
export function DealerSays({ name, line, lineKey, delay }: { name: string; line: string; lineKey: string; delay: number }) {
  return (
    <div className="pointer-events-none flex min-h-[28px] min-w-0 max-w-[min(440px,78vw)] items-center gap-2" aria-live="polite">
      <div className="shrink-0 rounded-full bg-[#1a1712] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2c27a] ring-1 ring-[#e2c27a]/30">{name}</div>
      {/* One line at a time: the last one leaves before the next arrives, so they never overlap. */}
      <AnimatePresence mode="wait" initial={false}>
        {line && (
          <motion.div key={lineKey} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.25, delay } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="relative min-w-0 line-clamp-2 rounded-2xl rounded-tl-sm bg-[#fbf7ee] px-3 py-1 text-[12.5px] font-semibold leading-snug text-[#2a2418] shadow-[0_4px_14px_rgba(0,0,0,.35)]">
            {line}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
