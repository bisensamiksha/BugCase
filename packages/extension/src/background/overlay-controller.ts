import browser from '../lib/browser';

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

/** Result of an overlay inject/remove attempt. Serializable so it can cross the message boundary. */
export interface OverlayInjectResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface OverlayController {
  /** Inject (toggle) the overlay into a specific tab. */
  inject(tabId: number): Promise<OverlayInjectResult>;
  /** Force-remove the overlay from a specific tab. */
  remove(tabId: number): Promise<OverlayInjectResult>;
  /** Resolve the active tab in the current window and inject into it only. */
  injectActiveTab(): Promise<OverlayInjectResult>;
}

/** Runs in the page; removes the overlay host. Must stay self-contained (serialized for injection). */
function removeOverlayInPage(): void {
  document.getElementById('bugcase-overlay-root')?.remove();
}

function isValidTabId(tabId: number): boolean {
  return Number.isInteger(tabId) && tabId >= 0;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createOverlayController(): OverlayController {
  async function inject(tabId: number): Promise<OverlayInjectResult> {
    if (!isValidTabId(tabId)) {
      return { ok: false, reason: `invalid tab id: ${String(tabId)}` };
    }
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

  async function remove(tabId: number): Promise<OverlayInjectResult> {
    if (!isValidTabId(tabId)) {
      return { ok: false, reason: `invalid tab id: ${String(tabId)}` };
    }
    try {
      await browser.scripting.executeScript({ target: { tabId }, func: removeOverlayInPage });
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

  return { inject, remove, injectActiveTab };
}
