export const pct = (x: number, digits = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%`;
export const edgePct = (ev: number, digits = 2) => `${Math.abs(ev * 100).toFixed(digits)}%`;
export const signed = (x: number, digits = 0) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;
export const money = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const oneIn = (p: number) => (p <= 0 ? '—' : p >= 0.5 ? `${(p * 100).toFixed(1)}%` : `1 in ${Math.round(1 / p).toLocaleString()}`);
export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
