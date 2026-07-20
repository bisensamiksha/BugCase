import type { BugReportV1 } from './report';
import { BugReportV1Schema } from './schemas';

/** The global the self-contained report.html assigns its data to (`window.__BUG_REPORT__`). */
export const WINDOW_REPORT_KEY = '__BUG_REPORT__';

/** The data baked into report.html and read back by the dashboard. Assets are base64 by ZIP path. */
export interface InlineReportPayload {
  readonly report: BugReportV1;
  readonly assets: Record<string, string>;
}

/** Base64-encode bytes in chunks so a large buffer never overflows the `fromCharCode` arg list. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Decode base64 (as produced by {@link bytesToBase64}) back to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// U+2028 / U+2029: valid in JSON strings but hazardous in a classic <script>; escape them too.
const LINE_SEPARATORS = new RegExp(
  `[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  'g',
);

/**
 * Escape a JSON string so it is safe to embed in a classic `<script>` element: `<`, `>`, `&` and the
 * U+2028/U+2029 line separators become `\uXXXX`. These only occur inside string values (JSON structure
 * has none), and the browser's JS parser resolves them back, so the reader sees the original object.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Validate an injected value into an {@link InlineReportPayload}; `null` on any mismatch (never throws). */
export function parseInlineReportPayload(value: unknown): InlineReportPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as { report?: unknown; assets?: unknown };
  const parsed = BugReportV1Schema.safeParse(candidate.report);
  if (!parsed.success) {
    return null;
  }
  if (typeof candidate.assets !== 'object' || candidate.assets === null) {
    return null;
  }
  const assets: Record<string, string> = {};
  for (const [key, val] of Object.entries(candidate.assets)) {
    if (typeof val !== 'string') {
      return null;
    }
    assets[key] = val;
  }
  return { report: parsed.data as BugReportV1, assets };
}
