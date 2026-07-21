/**
 * The single shared "kitchen-sink" report fixture for report.html verification (S4-16).
 *
 * A deterministic, schema-valid {@link BugReportV1} with **every** pane's data populated, plus a
 * matching {@link sampleAssets} map, so opening the generated report.html exercises all nine
 * dashboard panes at once. Built from literal values (not a live capture) and validated by
 * `sample-report.test.ts` against `BugReportV1Schema`, so it can never drift out of schema.
 *
 * This is the one shared fixture — the expanded Playwright suite (S4-20) must reuse it rather than
 * inventing a second one (ticket note, 2026-07-12).
 */
import { base64ToBytes, type BugReportV1 } from '@bugcase/schema';

/** Canonical ZIP paths for the fixture's binary assets (mirror `BUG_REPORT_ZIP_LAYOUT` + a crop). */
export const SAMPLE_ASSET_PATHS = {
  viewport: 'screenshots/viewport.png',
  fullPage: 'screenshots/full-page.png',
  /** One crop, shared by the Screenshots gallery and the Element-inspections pane. */
  crop: 'screenshots/crops/inspection-1.png',
  domSnapshot: 'raw/dom-snapshot.html',
} as const;

/**
 * A valid 1×1 transparent PNG (70 bytes). Small and deterministic — enough for the image panes to
 * build an object URL and render an `<img>` without pulling a large binary into the repo.
 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The shared 1×1 PNG bytes used for the viewport, full-page, and element-crop screenshots. */
export const TINY_PNG: Uint8Array = base64ToBytes(TINY_PNG_BASE64);

/** A tiny, self-contained DOM snapshot the DOM pane renders in its sandboxed preview. */
const SAMPLE_DOM_SNAPSHOT_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Example</title></head>' +
  '<body><main><h1>Example</h1><button id="submit">Submit</button></main></body></html>';

const CAPTURED_AT = '2026-05-30T12:00:00.000Z';

/** Kitchen-sink report: every optional section is present so every pane has content to render. */
export const sampleReport: BugReportV1 = {
  schemaVersion: 'v1',
  metadata: {
    id: '11111111-1111-4111-8111-111111111111',
    tool: {
      name: 'bugcase',
      version: '0.1.0',
      schemaVersion: 'v1',
      browserBuildTarget: 'chrome',
    },
    page: {
      url: 'https://example.com/login',
      title: 'Example — Sign in',
      origin: 'https://example.com',
      capturedAt: CAPTURED_AT,
      referrer: 'https://example.com/',
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
    permissionsAtCapture: [
      { name: 'activeTab', grantedAtCapture: true },
      { name: 'debugger', grantedAtCapture: false },
    ],
    scrubbersApplied: [
      { id: 'authorization-header', description: 'Redact Authorization headers', hits: 2 },
      { id: 'password-input', description: 'Mask password input values', hits: 1 },
    ],
    userOptions: {
      fullPageScreenshot: true,
      viewportScreenshot: true,
      domSnapshot: true,
      navigationHistory: true,
      consoleLogs: true,
      networkLog: true,
      browserInfo: true,
      screenInfo: true,
      installedExtensions: true,
      cookies: true,
      localStorage: true,
      sessionStorage: true,
      reproductionSteps: true,
      elementInspections: true,
    },
  },
  userInput: {
    schemaVersion: 'v1',
    title: 'Login button unresponsive on slow network',
    stepsToReproduce: '1. Open the login page\n2. Throttle to slow 3G\n3. Click Submit',
    severity: 'major',
    notes: 'The button spinner never resolves; the request 500s. See console + network.',
  },
  screenshots: {
    schemaVersion: 'v1',
    viewport: {
      path: SAMPLE_ASSET_PATHS.viewport,
      width: 1280,
      height: 800,
      devicePixelRatio: 2,
      captureMethod: 'visibleTab',
      hasAnnotations: false,
    },
    fullPage: {
      path: SAMPLE_ASSET_PATHS.fullPage,
      width: 1280,
      height: 2400,
      devicePixelRatio: 2,
      captureMethod: 'scrollStitch',
      hasAnnotations: false,
    },
    elementCrops: [
      {
        path: SAMPLE_ASSET_PATHS.crop,
        width: 240,
        height: 48,
        devicePixelRatio: 2,
        captureMethod: 'visibleTab',
        hasAnnotations: false,
      },
    ],
  },
  browser: {
    schemaVersion: 'v1',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '120' },
        { brand: 'Not(A:Brand', version: '24' },
      ],
      platform: 'macOS',
      platformVersion: '14.0.0',
      mobile: false,
      architecture: 'arm',
      bitness: '64',
    },
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    installedExtensions: [
      {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'BugCase',
        version: '0.1.0',
        enabled: true,
        type: 'extension',
      },
    ],
  },
  console: {
    schemaVersion: 'v1',
    capturedFromRingBuffer: true,
    capturedFromDebugger: false,
    bufferSize: 500,
    truncated: false,
    entries: [
      {
        id: 'c1',
        timestamp: '2026-05-30T11:59:58.000Z',
        level: 'log',
        args: [{ type: 'string', preview: 'App booted' }],
      },
      {
        id: 'c2',
        timestamp: '2026-05-30T11:59:59.500Z',
        level: 'error',
        args: [
          { type: 'string', preview: 'POST /api/login failed' },
          { type: 'object', preview: '{ status: 500 }', full: { status: 500 } },
        ],
        stack: 'Error: POST /api/login failed\n    at onSubmit (login.ts:42:11)',
        source: { file: 'login.ts', line: 42, column: 11 },
      },
    ],
  },
  network: {
    schemaVersion: 'v1',
    capturedFromRingBuffer: true,
    capturedFromDebugger: false,
    entries: [
      {
        id: 'n1',
        url: 'https://example.com/api/login',
        method: 'POST',
        status: 500,
        statusText: 'Internal Server Error',
        initiator: 'fetch',
        startedAt: '2026-05-30T11:59:59.000Z',
        endedAt: '2026-05-30T11:59:59.480Z',
        durationMs: 480,
        requestHeaders: [{ name: 'content-type', value: 'application/json' }],
        responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        request: {
          mimeType: 'application/json',
          sizeBytes: 32,
          text: '{"email":"a@example.com"}',
          truncated: false,
        },
        response: {
          mimeType: 'application/json',
          sizeBytes: 27,
          text: '{"error":"internal_error"}',
          truncated: false,
        },
        fromCache: false,
        failed: false,
        errorText: null,
      },
    ],
  },
  dom: {
    schemaVersion: 'v1',
    contentPath: SAMPLE_ASSET_PATHS.domSnapshot,
    byteSize: SAMPLE_DOM_SNAPSHOT_HTML.length,
    scrubbed: true,
    scrubberHits: 1,
  },
  storage: {
    schemaVersion: 'v1',
    localStorage: [{ key: 'theme', value: 'dark', sizeBytes: 9 }],
    sessionStorage: [{ key: 'csrf', value: 'abc123', sizeBytes: 10 }],
    note: 'Captured from the top-level document only.',
  },
  cookies: {
    schemaVersion: 'v1',
    entries: [
      {
        name: 'session',
        value: '••••••••',
        domain: 'example.com',
        path: '/',
        expiresAt: '2026-06-30T12:00:00.000Z',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        session: false,
        masked: true,
      },
    ],
  },
  navigation: {
    schemaVersion: 'v1',
    entries: [
      {
        url: 'https://example.com/',
        title: 'Example — Home',
        visitedAt: '2026-05-30T11:59:50.000Z',
      },
      {
        url: 'https://example.com/login',
        title: 'Example — Sign in',
        visitedAt: '2026-05-30T11:59:55.000Z',
      },
    ],
  },
  reproduction: {
    schemaVersion: 'v1',
    startedAt: '2026-05-30T11:59:55.000Z',
    endedAt: '2026-05-30T12:00:00.000Z',
    steps: [
      {
        id: 'r1',
        timestamp: '2026-05-30T11:59:56.000Z',
        type: 'click',
        selector: '#email',
        description: 'Click email field',
        metadata: { tag: 'input' },
      },
      {
        id: 'r2',
        timestamp: '2026-05-30T11:59:59.000Z',
        type: 'click',
        selector: '#submit',
        description: 'Click Submit',
        metadata: { tag: 'button', text: 'Submit' },
      },
    ],
  },
  elementInspections: {
    schemaVersion: 'v1',
    inspections: [
      {
        id: 'e1',
        outerHtml: '<button id="submit" class="btn btn-primary">Submit</button>',
        computedStyles: {
          display: 'inline-flex',
          color: 'rgb(255, 255, 255)',
          'background-color': 'rgb(37, 99, 235)',
        },
        boundingClientRect: { x: 520, y: 420, width: 240, height: 48 },
        ancestors: [
          { tag: 'form', id: 'login', classes: ['auth'] },
          { tag: 'main', id: null, classes: [] },
        ],
        screenshotCropPath: SAMPLE_ASSET_PATHS.crop,
      },
    ],
  },
  annotations: null,
};

/**
 * Binary/text assets referenced by {@link sampleReport}, keyed by their canonical ZIP path. These
 * are base64-embedded into report.html by `embedReportData` and read back by the dashboard's inline
 * ReportSource so the Screenshots, DOM, and Element-inspections panes resolve their bytes.
 */
export const sampleAssets: ReadonlyMap<string, Uint8Array> = new Map<string, Uint8Array>([
  [SAMPLE_ASSET_PATHS.viewport, TINY_PNG],
  [SAMPLE_ASSET_PATHS.fullPage, TINY_PNG],
  [SAMPLE_ASSET_PATHS.crop, TINY_PNG],
  [SAMPLE_ASSET_PATHS.domSnapshot, new TextEncoder().encode(SAMPLE_DOM_SNAPSHOT_HTML)],
]);
