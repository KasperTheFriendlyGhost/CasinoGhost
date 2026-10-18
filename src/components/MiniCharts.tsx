import { useState } from 'react';
import { useWidth } from './charts';

const nice = (span: number) => {
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
};

interface LineProps {
  points: { x: number; y: number }[];
  format: (v: number) => string;
  xLabel: (x: number) => string;
  /** Draw and include zero on the y-axis. */
  zero?: boolean;
  height?: number;
}

/** Single-series line with hairline grid, end label and hover readout. */
export function MiniLine({ points, format, xLabel, zero = false, height = 120 }: LineProps) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div ref={ref} className="grid h-[90px] place-items-center text-xs text-muted">Play a few rounds to fill this chart.</div>;
  const m = { l: 40, r: 10, t: 8, b: 18 };
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys, ...(zero ? [0] : [])), hi = Math.max(...ys, ...(zero ? [0] : []));
  if (hi === lo) { hi += 1; lo -= 1; }
  const step = nice(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const iw = W - m.l - m.r, ih = height - m.t - m.b;
  const X = (i: number) => m.l + (i / (points.length - 1)) * iw;
  const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(+v.toFixed(6));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={height} role="img">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={zero && v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
            <text x={m.l - 6} y={Y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)" className="tnum">{format(v)}</text>
          </g>
        ))}
        <text x={m.l} y={height - 4} fontSize="10" fill="var(--muted)">{xLabel(points[0].x)}</text>
        <text x={W - m.r} y={height - 4} fontSize="10" fill="var(--muted)" textAnchor="end">{xLabel(last.x)}</text>
        <path d={d} fill="none" stroke="var(--series-pos)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={X(points.length - 1)} cy={Y(last.y)} r="4" fill="var(--series-pos)" stroke="var(--panel)" strokeWidth="2" />
        {hp && hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={m.t} y2={m.t + ih} stroke="var(--axis)" />
            <circle cx={X(hover)} cy={Y(hp.y)} r="4" fill="var(--series-pos)" stroke="var(--panel)" strokeWidth="2" />
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent"
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))))); }}
          onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-panel px-2 py-1 text-[11px] shadow" style={{ left: Math.min(W - 120, Math.max(0, X(hover) + 8)) }}>
          <span className="text-muted">{xLabel(hp.x)}</span> · <span className="tnum font-semibold">{format(hp.y)}</span>
        </div>
      )}
    </div>
  );
}

/** Bet size against true count, one dot per round. */
export function MiniScatter({ points, height = 130 }: { points: { tc: number; bet: number }[]; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div ref={ref} className="grid h-[90px] place-items-center text-xs text-muted">Play a few rounds to fill this chart.</div>;
  const m = { l: 40, r: 10, t: 8, b: 20 };
  const tcs = points.map((p) => p.tc), bets = points.map((p) => p.bet);
  const x0 = Math.min(-2, ...tcs), x1 = Math.max(4, ...tcs);
  const hiB = Math.max(...bets) * 1.1 || 1;
  const step = nice(hiB);
  const top = Math.ceil(hiB / step) * step;
  const iw = W - m.l - m.r, ih = height - m.t - m.b;
  const X = (t: number) => m.l + ((t - x0) / (x1 - x0)) * iw;
  const Y = (b: number) => m.t + (1 - b / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={height} role="img">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={m.l - 6} y={Y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)" className="tnum">${v >= 1000 ? `${v / 1000}K` : v}</text>
          </g>
        ))}
        {[x0, 0, x1].map((t) => (
          <text key={t} x={X(t)} y={height - 5} textAnchor="middle" fontSize="10" fill="var(--muted)">TC {t > 0 ? '+' : ''}{t}</text>
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={X(p.tc)} cy={Y(p.bet)} r={hover === i ? 5 : 4} fill="var(--series-pos)" fillOpacity={hover === null || hover === i ? 0.75 : 0.35} stroke="var(--panel)" strokeWidth="2"
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
        ))}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-panel px-2 py-1 text-[11px] shadow" style={{ left: Math.min(W - 110, Math.max(0, X(hp.tc) + 8)) }}>
          TC {hp.tc > 0 ? '+' : ''}{hp.tc} · <span className="font-semibold">${hp.bet}</span>
        </div>
      )}
    </div>
  );
}

/** Normal curve of results you could have had, with your actual result marked. */
export function BellCurve({ expected, sd, actual, format }: { expected: number; sd: number; actual: number; format: (v: number) => string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 120, m = { l: 8, r: 8, t: 10, b: 20 };
  const z = sd > 0 ? (actual - expected) / sd : 0;
  const span = Math.max(3.2, Math.abs(z) + 0.4);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (zz: number) => m.l + ((zz + span) / (2 * span)) * iw;
  const Y = (zz: number) => m.t + (1 - Math.exp(-(zz * zz) / 2)) * ih;
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) { const zz = -span + (i / 80) * 2 * span; pts.push(`${X(zz).toFixed(1)},${Y(zz).toFixed(1)}`); }
  const fill: string[] = [`${X(-span)},${m.t + ih}`];
  for (let i = 0; i <= 80; i++) { const zz = -span + (i / 80) * (z + span); fill.push(`${X(zz).toFixed(1)},${Y(zz).toFixed(1)}`); }
  fill.push(`${X(z)},${m.t + ih}`);
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Your result ${format(actual)} against an expected ${format(expected)}`}>
        <line x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} stroke="var(--axis)" />
        <polygon points={fill.join(' ')} fill="var(--series-pos)" fillOpacity="0.12" />
        <polyline points={pts.join(' ')} fill="none" stroke="var(--series-pos)" strokeWidth="2" />
        <line x1={X(0)} x2={X(0)} y1={m.t} y2={m.t + ih} stroke="var(--axis)" />
        <line x1={X(z)} x2={X(z)} y1={m.t} y2={m.t + ih} stroke="var(--brass)" strokeWidth="2" />
        <circle cx={X(z)} cy={Y(z)} r="4.5" fill="var(--brass)" stroke="var(--panel)" strokeWidth="2" />
        <text x={X(0)} y={H - 5} textAnchor="middle" fontSize="10" fill="var(--muted)">Expected {format(expected)}</text>
        {Math.abs(z) > 0.9 && (
          <text x={X(z)} y={H - 5} textAnchor={z > 0 ? 'end' : 'start'} fontSize="10" fontWeight="600" fill="var(--fg-2)">You {format(actual)}</text>
        )}
      </svg>
    </div>
  );
}

/** Semicircular gauge. */
export function Gauge({ value, max, label, bands }: { value: number; max: number; label: string; bands?: { to: number; color: string }[] }) {
  const W = 250, H = 132, cx = W / 2, cy = 114, r = 88;
  const ang = (v: number) => Math.PI * (1 - Math.min(1, Math.max(0, v / max)));
  const pt = (v: number, rr = r) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
  const arc = (a: number, b: number) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
  const [nx, ny] = pt(value, r - 14);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  let from = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[260px]" role="img" aria-label={label}>
      <path d={arc(0, max)} fill="none" stroke="var(--grid)" strokeWidth="12" strokeLinecap="round" />
      {(bands ?? [{ to: max, color: 'var(--series-pos)' }]).map((b) => { const p = <path key={b.to} d={arc(from, Math.min(b.to, value))} fill="none" stroke={b.color} strokeWidth="12" strokeLinecap="round" opacity={value > from ? 1 : 0} />; from = b.to; return p; })}
      {ticks.map((t) => { const [x, y] = pt(t, r + 14); return <text key={t} x={x} y={y} textAnchor="middle" dy="0.32em" fontSize="10" fill="var(--muted)">{Math.round(t)}</text>; })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" style={{ transition: 'all .6s' }} />
      <circle cx={cx} cy={cy} r="6" fill="var(--fg)" />
    </svg>
  );
}
