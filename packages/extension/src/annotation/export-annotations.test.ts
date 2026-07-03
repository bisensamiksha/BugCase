import { describe, expect, it, vi } from 'vitest';

import { flattenAnnotatedScreenshot, flattenRedactedScreenshot } from './export-annotations';
import type { MutableImageData } from './redaction';

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

describe('flattenRedactedScreenshot', () => {
  /** A 2×2 secret-filled canvas fake with a real buffer, so we can assert the redaction actually lands. */
  function secretCanvas(marker: string): {
    canvas: {
      width: number;
      height: number;
      getContext: () => {
        getImageData: () => MutableImageData;
        putImageData: (img: MutableImageData) => void;
      };
      toDataURL: (type?: string) => string;
    };
    read: () => MutableImageData;
  } {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i += 1) {
      data[i * 4] = 200;
      data[i * 4 + 1] = 50;
      data[i * 4 + 2] = 50;
      data[i * 4 + 3] = 255;
    }
    const img: MutableImageData = { data, width: 2, height: 2 };
    return {
      canvas: {
        width: 2,
        height: 2,
        getContext: () => ({
          getImageData: () => img,
          putImageData: () => {},
        }),
        toDataURL: (_type?: string) => marker,
      },
      read: () => img,
    };
  }

  it('flattens via toCanvas, bakes the redactions, and returns the canvas PNG data URL', () => {
    const { canvas, read } = secretCanvas('data:image/png;base64,REDACTED');
    const toCanvas = vi.fn(() => canvas);
    const url = flattenRedactedScreenshot({ toCanvas }, 4, [{ x: 0, y: 0, width: 2, height: 2 }]);
    expect(toCanvas).toHaveBeenCalledWith({ pixelRatio: 4 });
    expect(url).toBe('data:image/png;base64,REDACTED');
    // The redaction must be applied to the canvas *before* it is exported.
    expect([...read().data]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  });
});
