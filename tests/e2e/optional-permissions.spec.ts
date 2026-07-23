/**
 * Optional-permission grant/deny flows (S4-20).
 *
 * The three capture options gated behind an optional browser permission — `cookies`
 * (`report.cookies`), navigation history / `history` (`report.navigation`), and installed extensions /
 * `management` (`report.browser.installedExtensions`) — each collected by a service-worker adapter that
 * gates on `permissions.contains` and degrades to `null` when not granted, never throwing.
 *
 * Coverage against the *real* permission machinery (no browser API is stubbed):
 *   - **deny** — asserted for all three. It runs while nothing is granted, so `contains` → false, the
 *     collector returns `null`, and the section is absent (capture still succeeds). This is the
 *     security-critical guarantee: an un-granted permission never leaks its data into the report.
 *   - **grant** — asserted end-to-end for `cookies`, via a real `chrome.permissions.request` that
 *     headless Chromium auto-accepts (no "Allow?" dialog): the collector then folds `report.cookies`
 *     in. `history`/`management` are *warning* permissions whose grant prompt headless Chromium does
 *     NOT auto-accept (the request hangs), and faking is not possible (the bundled webextension-polyfill
 *     resolves `permissions.contains` in no-callback mode, ignoring a stubbed return). Their grant path
 *     is therefore a 🟡 manual real-browser check — the collectors are unit-tested in
 *     `history-handler.test.ts` / `management-handler.test.ts`.
 */
import { expect, test, type Page } from '@playwright/test';

import { sampleReport } from '../../packages/report-template/src/__fixtures__/sample-report';

import {
  ALL_OFF,
  CHROMIUM_ONLY,
  launchExtension,
  openExtensionPage,
  runCapture,
  type CaptureSections,
} from './helpers/extension-harness';
import { readJsonEntry, REPORT_ZIP_PATHS } from './helpers/report-zip';

/** A recognizable installed-extension seeded so the management deny path has a baseline to keep. */
const SENTINEL_EXTENSION = {
  id: 'sentinelsentinelsentinelsentinel',
  name: 'Sentinel Extension',
  version: '9.9.9',
  enabled: true,
  type: 'extension',
};

/** Browser info seeded so the management collector has an installed-extensions list to fold into. */
const MANAGEMENT_SECTIONS: CaptureSections = {
  browser: { ...sampleReport.browser, installedExtensions: [SENTINEL_EXTENSION] },
};

interface ReportJson {
  readonly cookies: { readonly entries: readonly unknown[] } | null;
  readonly navigation: { readonly entries: readonly unknown[] } | null;
  readonly browser: { readonly installedExtensions: readonly { readonly id: string }[] } | null;
}

/** Request an optional permission from the extension page (auto-accepted in headless Chromium). */
async function requestPermission(page: Page, name: string): Promise<boolean> {
  return page.evaluate(
    (permission) =>
      (
        globalThis as unknown as {
          chrome: { permissions: { request: (r: unknown) => Promise<boolean> } };
        }
      ).chrome.permissions.request({ permissions: [permission] }),
    name,
  );
}

/** The un-granted (deny) assertion for each permission-gated section. */
const DENY_CASES = [
  {
    name: 'cookies',
    option: 'cookies' as const,
    assert: (report: ReportJson) => expect(report.cookies).toBeNull(),
  },
  {
    name: 'history',
    option: 'navigationHistory' as const,
    assert: (report: ReportJson) => expect(report.navigation).toBeNull(),
  },
  {
    name: 'management',
    option: 'installedExtensions' as const,
    sections: MANAGEMENT_SECTIONS,
    // Denied → the collector returns null and the seeded sentinel baseline is kept.
    assert: (report: ReportJson) =>
      expect(report.browser?.installedExtensions.map((extension) => extension.id)).toContain(
        SENTINEL_EXTENSION.id,
      ),
  },
];

test.describe('optional-permission grant/deny (Chromium)', () => {
  test('every permission-gated section is absent while the permission is un-granted', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const ext = await launchExtension();
    try {
      const page = await openExtensionPage(ext);
      for (const permission of DENY_CASES) {
        const result = await runCapture(ext, page, {
          userOptions: { ...ALL_OFF, [permission.option]: true },
          ...(permission.sections ? { sections: permission.sections } : {}),
        });
        expect(result.ok, `[${permission.name}] capture failed: ${result.reason ?? '?'}`).toBe(
          true,
        );
        if (!result.zip) throw new Error(`[${permission.name}] no ZIP`);
        permission.assert(await readJsonEntry<ReportJson>(result.zip, REPORT_ZIP_PATHS.report));
      }
    } finally {
      await ext.context.close();
    }
  });

  test('granting the cookies permission folds report.cookies in', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const ext = await launchExtension();
    try {
      const page = await openExtensionPage(ext);

      // Before granting: report.cookies is absent (the deny path, proven independently above).
      const denied = await runCapture(ext, page, { userOptions: { ...ALL_OFF, cookies: true } });
      expect(denied.ok).toBe(true);
      expect(
        (await readJsonEntry<ReportJson>(denied.zip!, REPORT_ZIP_PATHS.report)).cookies,
      ).toBeNull();

      // Grant the real permission (headless Chromium auto-accepts), then re-capture.
      expect(await requestPermission(page, 'cookies'), 'cookies permission was not granted').toBe(
        true,
      );
      const granted = await runCapture(ext, page, { userOptions: { ...ALL_OFF, cookies: true } });
      expect(granted.ok).toBe(true);
      // Granted → the collector runs and produces a cookies dump (empty here — no cookies on the
      // captured origin — but present, which is the grant→collect→fold proof).
      expect(
        (await readJsonEntry<ReportJson>(granted.zip!, REPORT_ZIP_PATHS.report)).cookies,
      ).not.toBeNull();
    } finally {
      await ext.context.close();
    }
  });
});
