// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadJson } from './export-json';

describe('downloadJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a JSON blob object URL, clicks a download anchor, and revokes the URL', () => {
    let captured: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:mock-url';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('privacy.json', { hello: 'world' });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(captured!.type).toBe('application/json');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download]')).toBeNull(); // anchor removed
  });
});
