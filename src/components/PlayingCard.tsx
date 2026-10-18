import { useEffect, useLayoutEffect } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { RANK_LABEL, SUIT_NAME, type Card } from '../engine/cards';
import { useSpeed } from '../lib/dashboard';
import { BACK_URL, faceUrl } from '../lib/cardArt';
import { offsetTo, useAnchors } from '../lib/tableAnchors';

interface Props {
  card: Card;
  faceDown?: boolean;
  /** Seconds before the card leaves the shoe. */
  delay?: number;
  /** Seconds before a face-down card turns over. */
  flipDelay?: number;
  /** Sweep the card into the discard tray. */
  collect?: boolean;
  /** The dealer lifts the corner to check for blackjack. */
  peek?: boolean;
  small?: boolean;
}

export function PlayingCard({ card, faceDown = false, delay = 0, flipDelay = 0, collect = false, peek = false, small = false }: Props) {
  const speed = useSpeed();
  const reduce = useReducedMotion() || speed === 0;
  const anchors = useAnchors();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const w = small ? 'var(--card-w-sm)' : 'var(--card-w)';

  // Deal: fly out of the shoe's mouth, spinning flat onto the felt.
  useLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    if (reduce) { el.style.opacity = '1'; return; }
    const from = offsetTo(el, anchors?.shoe.current, { x: 260, y: -220 });
    animate(el, { x: [from.x, 0], y: [from.y, 0], rotate: [-28, 0], scale: [0.55, 1], opacity: [0, 1] },
      { type: 'spring', stiffness: 210 / speed, damping: 24 / Math.sqrt(speed), delay: delay * speed });
    // Mount-only: the deal plays once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Collect: slide into the discard tray.
  useEffect(() => {
    const el = scope.current;
    if (!collect || !el || reduce) return;
    const to = offsetTo(el, anchors?.tray.current, { x: -300, y: -220 });
    animate(el, { x: to.x, y: to.y, rotate: 90, scale: 0.35, opacity: 0 }, { duration: 0.42 * speed, ease: [0.4, 0, 0.2, 1] });
  }, [collect, reduce, speed, anchors, animate, scope]);

  // Peek: lift the hole card's corner once, after the deal.
  useEffect(() => {
    const el = scope.current;
    if (!peek || !el || reduce) return;
    animate(el, { y: [0, -10, 0], rotate: [0, -4, 0] }, { duration: 0.55 * speed, delay: 1.35 * speed, ease: 'easeInOut' });
  }, [peek, reduce, speed, animate, scope]);

  const label = faceDown ? 'Face-down card' : `${RANK_LABEL[card.rank]} of ${SUIT_NAME[card.suit]}`;
  const radius = `calc(${w} * 0.075)`;
  return (
    <div ref={scope} className="relative shrink-0" style={{ width: w, aspectRatio: '5 / 7', perspective: 900, opacity: 0 }} role="img" aria-label={label}>
      <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }} initial={false}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: reduce ? 0 : 0.5 * speed, ease: [0.3, 0.7, 0.2, 1], delay: reduce ? 0 : flipDelay * speed }}>
        <img src={faceUrl(card.rank, card.suit)} alt="" draggable={false}
          className="absolute inset-0 h-full w-full select-none"
          style={{ backfaceVisibility: 'hidden', borderRadius: radius, boxShadow: '0 1px 1px rgba(0,0,0,.18), 0 8px 18px -4px rgba(0,0,0,.45)' }} />
        <img src={BACK_URL} alt="" draggable={false}
          className="absolute inset-0 h-full w-full select-none"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: radius, boxShadow: '0 1px 1px rgba(0,0,0,.18), 0 8px 18px -4px rgba(0,0,0,.45)' }} />
      </motion.div>
    </div>
  );
}
