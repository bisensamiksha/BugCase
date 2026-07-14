import { writeBugReportZip, type BugReportV1 } from '@bugcase/schema';
import JSZip from 'jszip';

/**
 * Deterministic large-report fixture for the S4-05 perf budget. Generated at test time and never
 * committed. A tiny, schema-valid `report.json` plus one big STORE (uncompressed) binary entry
 * padded to the target size — fast to build, and crucially never decompressed when the dashboard
 * opens (the `ReportSource` seam only reads `report.json` on open).
 */

const validReport: BugReportV1 = {
  schemaVersion: 'v1',
  metadata: {
    id: '00000000-0000-4000-8000-00000000abcd',
    tool: { name: 'bugcase', version: '0.0.1', schemaVersion: 'v1', browserBuildTarget: 'chrome' },
    page: {
      url: 'https://example.com/',
      title: 'Perf Fixture',
      origin: 'https://example.com',
      capturedAt: '2026-07-14T12:00:00.000Z',
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
      fullPageScreenshot: true,
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
  userInput: {
    schemaVersion: 'v1',
    title: 'Perf',
    stepsToReproduce: '',
    severity: 'minor',
    notes: '',
  },
  screenshots: {
    schemaVersion: 'v1',
    fullPage: {
      path: 'screenshots/full-page.png',
      width: 1280,
      height: 20000,
      devicePixelRatio: 2,
      captureMethod: 'scrollStitch',
      hasAnnotations: false,
    },
    elementCrops: [],
  },
  browser: null,
  console: null,
  network: null,
  dom: null,
  storage: null,
  cookies: null,
  navigation: null,
  reproduction: null,
  elementInspections: null,
  annotations: null,
};

/** The report used inside the fixture (exported so a test can assert against it). */
export const perfReport = validReport;

/** Build a ~`targetBytes` report ZIP as a Blob. Default 50 MB. */
export async function generateLargeReportZip(targetBytes = 50 * 1024 * 1024): Promise<Blob> {
  const zip = new JSZip();
  zip.file('report.json', JSON.stringify(validReport));
  // One big uncompressed binary entry standing in for a full-page screenshot.
  zip.file('screenshots/full-page.png', new Uint8Array(targetBytes), { compression: 'STORE' });
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
  return new Blob([buffer], { type: 'application/zip' });
}

/** A small, valid single-report ZIP (no padding) — for control comparisons. */
export async function generateSmallReportZip(): Promise<Blob> {
  return writeBugReportZip(validReport);
}
