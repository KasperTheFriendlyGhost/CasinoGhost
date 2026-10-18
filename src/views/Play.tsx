import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lightbulb, RotateCcw, Eye, EyeOff, Check, X } from 'lucide-react';
import { valueOf } from '../engine/cards';
import { Game, SIDE_IDS, type Hand } from '../engine/game';
import { ACT, handInfo, type ActionCode } from '../engine/strategy';
import { SIDE_BETS, type SideBetId } from '../engine/sidebets';
import type { AppSettings } from '../lib/settings';
import { usePref } from '../lib/settings';
import { cx, edgePct, money, signed } from '../lib/format';
import { PlayingCard } from '../components/PlayingCard';
import { FeltPrint } from '../components/FeltPrint';

type Spot = 'main' | SideBetId;

const CHIPS = [
  { v: 5, bg: '#c62f2f', edge: '#f3d7d7' },
  { v: 25, bg: '#1f8a4c', edge: '#d5f0de' },
  { v: 100, bg: '#1c1c1e', edge: '#e8e8e8' },
  { v: 500, bg: '#6b3fa0', edge: '#e6dbf5' },
];

const ACTIONS: { code: ActionCode; label: string; key: string }[] = [
  { code: ACT.HIT as ActionCode, label: 'Hit', key: 'H' },
  { code: ACT.STAND as ActionCode, label: 'Stand', key: 'S' },
  { code: ACT.DOUBLE as ActionCode, label: 'Double', key: 'D' },
  { code: ACT.SPLIT as ActionCode, label: 'Split', key: 'P' },
  { code: ACT.SURRENDER as ActionCode, label: 'Surrender', key: 'R' },
];

function useGame(settings: AppSettings) {
  const carry = useRef<Game | null>(null);
  const key = JSON.stringify([settings.rules, settings.deviations]);
  const game = useMemo(() => {
    const g = new Game({ rules: settings.rules, deviations: settings.deviations, pays: settings.pays });
    const prev = carry.current;
    if (prev) { g.bankroll = prev.bankroll; g.mainBet = prev.mainBet; g.sideStakes = { ...prev.sideStakes }; g.stats = prev.stats; g.log = prev.log; }
    carry.current = g;
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  game.settings.pays = settings.pays;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => game.subscribe(force), [game]);
  return game;
}

export function Play({ settings }: { settings: AppSettings }) {
  const game = useGame(settings);
  const [spot, setSpot] = useState<Spot>('main');
  const [hideCount, setHideCount] = usePref('hideCount', false);
  const [hint, setHint] = useState<string | null>(null);
  const R = settings.rules;
  const phase = game.phase;
  const canBet = phase === 'betting' || phase === 'settled';
  const legal = game.legal();
  const evs = useMemo(() => game.sideBetEVs(), [game, game.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const stakeOf = (s: Spot) => (s === 'main' ? game.mainBet : game.sideStakes[s]);
  const setStake = (s: Spot, v: number) => (s === 'main' ? game.setBet(v) : game.setSideStake(s, v));

  const act = (code: ActionCode) => { setHint(null); game.act(code); };
  const deal = () => { setHint(null); game.deal(); };
  const showHint = () => {
    const a = game.advice();
    if (!a) return;
    const name = ACTIONS.find((x) => x.code === a.action)!.label;
    setHint(a.index ? `${name}: index play (${a.index})` : `${name} is the basic-strategy play`);
  };

  // Keyboard: H S D P R act, Space/Enter deals, I/N insurance, ? hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (game.phase === 'player') {
        const a = ACTIONS.find((x) => x.key.toLowerCase() === k);
        if (a) { e.preventDefault(); act(a.code); }
        if (k === '?' || k === '/') showHint();
      } else if (game.phase === 'insurance') {
        if (k === 'i' || k === 'y') game.takeInsurance(true);
        if (k === 'n') game.takeInsurance(false);
      } else if ((k === ' ' || k === 'enter') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault(); deal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const d = game.lastDecision;
  const showRound = phase === 'settled';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0 flex flex-col gap-3">
        {/* Table */}
        <div className="rail rounded-[28px] p-[10px] sm:p-[14px]" style={{ ['--card-w' as string]: 'clamp(50px, 8.4vw, 88px)', ['--card-w-sm' as string]: 'clamp(42px, 6.4vw, 70px)' }}>
          <div className="felt felt-shape relative flex min-h-[420px] flex-col overflow-hidden rounded-[20px] sm:min-h-[500px]">
            <ShoeGauge game={game} />
            {/* Dealer */}
            <div className="flex flex-col items-center gap-2 pt-5">
              <div className="flex min-h-[calc(var(--card-w)*1.4)] items-start">
                {game.dealer.map((c, i) => (
                  <div key={c.uid} style={{ marginLeft: i ? 'calc(var(--card-w) * -0.32)' : 0 }}>
                    <PlayingCard card={c} faceDown={i === 1 && !game.holeRevealed} delay={i === 0 ? 0.15 : i === 1 ? 0.45 : (i - 1) * 0.35} />
                  </div>
                ))}
              </div>
              <TotalPill label={dealerLabel(game)} />
            </div>

            <FeltPrint rules={R} />

            {/* Player hands */}
            <div className="mt-auto flex flex-wrap items-end justify-center gap-x-6 gap-y-3 px-3 pb-3">
              {game.hands.map((h, i) => (
                <HandView key={i} hand={h} active={game.activeHand === h} small={game.hands.length > 2} firstDeal={i === 0 && !h.fromSplit} showResult={showRound} />
              ))}
            </div>

            {/* Betting spots */}
            <div className="flex items-end justify-center gap-2 pb-9 pt-6 sm:gap-5 sm:pb-12">
              {SIDE_IDS.slice(0, 2).map((id) => (
                <SideSpot key={id} id={id} game={game} selected={canBet && spot === id} onSelect={() => setSpot(id)} />
              ))}
              <BetSpot amount={game.mainBet} selected={canBet && spot === 'main'} onSelect={() => setSpot('main')} result={showRound ? game.roundNet : null} />
              <SideSpot id="ll" game={game} selected={canBet && spot === 'll'} onSelect={() => setSpot('ll')} />
            </div>

          </div>
        </div>

        {/* Controls */}
        <div className="panel flex flex-col gap-3 p-3 sm:p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="flex min-h-[30px] items-center" aria-live="polite">
            <AnimatePresence mode="wait">
              {hint ? (
                <Toast key="hint" tone="hint">{hint}</Toast>
              ) : d && phase !== 'betting' ? (
                <Toast key={game.stats.decisions} tone={d.correct ? 'good' : 'bad'}>
                  {d.correct ? (
                    <><Check size={15} aria-hidden /> {d.chosen} on {d.spot}{d.index ? ` · index play (${d.index})` : ''}</>
                  ) : (
                    <><X size={15} aria-hidden /> {d.best} was correct on {d.spot}{d.evCost > 0 ? ` · cost ${money(d.evCost * game.mainBet)}` : ''}{d.index ? ` · index play (${d.index})` : ''}</>
                  )}
                </Toast>
              ) : (
                <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted">
                  {phase === 'player' ? 'Your move. Every decision is graded against the correct play for this count.' : phase === 'insurance' ? 'Insurance is only worth it at a true count of +3 or more.' : 'Tap a betting spot, add chips, then deal.'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {phase === 'insurance' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-auto font-medium">Dealer shows an ace. Insurance costs {money(game.mainBet / 2)}.</p>
              <Btn onClick={() => game.takeInsurance(true)} kbd="I">Take insurance</Btn>
              <Btn primary onClick={() => game.takeInsurance(false)} kbd="N">No insurance</Btn>
            </div>
          ) : phase === 'player' ? (
            <div className="flex flex-wrap items-center gap-2">
              {ACTIONS.map((a) => {
                const ok = !!legal && (a.code === ACT.HIT ? legal.hit : a.code === ACT.STAND ? legal.stand : a.code === ACT.DOUBLE ? legal.double : a.code === ACT.SPLIT ? legal.split : legal.surrender);
                return <Btn key={a.key} primary={a.code === ACT.STAND || a.code === ACT.HIT} disabled={!ok} onClick={() => act(a.code)} kbd={a.key}>{a.label}</Btn>;
              })}
              <button onClick={showHint} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-fg-2 hover:bg-panel-2" title="Show the correct play (?)">
                <Lightbulb size={16} aria-hidden /> Hint
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2" role="group" aria-label="Chips">
                {CHIPS.map((c) => (
                  <button key={c.v} onClick={() => setStake(spot, stakeOf(spot) + c.v)} className="chip grid place-items-center rounded-full font-display text-[15px] font-extrabold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0" style={{ width: 46, height: 46, background: `radial-gradient(circle at 50% 50%, ${c.bg} 0 52%, transparent 53%), repeating-conic-gradient(${c.edge} 0 15deg, ${c.bg} 15deg 30deg)`, boxShadow: '0 3px 0 rgba(0,0,0,0.35), inset 0 0 0 2px rgba(0,0,0,0.25)' }} aria-label={`Add $${c.v} to ${spotName(spot)}`}>
                    {c.v}
                  </button>
                ))}
              </div>
              <div className="text-sm leading-tight">
                <div className="label">Betting on</div>
                <div className="font-semibold">{spotName(spot)} · {money(stakeOf(spot))}</div>
              </div>
              <button onClick={() => setStake(spot, 0)} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-fg-2 hover:bg-panel-2"><RotateCcw size={15} aria-hidden /> Clear</button>
              <Btn primary big className="ml-auto" disabled={game.mainBet <= 0} onClick={deal} kbd="Space">{phase === 'settled' ? 'Deal again' : 'Deal'}</Btn>
            </div>
          )}
        </div>
      </section>

      {/* Instrument rail */}
      <aside className="flex min-w-0 flex-col gap-4">
        <CountPanel game={game} hidden={hideCount} setHidden={setHideCount} />
        <SideBetPanel game={game} evs={evs} onPick={(id) => setSpot(id)} />
        <SessionPanel game={game} />
      </aside>
    </div>
  );
}

const spotName = (s: Spot) => (s === 'main' ? 'Main bet' : SIDE_BETS[s].name);

function dealerLabel(g: Game): string {
  if (!g.dealer.length) return 'Dealer';
  const cards = g.holeRevealed ? g.dealer : g.dealer.slice(0, 1);
  const { eff, soft } = handInfo(cards.map((c) => valueOf(c.rank)));
  if (g.holeRevealed && cards.length === 2 && eff === 21) return 'Blackjack';
  if (eff > 21) return `Bust · ${eff}`;
  return `${soft && eff < 21 ? 'Soft ' : ''}${eff}`;
}

function TotalPill({ label }: { label: string }) {
  return <div className="rounded-full bg-black/35 px-3 py-0.5 font-display text-[15px] font-bold tracking-wide text-[#f6eedb]">{label}</div>;
}

const OUTCOME: Record<string, { text: string; tone: 'good' | 'bad' | 'neutral' }> = {
  blackjack: { text: 'Blackjack', tone: 'good' }, win: { text: 'Win', tone: 'good' }, push: { text: 'Push', tone: 'neutral' },
  lose: { text: 'Lose', tone: 'bad' }, bust: { text: 'Bust', tone: 'bad' }, surrender: { text: 'Surrendered', tone: 'neutral' },
};

function HandView({ hand, active, small, firstDeal, showResult }: { hand: Hand; active: boolean; small: boolean; firstDeal: boolean; showResult: boolean }) {
  const { eff, soft } = handInfo(hand.cards.map((c) => valueOf(c.rank)));
  const natural = !hand.fromSplit && hand.cards.length === 2 && eff === 21;
  const label = natural ? 'Blackjack' : eff > 21 ? `Bust · ${eff}` : `${soft && eff < 21 ? 'Soft ' : ''}${eff}`;
  const o = showResult && hand.outcome ? OUTCOME[hand.outcome] : null;
  return (
    <div className={cx('relative flex flex-col items-center gap-2 rounded-2xl p-2 transition-shadow', active && 'shadow-[0_0_0_2px_var(--brass),0_0_24px_rgba(214,172,82,0.35)]')}>
      <div className="flex">
        {hand.cards.map((c, i) => (
          <div key={c.uid} style={{ marginLeft: i ? `calc(var(${small ? '--card-w-sm' : '--card-w'}) * -0.58)` : 0, marginTop: i ? `calc(var(--card-w) * ${-0.0 + i * 0.06})` : 0 }}>
            <PlayingCard card={c} small={small} delay={firstDeal && i === 0 ? 0 : firstDeal && i === 1 ? 0.3 : 0} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <TotalPill label={label} />
        {hand.doubled && <span className="rounded-full bg-brass px-2 py-0.5 text-[11px] font-bold text-brass-ink">2×</span>}
      </div>
      <AnimatePresence>
        {o && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.5 }}
            className={cx('absolute -top-3 rounded-full px-2.5 py-0.5 text-xs font-bold shadow', o.tone === 'good' ? 'bg-[#e9fbe9] text-[#0d5c1f]' : o.tone === 'bad' ? 'bg-[#fde8e8] text-[#8a1c1c]' : 'bg-[#f1efe8] text-[#3b3a35]')}>
            {o.text}{hand.net ? ` ${signed(hand.net, hand.net % 1 ? 1 : 0)}` : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChipStack({ amount }: { amount: number }) {
  const chip = [...CHIPS].reverse().find((c) => amount >= c.v) ?? CHIPS[0];
  const n = Math.min(5, Math.max(1, Math.round(amount / chip.v)));
  return (
    <div className="relative" style={{ width: 34, height: 34 + (n - 1) * 3 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="absolute left-0 rounded-full" style={{ bottom: i * 3, width: 34, height: 34, background: `radial-gradient(circle, ${chip.bg} 0 50%, transparent 51%), repeating-conic-gradient(${chip.edge} 0 15deg, ${chip.bg} 15deg 30deg)`, boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }} />
      ))}
    </div>
  );
}

function BetSpot({ amount, selected, onSelect, result }: { amount: number; selected: boolean; onSelect: () => void; result: number | null }) {
  return (
    <button onClick={onSelect} className={cx('relative grid place-items-center rounded-full border-2 transition-colors', selected ? 'border-brass bg-black/15' : 'border-[rgba(255,240,205,0.4)]')} style={{ width: 'clamp(68px, 15vw, 92px)', aspectRatio: '1' }} aria-label={`Main bet ${money(amount)}`}>
      {amount > 0 ? <ChipStack amount={amount} /> : <span className="font-display text-sm font-bold tracking-widest text-[var(--felt-ink)]">BET</span>}
      <span className="absolute -bottom-6 whitespace-nowrap font-data text-xs text-[#f6eedb]">{money(amount)}</span>
      {result !== null && (
        <motion.span key={result} initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -6 }} transition={{ delay: 0.7 }}
          className={cx('absolute -top-7 rounded-full px-2 py-0.5 font-data text-xs font-bold', result > 0 ? 'bg-[#e9fbe9] text-[#0d5c1f]' : result < 0 ? 'bg-[#fde8e8] text-[#8a1c1c]' : 'bg-[#f1efe8] text-[#3b3a35]')}>
          {result > 0 ? '+' : ''}{money(result)}
        </motion.span>
      )}
    </button>
  );
}

function SideSpot({ id, game, selected, onSelect }: { id: SideBetId; game: Game; selected: boolean; onSelect: () => void }) {
  const stake = game.sideStakes[id];
  const res = game.sideResults[id];
  return (
    <button onClick={onSelect} className={cx('relative grid place-items-center rounded-full border-2 border-dashed transition-colors', selected ? 'border-brass bg-black/15' : 'border-[rgba(255,240,205,0.35)]')} style={{ width: 'clamp(50px, 11vw, 64px)', aspectRatio: '1' }} aria-label={`${SIDE_BETS[id].name} side bet ${money(stake)}`}>
      {stake > 0 ? <div className="scale-75"><ChipStack amount={stake} /></div> : <span className="font-display text-[13px] font-bold tracking-wider text-[var(--felt-ink)]">{SIDE_BETS[id].short}</span>}
      {stake > 0 && <span className="absolute -bottom-5 font-data text-[11px] text-[#f6eedb]">{money(stake)}</span>}
      {res && (
        <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}
          className={cx('absolute -top-6 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', res.key ? 'bg-brass text-brass-ink' : 'bg-black/40 text-[#e9e2cf]')}>
          {res.key ? `Wins ${res.net}:1` : 'No win'}
        </motion.span>
      )}
    </button>
  );
}

function ShoeGauge({ game }: { game: Game }) {
  const left = game.shoe.cardsLeft / game.shoe.size;
  const cut = 1 - game.shoe.cut / game.shoe.size;
  return (
    <div className="absolute right-4 top-4 flex items-center gap-2 text-[#efe6cf]" aria-label={`${game.shoe.decksLeft.toFixed(1)} decks left in the shoe`}>
      <div className="text-right leading-tight">
        <div className="font-display text-sm font-bold tracking-wide">{game.shoe.decksLeft.toFixed(1)} decks</div>
        <div className="text-[11px] opacity-70">{game.justShuffled ? 'Fresh shoe' : 'in the shoe'}</div>
      </div>
      <div className="relative h-14 w-4 overflow-hidden rounded-sm bg-black/35">
        <div className="absolute inset-x-0 bottom-0 bg-[#f4efe2]" style={{ height: `${left * 100}%`, transition: 'height .4s' }} />
        <div className="absolute inset-x-0 h-[2px] bg-[#e5484d]" style={{ bottom: `${cut * 100}%` }} title="Cut card" />
      </div>
    </div>
  );
}

function Toast({ tone, children }: { tone: 'good' | 'bad' | 'hint'; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
      className={cx('inline-flex max-w-full items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-[13px] font-semibold',
        tone === 'good' ? 'bg-[#e9fbe9] text-[#0d5c1f]' : tone === 'bad' ? 'bg-[#fde8e8] text-[#8a1c1c]' : 'bg-[#fbf3dc] text-[#5a4211]')}>
      {children}
    </motion.div>
  );
}

function Btn({ children, onClick, primary, disabled, kbd, big, className }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; kbd?: string; big?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cx('inline-flex items-center gap-2 rounded-full border font-semibold transition-all', big ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm',
        primary ? 'border-transparent bg-brass text-brass-ink hover:brightness-110' : 'border-line-strong bg-panel-2 text-fg hover:border-brass',
        disabled && 'opacity-35 hover:brightness-100', className)}>
      {children}
      {kbd && <kbd className={cx('hidden rounded px-1.5 font-data text-[10px] sm:inline', primary ? 'bg-black/15' : 'bg-black/10 text-muted')}>{kbd}</kbd>}
    </button>
  );
}

// ----- Rail panels -------------------------------------------------------------------------

function CountPanel({ game, hidden, setHidden }: { game: Game; hidden: boolean; setHidden: (v: boolean) => void }) {
  const [guess, setGuess] = useState('');
  const [verdict, setVerdict] = useState<null | { ok: boolean; rc: number }>(null);
  useEffect(() => setVerdict(null), [game.stats.rounds]);
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(guess);
    if (!Number.isFinite(n) || guess.trim() === '') return;
    setVerdict({ ok: n === game.rc, rc: game.rc });
    setGuess('');
  };
  return (
    <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label">Hi-Lo count</h2>
        <button onClick={() => setHidden(!hidden)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-fg-2 hover:bg-panel-2">
          {hidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} {hidden ? 'Show' : 'Practice: hide'}
        </button>
      </div>
      {hidden ? (
        <form onSubmit={check} className="flex flex-col gap-2">
          <label htmlFor="rc-guess" className="text-sm text-fg-2">Keep the count yourself. What is the running count now?</label>
          <div className="flex gap-2">
            <input id="rc-guess" inputMode="numeric" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="e.g. −3" className="w-full min-w-0 rounded-lg border border-line-strong bg-panel-2 px-3 py-2 font-data text-fg" />
            <button className="rounded-lg bg-brass px-3 font-semibold text-brass-ink">Check</button>
          </div>
          {verdict && (
            <p className={cx('text-sm font-semibold', verdict.ok ? 'text-good' : 'text-bad')}>
              {verdict.ok ? 'Correct.' : `Not quite: the running count is ${signed(verdict.rc)}.`}
            </p>
          )}
        </form>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Running" value={signed(game.rc)} big />
          <Stat label="True" value={signed(game.tc)} big accent={game.tc >= 2} />
          <Stat label="Decks left" value={game.decksEst.toFixed(1)} big />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={cx('tnum font-display font-bold leading-none', big ? 'mt-1 text-[34px]' : 'mt-0.5 text-xl', accent ? 'text-brass' : 'text-fg')}>{value}</div>
    </div>
  );
}

function SideBetPanel({ game, evs, onPick }: { game: Game; evs: Record<SideBetId, number>; onPick: (id: SideBetId) => void }) {
  return (
    <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="label">Side bets · exact edge now</h2>
      </div>
      <p className="mb-3 text-xs text-muted">From every card left in the shoe. Positive means the bet favours you this round.</p>
      <ul className="flex flex-col gap-3">
        {SIDE_IDS.map((id) => {
          const ev = evs[id];
          const positive = ev > 0;
          // Meter: −30% … +10%, zero marked.
          const lo = -0.3, hi = 0.1, zero = (0 - lo) / (hi - lo);
          const pos = Math.min(1, Math.max(0, (ev - lo) / (hi - lo)));
          const res = game.sideResults[id];
          return (
            <li key={id}>
              <button onClick={() => onPick(id)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{SIDE_BETS[id].name}</span>
                  <span className={cx('tnum font-data text-sm font-bold', positive ? 'text-good' : 'text-fg-2')}>
                    {positive ? `+${edgePct(ev)} player` : `${edgePct(ev)} house`}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-panel-2" aria-hidden>
                  <div className="absolute top-[-3px] h-[14px] w-[2px] bg-fg-2" style={{ left: `${zero * 100}%` }} />
                  <motion.div className="absolute top-0 h-2 rounded-full" animate={{ left: `${Math.min(pos, zero) * 100}%`, width: `${Math.abs(pos - zero) * 100}%` }}
                    style={{ background: positive ? 'var(--good)' : 'var(--series-neg)' }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted">
                  <span>{game.sideStakes[id] ? `Betting ${money(game.sideStakes[id])}` : 'Not betting'}</span>
                  {res && <span className={res.key ? 'font-semibold text-brass' : ''}>{res.key ? `${res.label} · ${money(res.net * res.stake)}` : 'Last: no win'}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SessionPanel({ game }: { game: Game }) {
  const s = game.stats;
  const acc = s.decisions ? s.correct / s.decisions : 1;
  return (
    <div className="panel p-4" style={{ boxShadow: 'var(--shadow)' }}>
      <h2 className="label mb-3">Session</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Bankroll" value={money(game.bankroll)} />
        <Stat label="Hands" value={String(s.rounds)} />
        <Stat label="Accuracy" value={`${Math.round(acc * 100)}%`} accent={acc >= 0.98 && s.decisions >= 20} />
        <Stat label="Cost of mistakes" value={money(-s.evLost)} />
      </div>
      {game.log.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="label mb-2">Recent decisions</h3>
          <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1 text-[13px]">
            {game.log.slice(0, 12).map((d, i) => (
              <li key={game.stats.decisions - i} className="flex items-center gap-2">
                <span className={cx('grid size-4 shrink-0 place-items-center rounded-full', d.correct ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>{d.correct ? <Check size={11} /> : <X size={11} />}</span>
                <span className="min-w-0 flex-1 truncate">{d.spot}</span>
                <span className="shrink-0 text-muted">{d.correct ? d.chosen : `${d.chosen} → ${d.best}`}</span>
                <span className="w-10 shrink-0 text-right font-data text-[11px] text-muted">TC {signed(d.tc)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
