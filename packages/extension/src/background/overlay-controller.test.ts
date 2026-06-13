import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeScript, query } = vi.hoisted(() => ({
  executeScript: vi.fn(),
  query: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({
  default: { scripting: { executeScript }, tabs: { query } },
}));

import { OVERLAY_CONTENT_SCRIPT, createOverlayController } from './overlay-controller';

describe('createOverlayController', () => {
  beforeEach(() => {
    executeScript.mockReset();
    query.mockReset();
    executeScript.mockResolvedValue([{ result: undefined }]);
  });

  describe('inject', () => {
    it('injects the overlay content script into the given tab only', async () => {
      const result = await createOverlayController().inject(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledTimes(1);
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

  describe('remove', () => {
    it('removes the overlay from the given tab via an injected function', async () => {
      const result = await createOverlayController().remove(7);
      expect(result).toEqual({ ok: true });
      expect(executeScript).toHaveBeenCalledTimes(1);
      const injection = executeScript.mock.calls[0]?.[0] as
        | { target?: { tabId?: number }; func?: unknown }
        | undefined;
      expect(injection?.target).toEqual({ tabId: 7 });
      expect(typeof injection?.func).toBe('function');
    });
  });
});
