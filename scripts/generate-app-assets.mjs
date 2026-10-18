// Renders the iOS app icon from assets/icon-ios.svg into the native app's asset catalog.
// App Store icons must be opaque, so alpha is stripped. Run: node scripts/generate-app-assets.mjs
// Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright install chromium` once.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = new URL('..', import.meta.url).pathname;
const catalog = `${root}apple/CasinoGhost/Assets.xcassets`;

async function render(page, svgFile, size) {
  const svg = readFileSync(`${root}assets/${svgFile}`, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  return page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
}

/** Re-encode a PNG as RGB (no alpha channel). */
function opaque(buf) {
  const src = PNG.sync.read(buf);
  const out = new PNG({ width: src.width, height: src.height, colorType: 2, inputHasAlpha: true });
  src.data.copy(out.data);
  return PNG.sync.write(out, { colorType: 2 });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
writeFileSync(`${catalog}/AppIcon.appiconset/AppIcon.png`, opaque(await render(page, 'icon-ios.svg', 1024)));
await browser.close();
console.log('Wrote AppIcon (1024×1024, opaque).');
