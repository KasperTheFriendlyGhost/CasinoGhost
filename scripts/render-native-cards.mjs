// Renders the card faces (src/assets/cards, CC0) and the CasinoGhost card back to PNGs in the
// native app's asset catalog. Run once after changing card art:
//   CHROMIUM_PATH=... node scripts/render-native-cards.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}apple/CasinoGhost/Assets.xcassets/Cards`;
const W = 360, H = 504; // 3x a 120 x 168 pt card
const backSrc = readFileSync(`${root}src/lib/cardArt.ts`, 'utf8').match(/BACK_URL = toUrl\(`([\s\S]*?)`\)/)[1];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
async function render(svg, name) {
  const sized = svg.replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true });
  const dir = `${out}/${name}.imageset`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.png`, png);
  writeFileSync(`${dir}/Contents.json`, JSON.stringify({
    images: [{ filename: `${name}.png`, idiom: 'universal' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2));
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/Contents.json`, JSON.stringify({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }, null, 2));
const suits = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const ranks = { A: 1, J: 11, Q: 12, K: 13 };
for (const f of readdirSync(`${root}src/assets/cards`).filter((x) => x.endsWith('.svg'))) {
  const [s, r] = f.replace('.svg', '').split('-');
  const rank = ranks[r] ?? Number(r);
  await render(readFileSync(`${root}src/assets/cards/${f}`, 'utf8'), `${suits[s]}-${rank}`);
}
await render(backSrc, 'back');
await browser.close();
console.log('Rendered 52 faces and the back.');
