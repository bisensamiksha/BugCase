import {
  bytesToBase64,
  escapeJsonForScript,
  type BugReportV1,
  type InlineReportPayload,
} from '@bugcase/schema';

import { injectReportData } from './build-inline-html';

export interface EmbedReportDataInput {
  readonly templateHtml: string;
  readonly report: BugReportV1;
  readonly assets: ReadonlyMap<string, Blob | string | Uint8Array>;
}

async function toBytes(data: Blob | string | Uint8Array): Promise<Uint8Array> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Inline the report JSON + every asset (base64) into the report.html template's
 * `window.__BUG_REPORT__` placeholder, returning the self-contained HTML string. Throws (via
 * {@link injectReportData}) if the template has no placeholder.
 */
export async function embedReportData(input: EmbedReportDataInput): Promise<string> {
  const assets: Record<string, string> = {};
  for (const [path, data] of input.assets) {
    assets[path] = bytesToBase64(await toBytes(data));
  }
  const payload: InlineReportPayload = { report: input.report, assets };
  return injectReportData(input.templateHtml, escapeJsonForScript(JSON.stringify(payload)));
}
