import { useMemo, useState } from 'react';
import { RULE_PRESETS, houseEdge, parseRules, rulesSummary, type DevMode, type Rules as RulesT } from '../engine/strategy';
import type { AppSettings } from '../lib/settings';
import { cx, edgePct } from '../lib/format';
import { Segmented } from './Lab';

interface Props {
  settings: AppSettings;
  updateRules: (p: Partial<RulesT>) => void;
  setDeviations: (d: DevMode) => void;
}

export function Rules({ settings, updateRules, setDeviations }: Props) {
  const R = settings.rules;
  const edge = useMemo(() => houseEdge(R), [R]);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ understood: string[]; ignored: string[] } | null>(null);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseRules(text);
    updateRules(p.rules);
    setParsed({ understood: p.understood, ignored: p.ignored });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <h2 className="label mb-3">Common tables</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {RULE_PRESETS.map((p) => {
              const on = Object.entries(p.rules).every(([k, v]) => (R as Record<string, unknown>)[k] === v);
              return (
                <button key={p.name} onClick={() => updateRules({ peek: true, obo: true, ...p.rules })}
                  className={cx('flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left', on ? 'border-brass bg-brass-soft' : 'border-line-strong hover:border-brass')}>
                  <span className="font-semibold">{p.name}</span>
                  <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', p.tag === 'Avoid' ? 'bg-bad-soft text-bad' : p.tag === 'Good' ? 'bg-good-soft text-good' : 'bg-panel-2 text-fg-2')}>{p.tag}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={apply} className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <label htmlFor="rules-text" className="label mb-2 block">Describe the table</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="rules-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="6 decks, dealer hits soft 17, late surrender, 3:2"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-panel-2 px-3 py-2 text-fg" />
            <button className="rounded-lg bg-brass px-4 py-2 font-semibold text-brass-ink">Apply</button>
          </div>
          <p className="mt-2 text-xs text-muted">Shorthand works too: 6D H17 DAS LS 3:2 PEN:80%</p>
          {parsed && (
            <p className="mt-2 text-sm">
              {parsed.understood.length ? <span className="text-good">Applied: {parsed.understood.join(', ')}.</span> : <span className="text-bad">Nothing recognised. Try “6 decks, dealer stands on soft 17”.</span>}
              {parsed.ignored.length > 0 && <span className="text-muted"> Ignored: {parsed.ignored.join(' ')}</span>}
            </p>
          )}
        </form>

        <div className="panel grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2" style={{ boxShadow: 'var(--shadow)' }}>
          <Field label="Decks">
            <select id="r-decks" value={R.decks} onChange={(e) => updateRules({ decks: Number(e.target.value) })} className="sel">{[1, 2, 4, 5, 6, 8].map((d) => <option key={d} value={d}>{d}</option>)}</select>
          </Field>
          <Field label="Blackjack pays">
            <select id="r-bj" value={R.bjPay} onChange={(e) => updateRules({ bjPay: Number(e.target.value) })} className="sel">
              <option value={1.5}>3:2</option><option value={1.2}>6:5</option><option value={1.4}>7:5</option><option value={1}>1:1</option>
            </select>
          </Field>
          <Field label="Soft 17"><Segmented value={R.h17 ? 'h' : 's'} onChange={(v) => updateRules({ h17: v === 'h' })} options={[{ value: 's', label: 'Dealer stands' }, { value: 'h', label: 'Dealer hits' }]} /></Field>
          <Field label="Surrender"><Segmented value={R.surrender === 'none' ? 'none' : 'late'} onChange={(v) => updateRules({ surrender: v })} options={[{ value: 'none', label: 'None' }, { value: 'late', label: 'Late' }]} /></Field>
          <Field label="Double down"><Segmented value={R.doubleOn} onChange={(v) => updateRules({ doubleOn: v })} options={[{ value: 'any', label: 'Any 2' }, { value: '9-11', label: '9–11' }, { value: '10-11', label: '10–11' }]} /></Field>
          <Field label="Double after split"><Segmented value={R.das ? 'y' : 'n'} onChange={(v) => updateRules({ das: v === 'y' })} options={[{ value: 'y', label: 'Allowed' }, { value: 'n', label: 'Not allowed' }]} /></Field>
          <Field label="Hole card"><Segmented value={R.peek ? 'peek' : 'enhc'} onChange={(v) => updateRules({ peek: v === 'peek' })} options={[{ value: 'peek', label: 'Dealer peeks' }, { value: 'enhc', label: 'No hole card' }]} /></Field>
          <Field label="Split up to"><Segmented value={String(R.maxHands)} onChange={(v) => updateRules({ maxHands: Number(v) })} options={[{ value: '2', label: '2 hands' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} /></Field>
          <Field label="Split aces"><Segmented value={R.resplitAces ? 'rsa' : 'no'} onChange={(v) => updateRules({ resplitAces: v === 'rsa' })} options={[{ value: 'no', label: 'No resplit' }, { value: 'rsa', label: 'Resplit' }]} /></Field>
          <Field label={`Penetration · ${Math.round(R.penetration * 100)}% dealt`}>
            <input id="r-pen" type="range" min={0.5} max={0.9} step={0.01} value={R.penetration} onChange={(e) => updateRules({ penetration: Number(e.target.value) })} className="w-full" />
          </Field>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel p-5" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="label">House edge, perfect basic strategy</div>
          <div className="tnum font-display text-[56px] font-extrabold leading-none">{edgePct(edge, 2)}</div>
          <p className="mt-2 text-sm text-fg-2">{rulesSummary(R)}</p>
          <p className="mt-3 text-xs text-muted">Exact calculation for these rules. Changing rules reshuffles the shoe at the table.</p>
        </div>
        <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <h2 className="label mb-2">Index plays at the table</h2>
          <Segmented value={settings.deviations} onChange={setDeviations} options={[{ value: 'none', label: 'Off' }, { value: 'i18', label: 'Illustrious 18' }, { value: 'i18fab4', label: '+ Fab 4' }]} />
          <p className="mt-2 text-sm text-fg-2">With index plays on, the trainer grades hands against count-adjusted strategy and insurance at a true count of +3.</p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
