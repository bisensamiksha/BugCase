import { readFileSync } from 'node:fs';

import { BugReportV1Schema, base64ToBytes, parseInlineReportPayload } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { assertNoExternalRefs, REPORT_DATA_PLACEHOLDER } from '../build-inline-html';
import { embedReportData } from '../embed-data';

import { sampleAssets, sampleReport } from './sample-report';

/** The source template (marker + placeholder present) — enough to exercise embed without a build. */
const template = readFileSync(new URL('../template.html', import.meta.url), 'utf8');

/** Recover the JSON the dashboard would read by slicing out exactly what replaced the placeholder. */
function extractInjectedPayload(html: string): unknown {
  const idx = template.indexOf(REPORT_DATA_PLACEHOLDER);
  const before = template.slice(0, idx);
  const after = template.slice(idx + REPORT_DATA_PLACEHOLDER.length);
  // escapeJsonForScript output is still valid JSON (\uXXXX are valid JSON escapes), so parse directly.
  return JSON.parse(html.slice(before.length, html.length - after.length));
}

describe('sample-report fixture', () => {
  it('is a schema-valid BugReportV1 (so report.html can never embed an invalid report)', () => {
    const result = BugReportV1Schema.safeParse(sampleReport);
    expect(result.success).toBe(true);
  });

  it('populates every optional section so all nine panes have content', () => {
    // Each pane keys off one of these; a null here would silently render an empty pane in the e2e test.
    expect(sampleReport.screenshots.viewport).toBeDefined();
    expect(sampleReport.screenshots.fullPage).toBeDefined();
    expect(sampleReport.screenshots.elementCrops.length).toBeGreaterThan(0);
    expect(sampleReport.browser).not.toBeNull();
    expect(sampleReport.console?.entries.length).toBeGreaterThan(0);
    expect(sampleReport.network?.entries.length).toBeGreaterThan(0);
    expect(sampleReport.dom).not.toBeNull();
    expect(sampleReport.storage).not.toBeNull();
    expect(sampleReport.cookies?.entries.length).toBeGreaterThan(0);
    expect(sampleReport.navigation?.entries.length).toBeGreaterThan(0);
    expect(sampleReport.reproduction?.steps.length).toBeGreaterThan(0);
    expect(sampleReport.elementInspections?.inspections.length).toBeGreaterThan(0);
    expect(sampleReport.metadata.scrubbersApplied.length).toBeGreaterThan(0);
  });

  it('round-trips through embedReportData / parseInlineReportPayload back to the report + assets', async () => {
    const html = await embedReportData({
      templateHtml: template,
      report: sampleReport,
      assets: sampleAssets,
    });

    const payload = parseInlineReportPayload(extractInjectedPayload(html));
    expect(payload).not.toBeNull();
    expect(payload!.report).toEqual(sampleReport);

    // Every asset the report references decodes back to the original bytes.
    for (const [path, bytes] of sampleAssets) {
      expect(payload!.assets[path]).toBeDefined();
      expect(base64ToBytes(payload!.assets[path]!)).toEqual(bytes);
    }

    expect(html).not.toContain(REPORT_DATA_PLACEHOLDER);
  });

  it('embedding the fixture keeps the document self-contained (no external references)', async () => {
    const html = await embedReportData({
      templateHtml: template,
      report: sampleReport,
      assets: sampleAssets,
    });
    expect(() => assertNoExternalRefs(html)).not.toThrow();
  });
});
