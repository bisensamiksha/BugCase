import { describe, expect, it, vi } from 'vitest';

import { flattenAnnotatedScreenshot } from './export-annotations';

describe('flattenAnnotatedScreenshot', () => {
  it('rasterizes the stage to a PNG data URL and returns it', () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,FLAT');
    const url = flattenAnnotatedScreenshot({ toDataURL }, 2);
    expect(url).toBe('data:image/png;base64,FLAT');
    expect(toDataURL).toHaveBeenCalledWith({ pixelRatio: 2 });
  });

  it('defaults the pixel ratio to 1', () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,X');
    flattenAnnotatedScreenshot({ toDataURL });
    expect(toDataURL).toHaveBeenCalledWith({ pixelRatio: 1 });
  });
});
