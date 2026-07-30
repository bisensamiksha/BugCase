import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeScript, query } = vi.hoisted(() => ({
  executeScript: vi.fn(),
  query: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({
  default: { scripting: { executeScript }, tabs: { query } },
}));

import {
  ANNOTATION_CONTENT_SCRIPT,
  OVERLAY_CONTENT_SCRIPT,
  RECORDER_MAIN_SCRIPT,
  createOverlayController,
} from './overlay-controller';

describe('OVERLAY_CONTENT_SCRIPT', () => {
  it('points at a built, injectable JS artifact (not a TS/TSX source)', () => {
    // chrome.scripting.executeScript can only load files emitted into the build output.
    // A `.tsx` source is never present in dist-chrome, so injecting it fails silently in the
    // real browser (the popup ignores the rejected promise) and the overlay never opens.
    expect(OVERLAY_CONTENT_SCRIPT).toBe('content/overlay.js');
    expect(OVERLAY_CONTENT_SCRIPT).not.toMatch(/\.tsx?$/);
  });
});

describe('createOverlayController', () => {
  beforeEach(() => {
    executeScript.mockReset();
    query.mockReset();
    executeScript.mockResolvedValue([{ result: undefined }]);
  });

  describe('inject', () => {
    it('injects the overlay content script into the given tab', async () => {
      const result = await createOverlayController().inject(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [OVERLAY_CONTENT_SCRIPT],
      });
    });

    it('also injects the MAIN-world reproduction recorder so recording works on any page', async () => {
      // The recorder (main-entry.js) is otherwise registered only on passive-allowlisted origins at
      // document_start; injecting it on demand alongside the overlay makes reproduction recording work
      // on any page the overlay opens on, without pre-allowlisting or a reload.
      const result = await createOverlayController().inject(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [RECORDER_MAIN_SCRIPT],
        world: 'MAIN',
      });
    });

    it('still opens the overlay when the MAIN-world recorder injection fails', async () => {
      // The recorder inject is best-effort: a page that rejects the MAIN-world injection must not stop
      // the overlay (and the rest of capture) from working.
      executeScript.mockReset();
      executeScript
        .mockRejectedValueOnce(new Error('MAIN world blocked'))
        .mockResolvedValueOnce([{ result: undefined }]);
      const result = await createOverlayController().inject(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [OVERLAY_CONTENT_SCRIPT],
      });
    });

    it('rejects an invalid tab id without touching the browser', async () => {
      const result = await createOverlayController().inject(-1);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/tab/i);
      expect(executeScript).not.toHaveBeenCalled();
    });

    it('handles an injection failure (restricted page) without throwing', async () => {
      executeScript.mockRejectedValue(new Error('Cannot access chrome:// URL'));
      const result = await createOverlayController().inject(7);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/chrome:\/\//);
    });
  });

  describe('reinject', () => {
    it('injects the recorder, sets the mount-only flag, and mounts the overlay', async () => {
      const result = await createOverlayController().reinject(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [RECORDER_MAIN_SCRIPT],
        world: 'MAIN',
      });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [OVERLAY_CONTENT_SCRIPT],
      });
      // A func injection sets the mount-only flag so re-injection can't toggle the overlay off.
      const funcCall = executeScript.mock.calls.find(
        (c) => typeof (c[0] as { func?: unknown })?.func === 'function',
      );
      expect(funcCall).toBeDefined();
    });

    it('rejects an invalid tab id', async () => {
      const result = await createOverlayController().reinject(-1);
      expect(result.ok).toBe(false);
    });
  });

  describe('injectActiveTab', () => {
    it('resolves the active tab in the current window and injects only there', async () => {
      query.mockResolvedValue([{ id: 42 }]);
      const result = await createOverlayController().injectActiveTab();
      expect(result).toEqual({ ok: true });
      expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: [OVERLAY_CONTENT_SCRIPT],
      });
    });

    it('returns a clear reason when there is no active tab', async () => {
      query.mockResolvedValue([]);
      const result = await createOverlayController().injectActiveTab();
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/active tab/i);
      expect(executeScript).not.toHaveBeenCalled();
    });
  });

  describe('injectAnnotation', () => {
    it('injects the on-demand annotation surface into the given tab', async () => {
      const result = await createOverlayController().injectAnnotation(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: [ANNOTATION_CONTENT_SCRIPT],
      });
    });

    it('does not inject the recorder or overlay (annotation ships Konva only)', async () => {
      await createOverlayController().injectAnnotation(7);
      expect(executeScript).toHaveBeenCalledTimes(1);
    });

    it('returns a handled failure on an invalid tab id, without injecting', async () => {
      const result = await createOverlayController().injectAnnotation(-1);
      expect(result).toEqual({ ok: false, reason: 'invalid tab id: -1' });
      expect(executeScript).not.toHaveBeenCalled();
    });

    it('maps an executeScript rejection to a handled failure', async () => {
      executeScript.mockRejectedValueOnce(new Error('restricted page'));
      const result = await createOverlayController().injectAnnotation(7);
      expect(result).toEqual({ ok: false, reason: 'restricted page' });
    });
  });
});
