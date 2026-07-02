import { describe, expect, it, vi } from 'vitest';

// The module imports lib/browser; stub the polyfill. The default `show` resolves from
// `browser.downloads?.show`, which is undefined here, so the no-deps path exercises the fallback.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { revealDownload } from './reveal-download';

describe('revealDownload', () => {
  it('calls show with the download id and reports revealed', async () => {
    const show = vi.fn();
    const result = await revealDownload(42, 'report.zip', { show });
    expect(show).toHaveBeenCalledWith(42);
    expect(result).toEqual({ revealed: true, filename: 'report.zip' });
  });

  it('falls back without calling show when the id is null', async () => {
    const show = vi.fn();
    const result = await revealDownload(null, 'report.zip', { show });
    expect(show).not.toHaveBeenCalled();
    expect(result).toEqual({ revealed: false, filename: 'report.zip' });
  });

  it('falls back when show throws (e.g. the download record was purged)', async () => {
    const show = vi.fn(() => {
      throw new Error('no such download');
    });
    const result = await revealDownload(1, 'report.zip', { show });
    expect(result).toEqual({ revealed: false, filename: 'report.zip' });
  });

  it('falls back when show rejects', async () => {
    const show = vi.fn(() => Promise.reject(new Error('denied')));
    const result = await revealDownload(1, 'report.zip', { show });
    expect(result).toEqual({ revealed: false, filename: 'report.zip' });
  });

  it('falls back when no show function is available (default path, no downloads API)', async () => {
    const result = await revealDownload(1, 'report.zip');
    expect(result).toEqual({ revealed: false, filename: 'report.zip' });
  });
});
