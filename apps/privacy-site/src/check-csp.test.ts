import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * S4-31: the shipped Content-Security-Policies must stay strict, and `csp.md` must stay in sync
 * with them. Like the other build-gate scripts this is a plain-node CLI exercised through the real
 * process, so the untyped .mjs stays out of the src/** tsc graph. --json makes it machine-readable.
 */
const script = fileURLToPath(new URL('../../../scripts/check-csp.mjs', import.meta.url));

interface CheckResult {
  ok: boolean;
  errors: { file: string; message: string }[];
}

const DASHBOARD_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; font-src data:; media-src data:; connect-src 'none'; " +
  "base-uri 'none'; object-src 'none'; form-action 'none'";

const dashboardHtml = (csp: string = DASHBOARD_CSP): string =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>BugCase Dashboard</title></head><body><div id="root"></div></body></html>`;

/** The build-time hash is documented as a placeholder, which the gate normalises before comparing. */
const LEGAL_CSP_DOCUMENTED =
  "default-src 'none'; style-src 'sha256-<computed at build>'; script-src 'none'; " +
  "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const cspDoc = (csp: string = DASHBOARD_CSP, legal: string = LEGAL_CSP_DOCUMENTED): string =>
  `# Content-Security-Policy\n\n## Dashboard\n\n\`\`\`\n${csp}\n\`\`\`\n\n` +
  `## Legal pages\n\n\`\`\`\n${legal}\n\`\`\`\n`;

/** Minimal repo tree: the two files the gate always requires, overridable per case. */
function fixture(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-csp-'));
  const tree: Record<string, string> = {
    'packages/dashboard/index.html': dashboardHtml(),
    'apps/privacy-site/src/csp.md': cspDoc(),
    ...files,
  };
  for (const [name, body] of Object.entries(tree)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  }
  return dir;
}

function run(rootDir: string): { code: number | null; result: CheckResult } {
  const res = spawnSync('node', [script, rootDir, '--json'], { encoding: 'utf8' });
  return { code: res.status, result: JSON.parse(res.stdout) as CheckResult };
}

/** A legal page whose declared hash genuinely matches its own <style> bytes. */
function legalPage(style: string, hash: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${hash}'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>x</title><style>${style}</style></head><body></body></html>`;
}

const STYLE = 'body { color: #0f172a; }';
const STYLE_HASH = '3lqbdO1X77bijaFPUS1oZSx0k12O8Bb8RgjGXc8TWzQ=';

describe('check-csp', () => {
  it('passes a tree whose policy is strict and whose doc is in sync', () => {
    const { code, result } = run(fixture());
    expect(result.errors).toEqual([]);
    expect(result).toEqual({ ok: true, errors: [] });
    expect(code).toBe(0);
  });

  it('fails when the dashboard ships no CSP meta tag at all', () => {
    const { code, result } = run(
      fixture({
        'packages/dashboard/index.html': '<!doctype html><html><head></head><body></body></html>',
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/no Content-Security-Policy/i);
  });

  it('rejects a report-only policy, because report-only enforces nothing', () => {
    const { code, result } = run(
      fixture({
        'packages/dashboard/index.html': dashboardHtml().replace(
          'http-equiv="Content-Security-Policy"',
          'http-equiv="Content-Security-Policy-Report-Only"',
        ),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/report-only|no Content-Sec/i);
  });

  it.each([
    ["object-src 'none'", "object-src 'none'; "],
    ["base-uri 'none'", "base-uri 'none'; "],
    ["connect-src 'none'", "connect-src 'none'; "],
  ])('fails when %s is missing', (_label, fragment) => {
    const stripped = DASHBOARD_CSP.replace(fragment, '').replace(/;\s*$/, '');
    const { code, result } = run(
      fixture({
        'packages/dashboard/index.html': dashboardHtml(stripped),
        'apps/privacy-site/src/csp.md': cspDoc(stripped),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/missing required directive/i);
  });

  it.each([
    ["'unsafe-eval'", `${DASHBOARD_CSP}; worker-src 'unsafe-eval'`],
    ['report-uri', `${DASHBOARD_CSP}; report-uri /csp`],
    ['report-to', `${DASHBOARD_CSP}; report-to csp-endpoint`],
    [
      'a remote origin',
      DASHBOARD_CSP.replace("connect-src 'none'", 'connect-src https://api.x.dev'),
    ],
    ['a wildcard source', DASHBOARD_CSP.replace("img-src 'self' blob: data:", 'img-src *')],
  ])('fails when the policy contains %s', (_label, csp) => {
    const { code, result } = run(
      fixture({
        'packages/dashboard/index.html': dashboardHtml(csp),
        'apps/privacy-site/src/csp.md': cspDoc(csp),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/forbidden/i);
  });

  it('fails when csp.md has drifted from the shipped policy', () => {
    const { code, result } = run(
      fixture({ 'apps/privacy-site/src/csp.md': cspDoc(`${DASHBOARD_CSP}; worker-src 'self'`) }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/csp\.md/i);
  });

  it('checks built legal pages when they exist, and accepts a correct hash', () => {
    const { code, result } = run(
      fixture({ 'apps/privacy-site/dist/index.html': legalPage(STYLE, STYLE_HASH) }),
    );
    expect(result.errors).toEqual([]);
    expect(code).toBe(0);
  });

  it('fails when a legal page declares a hash that does not match its own style bytes', () => {
    const { code, result } = run(
      fixture({
        'apps/privacy-site/dist/index.html': legalPage('body { color: red; }', STYLE_HASH),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/hash/i);
  });

  it('fails when csp.md has drifted from the shipped legal-page policy', () => {
    const { code, result } = run(
      fixture({
        'apps/privacy-site/dist/index.html': legalPage(STYLE, STYLE_HASH),
        'apps/privacy-site/src/csp.md': cspDoc(
          DASHBOARD_CSP,
          LEGAL_CSP_DOCUMENTED.replace("script-src 'none'", "script-src 'self'"),
        ),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/csp\.md/i);
  });

  it("fails when a legal page carries 'unsafe-inline', which it never needs", () => {
    const { code, result } = run(
      fixture({
        'apps/privacy-site/dist/index.html': legalPage(STYLE, STYLE_HASH).replace(
          `'sha256-${STYLE_HASH}'`,
          "'unsafe-inline'",
        ),
      }),
    );
    expect(code).toBe(1);
    expect(result.errors.map((e) => e.message).join(' ')).toMatch(/unsafe-inline/i);
  });

  it('passes against the real repository tree', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const { code, result } = run(repoRoot);
    expect(result.errors).toEqual([]);
    expect(code).toBe(0);
  });
});
