import { describe, expect, it } from 'vitest';

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

import {
  CROP_BUDGET_BYTES,
  dataUrlStoredBytes,
  fitInspectionToBudget,
  formatBudgetNotice,
  usedDraftBytes,
} from './crop-budget';

const DATA_URL_PREFIX = 'data:image/png;base64,';
const SAMPLE_HTML = '<button>Pay</button>';

/** Build an inspection whose crop data URL is exactly `bytes` characters long when stored. */
function inspectionOfSize(bytes: number): CaptureElementInspection {
  const base64 = 'A'.repeat(Math.max(0, bytes - DATA_URL_PREFIX.length));
  return {
    outerHtml: SAMPLE_HTML,
    computedStyles: { color: 'rgb(0, 0, 0)' },
    boundingClientRect: { x: 0, y: 0, width: 10, height: 10 },
    ancestors: [],
    cropDataUrl: `${DATA_URL_PREFIX}${base64}`,
  };
}

describe('dataUrlStoredBytes', () => {
  it('measures the stored string, not the decoded image', () => {
    const url = `${DATA_URL_PREFIX}AAAA`;
    // 'AAAA' decodes to 3 bytes, but storage.session charges the serialized string: 22 + 4 = 26.
    expect(dataUrlStoredBytes(url)).toBe(url.length);
    expect(dataUrlStoredBytes(url)).toBe(26);
  });

  it('does not under-count a large crop the way a decoded measure would', () => {
    const base64 = 'A'.repeat(4000);
    const url = `${DATA_URL_PREFIX}${base64}`;
    // The decoded PNG is only 3000 bytes. Measuring that would under-count by ~4/3, so a draft the
    // budget called "in limits" could still be rejected by storage.set (which is swallowed).
    expect(dataUrlStoredBytes(url)).toBeGreaterThan((base64.length * 3) / 4);
    expect(dataUrlStoredBytes(url)).toBe(url.length);
  });

  it('returns 0 for an empty url', () => {
    expect(dataUrlStoredBytes('')).toBe(0);
  });
});

describe('usedDraftBytes', () => {
  it('counts a crop by its stored characters', () => {
    const withCrop = inspectionOfSize(300);
    expect(usedDraftBytes([withCrop])).toBe(300 + SAMPLE_HTML.length);
  });

  it('still counts the structural data of an inspection with no image', () => {
    const withoutCrop: CaptureElementInspection = {
      ...inspectionOfSize(300),
      cropDataUrl: null,
    };
    expect(usedDraftBytes([withoutCrop])).toBe(SAMPLE_HTML.length);
  });

  it('counts outerHtml, so a large DOM payload consumes the budget too', () => {
    const big: CaptureElementInspection = {
      ...inspectionOfSize(0),
      outerHtml: 'x'.repeat(5000),
      cropDataUrl: null,
    };
    expect(usedDraftBytes([big])).toBe(5000);
  });

  it('returns 0 for no inspections', () => {
    expect(usedDraftBytes([])).toBe(0);
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

  it('drops the image when earlier picks spent the budget on outerHtml alone', () => {
    // No stored crop bytes at all — the budget went entirely on serialized DOM.
    const existing: CaptureElementInspection[] = [
      { ...inspectionOfSize(0), outerHtml: 'x'.repeat(990), cropDataUrl: null },
    ];
    const fit = fitInspectionToBudget(existing, inspectionOfSize(60), 1000);
    expect(fit.dropped).toBe(true);
    expect(fit.remainingBytes).toBe(0);
  });

  it("charges the incoming pick's own outerHtml before its image", () => {
    const incoming: CaptureElementInspection = {
      ...inspectionOfSize(200),
      outerHtml: 'x'.repeat(900),
    };
    const fit = fitInspectionToBudget([], incoming, 1000);
    expect(fit.dropped).toBe(true);
    // 1000 − 900 of structural data leaves 100 for the image, which needs 200.
    expect(fit.remainingBytes).toBe(100);
    expect(fit.cropBytes).toBe(200);
    expect(fit.inspection.outerHtml).toBe(incoming.outerHtml);
  });

  it('defaults to the 8 MB budget', () => {
    expect(CROP_BUDGET_BYTES).toBe(8 * 1024 * 1024);
  });

  it('keeps a full budget of inspections inside the ~10 MB storage.session quota', () => {
    // The whole point of the measure: what the budget admits must actually be storable, or
    // storage.set rejects, saveOverlayDraft swallows it, and the draft silently freezes (BUG-06).
    const STORAGE_SESSION_QUOTA_BYTES = 10 * 1024 * 1024;
    const filled = [inspectionOfSize(CROP_BUDGET_BYTES - SAMPLE_HTML.length)];
    expect(usedDraftBytes(filled)).toBeLessThanOrEqual(CROP_BUDGET_BYTES);
    expect(JSON.stringify(filled).length).toBeLessThan(STORAGE_SESSION_QUOTA_BYTES);
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
