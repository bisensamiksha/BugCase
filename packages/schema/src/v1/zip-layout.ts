/**
 * Canonical filenames and folder paths inside a BugReport ZIP.
 *
 * This is the single source of truth shared by the ZIP writer (S1-08) and any
 * reader (the dashboard and the self-contained `report.html`). Both sides must
 * agree on exactly one spelling for every entry, so these constants live here
 * in `@bugcase/schema` rather than being duplicated per package.
 *
 * Invariants for every path value (guarded by `zip-layout.test.ts`):
 * - relative POSIX path using forward slashes only
 * - no leading slash, no trailing slash, no duplicate (`//`) separators
 */

/** Recursively freezes an object so the shared constants cannot be mutated at runtime. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export const BUG_REPORT_ZIP_LAYOUT = deepFreeze({
  manifest: 'manifest.json',
  report: 'report.json',
  metadata: 'metadata.json',
  reportHtml: 'report.html',
  screenshots: {
    dir: 'screenshots',
    viewport: 'screenshots/viewport.png',
    fullPage: 'screenshots/full-page.png',
  },
  annotations: { dir: 'annotations' },
  raw: {
    dir: 'raw',
    domSnapshot: 'raw/dom-snapshot.html',
    console: 'raw/console.json',
    network: 'raw/network.json',
  },
} as const);

/** The shape of {@link BUG_REPORT_ZIP_LAYOUT}, with every path as a string literal. */
export type BugReportZipLayout = typeof BUG_REPORT_ZIP_LAYOUT;

/**
 * Flattens a layout tree into a de-duplicated list of every path string.
 *
 * Used by the writer/reader to enumerate canonical entries and by the tests to
 * assert path hygiene across the whole tree. An empty or nested-empty layout
 * yields an empty array — it never throws.
 */
export function listZipPaths(
  layout: Readonly<Record<string, unknown>> = BUG_REPORT_ZIP_LAYOUT,
): readonly string[] {
  const paths: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      paths.push(node);
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const child of Object.values(node as Record<string, unknown>)) {
        walk(child);
      }
    }
  };
  walk(layout);
  return Array.from(new Set(paths));
}
