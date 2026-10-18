import { createContext, useContext, type RefObject } from 'react';

/** Where cards come from (the shoe's mouth) and go to (the discard tray), for animation. */
export interface TableAnchors {
  shoe: RefObject<HTMLElement | null>;
  tray: RefObject<HTMLElement | null>;
}

export const AnchorsContext = createContext<TableAnchors | null>(null);
export const useAnchors = () => useContext(AnchorsContext);

/** Offset from an element's centre to an anchor's centre, in px. */
export function offsetTo(el: HTMLElement, anchor: HTMLElement | null | undefined, fallback: { x: number; y: number }) {
  if (!anchor) return fallback;
  const a = anchor.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2) };
}
