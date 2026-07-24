/**
 * Generate the store listing's promo art from the SVG masters (S4-23).
 *
 * Rasterizes each `design/store-*.svg` at its exact pixel size using headless Chromium (already a dev
 * dependency via Playwright), so no extra image toolchain is needed. The committed PNGs are the build
 * artifact — run this only when a master SVG changes: `pnpm store:assets`.
 *
 * App screenshots are NOT generated here — they are captured by hand from the real build
 * (see store/chrome/screenshots/README.md); faking them would overpromise.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Each master SVG → its committed PNG at exact store dimensions. */
const ASSETS = [
  {
    svg: 'design/store-promo-small.svg',
    out: 'store/chrome/assets/promo-tile-440x280.png',
    width: 440,
    height: 280,
  },
  {
    svg: 'design/store-promo-marquee.svg',
    out: 'store/chrome/assets/promo-marquee-1400x560.png',
    width: 1400,
    height: 560,
  },
  {
    svg: 'design/store-logo.svg',
    out: 'store/edge/assets/store-logo-300x300.png',
    width: 300,
    height: 300,
  },
];

const browser = await chromium.launch();
try {
  for (const { svg, out, width, height } of ASSETS) {
    const svgMarkup = readFileSync(join(repoRoot, svg), 'utf8');
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    // CSS width/height pin the SVG to the exact store size; the viewBox scales the artwork.
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{background:transparent}
      svg{display:block;width:${width}px;height:${height}px}
    </style></head><body>${svgMarkup}</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    // Clip to the exact store size; the viewport already matches, and the outer SVG paints a full
    // white background. (A `locator('svg')` shot would be ambiguous — the masters nest an inner SVG.)
    const buffer = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
    const outPath = join(repoRoot, out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buffer);
    console.log(`${out} written (${width}×${height}, ${buffer.length} bytes)`);
    await page.close();
  }
} finally {
  await browser.close();
}
