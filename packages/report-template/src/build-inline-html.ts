/**
 * Pure, node-free inliner + injection contract for the self-contained report.html (S4-14).
 * Kept free of any Node/DOM import so the extension build (S4-15) can call `injectReportData` too.
 */

/**
 * The single report-data injection point. Present exactly once in the emitted empty-data
 * report.html; S4-15's zip-writer swaps it for a JSON payload via {@link injectReportData}.
 */
export const REPORT_DATA_PLACEHOLDER = '/* @BUGCASE_REPORT_DATA@ */ null';

const STYLE_MARKER = '<!-- @BUGCASE_STYLE@ -->';
const SCRIPT_MARKER = '<!-- @BUGCASE_SCRIPT@ -->';

export interface InlineHtmlInput {
  readonly templateHtml: string;
  readonly js: string;
  readonly css: string;
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  if (needle === '') {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Escape any `</script` so an inlined bundle can't break out of its host `<script>` element. */
function escapeScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

/**
 * Inline `css` and `js` into `templateHtml`, returning one self-contained HTML string. Throws on
 * malformed input — a missing/duplicated marker, a missing/duplicated data sentinel, or empty
 * css/js — so a half-inlined file never escapes the build.
 */
export function buildInlineHtml({ templateHtml, js, css }: InlineHtmlInput): string {
  if (js.trim() === '') {
    throw new Error('buildInlineHtml: empty js bundle');
  }
  if (css.trim() === '') {
    throw new Error('buildInlineHtml: empty css bundle');
  }
  for (const marker of [STYLE_MARKER, SCRIPT_MARKER]) {
    const n = occurrences(templateHtml, marker);
    if (n !== 1) {
      throw new Error(`buildInlineHtml: expected exactly one ${marker}, found ${n}`);
    }
  }
  if (occurrences(templateHtml, REPORT_DATA_PLACEHOLDER) !== 1) {
    throw new Error('buildInlineHtml: expected exactly one report-data placeholder');
  }
  // Use function replacements: a *string* replacement interprets `$&`, `$'`, `$1`… patterns, and a
  // minified JS bundle is full of them (e.g. React's `.replace(re, '$&/')`), which would otherwise
  // splice the marker text back into the code. A function return value is inserted verbatim.
  return templateHtml
    .replace(STYLE_MARKER, () => `<style>${css}</style>`)
    .replace(SCRIPT_MARKER, () => `<script type="module">${escapeScript(js)}</script>`);
}

/**
 * Replace the one report-data placeholder with a JSON payload string, turning
 * `window.__BUG_REPORT__ = <placeholder>;` into `window.__BUG_REPORT__ = <json>;`. Used by S4-15's
 * zip-writer. Throws unless the placeholder is present exactly once.
 */
export function injectReportData(templateHtml: string, json: string): string {
  if (occurrences(templateHtml, REPORT_DATA_PLACEHOLDER) !== 1) {
    throw new Error('injectReportData: expected exactly one report-data placeholder');
  }
  // Function replacement so `$`-sequences in the JSON payload are inserted verbatim (see buildInlineHtml).
  return templateHtml.replace(REPORT_DATA_PLACEHOLDER, () => json);
}

/**
 * Throw if `html` loads any external/un-inlined resource. Inline `<script>`/`<style>` *bodies* are
 * dropped first (opening tags kept) so their string contents can't cause a false positive; the real
 * bundle is inlined, so any surviving `<script src>`, `<link>`, or http(s)/protocol-relative
 * `src`/`href` is a self-containment bug.
 */
export function assertNoExternalRefs(html: string): void {
  const tagsOnly = html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
  const external = tagsOnly.match(/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
  if (external) {
    throw new Error(`assertNoExternalRefs: external reference found (${external[0]})`);
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(tagsOnly)) {
    throw new Error('assertNoExternalRefs: un-inlined <script src> present');
  }
  if (/<link\b/i.test(tagsOnly)) {
    throw new Error('assertNoExternalRefs: <link> present (styles/preloads must be inlined)');
  }
}
