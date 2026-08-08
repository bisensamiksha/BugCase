#!/usr/bin/env node
/**
 * S4-31: gate the shipped Content-Security-Policies.
 *
 * Three jobs, in order of how badly each failure would hurt:
 *
 *   1. The dashboard ships an ENFORCED policy that is still strict. A policy that quietly grows an
 *      `'unsafe-eval'` or a remote origin is worse than no policy, because the repo would keep
 *      claiming protection it no longer has.
 *   2. `apps/privacy-site/src/csp.md` quotes the policy actually shipped. That document explains
 *      every relaxation; a doc that has drifted from the code teaches the next person something
 *      false.
 *   3. Each built legal page allows its inline stylesheet by a hash that matches the bytes it
 *      actually emitted, and carries no `'unsafe-inline'`. A stale hash breaks all three pages at
 *      once and is invisible without a browser.
 *
 * The legal pages are only checked when `apps/privacy-site/dist` exists, so the gate is useful
 * before a build and stricter after one.
 *
 * Usage: node scripts/check-csp.mjs [rootDir] [--json]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DASHBOARD_HTML = 'packages/dashboard/index.html';
const CSP_DOC = 'apps/privacy-site/src/csp.md';
const LEGAL_DIST = 'apps/privacy-site/dist';

/** Named individually by the ticket's acceptance criteria, so assert them individually. */
const REQUIRED_DIRECTIVES = [
  "default-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
];

/**
 * Tokens that must never appear in any policy this repo ships.
 *
 * `report-uri` / `report-to` are not merely ignored in a meta tag: they would be remote logging,
 * which the product promises does not exist. The remote-origin and wildcard patterns are what keep
 * `connect-src 'none'` meaningful as a zero-telemetry backstop.
 */
const FORBIDDEN = [
  { pattern: /'unsafe-eval'/, label: "'unsafe-eval'" },
  { pattern: /'wasm-unsafe-eval'/, label: "'wasm-unsafe-eval'" },
  { pattern: /\breport-uri\b/, label: 'report-uri (remote logging)' },
  { pattern: /\breport-to\b/, label: 'report-to (remote logging)' },
  { pattern: /\*/, label: 'a wildcard source' },
  { pattern: /\bhttps?:/, label: 'a remote origin' },
  { pattern: /\/\/[a-z0-9.-]+/i, label: 'a remote host' },
];

/**
 * Read the content of an enforced CSP meta tag.
 *
 * Report-only tags are ignored on purpose rather than accepted: `Content-Security-Policy-Report-Only`
 * enforces nothing, so a page carrying only that one is reported as having no policy.
 *
 * @param {string} html
 * @returns {string | null}
 */
export function extractEnforcedCsp(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)) continue;
    // Match the delimiter explicitly: policies are full of single quotes ('none', 'self'), so a
    // naive ["']([^"']*)["'] truncates at the first `'none'`.
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (content) return (content[1] ?? content[2]).trim();
  }
  return null;
}

/** @param {string} html @returns {string | null} */
function extractInlineStyle(html) {
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? null;
}

/** @param {string} text @returns {string} */
function sha256Base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

/**
 * Normalise a policy for comparison against the documented one: the legal pages' hash is computed
 * at build time, so `csp.md` documents it as a placeholder rather than a literal digest.
 *
 * @param {string} csp
 * @returns {string}
 */
function normalize(csp) {
  return csp.replace(/'sha256-[A-Za-z0-9+/=]+'/g, "'sha256-<computed at build>'").trim();
}

/**
 * Every fenced code block in `csp.md`, normalised, as candidate policy quotations. Blocks that are
 * not policies (shell snippets, probe output) simply never match.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function documentedPolicies(markdown) {
  return [...markdown.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => normalize(m[1]));
}

/**
 * @param {string} rootDir Directory to scan.
 * @returns {{ok: boolean, errors: {file: string, message: string}[]}}
 */
export function checkCsp(rootDir = REPO_ROOT) {
  /** @type {{file: string, message: string}[]} */
  const errors = [];
  const fail = (file, message) => errors.push({ file, message });

  // --- 1. The dashboard -----------------------------------------------------------------------
  const dashboardPath = path.join(rootDir, DASHBOARD_HTML);
  let dashboardCsp = null;
  if (!existsSync(dashboardPath)) {
    fail(DASHBOARD_HTML, 'file not found');
  } else {
    dashboardCsp = extractEnforcedCsp(readFileSync(dashboardPath, 'utf8'));
    if (!dashboardCsp) {
      fail(DASHBOARD_HTML, 'no Content-Security-Policy meta tag (an enforced one is required)');
    } else {
      for (const directive of REQUIRED_DIRECTIVES) {
        if (!dashboardCsp.includes(directive)) {
          fail(DASHBOARD_HTML, `missing required directive: ${directive}`);
        }
      }
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(dashboardCsp)) fail(DASHBOARD_HTML, `forbidden token: ${label}`);
      }
    }
  }

  // --- 2. The document of record --------------------------------------------------------------
  const docPath = path.join(rootDir, CSP_DOC);
  if (!existsSync(docPath)) {
    fail(CSP_DOC, 'file not found (the policy of record must be written down)');
  } else if (dashboardCsp) {
    // Compare against whole fenced blocks, not a substring of the file. A substring match would
    // accept a document describing a *superset* policy ("...; worker-src 'self'"), which is exactly
    // the drift this gate exists to catch.
    const documented = documentedPolicies(readFileSync(docPath, 'utf8'));
    if (!documented.includes(normalize(dashboardCsp))) {
      fail(
        CSP_DOC,
        'csp.md does not quote the dashboard policy exactly; update it so the record cannot drift',
      );
    }
  }

  // --- 3. Built legal pages (only once a build exists) -----------------------------------------
  const distDir = path.join(rootDir, LEGAL_DIST);
  if (existsSync(distDir)) {
    const documented = existsSync(docPath) ? documentedPolicies(readFileSync(docPath, 'utf8')) : [];
    for (const name of readdirSync(distDir)
      .filter((f) => f.endsWith('.html'))
      .sort()) {
      const rel = `${LEGAL_DIST}/${name}`;
      const html = readFileSync(path.join(distDir, name), 'utf8');
      const csp = extractEnforcedCsp(html);
      if (!csp) {
        fail(rel, 'no Content-Security-Policy meta tag (an enforced one is required)');
        continue;
      }
      for (const directive of REQUIRED_DIRECTIVES) {
        if (!csp.includes(directive)) fail(rel, `missing required directive: ${directive}`);
      }
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(csp)) fail(rel, `forbidden token: ${label}`);
      }
      // These pages are build-time markdown with no scripts, so they never need inline styles.
      if (csp.includes("'unsafe-inline'")) {
        fail(rel, "'unsafe-inline' is never needed here: allow the stylesheet by hash instead");
      }
      const style = extractInlineStyle(html);
      const declared = /'sha256-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
      if (style !== null && declared) {
        const actual = sha256Base64(style);
        if (actual !== declared) {
          fail(
            rel,
            `style-src hash does not match the emitted <style> (expected sha256-${actual})`,
          );
        }
      } else if (style !== null && !declared) {
        fail(rel, 'page has an inline <style> but the policy declares no sha256 hash for it');
      }
      // The hash is computed at build time, so csp.md documents it as a placeholder; `normalize`
      // collapses both sides to that placeholder before comparing.
      if (documented.length > 0 && !documented.includes(normalize(csp))) {
        fail(rel, 'csp.md does not quote this legal-page policy exactly');
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const rootDir = args.find((a) => !a.startsWith('--')) ?? REPO_ROOT;
  const result = checkCsp(rootDir);

  if (json) {
    console.log(JSON.stringify(result));
  } else if (result.ok) {
    console.log('check-csp: policies are strict and csp.md is in sync');
  } else {
    for (const { file, message } of result.errors) console.error(`${file}: ${message}`);
    console.error(`\ncheck-csp: ${result.errors.length} problem(s)`);
  }
  process.exit(result.ok ? 0 : 1);
}
