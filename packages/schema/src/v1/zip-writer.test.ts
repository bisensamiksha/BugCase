import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { validMinimal } from './__tests__/fixtures/valid-minimal';
import { BugReportV1Schema } from './schemas/report.schema';
import { BUG_REPORT_ZIP_LAYOUT } from './zip-layout';
import { writeBugReportZip } from './zip-writer';

async function loadZip(blob: Blob): Promise<JSZip> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return JSZip.loadAsync(bytes);
}

describe('writeBugReportZip', () => {
  it('returns a non-empty application/zip Blob', async () => {
    const blob = await writeBugReportZip(validMinimal, { files: new Map() });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('writes report.json that re-validates against BugReportV1Schema', async () => {
    const blob = await writeBugReportZip(validMinimal, { files: new Map() });
    const zip = await loadZip(blob);

    const json = await zip.file(BUG_REPORT_ZIP_LAYOUT.report)?.async('string');
    expect(json).toBeDefined();
    const parsed = BugReportV1Schema.parse(JSON.parse(json as string));
    expect(parsed).toEqual(validMinimal);
  });

  it('writes metadata.json mirroring report.metadata', async () => {
    const blob = await writeBugReportZip(validMinimal, { files: new Map() });
    const zip = await loadZip(blob);

    const json = await zip.file(BUG_REPORT_ZIP_LAYOUT.metadata)?.async('string');
    expect(JSON.parse(json as string)).toEqual(validMinimal.metadata);
  });

  it('writes entries in deterministic sorted path order', async () => {
    const files = new Map<string, string | Uint8Array>([
      [BUG_REPORT_ZIP_LAYOUT.raw.console, '[]'],
      [BUG_REPORT_ZIP_LAYOUT.screenshots.viewport, new Uint8Array([137, 80, 78, 71])],
    ]);
    const blob = await writeBugReportZip(validMinimal, { files });
    const zip = await loadZip(blob);

    const names = Object.keys(zip.files);
    expect(names).toEqual([...names].sort());
  });

  it('includes caller-supplied assets at their declared paths', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const files = new Map<string, string | Uint8Array>([
      [BUG_REPORT_ZIP_LAYOUT.screenshots.viewport, png],
      [BUG_REPORT_ZIP_LAYOUT.raw.console, '[{"level":"log"}]'],
    ]);
    const blob = await writeBugReportZip(validMinimal, { files });
    const zip = await loadZip(blob);

    const storedPng = await zip
      .file(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)
      ?.async('uint8array');
    const storedConsole = await zip.file(BUG_REPORT_ZIP_LAYOUT.raw.console)?.async('string');
    expect(Array.from(storedPng as Uint8Array)).toEqual(Array.from(png));
    expect(storedConsole).toBe('[{"level":"log"}]');
  });

  it('normalizes a Blob asset to bytes', async () => {
    const files = new Map<string, Blob>([
      [BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot, new Blob(['<html></html>'])],
    ]);
    const blob = await writeBugReportZip(validMinimal, { files });
    const zip = await loadZip(blob);

    const html = await zip.file(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot)?.async('string');
    expect(html).toBe('<html></html>');
  });

  it('is reproducible: identical input yields byte-identical output', async () => {
    const a = await writeBugReportZip(validMinimal, { files: new Map() });
    const b = await writeBugReportZip(validMinimal, { files: new Map() });
    const ba = new Uint8Array(await a.arrayBuffer());
    const bb = new Uint8Array(await b.arrayBuffer());
    expect(Array.from(ba)).toEqual(Array.from(bb));
  });

  it('handles empty/omitted assets without throwing', async () => {
    const blob = await writeBugReportZip(validMinimal);
    const zip = await loadZip(blob);
    expect(zip.file(BUG_REPORT_ZIP_LAYOUT.report)).not.toBeNull();
    expect(zip.file(BUG_REPORT_ZIP_LAYOUT.metadata)).not.toBeNull();
  });

  it('keeps canonical report.json authoritative even if assets collide on its path', async () => {
    const files = new Map<string, string>([[BUG_REPORT_ZIP_LAYOUT.report, 'not a report']]);
    const blob = await writeBugReportZip(validMinimal, { files });
    const zip = await loadZip(blob);

    const json = await zip.file(BUG_REPORT_ZIP_LAYOUT.report)?.async('string');
    expect(() => BugReportV1Schema.parse(JSON.parse(json as string))).not.toThrow();
  });

  it('writes report.html when the reportHtml option is provided and omits it otherwise', async () => {
    const withHtml = await loadZip(
      await writeBugReportZip(
        validMinimal,
        { files: new Map() },
        { reportHtml: '<html>hi</html>' },
      ),
    );
    expect(await withHtml.file(BUG_REPORT_ZIP_LAYOUT.reportHtml)?.async('string')).toBe(
      '<html>hi</html>',
    );

    const without = await loadZip(await writeBugReportZip(validMinimal));
    expect(without.file(BUG_REPORT_ZIP_LAYOUT.reportHtml)).toBeNull();
  });
});
