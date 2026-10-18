// App Store screenshots: plays a short seeded session in the built app, captures five screens on
// an iPhone 6.9" and an iPad 13" viewport, and frames each with a headline at the exact sizes
// App Store Connect accepts (1320×2868 and 2064×2752, JPEG, no alpha).
//
//   npm run build && node scripts/app-store-screenshots.mjs
//
// Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright install chromium` once.
// Output: docs/app-store/screenshots/{iphone-6.9,ipad-13}/NN-name.jpg
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const outRoot = join(root, 'docs/app-store/screenshots');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

// ----- Devices and copy --------------------------------------------------------------------

const DEVICES = [
  {
    id: 'iphone-6.9', phone: true,
    canvas: { w: 1320, h: 2868 }, screen: { w: 440, h: 956 }, dsf: 3,
    statusBar: 62, homeBar: 34, headTop: 170, headSize: 104, subSize: 46, frameTop: 610, bezel: 22, radius: 64,
  },
  {
    id: 'ipad-13', phone: false,
    canvas: { w: 2064, h: 2752 }, screen: { w: 1032, h: 1376 }, dsf: 2,
    statusBar: 24, homeBar: 20, headTop: 150, headSize: 118, subSize: 52, frameTop: 540, bezel: 34, radius: 22,
  },
];

const SHOTS = [
  { id: '01-table', title: 'Deal it like the real table', sub: 'A live shoe, a discard tray and a dealer who keeps the pace.' },
  { id: '02-dashboard', title: 'The count, always on', sub: 'Running count, true count, edge and shoe depth at a glance.',
    ipad: { title: 'Build your own dashboard', sub: 'Choose the gauges, charts and drills you train with.' } },
  { id: '03-side-bets', title: 'Count the side bets', sub: 'Exact odds for 21+3, Perfect Pairs and Lucky Ladies as the shoe changes.' },
  { id: '04-strategy', title: 'Strategy for your rules', sub: 'Basic strategy and Hi-Lo index plays, computed for the game you play.' },
  { id: '05-rules', title: 'Your table, your rules', sub: 'Decks, soft 17, doubling, surrender, limits and pay tables.' },
];

// ----- Static server for dist/ -------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(dist, path.endsWith('/') ? `${path}index.html` : path);
  if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

// ----- Driving the app ---------------------------------------------------------------------

/** Seeded Math.random so every run deals the same cards. Sound off for the same reason. */
const initScript = `(() => {
  let a = 0x6a09e667;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (!localStorage.getItem('casinoghost:app')) {
    localStorage.setItem('casinoghost:app', JSON.stringify({ sound: false, volume: 0.6, haptics: true, appearance: 'dark' }));
    localStorage.setItem('casinoghost:dashboard', JSON.stringify({ speed: 'instant' }));
  }
})();`;

const wait = (p, ms) => p.waitForTimeout(ms);
const has = async (p, name) => (await p.getByRole('button', { name }).count()) > 0;
const KEYS = { Hit: 'h', Stand: 's', Double: 'd', Split: 'p', Surrender: 'r' };

/** Play one hand to the end by the book, except where `mistake` asks for a wrong first move. */
async function playHand(p, { mistake = false, pause = 40 } = {}) {
  for (let k = 0, first = true; k < 10; k++, first = false) {
    if (await has(p, /No insurance/)) { await p.keyboard.press('n'); await wait(p, pause); }
    if (!(await has(p, /^Stand/))) return;
    await p.getByRole('button', { name: /^Hint/ }).first().click();
    await wait(p, 120);
    const hint = (await p.locator('[aria-live="polite"]').filter({ hasText: /\bplay\b/ }).first().innerText()).trim();
    let move = /^(Hit|Stand|Double|Split|Surrender)/.exec(hint)?.[1] ?? 'Stand';
    if (mistake && first) move = move === 'Hit' ? 'Stand' : 'Hit';
    await p.keyboard.press(KEYS[move]);
    await wait(p, pause);
  }
}

/** A short instant-speed session so the shoe, tray, statistics and charts have data. */
async function warmUp(p) {
  await p.goto(`${base}#play`);
  await wait(p, 900);
  await p.keyboard.press('Backspace'); // clear the main spot, then bet one $25 chip
  await p.keyboard.press('2');
  for (let r = 0; r < 26; r++) {
    await p.keyboard.press('Space');
    await wait(p, 70);
    await playHand(p, { mistake: r === 6 || r === 17 });
  }
  // Back to normal dealing speed; the session is saved and restored on reload.
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('casinoghost:dashboard') || '{}');
    localStorage.setItem('casinoghost:dashboard', JSON.stringify({ ...d, speed: 'normal' }));
  });
  await p.reload();
  await wait(p, 1000);
}

/** Deal at normal speed until the player has a decision to make. */
async function toPlayerTurn(p) {
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Space');
    await wait(p, 2700);
    if (await has(p, /No insurance/)) { await p.keyboard.press('n'); await wait(p, 1500); }
    if (await has(p, /^Stand/)) return;
    await wait(p, 2500); // let the round settle
  }
}

async function goTo(p, route) {
  await p.evaluate((r) => { location.hash = r; window.scrollTo(0, 0); }, route);
  await wait(p, 1100);
}

// ----- Framing -----------------------------------------------------------------------------

const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource-variable', pkg, 'files', file)).toString('base64')}`;
const FONTS = `
@font-face { font-family: Display; font-weight: 100 900; src: url(${font('big-shoulders-display', 'big-shoulders-display-latin-wght-normal.woff2')}); }
@font-face { font-family: Body; font-weight: 300 900; src: url(${font('figtree', 'figtree-latin-wght-normal.woff2')}); }`;

/** Colour of a pixel row (top or bottom of the capture), to extend the app under the bars. */
function rowColor(png, y) {
  const i = (png.width * y + Math.floor(png.width / 2)) * 4;
  return `rgb(${png.data[i]},${png.data[i + 1]},${png.data[i + 2]})`;
}

const statusIcons = (s) => `
<svg viewBox="0 0 80 14" width="${80 * s}" height="${14 * s}" fill="#fff" aria-hidden="true">
  <rect x="0" y="9" width="3" height="4" rx="1"/><rect x="5" y="6.5" width="3" height="6.5" rx="1"/><rect x="10" y="4" width="3" height="9" rx="1"/><rect x="15" y="1.5" width="3" height="11.5" rx="1"/>
  <path d="M30 4.2a10 10 0 0 1 14 0l-1.5 1.5a8 8 0 0 0-11 0zM33 7.2a6 6 0 0 1 8 0l-1.5 1.5a4 4 0 0 0-5 0zM37 12.5l-2-2a3 3 0 0 1 4 0z"/>
  <rect x="52" y="1.5" width="24" height="11" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="54" y="3.5" width="18" height="7" rx="2"/><rect x="77.3" y="5" width="1.7" height="4" rx=".8" fill-opacity=".45"/>
</svg>`;

function frameHtml(d, shot, capture) {
  const png = PNG.sync.read(capture);
  const { w: cw, h: ch } = d.canvas;
  const avail = ch - d.frameTop - 90;
  const scale = (avail - 2 * d.bezel) / d.screen.h;
  const sw = d.screen.w * scale, sh = d.screen.h * scale;
  const copy = (!d.phone && shot.ipad) || shot;
  const img = `data:image/png;base64,${capture.toString('base64')}`;
  const island = d.phone ? `<div style="position:absolute;top:${11 * scale}px;left:50%;transform:translateX(-50%);width:${124 * scale}px;height:${36 * scale}px;border-radius:${18 * scale}px;background:#000"></div>` : '';
  const time = d.phone ? 'left:' + 52 * scale + 'px;top:' + 20 * scale + 'px;font-size:' + 17 * scale + 'px' : 'left:' + 22 * scale + 'px;top:' + 5 * scale + 'px;font-size:' + 13 * scale + 'px';
  const icons = d.phone ? `right:${34 * scale}px;top:${23 * scale}px` : `right:${20 * scale}px;top:${6 * scale}px`;
  return `<!doctype html><html><head><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${cw}px; height: ${ch}px; overflow: hidden; font-family: Body;
    background: radial-gradient(120% 70% at 50% 0%, #1f5a43 0%, #12382b 38%, #0c1a14 72%, #0a0f0c 100%); }
  .head { text-wrap: balance; position: absolute; top: ${d.headTop}px; left: 0; right: 0; text-align: center; padding: 0 ${cw * 0.07}px; }
  h1 { font-family: Display; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; line-height: .95;
    font-size: ${d.headSize}px; color: #f2e3bd; text-shadow: 0 4px 24px rgba(0,0,0,.35); }
  p { margin-top: ${d.subSize * 0.55}px; font-size: ${d.subSize}px; line-height: 1.25; color: #c8d6ce; font-weight: 500; }
  .device { position: absolute; top: ${d.frameTop}px; left: ${(cw - sw) / 2 - d.bezel}px; width: ${sw + 2 * d.bezel}px; height: ${sh + 2 * d.bezel}px;
    padding: ${d.bezel}px; border-radius: ${(d.radius * scale) + d.bezel}px; background: linear-gradient(160deg, #2c2f2d, #0b0c0b 40%, #1b1d1c);
    box-shadow: 0 0 0 ${3}px #3d413e, 0 40px 120px rgba(0,0,0,.55); }
  .screen { position: relative; width: ${sw}px; height: ${sh}px; border-radius: ${d.radius * scale}px; overflow: hidden; display: flex; flex-direction: column; }
  .bar { flex: none; position: relative; }
  .app { display: block; width: ${sw}px; height: auto; }
  .time { position: absolute; color: #fff; font-weight: 600; ${time}; }
  </style></head><body>
  <div class="head"><h1>${copy.title}</h1><p>${copy.sub}</p></div>
  <div class="device"><div class="screen">
    <div class="bar" style="height:${d.statusBar * scale}px;background:${rowColor(png, 0)}"><span class="time">9:41</span><div style="position:absolute;${icons}">${statusIcons(scale * (d.phone ? 1 : 0.85))}</div></div>
    <img class="app" src="${img}">
    <div class="bar" style="height:${d.homeBar * scale}px;background:${rowColor(png, png.height - 1)}"><div style="position:absolute;left:50%;bottom:${8 * scale}px;transform:translateX(-50%);width:${(d.phone ? 140 : 320) * scale}px;height:${5 * scale}px;border-radius:9px;background:rgba(255,255,255,.75)"></div></div>
    ${island}
  </div></div>
  </body></html>`;
}

// ----- Run ---------------------------------------------------------------------------------

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const composer = await browser.newPage({ deviceScaleFactor: 1 });

for (const d of DEVICES) {
  const viewport = { width: d.screen.w, height: d.screen.h - d.statusBar - d.homeBar };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: d.dsf, isMobile: d.phone, hasTouch: d.phone, colorScheme: 'dark', serviceWorkers: 'block' });
  await ctx.addInitScript(initScript);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  await warmUp(p);
  await toPlayerTurn(p);
  const captures = {};
  captures['01-table'] = await p.screenshot();
  await playHand(p, { pause: 600 });
  await wait(p, 4500);

  if (d.phone) {
    await p.evaluate(() => {
      const el = document.querySelector('aside[aria-label="Right dashboard"]');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
    });
    await wait(p, 700);
  } else {
    await p.getByRole('button', { name: /Customize/ }).first().click();
    await wait(p, 800);
  }
  captures['02-dashboard'] = await p.screenshot();

  await goTo(p, 'lab');
  await p.getByRole('radio', { name: '21+3' }).first().click();
  await p.getByText('Dealing the first shoes').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
  await wait(p, 600);
  if (d.phone) {
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('.label')].find((e) => e.textContent?.startsWith('House edge, full shoe'));
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40);
    });
    await wait(p, 500);
  }
  captures['03-side-bets'] = await p.screenshot();
  await goTo(p, 'strategy');
  captures['04-strategy'] = await p.screenshot();
  await goTo(p, 'rules');
  captures['05-rules'] = await p.screenshot();
  await ctx.close();

  const dir = join(outRoot, d.id);
  mkdirSync(dir, { recursive: true });
  await composer.setViewportSize({ width: d.canvas.w, height: d.canvas.h });
  for (const shot of SHOTS) {
    await composer.setContent(frameHtml(d, shot, captures[shot.id]), { waitUntil: 'load' });
    await composer.evaluate(() => document.fonts.ready);
    writeFileSync(join(dir, `${shot.id}.jpg`), await composer.screenshot({ type: 'jpeg', quality: 90 }));
  }
  console.log(`${d.id}: ${SHOTS.length} screenshots at ${d.canvas.w}×${d.canvas.h}${errors.length ? `\n  page errors: ${errors.join('; ')}` : ''}`);
}

await browser.close();
server.close();
