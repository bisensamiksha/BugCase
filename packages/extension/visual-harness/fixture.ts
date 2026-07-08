import type { BugReportV1 } from '@bugcase/schema';

/**
 * Deterministic fixtures for the visual-regression harness (S3-17). Everything is fixed — no clock, no
 * randomness, no network — so `toHaveScreenshot` baselines are stable run-to-run on a given platform.
 */

/** A fixed 4×4 solid teal PNG, injected as the screenshot so the Konva canvas renders deterministically. */
export const FIXED_SCREENSHOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR4nGNk' +
  'YPhfz0AEYBxVSF+FAP7/DQ2s4pKmAAAAAElFTkSuQmCC';

/** A minimal valid v1 report with a viewport screenshot present (so it can be viewed + annotated). */
export function buildFixtureReport(): BugReportV1 {
  return {
    schemaVersion: 'v1',
    metadata: {
      id: '00000000-0000-4000-8000-000000000000',
      tool: {
        name: 'bugcase',
        version: '0.0.1',
        schemaVersion: 'v1',
        browserBuildTarget: 'chrome',
      },
      page: {
        url: 'https://example.com/dashboard',
        title: 'Example Dashboard',
        origin: 'https://example.com',
        capturedAt: '2026-07-08T10:00:00.000Z',
        referrer: null,
      },
      viewport: {
        innerWidth: 1280,
        innerHeight: 800,
        outerWidth: 1280,
        outerHeight: 900,
        devicePixelRatio: 1,
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
        screenInfo: false,
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
      title: 'Button misaligned on dashboard',
      stepsToReproduce: 'Open the dashboard and look at the header.',
      severity: 'minor',
      notes: '',
    },
    screenshots: {
      schemaVersion: 'v1',
      viewport: {
        path: 'screenshots/viewport.png',
        width: 4,
        height: 4,
        devicePixelRatio: 1,
        captureMethod: 'visibleTab',
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
}
