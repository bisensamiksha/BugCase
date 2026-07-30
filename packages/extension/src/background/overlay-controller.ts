import browser from '../lib/browser';

import { PASSIVE_MAIN_SCRIPT_FILE } from './content-script-registration';

/**
 * Content entry the service worker injects via `chrome.scripting.executeScript` (uses
 * `activeTab`, so no host permissions). Injecting toggles the overlay: mount if absent,
 * remove if present (see content/overlay.tsx).
 *
 * This path is the built artifact emitted by the dedicated content build (`vite.content.config.ts`),
 * NOT the TS source. `chrome.scripting.executeScript({ files })` can only load files that ship in
 * dist, and injected files run as classic scripts (no ES modules), so the content entry is bundled
 * separately as a self-contained IIFE. CRXJS only bundles manifest-referenced entries, which is why
 * this needs its own build step. Injecting with `activeTab` needs no host permissions.
 */
export const OVERLAY_CONTENT_SCRIPT = 'content/overlay.js';

/**
 * The MAIN-world script that hosts the reproduction recorder + the page-bridge responder (S3-12).
 * It is registered at document_start only on passive-allowlisted origins (see
 * content-script-registration.ts), so on any other page — or an allowlisted page that hasn't reloaded
 * since opt-in — the recorder is absent and recording captures nothing. Injecting it on demand
 * alongside the overlay (via `activeTab`, `world: 'MAIN'`) makes recording work on any page the
 * overlay opens on. It is the same built artifact and is idempotent (self-install guard), so this is a
 * no-op where document_start already ran it.
 */
export const RECORDER_MAIN_SCRIPT = PASSIVE_MAIN_SCRIPT_FILE;

/**
 * On-demand annotation surface (TD-03): a self-contained IIFE that carries Konva, injected only when
 * the user clicks Annotate so `overlay.js` never ships the ~150 kB canvas engine on every capture.
 * Built by `vite.annotation.config.ts`; injected the same way as the overlay, via `activeTab` (no host
 * permission). Like the overlay, this is the built artifact path, not the TS source.
 */
export const ANNOTATION_CONTENT_SCRIPT = 'content/annotation.js';

/** Result of an overlay inject/remove attempt. Serializable so it can cross the message boundary. */
export interface OverlayInjectResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface OverlayController {
  /** Inject (toggle) the overlay into a specific tab. */
  inject(tabId: number): Promise<OverlayInjectResult>;
  /** Resolve the active tab in the current window and inject into it only. */
  injectActiveTab(): Promise<OverlayInjectResult>;
  /** Re-inject the recorder + overlay to continue a recording across a navigation (mount, not toggle). */
  reinject(tabId: number): Promise<OverlayInjectResult>;
  /** Inject the on-demand annotation surface into a specific tab (TD-03). */
  injectAnnotation(tabId: number): Promise<OverlayInjectResult>;
}

/**
 * Runs in the page; flags the next overlay inject to mount (not toggle). Must stay self-contained
 * (serialized for injection) — the literal must match `OVERLAY_MOUNT_ONLY_FLAG` in overlay-root.
 */
function setOverlayMountOnlyFlag(): void {
  (window as unknown as Record<string, unknown>).__bugcaseOverlayMountOnly = true;
}

function isValidTabId(tabId: number): boolean {
  return Number.isInteger(tabId) && tabId >= 0;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createOverlayController(): OverlayController {
  /**
   * Best-effort: ensure the MAIN-world recorder is present on the tab. Never throws — the overlay and
   * the rest of capture still work without it (e.g. on a restricted page that rejects MAIN injection).
   */
  async function ensureRecorder(tabId: number): Promise<void> {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: [RECORDER_MAIN_SCRIPT],
        world: 'MAIN',
      });
    } catch {
      // Reproduction recording is unavailable on this page; the overlay still opens.
    }
  }

  async function inject(tabId: number): Promise<OverlayInjectResult> {
    if (!isValidTabId(tabId)) {
      return { ok: false, reason: `invalid tab id: ${String(tabId)}` };
    }
    await ensureRecorder(tabId);
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: [OVERLAY_CONTENT_SCRIPT],
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toReason(error) };
    }
  }

  async function injectActiveTab(): Promise<OverlayInjectResult> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) {
      return { ok: false, reason: 'no active tab' };
    }
    return inject(tab.id);
  }

  async function reinject(tabId: number): Promise<OverlayInjectResult> {
    if (!isValidTabId(tabId)) {
      return { ok: false, reason: `invalid tab id: ${String(tabId)}` };
    }
    await ensureRecorder(tabId);
    try {
      await browser.scripting.executeScript({ target: { tabId }, func: setOverlayMountOnlyFlag });
      await browser.scripting.executeScript({ target: { tabId }, files: [OVERLAY_CONTENT_SCRIPT] });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toReason(error) };
    }
  }

  async function injectAnnotation(tabId: number): Promise<OverlayInjectResult> {
    if (!isValidTabId(tabId)) {
      return { ok: false, reason: `invalid tab id: ${String(tabId)}` };
    }
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: [ANNOTATION_CONTENT_SCRIPT],
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toReason(error) };
    }
  }

  return { inject, injectActiveTab, reinject, injectAnnotation };
}
