import type { BugReportV1 } from '@bugcase/schema';
import { base64ToBytes } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { REPORT_DATA_PLACEHOLDER } from './build-inline-html';
import { embedReportData } from './embed-data';

const TEMPLATE = `<script>window.__BUG_REPORT__ = ${REPORT_DATA_PLACEHOLDER};</script>`;
const report = { schemaVersion: 'v1', metadata: { id: 'r1' } } as unknown as BugReportV1;

describe('embedReportData', () => {
  it('embeds report + base64 assets that round-trip back to bytes', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const assets = new Map<string, Blob | string | Uint8Array>([
      ['screenshots/viewport.png', new Blob([pngBytes])],
      ['raw/dom-snapshot.html', '<html>snap</html>'],
    ]);
    const html = await embedReportData({ templateHtml: TEMPLATE, report, assets });

    const match = html.match(/window\.__BUG_REPORT__ = (.*);<\/script>/s);
    expect(match).not.toBeNull();
    // escapeJsonForScript output is still valid JSON (\uXXXX are valid JSON escapes), so parse it directly.
    const value = JSON.parse(match![1]!) as { report: BugReportV1; assets: Record<string, string> };
    expect(value.report).toEqual(report);
    expect(base64ToBytes(value.assets['screenshots/viewport.png']!)).toEqual(pngBytes);
    expect(new TextDecoder().decode(base64ToBytes(value.assets['raw/dom-snapshot.html']!))).toBe(
      '<html>snap</html>',
    );
    expect(html).not.toContain(REPORT_DATA_PLACEHOLDER);
  });

  it('throws when the template lacks the placeholder', async () => {
    await expect(
      embedReportData({ templateHtml: '<html></html>', report, assets: new Map() }),
    ).rejects.toThrow();
  });
});
