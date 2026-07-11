import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Page, type Worker } from '@playwright/test';

import { CHROMIUM_ONLY, launchExtension } from './helpers/preview';

/**
 * S3-16 — Settings + report-history persistence across a service-worker restart (Chromium).
 *
 * BugCase keeps settings and the metadata-only report history in `chrome.storage.local`, which the
 * options page reads via `getSettings` / `getReportHistory`. `storage.local` is durable — a service
 * worker eviction or a full browser restart must never drop it. These specs prove that by driving the
 * real options UI, then relaunching the SAME `userDataDir` (a fresh SW) and re-reading the values.
 *
 * The metadata-only guarantee itself (normalize drops non-metadata keys) is unit-proven in
 * `report-history.test.ts`; here we prove persistence + real render through the shipped options page.
 */

const OPTIONS_PATH = 'src/options/options.html';

function optionsUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/${OPTIONS_PATH}`;
}

async function openOptions(page: Page, extensionId: string): Promise<void> {
  await page.goto(optionsUrl(extensionId));
  await page.waitForSelector('[data-testid="options-app"]');
}

/**
 * Mark the first-install onboarding tour (S3-18) as already seen, so its overlay doesn't cover the
 * settings controls this spec drives. Seeded in the worker before opening the options page; persists
 * in `storage.local` across the restart. Without this, the tour can race the options-page interaction.
 */
async function seedOnboardingSeen(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const g = globalThis as unknown as {
      chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } };
    };
    return g.chrome.storage.local.set({ 'bugcase/onboarding-seen': true });
  });
}

test.describe('S3-16 settings persistence (Chromium)', () => {
  test('settings changed in the options page survive a service-worker restart', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const userDataDir = await mkdtemp(path.join(tmpdir(), 'bugcase-settings-'));
    try {
      // First launch: change a scrubber toggle + the ring-buffer size, which auto-save to storage.local.
      const first = await launchExtension({ userDataDir });
      await seedOnboardingSeen(first.worker); // suppress the first-run tour overlay (persists across restart)
      const scrubberId = await (async (): Promise<string> => {
        const page = await first.context.newPage();
        await openOptions(page, first.extensionId);

        // Pick the first scrubber toggle by its stable prefix (no dependency on a specific rule id).
        const toggle = page.locator('[data-testid^="scrubber-toggle-"]').first();
        const testId = (await toggle.getAttribute('data-testid')) ?? '';
        expect(testId).not.toBe('');
        expect(await toggle.isChecked()).toBe(true); // scrubbers default on
        await toggle.uncheck();

        const ring = page.locator('[data-testid="ring-buffer-size"]');
        await ring.fill('1234');
        // ring-buffer onChange persists on each keystroke; blur to be safe, then wait for the write.
        await ring.blur();

        // Confirm the write landed in storage.local before restarting (persist is fire-and-forget).
        await expect
          .poll(async () =>
            page.evaluate(async () => {
              const g = globalThis as unknown as {
                chrome: {
                  storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } };
                };
              };
              const rec = await g.chrome.storage.local.get('bugcase/settings');
              const s = rec['bugcase/settings'] as { maxRingBufferSize?: number } | undefined;
              return s?.maxRingBufferSize ?? 0;
            }),
          )
          .toBe(1234);
        return testId;
      })();
      await first.context.close();

      // Second launch on the SAME profile: a fresh service worker re-reads persisted settings.
      const second = await launchExtension({ userDataDir });
      try {
        const page = await second.context.newPage();
        await openOptions(page, second.extensionId);

        expect(await page.locator(`[data-testid="${scrubberId}"]`).isChecked()).toBe(false);
        expect(await page.locator('[data-testid="ring-buffer-size"]').inputValue()).toBe('1234');
      } finally {
        await second.context.close();
      }
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test('report history persists across a restart and renders metadata only', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const userDataDir = await mkdtemp(path.join(tmpdir(), 'bugcase-history-'));
    const entry = {
      id: 'hist-1',
      capturedAt: '2026-07-08T10:00:00.000Z',
      url: 'https://example.com/page',
      title: 'My Captured Page',
      origin: 'https://example.com',
      filename: 'bugcase-example-com-20260708-100000.zip',
      byteSize: 2048,
      artifacts: ['screenshot'],
      downloadId: 7,
      toolVersion: '0.0.1',
    };
    try {
      // First launch: seed a metadata-only history entry, then confirm the shipped options UI renders it.
      const first = await launchExtension({ userDataDir });
      await seedOnboardingSeen(first.worker); // suppress the first-run tour overlay (persists across restart)
      const page = await first.context.newPage();
      await openOptions(page, first.extensionId);
      await page.evaluate(async (e) => {
        const g = globalThis as unknown as {
          chrome: {
            storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
          };
        };
        await g.chrome.storage.local.set({ 'bugcase/report-history': [e] });
      }, entry);
      await page.reload();
      await page.waitForSelector('[data-testid="options-app"]');

      const rows = page.locator('[data-testid="history-row"]');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText('My Captured Page');
      await first.context.close();

      // Second launch on the same profile: the entry persisted and still renders.
      const second = await launchExtension({ userDataDir });
      try {
        const page2 = await second.context.newPage();
        await openOptions(page2, second.extensionId);
        const rows2 = page2.locator('[data-testid="history-row"]');
        await expect(rows2).toHaveCount(1);
        await expect(rows2.first()).toContainText('My Captured Page');
      } finally {
        await second.context.close();
      }
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
