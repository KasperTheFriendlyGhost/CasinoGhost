// Card faces (Adrian Kennard's CC0 deck, see src/assets/cards/README.md) and the CasinoGhost back.
import { RANK_LABEL } from '../engine/cards';

const faces = import.meta.glob('../assets/cards/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const SUIT_LETTER = ['S', 'H', 'D', 'C'];
const cache = new Map<string, string>();

const toUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function faceUrl(rank: number, suit: number): string {
  const key = `${SUIT_LETTER[suit]}-${RANK_LABEL[rank]}`;
  let url = cache.get(key);
  if (!url) {
    url = toUrl(faces[`../assets/cards/${key}.svg`] ?? '');
    cache.set(key, url);
  }
  return url;
}

/** Burgundy lattice back with a gold frame and the ghost emblem. */
export const BACK_URL = toUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336">
<defs>
  <pattern id="l" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="16" height="16" fill="#6b1622"/>
    <path d="M0 8H16M8 0V16" stroke="#c9a14e" stroke-opacity=".55" stroke-width="1.6"/>
    <circle cx="8" cy="8" r="2.2" fill="#e2c27a" fill-opacity=".7"/>
  </pattern>
  <radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
</defs>
<rect x="1" y="1" width="238" height="334" rx="13" fill="#fbf8f0" stroke="#d8d1bf" stroke-width="2"/>
<rect x="13" y="13" width="214" height="310" rx="7" fill="url(#l)"/>
<rect x="13" y="13" width="214" height="310" rx="7" fill="url(#g)"/>
<rect x="19" y="19" width="202" height="298" rx="5" fill="none" stroke="#e2c27a" stroke-width="2"/>
<ellipse cx="120" cy="168" rx="46" ry="58" fill="#5b111b" stroke="#e2c27a" stroke-width="2.5"/>
<path d="M95 202V160a25 25 0 0 1 50 0v42l-8.3-6.4-8.4 6.4-8.3-6.4-8.4 6.4-8.3-6.4z" fill="#e2c27a"/>
<ellipse cx="111.5" cy="163" rx="4" ry="5.5" fill="#5b111b"/><ellipse cx="128.5" cy="163" rx="4" ry="5.5" fill="#5b111b"/>
</svg>`);
