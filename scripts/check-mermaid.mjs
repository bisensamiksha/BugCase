#!/usr/bin/env node
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

/**
 * S4-30: every mermaid diagram in the docs must parse.
 *
 * A broken diagram is a silent failure. GitHub renders it as an error box in place of the picture,
 * and nothing else notices: the markdown is still valid, no test touches it, and CI stays green. The
 * first person to find out is a reader who wanted the diagram.
 *
 * This validates with the real mermaid parser rather than a regex approximation. A homemade linter
 * that accepts a diagram mermaid would reject is worse than no gate, because it converts an obvious
 * failure into a false assurance.
 *
 * Parse only, no render. Parsing catches the realistic regression (a syntax error introduced while
 * editing) in about a second and needs no browser. Rendering would additionally catch label markup
 * that silently escapes, but it needs a real DOM, and paying a browser launch on every CI run is not
 * worth that margin. Render locally when adding new label syntax.
 */

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Markdown that may carry diagrams. `docs/**` is gitignored, so it matches nothing in CI and
 * everything locally: the same command validates the local-only records on a developer machine
 * without ever being able to fail a build over a file CI cannot see.
 */
export const CONTENT_GLOBS = [
  '*.md',
  'adr/**/*.md',
  'store/**/*.md',
  'packages/*/*.md',
  'apps/*/*.md',
  'docs/**/*.md',
];

const FENCE = /^[ \t]*```+[ \t]*mermaid[ \t]*$([\s\S]*?)^[ \t]*```+[ \t]*$/gm;

/**
 * @param {string} markdown
 * @returns {string[]} Diagram sources, in document order.
 */
export function extractMermaidBlocks(markdown) {
  return [...markdown.matchAll(FENCE)].map((m) => m[1]);
}

/** jsdom is enough for `mermaid.parse`, which does not lay anything out. Render would need more. */
function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  // `navigator` is getter-only on modern Node globals, so assignment throws.
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
}

/**
 * @param {string} rootDir Directory to scan.
 * @param {string[]} globs Patterns relative to `rootDir`.
 * @returns {Promise<{checked: number, failures: {file: string, block: number, message: string}[]}>}
 */
export async function checkMermaid(rootDir, globs = CONTENT_GLOBS) {
  /** @type {{file: string, block: number, code: string}[]} */
  const blocks = [];
  const seen = new Set();
  for (const pattern of globs) {
    for (const match of globSync(pattern, { cwd: rootDir })) {
      const rel = match.split(path.sep).join('/');
      if (seen.has(rel)) continue; // globs overlap; never validate a file twice
      seen.add(rel);
      const body = readFileSync(path.resolve(rootDir, match), 'utf8');
      extractMermaidBlocks(body).forEach((code, i) => {
        blocks.push({ file: rel, block: i + 1, code });
      });
    }
  }

  if (blocks.length === 0) return { checked: 0, failures: [] };

  installDom();
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

  const failures = [];
  for (const b of blocks) {
    try {
      await mermaid.parse(b.code);
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
      failures.push({ file: b.file, block: b.block, message });
    }
  }
  return { checked: blocks.length, failures };
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const positional = argv.filter((a) => a !== '--json');
  const rootDir = positional[0] ?? REPO_ROOT;

  const { checked, failures } = await checkMermaid(rootDir);
  const ok = failures.length === 0;

  if (json) {
    process.stdout.write(JSON.stringify({ ok, checked, failures }));
  } else if (ok) {
    console.log(`check-mermaid: ${checked} diagram(s) parse.`);
  } else {
    console.error(`check-mermaid: ${failures.length} of ${checked} diagram(s) failed to parse:\n`);
    for (const f of failures) {
      console.error(`  ${f.file}  [mermaid block ${f.block}]`);
      console.error(`      ${f.message}`);
    }
    console.error(
      '\nGitHub renders a broken diagram as an error box, so this cannot be left to review.',
    );
  }

  if (!ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
