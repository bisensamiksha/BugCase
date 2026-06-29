/**
 * Capture-engine integration test (S2-23).
 *
 * Composes the *real* engine modules — `runCaptureFlow` + the real `collectDomSnapshot` + the real
 * DOM scrubbers + the real `writeBugReportZip` — over a known page DOM, then re-opens the produced
 * ZIP and asserts the outputs. Unlike `capture-flow.test.ts` (which mocks the writer and the DOM
 * collector to test orchestration), this exercises the actual scrub → package → re-read path, so it
 * proves a known **password input** leaves the engine masked.
 *
 * The browser-boundary half of S2-23 (loading the unpacked extension, a fixture page that emits
 * known console/network/password signals) lives in `tests/e2e/capture-engine.spec.ts`. That spec
 * asserts only what the headless harness can reach: DOM/storage collection needs host-permission
 * `executeScript` (gated behind an action-click / un-grantable in headless), and console/network are
 * not folded into the report ZIP yet — so the scrub assertion is proven here at the module level.
 */

import {
  BUG_REPORT_ZIP_LAYOUT,
  BugReportV1Schema,
  writeBugReportZip,
  type CaptureMetadata,
  type UserInput,
} from '@bugcase/schema';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

// runCaptureFlow's module graph pulls in lib/browser via downloads.ts; the webextension-polyfill
// module throws at import outside an extension, so stub it (downloads is injected below anyway).
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { toConsoleLog } from '../capture/console-log';
import { collectDomSnapshot } from '../capture/dom-snapshot';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import { toNetworkLog } from '../capture/network-log';
import type { CapturedScreenshot } from '../capture/screenshot-strategy';

import { runCaptureFlow, type CaptureFlowInput } from './capture-flow';

/** A known page DOM: one password input (secret), one visible text input, one inline script. */
const KNOWN_HTML =
  '<html><body>' +
  '<input type="password" value="hunter2">' +
  '<input type="text" value="visible-keep-me">' +
  '<script>trackUser()</script>' +
  '</body></html>';

const metadata: CaptureMetadata = {
  id: '00000000-0000-4000-8000-000000000000',
  tool: { name: 'bugcase', version: '0.0.1', schemaVersion: 'v1', browserBuildTarget: 'chrome' },
  page: {
    url: 'https://example.com/path',
    title: 'Example',
    origin: 'https://example.com',
    capturedAt: '2026-06-27T12:00:00.000Z',
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
  userOptions: DEFAULT_USER_OPTIONS,
};

const userInput: UserInput = {
  schemaVersion: 'v1',
  title: 'Login button does nothing',
  stepsToReproduce: '1. open /login\n2. click submit',
  severity: 'major',
  notes: 'happens every time',
};

function fakeShot(): CapturedScreenshot {
  return {
    blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
    dataUrl: 'data:image/png;base64,iVBORw==',
    width: 1280,
    height: 800,
    devicePixelRatio: 2,
    captureMethod: 'visibleTab',
  };
}

/** Run the real engine over KNOWN_HTML and return the re-opened ZIP plus the captured Blob. */
async function captureAndReopen(
  extra: Pick<Partial<CaptureFlowInput>, 'console' | 'network'> = {},
): Promise<{ zip: JSZip; blob: Blob }> {
  let captured: Blob | undefined;
  const result = await runCaptureFlow(
    { metadata, userInput, ...extra },
    {
      captureScreenshot: () => Promise.resolve(fakeShot()),
      // The real DOM collector: read the known HTML, then run the real scrubbers.
      collectDom: () => collectDomSnapshot({ readOuterHtml: () => Promise.resolve(KNOWN_HTML) }),
      // The real ZIP writer.
      writeZip: writeBugReportZip,
      // Capture the produced Blob instead of hitting chrome.downloads.
      download: (blob) => {
        captured = blob;
        return Promise.resolve(1);
      },
      now: () => new Date('2026-06-27T09:08:07.000Z'),
    },
  );
  expect(result.ok, `capture failed: ${result.reason ?? 'unknown'}`).toBe(true);
  if (!captured) {
    throw new Error('no ZIP was produced');
  }
  const zip = await JSZip.loadAsync(await captured.arrayBuffer());
  return { zip, blob: captured };
}

async function entryText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`ZIP is missing ${path}`);
  }
  return file.async('string');
}

describe('capture engine → ZIP (real modules)', () => {
  it('masks a known password input in the stored DOM snapshot, keeping visible text', async () => {
    const { zip } = await captureAndReopen();

    const dom = await entryText(zip, BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot);
    // The password secret is gone, replaced by the placeholder.
    expect(dom).not.toContain('hunter2');
    expect(dom).toContain('[scrubbed]');
    // Non-password input is preserved by default (the all-input mask is opt-in).
    expect(dom).toContain('visible-keep-me');
    // Scripts are left by default (strip is opt-in); this characterizes the default policy.
    expect(dom).toContain('trackUser()');
  });

  it('records the DOM snapshot in a schema-valid report.json with a scrubber hit', async () => {
    const { zip } = await captureAndReopen();

    const report = BugReportV1Schema.parse(
      JSON.parse(await entryText(zip, BUG_REPORT_ZIP_LAYOUT.report)),
    );
    expect(report.dom?.contentPath).toBe(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot);
    expect(report.dom?.scrubbed).toBe(true);
    expect(report.dom?.scrubberHits ?? 0).toBeGreaterThanOrEqual(1);
    // The user's typed report (S2-21) round-trips into the ZIP intact.
    expect(report.userInput.severity).toBe('major');
    expect(report.userInput.title).toBe('Login button does nothing');
  });

  it('records console + network ring-buffer logs in the report, scrubbing network headers (S2-25)', async () => {
    // Map raw ring-buffer entries the way the overlay does, then run them through the engine.
    const consoleLog = toConsoleLog(
      [{ type: 'error', args: ['kaboom'], timestamp: Date.parse('2026-06-27T12:00:00.000Z') }],
      { bufferSize: 500 },
    );
    const { log: networkLog } = toNetworkLog([
      {
        initiator: 'fetch',
        url: 'https://api.example.com/v1',
        method: 'POST',
        status: 200,
        statusText: 'OK',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer top-secret' }],
        responseHeaders: [],
        startedAt: Date.parse('2026-06-27T12:00:00.000Z'),
        endedAt: Date.parse('2026-06-27T12:00:00.050Z'),
        durationMs: 50,
        failed: false,
        errorText: null,
      },
    ]);

    const { zip } = await captureAndReopen({ console: consoleLog, network: networkLog });
    const report = BugReportV1Schema.parse(
      JSON.parse(await entryText(zip, BUG_REPORT_ZIP_LAYOUT.report)),
    );

    expect(report.console?.entries[0]?.level).toBe('error');
    expect(report.network?.entries[0]?.url).toBe('https://api.example.com/v1');
    // The sensitive request header is scrubbed in the stored report.
    const auth = report.network?.entries[0]?.requestHeaders.find((h) => h.name === 'Authorization');
    expect(auth?.value).toBe('[scrubbed]');
    expect(report.network?.entries[0]?.requestHeaders).not.toContainEqual({
      name: 'Authorization',
      value: 'Bearer top-secret',
    });
  });

  it('writes the canonical report + metadata + screenshot entries', async () => {
    const { zip } = await captureAndReopen();

    expect(zip.file(BUG_REPORT_ZIP_LAYOUT.report)).not.toBeNull();
    expect(zip.file(BUG_REPORT_ZIP_LAYOUT.metadata)).not.toBeNull();
    expect(zip.file(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)).not.toBeNull();

    const meta = JSON.parse(await entryText(zip, BUG_REPORT_ZIP_LAYOUT.metadata)) as {
      tool: { name: string };
      page: { url: string };
    };
    expect(meta.tool.name).toBe('bugcase');
    expect(meta.page.url).toBe('https://example.com/path');
  });
});
