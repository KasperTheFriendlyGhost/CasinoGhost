import { motion, useReducedMotion } from 'motion/react';
import { RANK_LABEL, SUIT_SYMBOL, SUIT_NAME, isRed, type Card } from '../engine/cards';
import { useSpeed } from '../lib/dashboard';

interface Props {
  card: Card;
  faceDown?: boolean;
  /** Seconds to wait before the deal animation starts. */
  delay?: number;
  small?: boolean;
}

const FACE = new Set([11, 12, 13]);

export function PlayingCard({ card, faceDown = false, delay = 0, small = false }: Props) {
  const speed = useSpeed();
  const reduce = useReducedMotion() || speed === 0;
  const color = isRed(card.suit) ? 'var(--card-red)' : 'var(--card-black)';
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const w = small ? 'var(--card-w-sm)' : 'var(--card-w)';

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: w, aspectRatio: '5 / 7', perspective: 800 }}
      initial={reduce ? false : { x: 260, y: -220, rotate: -14, opacity: 0 }}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260 / speed, damping: 26 / Math.sqrt(speed), delay: delay * speed }}
      role="img"
      aria-label={faceDown ? 'Face-down card' : `${rank} of ${SUIT_NAME[card.suit]}`}
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: reduce ? 0 : 0.45 * speed, ease: [0.3, 0.7, 0.2, 1] }}
      >
        {/* Face */}
        <div
          className="absolute inset-0 overflow-hidden select-none"
          style={{
            backfaceVisibility: 'hidden',
            background: 'var(--card-face)',
            borderRadius: 'calc(' + w + ' * 0.09)',
            boxShadow: '0 1px 0 var(--card-edge), 0 6px 14px rgba(0,0,0,0.28)',
            color,
            fontFamily: 'var(--font-display)',
            ['--cw' as string]: w,
          }}
        >
          <Corner rank={rank} suit={suit} />
          <div className="absolute inset-0 grid place-items-center" aria-hidden>
            {FACE.has(card.rank) ? (
              <div className="grid place-items-center leading-none" style={{ border: `1.5px solid ${color}`, borderRadius: 6, width: '58%', height: '62%', opacity: 0.95 }}>
                <span style={{ fontSize: `calc(${w} * 0.42)`, fontWeight: 800 }}>{rank}</span>
                <span style={{ fontSize: `calc(${w} * 0.24)`, marginTop: '-0.2em' }}>{suit}</span>
              </div>
            ) : (
              <span style={{ fontSize: `calc(${w} * ${card.rank === 1 ? 0.62 : 0.5})`, lineHeight: 1 }}>{suit}</span>
            )}
          </div>
          <div className="absolute inset-0 rotate-180"><Corner rank={rank} suit={suit} /></div>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 'calc(' + w + ' * 0.09)',
            background:
              'repeating-linear-gradient(45deg, rgba(214,172,82,0.38) 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, rgba(214,172,82,0.38) 0 2px, transparent 2px 9px), #5b1620',
            boxShadow: 'inset 0 0 0 4px #f4efe2, inset 0 0 0 5px rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,0.28)',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

function Corner({ rank, suit }: { rank: string; suit: string }) {
  return (
    <div className="absolute flex flex-col items-center leading-none" style={{ top: '6%', left: '8%' }} aria-hidden>
      <span style={{ fontSize: 'calc(var(--cw) * 0.26)', fontWeight: 800, letterSpacing: rank === '10' ? '-0.06em' : 0 }}>{rank}</span>
      <span style={{ fontSize: 'calc(var(--cw) * 0.2)', marginTop: '0.05em' }}>{suit}</span>
    </div>
  );
}
