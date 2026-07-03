import { describe, expect, it, vi } from 'vitest';

import {
  extractRedactions,
  findNonBlackPixel,
  paintRectsBlack,
  redactCanvas,
  scaleRedactions,
  type MutableImageData,
  type RedactableCanvas,
  type RedactionRect,
} from './redaction';
import type { Annotation } from './tools';

/** Build an RGBA image buffer filled with one colour, for pixel-level assertions. */
function makeImage(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number],
): MutableImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

/** Read a single pixel's RGBA out of an image buffer. */
function pixel(img: MutableImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

const SECRET: [number, number, number, number] = [200, 50, 50, 255];
const BLACK: [number, number, number, number] = [0, 0, 0, 255];

describe('extractRedactions', () => {
  it('returns only the redact shapes as rects', () => {
    const shapes: Annotation[] = [
      { type: 'rect', id: 'a', x: 0, y: 0, width: 5, height: 5, color: '#f00', strokeWidth: 2 },
      { type: 'redact', id: 'b', x: 1, y: 2, width: 3, height: 4 },
      { type: 'text', id: 'c', x: 0, y: 0, text: 'hi', color: '#000', fontSize: 12 },
      { type: 'redact', id: 'd', x: 10, y: 20, width: 30, height: 40 },
    ];
    expect(extractRedactions(shapes)).toEqual([
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 10, y: 20, width: 30, height: 40 },
    ]);
  });

  it('returns an empty array when there are no redactions', () => {
    const shapes: Annotation[] = [
      { type: 'rect', id: 'a', x: 0, y: 0, width: 5, height: 5, color: '#f00', strokeWidth: 2 },
    ];
    expect(extractRedactions(shapes)).toEqual([]);
    expect(extractRedactions([])).toEqual([]);
  });
});

describe('scaleRedactions', () => {
  it('multiplies every coordinate by the scale factor', () => {
    const rects: RedactionRect[] = [{ x: 1, y: 2, width: 3, height: 4 }];
    expect(scaleRedactions(rects, 2)).toEqual([{ x: 2, y: 4, width: 6, height: 8 }]);
  });

  it('leaves coordinates unchanged at scale 1', () => {
    const rects: RedactionRect[] = [{ x: 5, y: 6, width: 7, height: 8 }];
    expect(scaleRedactions(rects, 1)).toEqual(rects);
  });
});

describe('paintRectsBlack', () => {
  it('overwrites every pixel inside the rect with opaque black', () => {
    const img = makeImage(4, 4, SECRET);
    paintRectsBlack(img, [{ x: 1, y: 1, width: 2, height: 2 }]);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      expect(pixel(img, x, y)).toEqual(BLACK);
    }
  });

  it('destroys the secret colour inside the rect (unrecoverable)', () => {
    const img = makeImage(4, 4, SECRET);
    const rect: RedactionRect = { x: 1, y: 1, width: 2, height: 2 };
    paintRectsBlack(img, [rect]);
    expect(findNonBlackPixel(img, rect)).toBeNull();
  });

  it('leaves pixels outside the rect untouched', () => {
    const img = makeImage(4, 4, SECRET);
    paintRectsBlack(img, [{ x: 1, y: 1, width: 2, height: 2 }]);
    expect(pixel(img, 0, 0)).toEqual(SECRET);
    expect(pixel(img, 3, 3)).toEqual(SECRET);
    expect(pixel(img, 0, 3)).toEqual(SECRET);
  });

  it('rounds fractional bounds OUTWARD so no antialiased edge pixel survives', () => {
    const img = makeImage(4, 4, SECRET);
    // left/top floor to 0, right/bottom ceil(1.6)=2 → covers pixels x,y in {0,1}
    paintRectsBlack(img, [{ x: 0.4, y: 0.4, width: 1.2, height: 1.2 }]);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      expect(pixel(img, x, y)).toEqual(BLACK);
    }
    expect(pixel(img, 2, 2)).toEqual(SECRET);
  });

  it('clamps rects that extend beyond the image without throwing', () => {
    const img = makeImage(4, 4, SECRET);
    expect(() => paintRectsBlack(img, [{ x: 3, y: 3, width: 5, height: 5 }])).not.toThrow();
    expect(pixel(img, 3, 3)).toEqual(BLACK);
    expect(pixel(img, 0, 0)).toEqual(SECRET);
  });

  it('is a no-op for a zero-size rect', () => {
    const img = makeImage(2, 2, SECRET);
    paintRectsBlack(img, [{ x: 1, y: 1, width: 0, height: 0 }]);
    expect(pixel(img, 0, 0)).toEqual(SECRET);
    expect(pixel(img, 1, 1)).toEqual(SECRET);
  });
});

describe('findNonBlackPixel', () => {
  it('returns null when the whole region is opaque black', () => {
    const img = makeImage(3, 3, BLACK);
    expect(findNonBlackPixel(img, { x: 0, y: 0, width: 3, height: 3 })).toBeNull();
  });

  it('returns the coordinates of a non-black pixel inside the region', () => {
    const img = makeImage(3, 3, BLACK);
    const i = (1 * 3 + 2) * 4; // pixel (2,1)
    img.data[i] = 10;
    expect(findNonBlackPixel(img, { x: 0, y: 0, width: 3, height: 3 })).toEqual({ x: 2, y: 1 });
  });

  it('ignores non-black pixels outside the region', () => {
    const img = makeImage(3, 3, BLACK);
    const i = 0; // pixel (0,0) — outside the queried rect
    img.data[i] = 255;
    expect(findNonBlackPixel(img, { x: 1, y: 1, width: 2, height: 2 })).toBeNull();
  });

  it('treats a not-fully-opaque black pixel as non-black (opacity matters)', () => {
    const img = makeImage(2, 2, BLACK);
    const i = 0; // pixel (0,0) alpha < 255
    img.data[i + 3] = 254;
    expect(findNonBlackPixel(img, { x: 0, y: 0, width: 2, height: 2 })).toEqual({ x: 0, y: 0 });
  });
});

describe('redactCanvas', () => {
  /** A canvas fake backed by a real RGBA buffer, mirroring getImageData(copy)/putImageData(write-back). */
  function fakeCanvas(img: MutableImageData): RedactableCanvas {
    return {
      width: img.width,
      height: img.height,
      getContext: () => ({
        getImageData: (x, y, w, h) => {
          const copy = new Uint8ClampedArray(w * h * 4);
          for (let row = 0; row < h; row += 1) {
            for (let col = 0; col < w; col += 1) {
              const src = ((y + row) * img.width + (x + col)) * 4;
              const dst = (row * w + col) * 4;
              copy.set(img.data.subarray(src, src + 4), dst);
            }
          }
          return { data: copy, width: w, height: h };
        },
        putImageData: (patch, x, y) => {
          for (let row = 0; row < patch.height; row += 1) {
            for (let col = 0; col < patch.width; col += 1) {
              const src = (row * patch.width + col) * 4;
              const dst = ((y + row) * img.width + (x + col)) * 4;
              img.data.set(patch.data.subarray(src, src + 4), dst);
            }
          }
        },
      }),
    };
  }

  it('blacks out the rects on the canvas buffer via the 2d context', () => {
    const img = makeImage(4, 4, SECRET);
    redactCanvas(fakeCanvas(img), [{ x: 1, y: 1, width: 2, height: 2 }]);
    expect(pixel(img, 1, 1)).toEqual(BLACK);
    expect(pixel(img, 2, 2)).toEqual(BLACK);
    expect(pixel(img, 0, 0)).toEqual(SECRET);
  });

  it('does nothing when there are no rects (no context read)', () => {
    const getContext = vi.fn();
    redactCanvas({ width: 4, height: 4, getContext }, []);
    expect(getContext).not.toHaveBeenCalled();
  });

  it('does not throw when the 2d context is unavailable', () => {
    expect(() =>
      redactCanvas({ width: 4, height: 4, getContext: () => null }, [
        { x: 0, y: 0, width: 1, height: 1 },
      ]),
    ).not.toThrow();
  });
});
