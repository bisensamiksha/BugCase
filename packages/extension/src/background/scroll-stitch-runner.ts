/**
 * Service-worker glue for the scroll-stitch capture (S2-12).
 *
 * Supplies the real browser effects to {@link captureFullPageByScrollStitch}: page operations
 * (metrics, freeze/restore, scroll) run in the page via `chrome.scripting.executeScript`; each tile
 * is captured with `tabs.captureVisibleTab` (throttled to stay under Chrome's per-second quota) and
 * decoded to an `ImageBitmap`; tiles are composited on an `OffscreenCanvas`. The geometry and
 * orchestration live in the unit-tested `../capture/scroll-stitch`; this module is the thin,
 * browser-only integration that can only be exercised manually.
 */

import { captureVisibleViewport } from '../capture';
import type { CapturedScreenshot } from '../capture/screenshot-strategy';
import {
  captureFullPageByScrollStitch,
  type PageMetrics,
  type ScrollStitchPlan,
} from '../capture/scroll-stitch';
import { freezePageForCapture, restoreFrozenPage } from '../content/freeze-page';
import browser from '../lib/browser';

/** `captureVisibleTab` is rate-limited (~2/sec); keep tile captures just under that. */
const CAPTURE_THROTTLE_MS = 550;

type PageFunc<Args extends unknown[], Result> = (...args: Args) => Result;

async function execInPage<Args extends unknown[], Result>(
  tabId: number,
  func: PageFunc<Args, Result>,
  args: Args,
): Promise<Result | undefined> {
  const [injection] = await browser.scripting.executeScript({ target: { tabId }, func, args });
  const value: unknown = injection?.result;
  return value as Result | undefined;
}

async function stitchTiles(plan: ScrollStitchPlan, tiles: readonly ImageBitmap[]): Promise<Blob> {
  const canvas = new OffscreenCanvas(plan.canvasWidth, plan.canvasHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }
  plan.tiles.forEach((tile, index) => {
    const bitmap = tiles[index];
    if (bitmap) {
      ctx.drawImage(bitmap, 0, tile.dy);
    }
  });
  return canvas.convertToBlob({ type: 'image/png' });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/** Run a full-page scroll-stitch capture against `tabId`, returning a report-ready screenshot. */
export async function runScrollStitchCapture(
  tabId: number,
  devicePixelRatio: number,
): Promise<CapturedScreenshot> {
  let lastCaptureAt = 0;

  const result = await captureFullPageByScrollStitch<ImageBitmap>({
    getMetrics: async () => {
      const metrics = await execInPage(
        tabId,
        () => ({
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        }),
        [],
      );
      if (!metrics) {
        throw new Error('could not read page metrics');
      }
      return metrics satisfies PageMetrics;
    },
    freeze: async () => {
      await execInPage(tabId, freezePageForCapture, []);
    },
    restore: async () => {
      await execInPage(tabId, restoreFrozenPage, []);
    },
    scrollTo: async (scrollY) => {
      await execInPage(tabId, (y: number) => window.scrollTo(0, y), [scrollY]);
    },
    captureTile: async () => {
      const sinceLast = Date.now() - lastCaptureAt;
      if (lastCaptureAt > 0 && sinceLast < CAPTURE_THROTTLE_MS) {
        await new Promise((resolve) => setTimeout(resolve, CAPTURE_THROTTLE_MS - sinceLast));
      }
      const { blob } = await captureVisibleViewport({ devicePixelRatio });
      lastCaptureAt = Date.now();
      return createImageBitmap(blob);
    },
    stitch: stitchTiles,
  });

  return {
    blob: result.blob,
    dataUrl: await blobToDataUrl(result.blob),
    width: result.width,
    height: result.height,
    devicePixelRatio,
    captureMethod: 'scrollStitch',
  };
}
