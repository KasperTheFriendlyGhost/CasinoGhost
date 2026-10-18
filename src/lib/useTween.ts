import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

/** A number that glides to its new value instead of jumping. */
export function useTween(value: number, duration = 0.7): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const controls = animate(current.current, value, {
      duration, ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { current.current = v; setShown(v); },
    });
    return () => controls.stop();
  }, [value, duration]);
  return shown;
}
