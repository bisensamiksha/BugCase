import { describe, expect, it } from 'vitest';

import {
  resolveFinalizeAnnotations,
  CAPTURE_REPORT,
  CAPTURE_VISIBLE_TAB,
  FINALIZE_REPORT,
  INJECT_ANNOTATION,
  OVERLAY_INJECT,
  PEEK_REPORT_ASSET,
  finalizeResponseFrom,
  isCaptureReportRequest,
  isFinalizeReportRequest,
  isInjectAnnotationRequest,
  isOverlayInjectRequest,
  isPeekReportAssetRequest,
} from './messages';

describe('finalizeResponseFrom', () => {
  it('carries downloadId, filename, and byteSize from a successful finalize result', () => {
    expect(
      finalizeResponseFrom({ ok: true, downloadId: 7, filename: 'r.zip', byteSize: 2048 }),
    ).toEqual({ ok: true, downloadId: 7, filename: 'r.zip', byteSize: 2048 });
  });

  it('omits absent optional fields', () => {
    expect(finalizeResponseFrom({ ok: true })).toEqual({ ok: true });
  });

  it('carries the failure reason', () => {
    expect(finalizeResponseFrom({ ok: false, reason: 'expired' })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('isOverlayInjectRequest', () => {
  it('accepts a well-formed overlay inject request', () => {
    expect(isOverlayInjectRequest({ type: OVERLAY_INJECT })).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isOverlayInjectRequest({ type: CAPTURE_VISIBLE_TAB })).toBe(false);
    expect(isOverlayInjectRequest(null)).toBe(false);
    expect(isOverlayInjectRequest('overlay')).toBe(false);
  });
});

describe('isInjectAnnotationRequest', () => {
  it('accepts a well-formed inject-annotation request', () => {
    expect(isInjectAnnotationRequest({ type: INJECT_ANNOTATION })).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isInjectAnnotationRequest({ type: OVERLAY_INJECT })).toBe(false);
    expect(isInjectAnnotationRequest(null)).toBe(false);
    expect(isInjectAnnotationRequest('annotate')).toBe(false);
  });
});

describe('isCaptureReportRequest', () => {
  it('accepts a well-formed capture report request', () => {
    expect(isCaptureReportRequest({ type: CAPTURE_REPORT, metadata: {}, userInput: {} })).toBe(
      true,
    );
  });

  it('rejects other message types and non-objects', () => {
    expect(isCaptureReportRequest({ type: OVERLAY_INJECT })).toBe(false);
    expect(isCaptureReportRequest(undefined)).toBe(false);
    expect(isCaptureReportRequest('capture')).toBe(false);
  });
});

describe('isFinalizeReportRequest', () => {
  it('accepts a well-formed finalize request', () => {
    expect(isFinalizeReportRequest({ type: FINALIZE_REPORT, reportId: 'r1', removedIds: [] })).toBe(
      true,
    );
  });

  it('rejects other message types and non-objects', () => {
    expect(isFinalizeReportRequest({ type: CAPTURE_REPORT })).toBe(false);
    expect(isFinalizeReportRequest(null)).toBe(false);
    expect(isFinalizeReportRequest('finalize')).toBe(false);
  });
});

describe('isPeekReportAssetRequest', () => {
  it('accepts a well-formed peek request', () => {
    expect(
      isPeekReportAssetRequest({ type: PEEK_REPORT_ASSET, reportId: 'r1', path: 'raw/s.png' }),
    ).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isPeekReportAssetRequest({ type: FINALIZE_REPORT })).toBe(false);
    expect(isPeekReportAssetRequest(null)).toBe(false);
    expect(isPeekReportAssetRequest('peek')).toBe(false);
  });
});

describe('resolveFinalizeAnnotations (BUG-05)', () => {
  const one = { konvaJson: '{}', screenshotDataUrl: 'data:image/png;base64,AAA' };

  it('returns the annotations array when present', () => {
    expect(resolveFinalizeAnnotations({ annotations: [one] })).toEqual([one]);
  });

  it('accepts the deprecated single-annotation field rather than dropping it', () => {
    // A dropped annotation zips the ORIGINAL screenshot and still reports ok:true — a silent leak.
    expect(resolveFinalizeAnnotations({ annotation: one })).toEqual([one]);
  });

  it('prefers the array when both are somehow present', () => {
    const other = { konvaJson: '{"b":1}', screenshotDataUrl: 'data:image/png;base64,BBB' };
    expect(resolveFinalizeAnnotations({ annotations: [other], annotation: one })).toEqual([other]);
  });

  it('returns an empty list when neither is present', () => {
    expect(resolveFinalizeAnnotations({})).toEqual([]);
  });

  it('falls back to the single field when the array is empty', () => {
    expect(resolveFinalizeAnnotations({ annotations: [], annotation: one })).toEqual([one]);
  });
});
