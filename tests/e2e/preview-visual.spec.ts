import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * S3-17 — Visual regression snapshots for the preview screen (opt-in `visual` project).
 *
 * The live preview renders inside the injected overlay Shadow DOM (unreachable headless), so this loads
 * a standalone harness that mounts the real PreviewApp with deterministic fixture data
 * (`packages/extension/visual-harness`, built via `pnpm build:harness`). Each state is asserted by its
 * testid before snapshotting, so a broken fixture fails loudly instead of snapshotting garbage.
 *
 * Baselines are platform-suffixed and committed for the dev platform (darwin); this project is excluded
 * from the default run so CI stays green. See tests/e2e/__screenshots__/README.md.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_HTML = path.resolve(here, '../../packages/extension/visual-harness/dist/index.html');
const HARNESS_URL = pathToFileURL(HARNESS_HTML).href;

async function openHarness(page: Page): Promise<void> {
  try {
    await access(HARNESS_HTML);
  } catch {
    throw new Error(`Missing ${HARNESS_HTML} — build the visual harness first: pnpm build:harness`);
  }
  await page.goto(HARNESS_URL);
  await page.waitForSelector('[data-testid="preview-review-screen-scaffold"]');
}

test.describe('S3-17 preview screen visual regression', () => {
  test('review screen', async ({ page }) => {
    await openHarness(page);
    await expect(page).toHaveScreenshot('preview-review-screen.png', { fullPage: true });
  });

  test('privacy-notice modal', async ({ page }) => {
    await openHarness(page);
    await page.locator('[data-testid="preview-download"]').click();
    await page.waitForSelector('[data-testid="privacy-notice-modal"]');
    await expect(page).toHaveScreenshot('preview-privacy-modal.png', { fullPage: true });
  });

  test('annotation canvas', async ({ page }) => {
    await openHarness(page);
    await page.locator('[data-testid="annotate-screenshot"]').click();
    // The Konva stage renders onto a <canvas> once the injected screenshot image has loaded.
    await page.waitForSelector('[data-testid="konva-annotation-canvas"] canvas');
    await expect(page).toHaveScreenshot('preview-annotation-canvas.png', { fullPage: true });
  });
});
