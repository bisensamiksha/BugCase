import { describe, expect, it } from 'vitest';

import { CAPTURE_VISIBLE_TAB, OVERLAY_INJECT, isOverlayInjectRequest } from './messages';

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
