// The dealing shoe and the discard tray, drawn to scale so decks can be judged by eye.

/** Stack of card edges (as seen from the side), as a CSS background. */
const EDGES_V = 'repeating-linear-gradient(90deg, #f6f2e7 0 1.5px, #c9c2b0 1.5px 2.5px)';
const EDGES_H = 'repeating-linear-gradient(0deg, #f6f2e7 0 1.5px, #c9c2b0 1.5px 2.5px)';

interface ShoeProps {
  /** Cards still in the shoe. */
  left: number;
  size: number;
  /** Cards dealt when the cut card comes out. */
  cut: number;
  decks: number;
  showNumbers: boolean;
}

/** Red acrylic shoe; the card stack shrinks toward the front as cards are dealt. */
export function DealingShoe({ left, size, cut, decks, showNumbers }: ShoeProps) {
  const W = 118; // inner window width in px for a full shoe
  const stack = (left / size) * W;
  const behindCut = ((size - cut) / size) * W; // cut card position, measured from the back
  const cutReached = left <= size - cut;
  return (
    <div className="flex flex-col items-end gap-1" aria-label={showNumbers ? `${(left / 52).toFixed(1)} decks left in the shoe` : 'Dealing shoe'}>
      <div className="relative" style={{ width: W + 26, height: 54 }}>
        {/* body */}
        <div className="absolute inset-0 rounded-[10px_8px_8px_14px]"
          style={{ background: 'linear-gradient(165deg, rgba(222,64,72,0.92), rgba(120,16,24,0.95))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -6px 12px rgba(0,0,0,0.35), 0 8px 16px rgba(0,0,0,0.35)' }} />
        {/* window with cards */}
        <div className="absolute overflow-hidden rounded-[4px] bg-black/30" style={{ left: 18, right: 8, top: 9, bottom: 11 }}>
          <div className="absolute inset-y-0 right-0" style={{ width: stack, background: EDGES_V, transition: 'width .5s ease' }} />
          {/* top card back at the front of the stack */}
          {left > 0 && <div className="absolute inset-y-0 w-[6px] rounded-[1px]" style={{ right: stack - 3, background: '#5b1620', boxShadow: '0 0 0 1px #f4efe2 inset', transition: 'right .5s ease' }} />}
          {/* cut card */}
          <div className="absolute -inset-y-1 w-[3px]" style={{ right: cutReached ? Math.max(0, stack - 1) : behindCut, background: '#ffd23f', boxShadow: '0 0 4px rgba(255,210,63,0.8)', transition: 'right .5s ease' }} title="Cut card" />
        </div>
        {/* front lip */}
        <div className="absolute left-0 top-[6px] h-[42px] w-[16px] rounded-[10px_3px_3px_12px]" style={{ background: 'linear-gradient(180deg, rgba(255,120,128,0.55), rgba(110,10,18,0.9))' }} />
      </div>
      {showNumbers && <div className="font-display text-[13px] font-bold tracking-wide text-[#efe6cf]">{(left / 52).toFixed(1)} of {decks} decks</div>}
    </div>
  );
}

interface TrayProps {
  inTray: number;
  size: number;
  decks: number;
  marks: boolean;
  onClick?: () => void;
}

/** Clear discard tray; the stack of played cards grows from the bottom. */
export function DiscardTray({ inTray, size, decks, marks, onClick }: TrayProps) {
  const H = 96; // inner height for a full shoe
  const h = (inTray / size) * H;
  return (
    <button onClick={onClick} className="group relative shrink-0 cursor-pointer" style={{ width: 46, height: H + 12 }}
      aria-label="Discard tray: estimate the decks played" title="Discard tray: click to practise deck estimation">
      <div className="absolute inset-0 rounded-[6px] border border-white/35 bg-white/[0.07] shadow-[inset_0_0_10px_rgba(255,255,255,0.08),0_6px_14px_rgba(0,0,0,0.3)] backdrop-blur-[1px] group-hover:border-[#d6ac52]" />
      <div className="absolute inset-x-[7px] bottom-[6px] rounded-[2px]" style={{ height: h, background: EDGES_H, transition: 'height .5s ease', boxShadow: '0 -1px 0 #5b1620' }} />
      {marks && Array.from({ length: decks - 1 }, (_, i) => {
        const y = 6 + ((i + 1) / decks) * H;
        return (
          <div key={i} className="absolute right-[-2px] flex items-center" style={{ bottom: y - 0.5 }}>
            <span className="h-px w-[9px] bg-white/60" />
          </div>
        );
      })}
      {marks && <span className="absolute -right-[3px] top-0 translate-x-full font-data text-[9px] leading-none text-white/60">{decks}</span>}
    </button>
  );
}
