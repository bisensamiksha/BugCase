import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY_FILE = path.resolve(
  here,
  '../../packages/extension/dist-chrome/injected/main-entry.js',
);
const BRIDGE_SOURCE = 'bugcase-bridge';

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

test.describe('passive error detection badge — live MAIN-world signal (Chromium)', () => {
  test('an uncaught page error posts a passive-error signal, but console.error does not', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);
    test.setTimeout(30000);

    // Inject the *built* MAIN-world entry into a real page — what the extension registers at
    // document_start on allowlisted origins. It installs the console ring buffer whose onError hook
    // (S3-14) posts a `passive-error` bridge message the isolated world relays to the worker for the
    // badge. This proves the reachable half: a genuine uncaught error emits the signal; a
    // console.error (intentional, handled logging) does not.
    const mainEntry = await readFile(MAIN_ENTRY_FILE, 'utf8');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="x" type="button">x</button>');
      await page.addScriptTag({ content: mainEntry });

      // Count the passive-error signals the MAIN world posts onto the page window.
      await page.evaluate((source: string) => {
        (window as unknown as { __passive: number }).__passive = 0;
        window.addEventListener('message', (event) => {
          const d = event.data as { source?: string; kind?: string };
          if (d?.source === source && d.kind === 'passive-error') {
            (window as unknown as { __passive: number }).__passive += 1;
          }
        });
      }, BRIDGE_SOURCE);

      const installed = await page.evaluate(() =>
        Boolean((window as unknown as Record<string, unknown>).__bugcasePassiveMainInstalled),
      );
      expect(installed, 'main-entry did not install in this world').toBe(true);

      // A genuine uncaught error (thrown async so it reaches window 'error') and an unhandled rejection.
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('e2e-uncaught-boom');
        }, 0);
      });
      await page.evaluate(() => {
        void Promise.reject(new Error('e2e-unhandled-rejection'));
      });
      await page.waitForTimeout(100);

      const afterErrors = await page.evaluate(
        () => (window as unknown as { __passive: number }).__passive,
      );
      expect(afterErrors, 'uncaught error + rejection should each emit a passive-error').toBe(2);

      // console.error is intentional, handled logging — it must NOT bump the badge.
      await page.evaluate(() => console.error('handled on purpose, not a crash'));
      await page.waitForTimeout(50);
      const afterConsoleError = await page.evaluate(
        () => (window as unknown as { __passive: number }).__passive,
      );
      expect(afterConsoleError, 'console.error must not emit a passive-error').toBe(2);

      // NOTE: the isolated-world relay (passive-bridge → PASSIVE_ERROR), the per-tab count + toolbar
      // badge (setBadgeText, capped 9+), reset-on-capture/nav, and the overlay Dismiss button are
      // proven at the module level in src/content/passive-bridge.test.ts,
      // src/storage/passive-errors.test.ts, src/background/passive-error-badge.test.ts, and
      // src/overlay/{DismissErrorBadgeButton,OverlayApp}.test.tsx. Driving the *live* toolbar badge
      // needs the registered content scripts + a real tab sender, which this headless harness can't
      // arrange deterministically.
    } finally {
      await browser.close();
    }
  });
});
