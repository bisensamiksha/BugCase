import { BUG_REPORT_ZIP_LAYOUT, writeBugReportZip, type BugReportV1 } from '@bugcase/schema';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { readReportZip } from './read-report-zip';

const validReport: BugReportV1 = {
  schemaVersion: 'v1',
  metadata: {
    id: '00000000-0000-4000-8000-000000000000',
    tool: { name: 'bugcase', version: '0.0.1', schemaVersion: 'v1', browserBuildTarget: 'chrome' },
    page: {
      url: 'https://example.com/',
      title: 'Example',
      origin: 'https://example.com',
      capturedAt: '2026-05-30T12:00:00.000Z',
      referrer: null,
    },
    viewport: {
      innerWidth: 1280,
      innerHeight: 800,
      outerWidth: 1280,
      outerHeight: 900,
      devicePixelRatio: 2,
      zoomEstimate: 1,
      screenWidth: 1920,
      screenHeight: 1080,
      orientation: 'landscape-primary',
    },
    permissionsAtCapture: [],
    scrubbersApplied: [],
    userOptions: {
      fullPageScreenshot: false,
      viewportScreenshot: true,
      domSnapshot: false,
      navigationHistory: false,
      consoleLogs: false,
      networkLog: false,
      browserInfo: false,
      screenInfo: true,
      installedExtensions: false,
      cookies: false,
      localStorage: false,
      sessionStorage: false,
      reproductionSteps: false,
      elementInspections: false,
    },
  },
  userInput: { schemaVersion: 'v1', title: '', stepsToReproduce: '', severity: 'minor', notes: '' },
  screenshots: { schemaVersion: 'v1', elementCrops: [] },
  browser: null,
  console: null,
  network: null,
  dom: null,
  storage: null,
  cookies: null,
  navigation: null,
  reproduction: null,
  elementInspections: null,
};

async function zipWith(path: string, content: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file(path, content);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([buffer], { type: 'application/zip' });
}

describe('readReportZip', () => {
  it('parses and validates a real BugReport ZIP', async () => {
    const blob = await writeBugReportZip(validReport);
    const result = await readReportZip(blob);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.metadata.id).toBe(validReport.metadata.id);
      expect(result.report.metadata.page.origin).toBe('https://example.com');
    }
  });

  it('fails when report.json is missing', async () => {
    const blob = await zipWith('other.txt', 'hello');
    const result = await readReportZip(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/report\.json/);
    }
  });

  it('fails when report.json is not valid JSON', async () => {
    const blob = await zipWith(BUG_REPORT_ZIP_LAYOUT.report, 'not json {');
    const result = await readReportZip(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JSON/i);
    }
  });

  it('fails schema validation when report.json is structurally wrong', async () => {
    const blob = await zipWith(
      BUG_REPORT_ZIP_LAYOUT.report,
      JSON.stringify({ schemaVersion: 'v1' }),
    );
    const result = await readReportZip(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/schema/i);
    }
  });

  it('fails gracefully when the input is not a ZIP at all', async () => {
    const result = await readReportZip(new Uint8Array([1, 2, 3, 4]));
    expect(result.ok).toBe(false);
  });
});
