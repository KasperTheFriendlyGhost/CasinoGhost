import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lightbulb, RotateCcw, Check, X, LayoutDashboard, Pause, Play as PlayIcon, Shuffle } from 'lucide-react';
import { valueOf } from '../engine/cards';
import { Game, SIDE_IDS, type Hand, type SessionSnapshot } from '../engine/game';
import { ACT, handInfo, type ActionCode } from '../engine/strategy';
import { SIDE_BETS, type SideBetId } from '../engine/sidebets';
import type { AppSettings } from '../lib/settings';
import { usePref } from '../lib/settings';
import { SpeedContext, speedFactor, useDashboard, widgetsFor, type DashboardConfig } from '../lib/dashboard';
import { cx, money, signed } from '../lib/format';
import { PlayingCard } from '../components/PlayingCard';
import { FeltPrint } from '../components/FeltPrint';
import { DashboardColumn, DECK_GUESS_ID } from '../components/widgets';
import { DealingShoe, DiscardTray } from '../components/ShoeTray';
import { CustomizeDashboard } from '../components/CustomizeDashboard';

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

const SESSION_KEY = 'casinoghost:session';

function loadSession(): Partial<SessionSnapshot> | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveSession(s: SessionSnapshot) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function useGame(settings: AppSettings, dash: DashboardConfig) {
  const carry = useRef<Game | null>(null);
  const key = JSON.stringify([settings.rules, settings.deviations]);
  const game = useMemo(() => {
    const g = new Game({ rules: settings.rules, deviations: settings.deviations, pays: settings.pays, limits: settings.limits });
    const prev = carry.current;
    if (prev) g.restore(prev.snapshot());
    else {
      g.bankroll = dash.startBankroll;
      const saved = dash.reset === 'manual' ? loadSession() : null;
      if (saved) g.restore(saved);
    }
    carry.current = g;
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  game.settings.pays = settings.pays;
  game.settings.limits = settings.limits;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => game.subscribe(force), [game]);
  // Save after every settled round.
  useEffect(() => { saveSession(game.snapshot()); }, [game, game.stats.rounds]);
  return game;
}

export function Play({ settings }: { settings: AppSettings }) {
  const { cfg: dash, update: updateDash, reset: resetDash } = useDashboard();
  const game = useGame(settings, dash);
  const [spot, setSpot] = useState<Spot>('main');
  const [hideCount, setHideCount] = usePref('hideCount', false);
  const [hint, setHint] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
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
  const resetSession = useCallback(() => { game.resetSession(dash.startBankroll); saveSession(game.snapshot()); }, [game, dash.startBankroll]);

  const SPOTS: Spot[] = ['pp', 't213', 'main', 'll'];
  const focusDeckGuess = () => document.getElementById(DECK_GUESS_ID)?.focus();
  /** Betting keys between rounds. Returns true when the key was handled. */
  const betKeys = (e: KeyboardEvent): boolean => {
    if (!(game.phase === 'betting' || game.phase === 'settled')) return false;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (digit) {
      const v = CHIPS[Number(digit[1]) - 1].v;
      setStake(spot, Math.max(0, stakeOf(spot) + (e.shiftKey ? -v : v)));
      return true;
    }
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowRight': {
        const i = SPOTS.indexOf(spot), n = SPOTS.length;
        setSpot(SPOTS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]);
        return true;
      }
      case 'Backspace': case 'Delete': setStake(spot, 0); return true;
      case 'x': case 'X': game.setBet(0); for (const id of SIDE_IDS) game.setSideStake(id, 0); return true;
      case ']': setStake(spot, stakeOf(spot) * 2); return true;
      case '[': setStake(spot, Math.floor(stakeOf(spot) / 2)); return true;
      case 'e': case 'E': focusDeckGuess(); return true;
    }
    return false;
  };

  // Keyboard: H S D P R act, Space/Enter deals, I/N insurance, ? hint, plus betting keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (customizing || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (game.phase === 'player') {
        const a = ACTIONS.find((x) => x.key.toLowerCase() === k);
        if (a) { e.preventDefault(); act(a.code); }
        if (k === '?' || k === '/') showHint();
      } else if (game.phase === 'insurance') {
        if (k === 'i' || k === 'y') game.takeInsurance(true);
        if (k === 'n') game.takeInsurance(false);
      } else if (betKeys(e)) {
        e.preventDefault();
      } else if (k === ' ' || k === 'enter') {
        // Space/Enter deals, even right after clicking a chip or betting spot; other buttons keep their usual keys.
        const t = e.target;
        if (t instanceof HTMLButtonElement && !t.dataset.betControl) return;
        e.preventDefault(); deal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const d = game.lastDecision;
  const showRound = phase === 'settled';
  const left = widgetsFor(dash, 'left'), right = widgetsFor(dash, 'right');
  const wp = { game, cfg: dash, hideCount, setHideCount, evs, onPickSide: (id: SideBetId) => setSpot(id) };
  const grid = left.length && right.length
    ? 'xl:grid-cols-[300px_minmax(0,1fr)_300px]'
    : left.length ? 'lg:grid-cols-[330px_minmax(0,1fr)]' : right.length ? 'lg:grid-cols-[minmax(0,1fr)_330px]' : '';

  return (
    <SpeedContext.Provider value={speedFactor(dash.speed)}>
    <div className={cx('grid items-start gap-4', grid)}>
      <section className="min-w-0 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 sm:flex-wrap">
          <ToolButton label="Customize dashboard" onClick={() => setCustomizing(true)}><LayoutDashboard size={15} aria-hidden /><span className="hidden sm:inline">Customize dashboard</span></ToolButton>
          <ToolButton label={game.paused ? 'Resume' : 'Pause'} onClick={() => (game.paused ? game.resume() : game.pause())} pressed={game.paused}>
            {game.paused ? <><PlayIcon size={15} aria-hidden /><span className="hidden sm:inline">Resume</span></> : <><Pause size={15} aria-hidden /><span className="hidden sm:inline">Pause</span></>}
          </ToolButton>
          <ToolButton label="New shoe" onClick={() => game.newShoe()} disabled={!canBet}><Shuffle size={15} aria-hidden /><span className="hidden sm:inline">New shoe</span></ToolButton>
          <button className="ml-auto rounded-full border border-line bg-panel px-3 py-2 text-xs font-semibold capitalize text-fg-2 sm:hidden" aria-label={`Speed: ${dash.speed}. Tap to change.`}
            onClick={() => { const order = ['slow', 'normal', 'fast', 'instant'] as const; updateDash({ speed: order[(order.indexOf(dash.speed) + 1) % order.length] }); }}>
            Speed: <span className="text-fg">{dash.speed}</span>
          </button>
          <div className="ml-auto hidden items-center gap-1 rounded-full border border-line bg-panel p-0.5 text-xs font-semibold sm:flex" role="radiogroup" aria-label="Deal speed">
            {(['slow', 'normal', 'fast', 'instant'] as const).map((sp) => (
              <button key={sp} role="radio" aria-checked={dash.speed === sp} onClick={(e) => { updateDash({ speed: sp }); if (e.detail) e.currentTarget.blur(); }}
                className={cx('rounded-full px-2.5 py-1 capitalize', dash.speed === sp ? 'bg-brass text-brass-ink' : 'text-fg-2 hover:text-fg')}>{sp}</button>
            ))}
          </div>
        </div>
        {/* Table */}
        <div className="rail relative rounded-[28px] p-[10px] pb-[46px] sm:p-[14px] sm:pb-[52px]" style={{ ['--card-w' as string]: 'clamp(50px, 8.4vw, 88px)', ['--card-w-sm' as string]: 'clamp(42px, 6.4vw, 70px)' }}>
          <div className="felt felt-shape relative flex min-h-[380px] flex-col overflow-hidden rounded-[20px] sm:min-h-[500px]">
            <div className="absolute right-2 top-2 z-10 origin-top-right scale-[0.72] sm:right-4 sm:top-4 sm:scale-100">
              <DealingShoe left={game.shoe.cardsLeft} size={game.shoe.size} cut={game.shoe.cut} decks={R.decks} showNumbers={dash.deckNumbers} />
            </div>
            <TableCorner game={game} showCount={dash.pinCount && !hideCount} trayMarks={dash.trayMarks} onTray={focusDeckGuess} />
            {/* Dealer */}
            <div className="flex flex-col items-center gap-2 pt-[94px] sm:pt-5">
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
            <div className="flex items-end justify-center gap-2 pb-7 pt-4 sm:gap-5 sm:pb-12 sm:pt-6">
              {SIDE_IDS.slice(0, 2).map((id) => (
                <SideSpot key={id} id={id} game={game} selected={canBet && spot === id} onSelect={() => setSpot(id)} />
              ))}
              <BetSpot amount={game.mainBet} selected={canBet && spot === 'main'} onSelect={() => setSpot('main')} result={showRound ? game.roundNet : null} />
              <SideSpot id="ll" game={game} selected={canBet && spot === 'll'} onSelect={() => setSpot('ll')} />
            </div>

          </div>
          <BankrollRail bankroll={game.bankroll} delta={showRound ? game.roundNet : null} round={game.stats.rounds} />
        </div>

        {/* Controls */}
        <div className="panel sticky bottom-0 z-20 flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:gap-3 sm:p-4" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="flex min-h-[30px] items-center gap-2" aria-live="polite">
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
                <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted max-sm:line-clamp-1">
                  {phase === 'player' ? 'Your move. Every decision is graded against the correct play for this count.' : phase === 'insurance' ? 'Insurance is only worth it at a true count of +3 or more.' : 'Tap a betting spot, add chips, then deal.'}
                </motion.p>
              )}
            </AnimatePresence>
            {phase === 'player' && (
              <button onClick={showHint} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-fg-2 hover:bg-panel-2 sm:hidden" aria-label="Hint: show the correct play">
                <Lightbulb size={16} aria-hidden /> Hint
              </button>
            )}
          </div>
          {phase === 'insurance' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-auto font-medium">Dealer shows an ace. Insurance costs {money(game.mainBet / 2)}.</p>
              <Btn onClick={() => game.takeInsurance(true)} kbd="I">Take insurance</Btn>
              <Btn primary onClick={() => game.takeInsurance(false)} kbd="N">No insurance</Btn>
            </div>
          ) : phase === 'player' ? (
            <div className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              {ACTIONS.map((a) => {
                const ok = !!legal && (a.code === ACT.HIT ? legal.hit : a.code === ACT.STAND ? legal.stand : a.code === ACT.DOUBLE ? legal.double : a.code === ACT.SPLIT ? legal.split : legal.surrender);
                return (
                  <Btn key={a.key} primary={a.code === ACT.STAND || a.code === ACT.HIT} disabled={!ok} onClick={() => act(a.code)} kbd={a.key} className="justify-center max-sm:px-1 max-sm:py-3 max-sm:text-[13px]">
                    {a.code === ACT.SURRENDER ? <><span className="sm:hidden">Surr.</span><span className="hidden sm:inline">Surrender</span></> : a.label}
                  </Btn>
                );
              })}
              <button onClick={showHint} className="ml-auto hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm text-fg-2 hover:bg-panel-2 sm:inline-flex" title="Show the correct play (?)">
                <Lightbulb size={16} aria-hidden /> Hint
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="order-1 flex items-center gap-2 sm:order-none" role="group" aria-label="Chips">
                {CHIPS.map((c, i) => (
                  <ChipButton key={c.v} chip={c} n={i + 1} target={spotName(spot)}
                    onAdd={() => setStake(spot, stakeOf(spot) + c.v)} onRemove={() => setStake(spot, Math.max(0, stakeOf(spot) - c.v))} />
                ))}
              </div>
              <div className="order-3 text-sm leading-tight sm:order-none">
                <div className="label">Betting on</div>
                <div className="font-semibold">{spotName(spot)} · {money(stakeOf(spot))}</div>
              </div>
              <button data-bet-control="1" onClick={() => setStake(spot, 0)} className="order-4 inline-flex items-center sm:order-none gap-1 rounded-full px-3 py-2 text-sm text-fg-2 hover:bg-panel-2" title="Clear this spot (Backspace)"><RotateCcw size={15} aria-hidden /> Clear</button>
              <button data-bet-control="1" onClick={() => { game.setBet(0); for (const id of SIDE_IDS) game.setSideStake(id, 0); }} className="order-5 inline-flex items-center sm:order-none gap-1 rounded-full px-3 py-2 text-sm text-fg-2 hover:bg-panel-2" title="Clear every bet (X)"><X size={15} aria-hidden /> Clear all</button>
              {game.mainBet > 0 && game.mainBet < game.limits.min && <span className="order-6 text-sm font-semibold text-bad sm:order-none">Table minimum is {money(game.limits.min)}</span>}
              <Btn primary big className="order-2 ml-auto max-sm:px-5 sm:order-none" disabled={game.mainBet <= 0 || game.mainBet < game.limits.min} onClick={deal} kbd="Space">{phase === 'settled' ? 'Deal again' : 'Deal'}</Btn>
              <KeyLegend />
            </div>
          )}
        </div>
      </section>

      {left.length > 0 && (
        <aside className={cx('flex min-w-0 flex-col gap-4', right.length ? 'xl:order-first' : 'lg:order-first')} aria-label="Left dashboard">
          <DashboardColumn ids={left} {...wp} />
        </aside>
      )}
      {right.length > 0 && (
        <aside className="flex min-w-0 flex-col gap-4" aria-label="Right dashboard">
          <DashboardColumn ids={right} {...wp} />
        </aside>
      )}
    </div>
    {customizing && <CustomizeDashboard cfg={dash} update={updateDash} restoreDefaults={resetDash} onResetSession={resetSession} onClose={() => setCustomizing(false)} />}
    </SpeedContext.Provider>
  );
}

/** A chip: tap or click adds it; long-press, right-click or Shift+number removes it. */
function ChipButton({ chip, n, target, onAdd, onRemove }: { chip: (typeof CHIPS)[number]; n: number; target: string; onAdd: () => void; onRemove: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return (
    <button data-bet-control="1"
      onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onAdd(); }}
      onContextMenu={(e) => { e.preventDefault(); if (!longPressed.current) onRemove(); }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        longPressed.current = false;
        timer.current = setTimeout(() => { longPressed.current = true; onRemove(); navigator.vibrate?.(15); }, 450);
      }}
      onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      title={`Add $${chip.v} (key ${n}). Long-press, right-click or Shift+${n} removes it.`}
      className="chip relative grid size-[42px] place-items-center rounded-full font-display text-[14px] font-extrabold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:size-[46px] sm:text-[15px]"
      style={{ background: `radial-gradient(circle at 50% 50%, ${chip.bg} 0 52%, transparent 53%), repeating-conic-gradient(${chip.edge} 0 15deg, ${chip.bg} 15deg 30deg)`, boxShadow: '0 3px 0 rgba(0,0,0,0.35), inset 0 0 0 2px rgba(0,0,0,0.25)' }}
      aria-label={`Add $${chip.v} to ${target}`}>
      {chip.v}
      <kbd className="absolute -bottom-1.5 -right-1 hidden rounded bg-panel px-1 font-data text-[9px] font-bold text-fg-2 ring-1 ring-line-strong sm:block">{n}</kbd>
    </button>
  );
}

function ToolButton({ children, onClick, pressed, disabled, label }: { children: React.ReactNode; onClick: () => void; pressed?: boolean; disabled?: boolean; label: string }) {
  return (
    <button onClick={(e) => { onClick(); if (e.detail) e.currentTarget.blur(); }} disabled={disabled} aria-pressed={pressed} aria-label={label} title={label}
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-2 sm:py-1.5 text-sm font-semibold transition-colors disabled:opacity-40',
        pressed ? 'border-brass bg-brass-soft text-fg' : 'border-line bg-panel text-fg-2 hover:border-brass hover:text-fg')}>
      {children}
    </button>
  );
}

/** Table-limits placard and the pinned running/true count, top-left of the felt. */
function TableCorner({ game, showCount, trayMarks, onTray }: { game: Game; showCount: boolean; trayMarks: boolean; onTray: () => void }) {
  const { min, max } = game.limits;
  return (
    <div className="absolute left-2 top-2 z-10 flex origin-top-left scale-[0.8] items-start gap-3 sm:left-4 sm:top-4 sm:scale-100">
    <div className="flex flex-col items-start gap-2">
      <div className="rounded-md bg-[#f4efe2] px-2.5 py-1 text-center leading-none text-[#1b1a16] shadow-[0_3px_0_rgba(0,0,0,0.35)]">
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b5a2e]">Limits</div>
        <div className="tnum font-display text-[17px] font-extrabold">${min.toLocaleString()}–${max.toLocaleString()}</div>
      </div>
      {showCount && (
        <div className="flex gap-1.5" aria-label={`Running count ${game.rc}, true count ${game.tc}`}>
          {[['RC', game.rc], ['TC', game.tc]].map(([l, v]) => (
            <div key={l} className="rounded-md bg-black/55 px-2 py-1 text-center leading-none ring-1 ring-black/40 backdrop-blur-sm">
              <div className="text-[9px] font-bold tracking-[0.14em] text-[#d6ac52]">{l}</div>
              <motion.div key={String(v)} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="tnum font-data text-[18px] font-bold text-[#f6eedb]">{signed(v as number)}</motion.div>
            </div>
          ))}
        </div>
      )}
    </div>
    <DiscardTray inTray={game.inTray} size={game.shoe.size} decks={game.settings.rules.decks} marks={trayMarks} onClick={onTray} />
    </div>
  );
}

/** Chip rail in front of the seat: bankroll as chip stacks plus the amount. */
function BankrollRail({ bankroll, delta, round }: { bankroll: number; delta: number | null; round: number }) {
  // Rack the bankroll like a player: up to 8 of each smaller chip, the rest in $500s.
  let rest = Math.max(0, bankroll);
  const counts = CHIPS.map((c, i) => {
    const n = i === CHIPS.length - 1 ? Math.floor(rest / c.v) : Math.min(8, Math.floor((rest * 0.5) / c.v));
    rest -= n * c.v;
    return n;
  });
  const stacks = CHIPS.map((c, i) => ({ ...c, n: Math.min(12, counts[i]) }));
  return (
    <div className="absolute bottom-[7px] left-1/2 flex -translate-x-1/2 items-end gap-3 rounded-full bg-black/40 py-1 pl-3 pr-4 ring-1 ring-[rgba(255,220,170,0.22)] sm:bottom-[9px]" aria-label={`Bankroll ${money(bankroll)}`}>
      <div className="flex items-end gap-1" aria-hidden>
        {stacks.map((c) => (
          <div key={c.v} className="relative w-[20px]" style={{ height: 8 + Math.max(0, c.n - 1) * 3.5 }}>
            {Array.from({ length: c.n }).map((_, i) => (
              <div key={i} className="absolute left-0 h-[8px] w-[20px] rounded-[50%]" style={{ bottom: i * 3.5, background: `repeating-conic-gradient(${c.edge} 0 20deg, ${c.bg} 20deg 45deg)`, boxShadow: `0 1px 0 rgba(0,0,0,.5), inset 0 0 0 2px ${c.bg}` }} />
            ))}
          </div>
        ))}
      </div>
      <div className="leading-none">
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#d6ac52]">Bankroll</div>
        <div className="tnum font-display text-[22px] font-extrabold text-[#f6eedb]">{money(bankroll)}</div>
      </div>
      <AnimatePresence>
        {delta !== null && delta !== 0 && (
          <motion.span key={round} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.6 }}
            className={cx('self-center rounded-full px-2 py-0.5 font-data text-xs font-bold', delta > 0 ? 'bg-[#e9fbe9] text-[#0d5c1f]' : 'bg-[#fde8e8] text-[#8a1c1c]')}>
            {delta > 0 ? '+' : ''}{money(delta)}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function KeyLegend() {
  const K = ({ children }: { children: React.ReactNode }) => <kbd className="rounded bg-panel-2 px-1.5 py-0.5 font-data text-[10px] text-fg ring-1 ring-line-strong">{children}</kbd>;
  return (
    <p className="hidden w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:flex">
      <span><K>1</K>–<K>4</K> add chip</span>
      <span><K>Shift</K>+<K>1</K>–<K>4</K> remove chip</span>
      <span><K>←</K><K>→</K> choose spot</span>
      <span><K>]</K> double · <K>[</K> halve</span>
      <span><K>⌫</K> clear spot</span>
      <span><K>X</K> clear all</span>
      <span><K>E</K> estimate decks</span>
      <span><K>Space</K> deal</span>
    </p>
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
    <button data-bet-control="1" onClick={onSelect} className={cx('relative grid place-items-center rounded-full border-2 transition-colors', selected ? 'border-brass bg-black/15' : 'border-[rgba(255,240,205,0.4)]')} style={{ width: 'clamp(68px, 15vw, 92px)', aspectRatio: '1' }} aria-label={`Main bet ${money(amount)}`}>
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
    <button data-bet-control="1" onClick={onSelect} className={cx('relative grid place-items-center rounded-full border-2 border-dashed transition-colors', selected ? 'border-brass bg-black/15' : 'border-[rgba(255,240,205,0.35)]')} style={{ width: 'clamp(50px, 11vw, 64px)', aspectRatio: '1' }} aria-label={`${SIDE_BETS[id].name} side bet ${money(stake)}`}>
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
