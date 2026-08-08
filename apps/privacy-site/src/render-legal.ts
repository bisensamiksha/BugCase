import { createHash } from 'node:crypto';

import { marked } from 'marked';

export interface RenderLegalPageInput {
  /** Text for the browser tab / <title>. */
  readonly title: string;
  /** Markdown body to render into the page. */
  readonly markdown: string;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; max-width: 46rem; padding: 2.5rem 1.25rem 4rem;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    line-height: 1.65; color: #0f172a; background: #ffffff;
  }
  @media (prefers-color-scheme: dark) { body { color: #e2e8f0; background: #0f172a; } }
  h1 { margin-bottom: 0.25rem; }
  h2 { margin-top: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
  a { color: #2563eb; }
  code { background: #f1f5f9; padding: 0.05rem 0.3rem; border-radius: 0.25rem; }
  nav.legal-nav { margin: 0 0 2rem; font-size: 0.9rem; }
`.trim();

/**
 * Enforced Content-Security-Policy for every legal page (S4-31).
 *
 * These pages are build-time Markdown with one inline `<style>` and no scripts at all, so they
 * take the strictest policy in the repo: everything falls through to `default-src 'none'`, and the
 * one stylesheet is allowed **by hash** rather than by `'unsafe-inline'`. The hash is computed from
 * the same `STYLE` constant that is interpolated into the page below, so the two cannot drift.
 *
 * The dashboard's policy is necessarily looser and lives in `packages/dashboard/index.html`; the
 * reasons for every difference are recorded in `csp.md` next to this file.
 *
 * `script-src` and `object-src` are stated explicitly even though `default-src 'none'` already
 * covers them, because the ticket's acceptance criteria name them individually.
 *
 * Deliberately absent: `report-uri` / `report-to` would be remote logging, which this product
 * promises it does not do. `frame-ancestors` and `sandbox` are silently ignored in a meta-delivered
 * policy, and GitHub Pages cannot set response headers, so they are not claimed here (see csp.md).
 */
export const LEGAL_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${createHash('sha256').update(STYLE, 'utf8').digest('base64')}'`,
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a legal document to a complete, self-contained HTML page: `marked` for the body, one shared
 * inline-styled shell for the chrome. First-party build-time content only — no runtime sanitizer.
 */
export function renderLegalPage({ title, markdown }: RenderLegalPageInput): string {
  const body = marked.parse(markdown, { async: false });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${LEGAL_CSP}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <main>
${body}
    </main>
  </body>
</html>
`;
}
