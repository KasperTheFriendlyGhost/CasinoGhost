// The dealing shoe and the discard tray, drawn in perspective as they sit on a casino table.
// Both fill and empty to scale, so decks can be judged by eye.
import type { Ref } from 'react';

const PCT = (v: number, of: number) => `${(v / of) * 100}%`;

interface ShoeProps {
  /** Cards still in the shoe. */
  left: number;
  size: number;
  /** Cards dealt when the cut card comes out. */
  cut: number;
  decks: number;
  showNumbers: boolean;
  /** Element at the shoe's mouth, where dealt cards come from. */
  mouthRef?: Ref<HTMLSpanElement>;
}

// Shoe geometry (SVG units). The mouth slopes toward the dealer on the left.
const VW = 230, VH = 124;
const X0 = 50, YB = 110, L = 136, H = 58, DX = 30, DY = -24, RAMP = 36;
const LMAX = L - 30; // interior length a full shoe of cards fills
const SLANT = -Math.atan(RAMP / H) * (180 / Math.PI); // card-edge lean, matches the ramp

/** Ramp-parallel quadrilateral on the side face between offsets a and b from the front. */
function sideBand(a: number, b: number, inset = 2) {
  const x = X0 - RAMP + 6;
  return `${x + a},${YB - inset} ${x + b},${YB - inset} ${x + b + RAMP},${YB - H + inset} ${x + a + RAMP},${YB - H + inset}`;
}
/** Same band, on the top face. */
function topBand(a: number, b: number) {
  const x = X0 + 6;
  return `${x + a},${YB - H} ${x + b},${YB - H} ${x + b + DX},${YB - H + DY} ${x + a + DX},${YB - H + DY}`;
}

export function DealingShoe({ left, size, cut, decks, showNumbers, mouthRef }: ShoeProps) {
  const len = Math.max(0, (left / size) * LMAX);
  const dealt = size - left;
  const cutFromFront = Math.max(0, ((cut - dealt) / size) * LMAX);
  const s0 = 3, s1 = s0 + len;
  return (
    <div className="relative select-none" style={{ width: 'min(200px, 24vw)', minWidth: 150 }}
      aria-label={showNumbers ? `${(left / 52).toFixed(1)} decks left in the shoe` : 'Dealing shoe'}>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" aria-hidden>
        <defs>
          <pattern id="shoe-edges" width="3" height="10" patternUnits="userSpaceOnUse" patternTransform={`skewX(${SLANT})`}>
            <rect width="3" height="10" fill="#fdfbf5" /><rect width="0.7" height="10" fill="#d2cab6" />
          </pattern>
          <pattern id="shoe-top-edges" width="3" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-55)">
            <rect width="3" height="10" fill="#ffffff" /><rect width="0.7" height="10" fill="#dcd5c3" />
          </pattern>
          <linearGradient id="shoe-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff4d58" stopOpacity="0.14" /><stop offset="0.8" stopColor="#c01c28" stopOpacity="0.32" /><stop offset="1" stopColor="#7a0d16" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="shoe-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb3b8" stopOpacity="0.22" /><stop offset="0.5" stopColor="#e0303c" stopOpacity="0.1" /><stop offset="1" stopColor="#ffc9cc" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="shoe-ramp" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#5c0a12" /><stop offset="1" stopColor="#b51d28" />
          </linearGradient>
          <pattern id="shoe-back" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#6b1622" /><path d="M0 3H6M3 0V6" stroke="#d9b56a" strokeOpacity=".6" strokeWidth="0.8" />
          </pattern>
          <radialGradient id="shoe-shadow"><stop offset="0" stopColor="#000" stopOpacity=".45" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        </defs>

        {/* shadow on the felt */}
        <ellipse cx={X0 + L / 2 + 6} cy={YB + 5} rx={L / 2 + 30} ry={9} fill="url(#shoe-shadow)" />

        {/* back face (seen through the body) */}
        <polygon points={`${X0 + L},${YB} ${X0 + L + DX},${YB + DY} ${X0 + L + DX},${YB - H + DY} ${X0 + L},${YB - H}`} fill="#5e0a12" fillOpacity="0.85" />

        {/* cards inside, then the weight that pushes them forward */}
        {len > 0 && <polygon points={topBand(s0, s1)} fill="url(#shoe-top-edges)" />}
        {len > 0 && <polygon points={sideBand(s0, s1)} fill="url(#shoe-edges)" />}
        <polygon points={topBand(s1, s1 + 13)} fill="#2a2a2e" />
        <polygon points={sideBand(s1, s1 + 13, 1)} fill="#1b1b1f" />
        {/* cut card */}
        {left > 0 && (
          <g>
            <polygon points={sideBand(s0 + Math.min(cutFromFront, len), s0 + Math.min(cutFromFront, len) + 1.6, -4)} fill="#ffd23f" />
            <polygon points={topBand(s0 + Math.min(cutFromFront, len), s0 + Math.min(cutFromFront, len) + 1.6)} fill="#ffe27a" />
          </g>
        )}

        {/* acrylic body */}
        <polygon points={`${X0 - RAMP},${YB} ${X0 + L},${YB} ${X0 + L},${YB - H} ${X0 + 6},${YB - H}`} fill="url(#shoe-side)" />
        <polygon points={`${X0 + 6},${YB - H} ${X0 + L},${YB - H} ${X0 + L + DX},${YB - H + DY} ${X0 + 6 + DX},${YB - H + DY}`} fill="url(#shoe-top)" />
        {/* the mouth: sloped face plate showing the next card's back, with a finger slot */}
        <polygon points={`${X0 - RAMP},${YB} ${X0 + 6},${YB - H} ${X0 + 6 + DX},${YB - H + DY} ${X0 - RAMP + DX},${YB + DY}`} fill="url(#shoe-ramp)" />
        {left > 0 && (
          <polygon points={`${X0 - RAMP + 9},${YB - 4} ${X0 + 3},${YB - H + 5} ${X0 + 3 + DX - 6},${YB - H + DY + 5} ${X0 - RAMP + 9 + DX - 6},${YB + DY - 4}`}
            fill="url(#shoe-back)" stroke="#f4efe2" strokeWidth="1.4" />
        )}
        <path d={`M${X0 - RAMP + 4 + DX * 0.35},${YB + DY * 0.35 - 1} q 10 -9 20 0`} fill="#2b0307" opacity="0.9" />

        {/* solid acrylic base and outline */}
        <polygon points={`${X0 - RAMP},${YB} ${X0 + L},${YB} ${X0 + L},${YB - 6} ${X0 - RAMP + 4.1},${YB - 6}`} fill="#8e111c" fillOpacity="0.92" />
        <polygon points={`${X0 - RAMP},${YB} ${X0 + L},${YB} ${X0 + L},${YB - H} ${X0 + 6},${YB - H}`} fill="none" stroke="#ffc2c6" strokeOpacity="0.55" strokeWidth="1" />
        <polygon points={`${X0 + L},${YB} ${X0 + L + DX},${YB + DY} ${X0 + L + DX},${YB - H + DY} ${X0 + L},${YB - H}`} fill="#a3141f" fillOpacity="0.45" stroke="#ffc2c6" strokeOpacity="0.4" strokeWidth="1" />
        {/* highlights */}
        <polyline points={`${X0 + 6},${YB - H} ${X0 + L},${YB - H} ${X0 + L + DX},${YB - H + DY}`} fill="none" stroke="#ffd3d6" strokeOpacity="0.55" strokeWidth="1.2" />
        <line x1={X0 - RAMP} y1={YB} x2={X0 + L} y2={YB} stroke="#2b0307" strokeOpacity="0.6" strokeWidth="1.5" />
        <line x1={X0 - RAMP} y1={YB} x2={X0 + 6} y2={YB - H} stroke="#ffb3b8" strokeOpacity="0.5" strokeWidth="1" />
      </svg>
      {/* card launch point */}
      <span ref={mouthRef} className="absolute size-1" style={{ left: PCT(X0 - 8, VW), top: PCT(YB - H / 2 + DY / 2, VH) }} />
      {showNumbers && <div className="-mt-1 text-right font-display text-[13px] font-bold tracking-wide text-[#efe6cf]/90">{(left / 52).toFixed(1)} of {decks} decks</div>}
    </div>
  );
}

interface TrayProps {
  inTray: number;
  size: number;
  decks: number;
  marks: boolean;
  onClick?: () => void;
  trayRef?: Ref<HTMLButtonElement>;
}

// Tray geometry: a clear box; played cards lie flat and the pile grows upward.
const TW = 92, TH = 132;
const BX = 12, BY = 120, BW = 54, BH = 96, TDX = 18, TDY = -14;

export function DiscardTray({ inTray, size, decks, marks, onClick, trayRef }: TrayProps) {
  const h = (inTray / size) * (BH - 6);
  const top = BY - 3 - h;
  return (
    <button ref={trayRef} onClick={onClick} className="group relative shrink-0 cursor-pointer select-none" style={{ width: 'min(74px, 11vw)', minWidth: 58 }}
      aria-label="Discard tray: estimate the decks played" title="Discard tray: click to practise deck estimation">
      <svg viewBox={`0 0 ${TW} ${TH}`} className="block w-full" aria-hidden>
        <defs>
          <pattern id="tray-edges" width="10" height="2.4" patternUnits="userSpaceOnUse">
            <rect width="10" height="2.4" fill="#f7f3e8" /><rect y="1.6" width="10" height="0.8" fill="#bdb5a1" />
          </pattern>
          <pattern id="tray-back" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#6b1622" /><path d="M0 3H6M3 0V6" stroke="#d9b56a" strokeOpacity=".6" strokeWidth="0.8" />
          </pattern>
          <linearGradient id="tray-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" /><stop offset="0.6" stopColor="#ffffff" stopOpacity="0.06" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.14" />
          </linearGradient>
          <radialGradient id="tray-shadow"><stop offset="0" stopColor="#000" stopOpacity=".4" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx={BX + BW / 2 + 8} cy={BY + 4} rx={BW / 2 + 18} ry={6} fill="url(#tray-shadow)" />
        {/* back and right walls */}
        <polygon points={`${BX + TDX},${BY + TDY} ${BX + BW + TDX},${BY + TDY} ${BX + BW + TDX},${BY - BH + TDY} ${BX + TDX},${BY - BH + TDY}`} fill="#ffffff" fillOpacity="0.05" stroke="#ffffff" strokeOpacity="0.25" />
        {/* the pile: side edges on the front, card back on top */}
        {h > 0.5 && (
          <g>
            <polygon points={`${BX + BW},${BY - 3} ${BX + BW + TDX - 3},${BY + TDY + 0} ${BX + BW + TDX - 3},${top + TDY + 3} ${BX + BW},${top}`} fill="#d9d2c0" />
            <rect x={BX + 3} y={top} width={BW - 3} height={h} fill="url(#tray-edges)" />
            <polygon points={`${BX + 3},${top} ${BX + BW},${top} ${BX + BW + TDX - 3},${top + TDY + 3} ${BX + 3 + TDX - 3},${top + TDY + 3}`} fill="url(#tray-back)" stroke="#f4efe2" strokeWidth="1" />
          </g>
        )}
        {/* front glass, top rim and right wall */}
        <polygon points={`${BX + BW},${BY} ${BX + BW + TDX},${BY + TDY} ${BX + BW + TDX},${BY - BH + TDY} ${BX + BW},${BY - BH}`} fill="url(#tray-glass)" stroke="#ffffff" strokeOpacity="0.4" />
        <rect x={BX} y={BY - BH} width={BW} height={BH} rx="2" fill="url(#tray-glass)" stroke="#ffffff" strokeOpacity="0.55" className="transition-[stroke] group-hover:stroke-[#d6ac52]" />
        <polyline points={`${BX},${BY - BH} ${BX + TDX},${BY - BH + TDY} ${BX + BW + TDX},${BY - BH + TDY} ${BX + BW},${BY - BH}`} fill="none" stroke="#ffffff" strokeOpacity="0.5" />
        {marks && Array.from({ length: decks - 1 }, (_, i) => {
          const y = BY - 3 - ((i + 1) / decks) * (BH - 6);
          return <g key={i}><line x1={BX} y1={y} x2={BX + 7} y2={y} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.2" /><text x={BX + 9} y={y + 3} fontSize="8" fill="#ffffff" fillOpacity="0.65" fontFamily="var(--font-data)">{i + 1}</text></g>;
        })}
      </svg>
    </button>
  );
}
