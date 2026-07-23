/**
 * Representative capture-option matrix (S4-20).
 *
 * Drives the real `CAPTURE_REPORT`→`FINALIZE_REPORT` round-trip through the loaded extension for a
 * *representative* set of capture-option combinations — every option observed on and off at least
 * once (all-on + all-off), plus the high-risk pairs/groups — NOT the full 2^n space. For each case we
 * open the produced ZIP and assert:
 *   - `report.metadata.userOptions` round-trips the requested combination exactly;
 *   - the client-supplied sections (console/network/reproduction, reused from the shared S4-16
 *     fixture) are present iff their option is on;
 *   - the viewport screenshot is present and capture/finalize never fails (`ok: true`).
 *
 * Headless limit (documented at `capture-engine.spec.ts:251`): DOM/storage/cookies/history/extensions
 * need a real tab id or an un-grantable optional permission, so they are `null` here regardless of the
 * option — their collection is covered by `optional-permissions.spec.ts` and the unit suites. The
 * client-side gating that decides *whether* to supply console/network is covered by
 * `overlay/request-capture.test.ts`.
 */
import { expect, test } from '@playwright/test';

import { sampleReport } from '../../packages/report-template/src/__fixtures__/sample-report';

import {
  CAPTURE_MATRIX,
  CHROMIUM_ONLY,
  launchExtension,
  openExtensionPage,
  runCapture,
  type CaptureSections,
} from './helpers/extension-harness';
import { readJsonEntry, hasEntry, REPORT_ZIP_PATHS } from './helpers/report-zip';

/** The three client-collected sections this harness can observe in the ZIP, keyed by their option. */
const OBSERVABLE_SECTIONS = [
  { option: 'consoleLogs', field: 'console', data: sampleReport.console },
  { option: 'networkLog', field: 'network', data: sampleReport.network },
  { option: 'reproductionSteps', field: 'reproduction', data: sampleReport.reproduction },
] as const;

/** Sections the headless harness can never observe (no tab id / un-grantable permission). */
const UNOBSERVABLE_FIELDS = [
  'dom',
  'storage',
  'cookies',
  'navigation',
  'browser',
  'elementInspections',
] as const;

interface ReportJson {
  readonly metadata: { readonly userOptions: Record<string, boolean> };
  readonly console: unknown;
  readonly network: unknown;
  readonly reproduction: unknown;
  readonly dom: unknown;
  readonly storage: unknown;
  readonly cookies: unknown;
  readonly navigation: unknown;
  readonly browser: unknown;
  readonly elementInspections: unknown;
}

test.describe('capture-option matrix (Chromium)', () => {
  test('every representative combination round-trips and folds in exactly the enabled sections', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const ext = await launchExtension();
    try {
      const page = await openExtensionPage(ext);

      for (const matrixCase of CAPTURE_MATRIX) {
        const { name, userOptions } = matrixCase;

        // Supply a client-collected section only when its option is on — mirroring what the real
        // overlay does — so "present iff enabled" is a meaningful assertion, not a tautology.
        const sections: CaptureSections = {};
        for (const { option, field, data } of OBSERVABLE_SECTIONS) {
          if (userOptions[option]) {
            sections[field] = data;
          }
        }

        const result = await runCapture(ext, page, { userOptions, sections });

        expect(result.ok, `[${name}] capture/finalize failed: ${result.reason ?? 'unknown'}`).toBe(
          true,
        );
        expect(result.filename, `[${name}] filename`).toMatch(/^bugcase-.+\.zip$/);
        const zip = result.zip;
        expect(zip, `[${name}] no ZIP downloaded`).not.toBeNull();
        if (!zip) throw new Error('unreachable');

        const report = await readJsonEntry<ReportJson>(zip, REPORT_ZIP_PATHS.report);

        // (a) userOptions round-trips exactly.
        expect(report.metadata.userOptions, `[${name}] userOptions round-trip`).toEqual(
          userOptions,
        );

        // (b) each observable section is present iff its option is on.
        for (const { option, field } of OBSERVABLE_SECTIONS) {
          const present = report[field] !== null;
          expect(present, `[${name}] ${field} present === ${option}`).toBe(userOptions[option]);
        }

        // (c) the viewport screenshot is always folded in (captureVisibleTab is stubbed).
        expect(
          hasEntry(zip, REPORT_ZIP_PATHS.viewportScreenshot),
          `[${name}] viewport screenshot`,
        ).toBe(true);

        // (d) headless limit: permission/tab-gated sections stay null even when their option is on.
        for (const field of UNOBSERVABLE_FIELDS) {
          expect(report[field], `[${name}] ${field} unobservable headless → null`).toBeNull();
        }
      }
    } finally {
      await ext.context.close();
    }
  });
});
