import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guard: no raw colour literals in the extension source (S4-25).
 *
 * The extension's UI is inline styles — the overlay injects into arbitrary pages through a Shadow
 * DOM and cannot rely on a stylesheet — so colours cannot be centralised by a CSS file the way the
 * dashboard's are. Without an enforced rule the 164 hex literals this ticket removed would silently
 * come back, and the shared token package would quietly stop being the single source of truth.
 *
 * Colours come from `@bugcase/shared-tokens`. The extension consumes the **primitive** scale rather
 * than the semantic themes: it is deliberately light-only (S4-25 fork 1), and the primitives carry
 * exactly the values it already shipped, so adopting them changed no pixels.
 */

const SRC = new URL('../', import.meta.url).pathname;

/** Colour literals that are deliberately not theme colours. */
const ALLOWLIST: readonly {
  readonly file: string;
  readonly value: string;
  readonly why: string;
}[] = [
  {
    file: 'annotation/AnnotationCanvas.tsx',
    value: '#000000',
    why: 'Redaction fill is opaque paint, not a theme colour. It must stay black even if the palette changes — a redaction box that follows a theme is a privacy bug.',
  },
];

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(full);
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
        return [];
      }
      return [full];
    }),
  );
  return files.flat();
}

describe('extension colour literals', () => {
  it('are sourced from @bugcase/shared-tokens, not hardcoded', async () => {
    const files = await sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file);
      const content = await readFile(file, 'utf8');
      for (const [match] of content.matchAll(HEX)) {
        const allowed = ALLOWLIST.some(
          (entry) => entry.file === rel && entry.value.toLowerCase() === match.toLowerCase(),
        );
        if (!allowed) {
          offenders.push(`${rel}: ${match}`);
        }
      }
    }

    expect(
      offenders,
      `Import the value from @bugcase/shared-tokens instead (e.g. palette.slate600). If the colour is genuinely not a theme colour, add it to the allowlist in this file with a reason.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the allowlist honest — every entry still exists', async () => {
    // A stale allowlist entry silently widens the guard.
    for (const entry of ALLOWLIST) {
      const content = await readFile(join(SRC, entry.file), 'utf8');
      expect(content, `${entry.file} no longer contains ${entry.value}`).toContain(entry.value);
    }
  });
});
