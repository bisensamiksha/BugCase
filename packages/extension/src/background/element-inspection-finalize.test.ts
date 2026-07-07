import { ElementInspectionsManifestSchema } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  buildElementInspections,
  type CaptureElementInspection,
} from './element-inspection-finalize';

function raw(overrides: Partial<CaptureElementInspection> = {}): CaptureElementInspection {
  return {
    outerHtml: '<button id="go">Go</button>',
    computedStyles: { display: 'flex' },
    boundingClientRect: { x: 10, y: 20, width: 100, height: 40 },
    ancestors: [{ tag: 'section', id: null, classes: ['a'] }],
    cropDataUrl: 'data:image/png;base64,AAAA',
    ...overrides,
  };
}

const fakeBlob = (): Blob => new Blob([new Uint8Array([1])], { type: 'image/png' });

describe('buildElementInspections', () => {
  it('assigns ids + crop paths, emits crop files and elementCrops refs', () => {
    let n = 0;
    const built = buildElementInspections([raw(), raw()], {
      newId: () => `id-${n++}`,
      toBlob: () => fakeBlob(),
    });
    expect(built).not.toBeNull();
    expect(built?.manifest.inspections.map((i) => i.id)).toEqual(['id-0', 'id-1']);
    expect(built?.manifest.inspections[0]?.screenshotCropPath).toBe(
      'screenshots/crops/element-1.png',
    );
    expect(built?.manifest.inspections[1]?.screenshotCropPath).toBe(
      'screenshots/crops/element-2.png',
    );
    expect([...(built?.cropFiles.keys() ?? [])]).toEqual([
      'screenshots/crops/element-1.png',
      'screenshots/crops/element-2.png',
    ]);
    expect(built?.elementCrops[0]).toMatchObject({
      path: 'screenshots/crops/element-1.png',
      width: 100,
      height: 40,
    });
  });

  it('leaves screenshotCropPath empty + writes no file when a crop is missing', () => {
    const built = buildElementInspections([raw({ cropDataUrl: null })], {
      toBlob: () => fakeBlob(),
    });
    expect(built?.manifest.inspections[0]?.screenshotCropPath).toBe('');
    expect(built?.cropFiles.size).toBe(0);
    expect(built?.elementCrops).toHaveLength(0);
  });

  it('returns null for no inspections (so report.elementInspections stays null)', () => {
    expect(buildElementInspections([], {})).toBeNull();
  });

  it('produces a schema-valid manifest', () => {
    const built = buildElementInspections([raw()], { newId: () => 'x', toBlob: () => fakeBlob() });
    expect(() => ElementInspectionsManifestSchema.parse(built?.manifest)).not.toThrow();
  });
});
