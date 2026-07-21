/**
 * Generate the extension's PNG icons from the master SVG (S4-17).
 *
 * Rasterizes design/bugcase-icon.svg at each manifest size using headless Chromium (already a dev
 * dependency via Playwright), so no extra image toolchain is needed. The committed PNGs are the
 * build artifact — run this only when the master SVG changes: `pnpm icons:generate`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(repoRoot, 'design', 'bugcase-icon.svg');
const outDir = join(repoRoot, 'packages', 'extension', 'public', 'icons');

/** Manifest icon sizes (mirror `manifest.ts` `icons`). */
const SIZES = [16, 32, 48, 128];

const svg = readFileSync(svgPath, 'utf8');

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    // CSS width/height override the SVG's own attributes; the viewBox scales the mark to `size`.
    const page = await browser.newPage({
      viewport: { width: size * 2, height: size * 2 },
      deviceScaleFactor: 1,
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{background:transparent}
      svg{display:block;width:${size}px;height:${size}px}
    </style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.locator('svg').screenshot({ omitBackground: true });
    writeFileSync(join(outDir, `icon-${size}.png`), buffer);
    console.log(`icon-${size}.png written (${buffer.length} bytes)`);
    await page.close();
  }
} finally {
  await browser.close();
}
