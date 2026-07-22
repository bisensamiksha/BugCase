// @vitest-environment jsdom
import type { ScreenshotRef } from '@bugcase/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../lib/browser', () => ({ default: { runtime: { sendMessage } } }));

import { INJECT_ANNOTATION } from '../background/messages';
import { reportAnnotationOutcome } from '../content/annotation-channel';

import { requestAnnotation } from './request-annotation';

const screenshot: ScreenshotRef = {
  path: 'screenshots/viewport.png',
  width: 4,
  height: 4,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
};

describe('requestAnnotation', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('sends INJECT_ANNOTATION and resolves the reported result', async () => {
    sendMessage.mockResolvedValue({ ok: true });
    const promise = requestAnnotation({ reportId: 'r1', screenshot });
    reportAnnotationOutcome(
      { status: 'done', result: { konvaJson: '{}', pngDataUrl: 'data:x', shapes: [] } },
      window,
    );
    await expect(promise).resolves.toEqual({ konvaJson: '{}', pngDataUrl: 'data:x', shapes: [] });
    expect(sendMessage).toHaveBeenCalledWith({ type: INJECT_ANNOTATION });
  });

  it('resolves null when the user cancels', async () => {
    sendMessage.mockResolvedValue({ ok: true });
    const promise = requestAnnotation({ reportId: 'r1', screenshot });
    reportAnnotationOutcome({ status: 'cancel' }, window);
    await expect(promise).resolves.toBeNull();
  });

  it('rejects when the SW reports an inject failure', async () => {
    sendMessage.mockResolvedValue({ ok: false, reason: 'no tab id' });
    await expect(requestAnnotation({ reportId: 'r1', screenshot })).rejects.toThrow('no tab id');
  });
});
