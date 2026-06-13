import { describe, expect, it } from 'vitest';

import {
  CAPTURE_REPORT,
  CAPTURE_VISIBLE_TAB,
  OVERLAY_INJECT,
  isCaptureReportRequest,
  isOverlayInjectRequest,
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
