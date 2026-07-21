import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildManifest } from './manifest';

/**
 * The final extension icons (S4-17) ship inside the signed ZIP (S4-18) and the store listing
 * (S4-23), where a missing or wrong-size icon fails validation. Drive the check off the manifest's
 * own `icons` map so the assets and the manifest can never drift, and read pixel dimensions straight
 * from the committed PNGs' IHDR header (kept self-contained here — the capture engine's equivalent
 * reader lives behind a `webextension-polyfill` import that can't load in a plain node test).
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read a PNG's pixel dimensions straight from its IHDR header; throws if it is not a valid PNG. */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signatureOk = bytes.length >= 24 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
  if (!signatureOk) {
    throw new Error('Not a valid PNG image');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Manifest icon map: declared size (px, as a string key) -> path relative to the package root. */
const iconEntries = Object.entries(
  (buildManifest('chrome') as { icons: Record<string, string> }).icons,
);

describe('extension icons', () => {
  it('declares the four store/toolbar sizes', () => {
    expect(iconEntries.map(([size]) => size).sort()).toEqual(['128', '16', '32', '48']);
  });

  it.each(iconEntries)('icon %s is a valid square PNG of the declared size', (size, relPath) => {
    const bytes = readFileSync(join(packageRoot, relPath));
    const { width, height } = readPngDimensions(bytes);
    const expected = Number(size);
    expect(width).toBe(expected);
    expect(height).toBe(expected);
  });

  it('emits identical icons for both browser targets', () => {
    const firefoxIcons = (buildManifest('firefox') as { icons: Record<string, string> }).icons;
    expect(firefoxIcons).toEqual(Object.fromEntries(iconEntries));
  });
});
