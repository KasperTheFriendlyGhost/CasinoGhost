import { useMemo } from 'react';
import { ACT_NAMES, buildStrategy, cellCode, houseEdge, indexPlays, rulesSummary } from '../engine/strategy';
import type { AppSettings } from '../lib/settings';
import { edgePct } from '../lib/format';

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
const upLabel = (u: number) => (u === 1 ? 'A' : String(u));

// Fixed fills; the letter inside each cell carries the meaning too.
const ACTION_STYLE: Record<string, { bg: string; ink: string; name: string }> = {
  H: { bg: '#2a78d6', ink: '#ffffff', name: 'Hit' },
  S: { bg: '#eda100', ink: '#1a1405', name: 'Stand' },
  D: { bg: '#1baf7a', ink: '#04140d', name: 'Double' },
  P: { bg: '#6250d6', ink: '#ffffff', name: 'Split' },
  R: { bg: '#e34948', ink: '#ffffff', name: 'Surrender' },
};

export function Strategy({ settings }: { settings: AppSettings }) {
  const R = settings.rules;
  const { S, edge, devs } = useMemo(() => {
    const S = buildStrategy(R);
    return { S, edge: houseEdge(R, S), devs: indexPlays(R, S, settings.deviations === 'none' ? 'i18fab4' : settings.deviations) };
  }, [R, settings.deviations]);
  const T = S.initial;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-end gap-x-10 gap-y-3 p-5" style={{ boxShadow: 'var(--shadow)' }}>
        <div>
          <div className="label">Basic strategy for</div>
          <div className="font-display text-3xl font-extrabold leading-tight">{rulesSummary(R)}</div>
        </div>
        <div>
          <div className="label">House edge with perfect play</div>
          <div className="tnum font-display text-3xl font-extrabold">{edgePct(edge, 3)}</div>
        </div>
        <p className="max-w-[52ch] text-sm text-fg-2">Every cell is solved by the exact expected-value engine for these rules, so the chart changes when you change the rules.</p>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {Object.entries(ACTION_STYLE).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="grid size-6 place-items-center rounded font-display font-bold" style={{ background: v.bg, color: v.ink }}>{k}</span>{v.name}</span>
        ))}
        <span className="text-fg-2">Ds = double, otherwise stand · Rh / Rs / Rp = surrender, otherwise hit / stand / split</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Grid title="Hard totals" rows={[...Array(10)].map((_, i) => 17 - i).reverse()} label={(t) => String(t)} code={(t, u) => cellCode(T, 'hard', t, u)} note="Hard 4–7 always hit; hard 18 and up always stand." />
        <Grid title="Soft totals" rows={[13, 14, 15, 16, 17, 18, 19, 20]} label={(t) => `A,${t - 11}`} code={(t, u) => cellCode(T, 'soft', t, u)} />
        <Grid title="Pairs" rows={[1, 10, 9, 8, 7, 6, 5, 4, 3, 2]} label={(r) => (r === 1 ? 'A,A' : `${r},${r}`)} code={(r, u) => cellCode(T, 'pair', r, u)} />
      </div>

      <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
        <h3 className="label mb-1">Hi-Lo index plays in use</h3>
        <p className="mb-3 text-sm text-fg-2">Change the play when the true count reaches the index. Only plays that apply under these rules are listed.</p>
        <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {devs.insurance !== null && <li className="flex justify-between gap-3 border-b border-line py-1"><span>Take insurance</span><span className="font-data text-fg-2">TC ≥ +{devs.insurance}</span></li>}
          {devs.list.map((d) => (
            <li key={`${d.kind}:${d.key}:${d.up}:${d.label}`} className="flex justify-between gap-3 border-b border-line py-1">
              <span className="min-w-0">{d.label}: <b className="font-semibold">{ACT_NAMES[d.above]}</b> <span className="text-muted">else {ACT_NAMES[d.below]}</span></span>
              <span className="shrink-0 font-data text-fg-2">TC ≥ {d.idx > 0 ? '+' : ''}{d.idx}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Grid({ title, rows, label, code, note }: { title: string; rows: number[]; label: (r: number) => string; code: (r: number, up: number) => string; note?: string }) {
  return (
    <div className="panel min-w-0 p-4" style={{ boxShadow: 'var(--shadow)' }}>
      <h3 className="label mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-12 text-left text-[11px] font-medium text-muted">You</th>
              {UPS.map((u) => <th key={u} className="font-display text-sm font-bold text-fg-2">{upLabel(u)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th className="pr-1 text-left font-display text-sm font-bold">{label(r)}</th>
                {UPS.map((u) => {
                  const c = code(r, u) ?? '';
                  const st = ACTION_STYLE[c[0]] ?? { bg: 'var(--panel-2)', ink: 'var(--fg)', name: '' };
                  return (
                    <td key={u} title={`${label(r)} vs ${upLabel(u)}: ${c}`} className="h-8 min-w-7 rounded text-center font-display text-[13px] font-bold" style={{ background: st.bg, color: st.ink }}>{c}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}
