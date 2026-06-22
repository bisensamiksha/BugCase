/**
 * DOM snapshot collector (S2-13).
 *
 * Takes the page's `documentElement.outerHTML` (read in the page by
 * `../content/dom-snapshot-runner`), runs it through the DOM scrubbers (S2-08 `scrubDom`) to mask
 * password inputs (and optionally all inputs / strip scripts), and produces a schema `DomSnapshot`
 * plus the scrubbed HTML to write into the ZIP. Never throws — failures resolve to `null` so a
 * capture can proceed without a DOM snapshot.
 */

import {
  BUG_REPORT_ZIP_LAYOUT,
  scrubDom,
  type DomScrubberOptions,
  type DomSnapshot,
} from '@bugcase/schema';

export interface DomSnapshotResult {
  /** Manifest entry for the report (`report.dom`). */
  readonly snapshot: DomSnapshot;
  /** Scrubbed HTML to store at `snapshot.contentPath`. */
  readonly html: string;
}

export interface CollectDomSnapshotDeps {
  /** Reads the page's outerHTML (e.g. via executeScript). */
  readonly readOuterHtml: () => Promise<string>;
  /** Optional DOM scrubber tuning; password masking is always applied. */
  readonly scrubberOptions?: DomScrubberOptions;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Collect and scrub the page DOM. Resolves `null` for empty input or any failure (e.g. the in-page
 * read rejecting), so the caller treats a missing DOM snapshot as a non-fatal, skipped artifact.
 */
export async function collectDomSnapshot(
  deps: CollectDomSnapshotDeps,
): Promise<DomSnapshotResult | null> {
  try {
    const raw = await deps.readOuterHtml();
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    const scrubbed = scrubDom(raw, deps.scrubberOptions);
    return {
      html: scrubbed.value,
      snapshot: {
        schemaVersion: 'v1',
        contentPath: BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot,
        byteSize: byteLength(scrubbed.value),
        scrubbed: true,
        scrubberHits: scrubbed.hits,
      },
    };
  } catch {
    return null;
  }
}
