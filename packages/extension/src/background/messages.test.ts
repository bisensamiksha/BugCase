import { describe, expect, it } from 'vitest';

import {
  CAPTURE_REPORT,
  CAPTURE_VISIBLE_TAB,
  FINALIZE_REPORT,
  OVERLAY_INJECT,
  PEEK_REPORT_ASSET,
  isCaptureReportRequest,
  isFinalizeReportRequest,
  isOverlayInjectRequest,
  isPeekReportAssetRequest,
} from './messages';

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
