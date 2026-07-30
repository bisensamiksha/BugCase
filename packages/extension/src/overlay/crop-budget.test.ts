import { describe, expect, it } from 'vitest';

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

import {
  CROP_BUDGET_BYTES,
  dataUrlBytes,
  fitInspectionToBudget,
  formatBudgetNotice,
  usedCropBytes,
} from './crop-budget';

/** Build an inspection whose crop decodes to approximately `bytes` bytes. */
function inspectionOfSize(bytes: number): CaptureElementInspection {
  // 4 base64 chars encode 3 bytes; pad to a multiple of 4 so there is no '=' padding to discount.
  const base64 = 'A'.repeat(Math.ceil(bytes / 3) * 4);
  return {
    outerHtml: '<button>Pay</button>',
    computedStyles: { color: 'rgb(0, 0, 0)' },
    boundingClientRect: { x: 0, y: 0, width: 10, height: 10 },
    ancestors: [],
    cropDataUrl: `data:image/png;base64,${base64}`,
  };
}

describe('dataUrlBytes', () => {
  it('returns the decoded byte length of a base64 data url', () => {
    // 'AAAA' is 4 base64 chars => 3 bytes.
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
  });

  it('discounts padding characters', () => {
    expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1);
  });

  it('returns 0 for an empty or non-base64 url', () => {
    expect(dataUrlBytes('')).toBe(0);
    expect(dataUrlBytes('https://example.com/x.png')).toBe(0);
  });
});

describe('usedCropBytes', () => {
  it('sums crop sizes and ignores inspections without an image', () => {
    const withCrop = inspectionOfSize(300);
    const withoutCrop: CaptureElementInspection = { ...withCrop, cropDataUrl: null };
    expect(usedCropBytes([withCrop, withoutCrop])).toBe(dataUrlBytes(withCrop.cropDataUrl!));
  });

  it('returns 0 for no inspections', () => {
    expect(usedCropBytes([])).toBe(0);
  });
});

describe('fitInspectionToBudget', () => {
  it('keeps the image when it fits', () => {
    const incoming = inspectionOfSize(1000);
    const fit = fitInspectionToBudget([], incoming);
    expect(fit.dropped).toBe(false);
    expect(fit.inspection.cropDataUrl).toBe(incoming.cropDataUrl);
  });

  it('drops only the image when the crop does not fit, keeping structural data', () => {
    const existing = [inspectionOfSize(900)];
    const incoming = inspectionOfSize(300);
    const fit = fitInspectionToBudget(existing, incoming, 1000);
    expect(fit.dropped).toBe(true);
    expect(fit.inspection.cropDataUrl).toBeNull();
    expect(fit.inspection.outerHtml).toBe(incoming.outerHtml);
    expect(fit.inspection.computedStyles).toEqual(incoming.computedStyles);
    expect(fit.inspection.ancestors).toEqual(incoming.ancestors);
  });

  it('drops a single crop that is larger than the whole budget', () => {
    const fit = fitInspectionToBudget([], inspectionOfSize(5000), 1000);
    expect(fit.dropped).toBe(true);
    expect(fit.inspection.cropDataUrl).toBeNull();
  });

  it('passes through an inspection that never had an image', () => {
    const incoming: CaptureElementInspection = {
      ...inspectionOfSize(10),
      cropDataUrl: null,
    };
    const fit = fitInspectionToBudget([], incoming, 1000);
    expect(fit.dropped).toBe(false);
    expect(fit.inspection.cropDataUrl).toBeNull();
  });

  it('defaults to the 8 MB budget', () => {
    expect(CROP_BUDGET_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe('formatBudgetNotice', () => {
  it('reports the crop size, the remaining space and the limit', () => {
    const fit = fitInspectionToBudget([inspectionOfSize(900)], inspectionOfSize(300), 1000);
    const notice = formatBudgetNotice(fit);
    expect(notice).toContain('Added without its image');
    expect(notice).toContain('limit');
  });
});
