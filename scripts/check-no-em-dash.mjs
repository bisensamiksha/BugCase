#!/usr/bin/env node
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EM_DASH = '—';
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Content globs ESLint cannot reach (Markdown, HTML, SVG). UI source is covered by the
 * `no-restricted-syntax` block in eslint.config.js instead.
 */
export const CONTENT_GLOBS = [
  'README.md',
  'CONTRIBUTING.md',
  'store/**/*.md',
  'apps/privacy-site/src/**/*.html',
  'apps/privacy-site/src/**/*.md',
  'design/*.svg',
  'packages/*/index.html',
  'packages/*/src/**/*.html',
];

/**
 * @param {string} rootDir Directory to scan.
 * @param {string[]} globs Patterns relative to `rootDir`.
 * @returns {{file: string, line: number, text: string}[]} Every hit, sorted by file then line.
 */
export function scanForEmDash(rootDir, globs = CONTENT_GLOBS) {
  const hits = [];
  for (const pattern of globs) {
    for (const match of globSync(pattern, { cwd: rootDir })) {
      const body = readFileSync(path.resolve(rootDir, match), 'utf8');
      body.split('\n').forEach((text, i) => {
        if (text.includes(EM_DASH)) {
          hits.push({ file: match.split(path.sep).join('/'), line: i + 1, text });
        }
      });
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const positional = argv.filter((a) => a !== '--json');
  const rootDir = positional[0] ?? REPO_ROOT;

  const hits = scanForEmDash(rootDir);
  const ok = hits.length === 0;

  if (json) {
    process.stdout.write(JSON.stringify({ ok, hits }));
  } else if (ok) {
    console.log('No em dashes in user-visible content files.');
  } else {
    console.error(`Found ${hits.length} em dash(es) in user-visible content files:\n`);
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  ${h.text.trim()}`);
    }
    console.error('\nReword the sentence. Do not substitute a hyphen inside a sentence.');
  }

  if (!ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
