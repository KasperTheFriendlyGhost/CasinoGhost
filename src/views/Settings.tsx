import { useState } from 'react';
import { Volume2, Vibrate, Moon, Database, LifeBuoy, Info } from 'lucide-react';
import type { AppPrefs, Appearance } from '../lib/settings';
import { haptic, isNative, SITE_URL, store } from '../lib/native';
import { ExtLink } from '../components/ExtLink';
import { sfx } from '../lib/sound';
import { cx } from '../lib/format';
import { Segmented } from './Lab';

interface Props {
  prefs: AppPrefs;
  setPrefs: (p: Partial<AppPrefs>) => void;
}

function Section({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden" style={{ boxShadow: 'var(--shadow)' }}>
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold"><Icon size={16} className="text-brass" aria-hidden />{title}</h2>
      <div className="divide-y divide-[var(--line)]">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** iOS-style switch. */
function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button id={id} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-[31px] w-[51px] rounded-full transition-colors duration-200', checked ? 'bg-good' : 'bg-[var(--line-strong)]')}>
      <span className={cx('absolute left-0 top-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.3)] transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
    </button>
  );
}

export function Settings({ prefs, setPrefs }: Props) {
  const [confirm, setConfirm] = useState<null | 'session' | 'all'>(null);
  const resetSession = () => { store.remove('casinoghost:session'); location.reload(); };
  const eraseAll = () => { store.clearAll(); location.reload(); };

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-4">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">Settings</h1>

      <Section icon={Volume2} title="Sound">
        <Row label="Table sounds" hint="Cards, chips, shuffles and wins">
          <Toggle id="pref-sound" label="Table sounds" checked={prefs.sound} onChange={(sound) => { setPrefs({ sound }); if (sound) setTimeout(() => sfx.chip(), 30); }} />
        </Row>
        <Row label="Volume">
          <div className="flex items-center gap-3">
            <input id="pref-volume" aria-label="Volume" type="range" min={0} max={1} step={0.05} value={prefs.volume} disabled={!prefs.sound}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })} onPointerUp={() => sfx.card()} className="w-36" />
            <button onClick={() => { sfx.card(); sfx.card(0.12); sfx.chip(0.3); }} disabled={!prefs.sound} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold disabled:opacity-40">Test</button>
          </div>
        </Row>
      </Section>

      <Section icon={Vibrate} title="Haptics">
        <Row label="Haptic feedback" hint={isNative ? 'Taps for chips, decisions and results' : 'On supported phones'}>
          <Toggle id="pref-haptics" label="Haptic feedback" checked={prefs.haptics} onChange={(haptics) => { setPrefs({ haptics }); if (haptics) setTimeout(() => haptic('success'), 30); }} />
        </Row>
      </Section>

      <Section icon={Moon} title="Appearance">
        <Row label="Theme">
          <div className="w-[230px]">
            <Segmented<Appearance> value={prefs.appearance} onChange={(appearance) => setPrefs({ appearance })}
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
        </Row>
      </Section>

      <Section icon={Database} title="Data">
        <Row label="Reset session" hint="Bankroll, statistics and charts. Settings stay.">
          {confirm === 'session'
            ? <div className="flex gap-2"><button onClick={resetSession} className="rounded-full bg-bad px-3 py-1.5 text-sm font-semibold text-white">Reset</button><button onClick={() => setConfirm(null)} className="rounded-full border border-line-strong px-3 py-1.5 text-sm">Cancel</button></div>
            : <button onClick={() => setConfirm('session')} className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-semibold">Reset…</button>}
        </Row>
        <Row label="Erase all data" hint="Everything stored on this device, back to a fresh install.">
          {confirm === 'all'
            ? <div className="flex gap-2"><button onClick={eraseAll} className="rounded-full bg-bad px-3 py-1.5 text-sm font-semibold text-white">Erase</button><button onClick={() => setConfirm(null)} className="rounded-full border border-line-strong px-3 py-1.5 text-sm">Cancel</button></div>
            : <button onClick={() => setConfirm('all')} className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-semibold text-bad">Erase…</button>}
        </Row>
      </Section>

      <Section icon={LifeBuoy} title="Play responsibly">
        <div className="space-y-2 px-4 py-3 text-sm text-fg-2">
          <p>CasinoGhost is a training tool. No real money is wagered and nothing can be won. Counting cards does not guarantee winning, and casinos may refuse play to counters.</p>
          <p>If gambling stops being fun, help is free and confidential:{' '}
            <ExtLink className="font-semibold text-fg underline" href="https://www.ncpgambling.org/help-treatment/">National Council on Problem Gambling (US)</ExtLink>{' · '}
            <ExtLink className="font-semibold text-fg underline" href="https://www.begambleaware.org/">BeGambleAware (UK)</ExtLink>.
          </p>
        </div>
      </Section>

      <Section icon={Info} title="About">
        <Row label="Version"><span className="font-data text-sm text-fg-2">{__APP_VERSION__}</span></Row>
        <div className="space-y-1.5 px-4 py-3 text-xs text-muted">
          <p>Strategy engine adapted from <ExtLink className="underline" href="https://github.com/noahskahn/cutcard">cutcard</ExtLink> (MIT). Card faces by <ExtLink className="underline" href="https://www.me.uk/cards/">Adrian Kennard</ExtLink> (CC0). Fonts: Big Shoulders Display, Figtree and JetBrains Mono (SIL Open Font License).</p>
          <p><ExtLink className="underline" href={`${SITE_URL}privacy.html`}>Privacy policy</ExtLink> · <ExtLink className="underline" href={`${SITE_URL}support.html`}>Support</ExtLink> · CasinoGhost collects no personal data; everything stays on this device.</p>
        </div>
      </Section>
    </div>
  );
}
