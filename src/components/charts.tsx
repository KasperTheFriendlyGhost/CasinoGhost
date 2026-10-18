import { useEffect, useRef, useState } from 'react';
import type { TcBin } from '../engine/sidecountSim';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceStep = (span: number, target = 5) => {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
};
const fmtPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;
const fmtTc = (t: number) => (t > 0 ? `+${t}` : `${t}`);

interface EvChartProps {
  bins: TcBin[];
  threshold: number | null;
  minShare?: number;
}

/** EV by true count (line) over a separate frequency strip. One y-scale per chart. */
export function EvByCountChart({ bins, threshold, minShare = 0.0004 }: EvChartProps) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = bins.reduce((a, b) => a + b.rounds, 0);
  const pts = bins.filter((b) => b.rounds / total >= minShare);
  if (pts.length < 2) return <div ref={ref} className="text-sm text-muted">Not enough rounds to chart.</div>;

  const H = 230, FH = 64, m = { l: 48, r: 14, t: 14, b: 26 };
  const x0 = pts[0].tc, x1 = pts[pts.length - 1].tc;
  const yMin = Math.min(0, ...pts.map((p) => p.meanEV)), yMax = Math.max(0.02, ...pts.map((p) => p.meanEV));
  const step = niceStep(yMax - yMin, 5);
  const lo = Math.floor(yMin / step) * step, hi = Math.ceil(yMax / step) * step;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (tc: number) => m.l + ((tc - x0) / Math.max(1, x1 - x0)) * iw;
  const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  const xStep = Math.max(1, Math.ceil((x1 - x0) / Math.max(4, Math.floor(iw / 48))));
  const xTicks: number[] = [];
  for (let t = Math.ceil(x0 / xStep) * xStep; t <= x1; t += xStep) xTicks.push(t);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.tc).toFixed(1)},${Y(p.meanEV).toFixed(1)}`).join('');
  const maxShare = Math.max(...pts.map((p) => p.rounds / total));
  const bw = Math.max(3, Math.min(24, iw / (x1 - x0 + 1) - 2));
  const hp = hover !== null ? pts.find((p) => p.tc === hover) : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tc = Math.round(x0 + ((e.clientX - r.left) / r.width) * (x1 - x0));
    setHover(Math.max(x0, Math.min(x1, tc)));
  };

  return (
    <div ref={ref} className="relative w-full">
      <svg width={W} height={H} role="img" aria-label="Side bet expected value by true count">
        {threshold !== null && threshold <= x1 && (
          <rect x={X(Math.max(threshold, x0)) - 0.5} y={m.t} width={X(x1) - X(Math.max(threshold, x0)) + 1} height={ih} fill="var(--brass-soft)" />
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={m.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{fmtPct(v)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tnum">{fmtTc(t)}</text>
        ))}
        {threshold !== null && threshold <= x1 && (
          <text x={X(Math.max(threshold, x0)) > W - 130 ? X(Math.max(threshold, x0)) - 6 : X(Math.max(threshold, x0)) + 6} textAnchor={X(Math.max(threshold, x0)) > W - 130 ? 'end' : 'start'} y={m.t + 14} fontSize="12" fontWeight="600" fill="var(--fg-2)">Bet from TC {fmtTc(threshold)}</text>
        )}
        <path d={d} fill="none" stroke="var(--series-pos)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hp && (
          <g>
            <line x1={X(hp.tc)} x2={X(hp.tc)} y1={m.t} y2={m.t + ih} stroke="var(--axis)" />
            <circle cx={X(hp.tc)} cy={Y(hp.meanEV)} r="5" fill="var(--series-pos)" stroke="var(--panel)" strokeWidth="2" />
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <div className="label mt-1 mb-1" style={{ paddingLeft: m.l }}>Share of rounds at each true count</div>
      <svg width={W} height={FH} role="img" aria-label="Share of rounds by true count">
        <line x1={m.l} x2={W - m.r} y1={FH - 4} y2={FH - 4} stroke="var(--axis)" />
        {pts.map((p) => {
          const h = ((p.rounds / total) / maxShare) * (FH - 12);
          return (
            <path key={p.tc} d={roundedTop(X(p.tc) - bw / 2, FH - 4 - h, bw, h, Math.min(4, bw / 2, h))}
              fill={threshold !== null && p.tc >= threshold ? 'var(--brass)' : 'var(--axis)'} opacity={hover === null || hover === p.tc ? 1 : 0.55}
              onPointerEnter={() => setHover(p.tc)} onPointerLeave={() => setHover(null)} />
          );
        })}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(W - 170, Math.max(0, X(hp.tc) + 10)), top: 8 }}>
          <div className="font-semibold">True count {fmtTc(hp.tc)}</div>
          <div className="tnum text-fg-2">Edge {fmtPct(hp.meanEV)} · {((hp.rounds / total) * 100).toFixed(2)}% of rounds</div>
          <div className="tnum text-muted">Exact EV positive in {(hp.pPositive * 100).toFixed(0)}% of them</div>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  r = Math.max(0, r);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Effect of removing one card of each value: diverging bars around zero, tags beneath. */
export function EorChart({ eor, tags }: { eor: Float64Array; tags: ArrayLike<number> }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = Array.from({ length: 10 }, (_, i) => eor[i + 1]);
  const maxAbs = Math.max(1e-9, ...vals.map(Math.abs));
  const H = 190, m = { l: 8, r: 8, t: 22, b: 44 };
  const ih = H - m.t - m.b, iw = W - m.l - m.r;
  const mid = m.t + ih / 2;
  const slot = iw / 10, bw = Math.min(24, slot * 0.55);
  const names = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(3)}%`;
  return (
    <div ref={ref} className="relative w-full">
      <svg width={W} height={H} role="img" aria-label="Effect of removing one card of each value on the side bet's edge">
        <line x1={m.l} x2={W - m.r} y1={mid} y2={mid} stroke="var(--axis)" strokeWidth="1.5" />
        {vals.map((v, i) => {
          const cx = m.l + slot * (i + 0.5);
          const h = (Math.abs(v) / maxAbs) * (ih / 2 - 4);
          const up = v >= 0;
          const path = up ? roundedTop(cx - bw / 2, mid - h, bw, h, Math.min(4, h)) : roundedBottom(cx - bw / 2, mid, bw, h, Math.min(4, h));
          const t = tags[i + 1];
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={m.t} width={slot} height={ih} fill="transparent" />
              <path d={path} fill={up ? 'var(--series-pos)' : 'var(--series-neg)'} opacity={hover === null || hover === i ? 1 : 0.5} />
              <text x={cx} y={H - 26} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--fg)" style={{ fontFamily: 'var(--font-display)' }}>{names[i]}</text>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--fg-2)" className="tnum">{t > 0 ? `+${t}` : t}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg" style={{ left: Math.min(W - 190, Math.max(0, m.l + slot * (hover + 0.5) + 8)), top: 0 }}>
          <div className="font-semibold">Remove one {names[hover] === 'A' ? 'ace' : names[hover] === '10' ? 'ten-value card' : names[hover]}</div>
          <div className="tnum text-fg-2">Edge changes {fmt(vals[hover])}</div>
          <div className="tnum text-muted">Count tag {tags[hover + 1] > 0 ? '+' : ''}{tags[hover + 1]}</div>
        </div>
      )}
    </div>
  );
}

function roundedBottom(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}
