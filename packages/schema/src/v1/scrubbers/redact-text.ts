/**
 * Manual post-capture text redaction (BUG-04).
 *
 * The always-on scrubbers cannot know every secret: a value can reach the report through a field
 * no heuristic flags, or through console/network text. This lets the user remove an exact string
 * from an already-captured report before the ZIP is written — the text counterpart to the
 * destructive image redaction in the annotation canvas.
 *
 * Deliberately a **deep walk** rather than a fixed field list: a secret that leaked once has usually
 * leaked into more than one place, and enumerating fields would miss whichever one nobody thought of.
 *
 * Matching is exact and case-sensitive, and the needle is treated literally (never compiled as a
 * regular expression), so a pasted secret containing `.` or `*` cannot match more than itself or
 * trigger catastrophic backtracking. The secret is never stored, logged, or written into metadata.
 */

import type { ScrubberRuleApplied } from '../common';
import type { BugReportV1 } from '../report';

/** Replacement written over every redacted occurrence. */
export const REDACTED_PLACEHOLDER = '[redacted]';

/** Stable id recorded in `metadata.scrubbersApplied` when the user redacts text by hand. */
export const MANUAL_TEXT_REDACTION_RULE_ID = 'manual-text-redaction';

const MANUAL_TEXT_REDACTION_DESCRIPTION =
  'User-supplied text redacted from the report before download';

export interface RedactResult<T> {
  readonly value: T;
  readonly hits: number;
}

/** A usable needle: non-empty once trimmed. Prevents an accidental blank from rewriting everything. */
function isUsableSecret(secret: string): boolean {
  return typeof secret === 'string' && secret.trim().length > 0;
}

/** Count non-overlapping literal occurrences of `secret` in `text`. */
function countOccurrences(text: string, secret: string): number {
  let count = 0;
  let index = text.indexOf(secret);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(secret, index + secret.length);
  }
  return count;
}

/** Replace every literal occurrence, reporting how many were replaced. */
function redactString(text: string, secret: string): RedactResult<string> {
  const hits = countOccurrences(text, secret);
  if (hits === 0) {
    return { value: text, hits: 0 };
  }
  return { value: text.split(secret).join(REDACTED_PLACEHOLDER), hits };
}

/**
 * Structurally clone `value`, replacing every literal occurrence of `secret` in every string leaf.
 * Non-string leaves pass through untouched; the input is never mutated.
 */
export function redactTextDeep<T>(value: T, secret: string): RedactResult<T> {
  if (!isUsableSecret(secret)) {
    return { value, hits: 0 };
  }
  let hits = 0;

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const result = redactString(node, secret);
      hits += result.hits;
      return result.value;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        out[key] = walk(child);
      }
      return out;
    }
    return node;
  };

  return { value: walk(value) as T, hits };
}

/** Merge this run's hits into a single `manual-text-redaction` entry, so repeats accumulate. */
function withRedactionRecorded(
  applied: readonly ScrubberRuleApplied[],
  hits: number,
): readonly ScrubberRuleApplied[] {
  const existing = applied.find((entry) => entry.id === MANUAL_TEXT_REDACTION_RULE_ID);
  if (!existing) {
    return [
      ...applied,
      {
        id: MANUAL_TEXT_REDACTION_RULE_ID,
        description: MANUAL_TEXT_REDACTION_DESCRIPTION,
        hits,
      },
    ];
  }
  return applied.map((entry) =>
    entry.id === MANUAL_TEXT_REDACTION_RULE_ID ? { ...entry, hits: entry.hits + hits } : entry,
  );
}

export interface RedactReportResult {
  readonly report: BugReportV1;
  readonly hits: number;
}

export interface RedactReportOptions {
  /**
   * Occurrences already removed outside `report.json` — the text assets (the DOM snapshot html).
   * Folded into the recorded total so `metadata.scrubbersApplied` reflects everything that was
   * redacted, not just the part that lived in the JSON. The privacy pane is an honesty surface;
   * under-reporting there would be its own bug.
   */
  readonly additionalHits?: number;
}

/**
 * Remove `secret` from every string in the report and record the redaction in
 * `metadata.scrubbersApplied`. Nothing is recorded when nothing was removed anywhere, so the privacy
 * pane only ever reports redactions that actually happened.
 *
 * `hits` counts occurrences inside the report itself; the recorded total also includes
 * `additionalHits`.
 */
export function redactTextInReport(
  report: BugReportV1,
  secret: string,
  options: RedactReportOptions = {},
): RedactReportResult {
  const redacted = redactTextDeep(report, secret);
  const additional = Math.max(0, options.additionalHits ?? 0);
  const recorded = redacted.hits + additional;
  if (recorded === 0) {
    return { report, hits: 0 };
  }
  const next: BugReportV1 = {
    ...redacted.value,
    metadata: {
      ...redacted.value.metadata,
      scrubbersApplied: withRedactionRecorded(redacted.value.metadata.scrubbersApplied, recorded),
    },
  };
  return { report: next, hits: redacted.hits };
}

/** ZIP asset payloads, matching `BugReportZipAssets['files']`. */
export type AssetFiles = ReadonlyMap<string, Blob | string | Uint8Array>;

export interface RedactAssetsResult {
  readonly files: AssetFiles;
  readonly hits: number;
}

/**
 * Redact `secret` from every **text** asset (the DOM snapshot html and friends). Binary payloads —
 * screenshots and element crops — are passed through untouched: those are raw pixels and are
 * redacted by hand in Annotate (BUG-01), never automatically.
 */
export function redactTextInAssets(files: AssetFiles, secret: string): RedactAssetsResult {
  if (!isUsableSecret(secret)) {
    return { files, hits: 0 };
  }
  let hits = 0;
  const next = new Map<string, Blob | string | Uint8Array>();
  for (const [path, data] of files) {
    if (typeof data === 'string') {
      const result = redactString(data, secret);
      hits += result.hits;
      next.set(path, result.value);
    } else {
      next.set(path, data);
    }
  }
  return { files: hits === 0 ? files : next, hits };
}
