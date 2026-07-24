import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// S4-23: the generated store promo art (from design/store-*.svg via `pnpm store:assets`) must exist at
// the exact pixel sizes the Chrome Web Store and Edge Add-ons require, or the listing upload is
// rejected. Read the dimensions straight from each committed PNG's IHDR header (self-contained, like
// src/icons.test.ts) so the assets and their declared sizes can never silently drift.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signatureOk = bytes.length >= 24 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
  if (!signatureOk) throw new Error('Not a valid PNG image');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Repo-root-relative path → declared store dimensions. Mirrors scripts/generate-store-assets.mjs. */
const assets: [string, number, number][] = [
  ['store/chrome/assets/promo-tile-440x280.png', 440, 280],
  ['store/chrome/assets/promo-marquee-1400x560.png', 1400, 560],
  ['store/edge/assets/store-logo-300x300.png', 300, 300],
];

describe('store listing assets', () => {
  it.each(assets)('%s is a valid PNG of the declared size', (relPath, width, height) => {
    const bytes = readFileSync(fileURLToPath(new URL(`../../../../${relPath}`, import.meta.url)));
    const dims = readPngDimensions(bytes);
    expect(dims).toEqual({ width, height });
  });
});
