// @vitest-environment jsdom
import type { ScreenshotRef } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import {
  openAnnotation,
  readAnnotationRequest,
  reportAnnotationOutcome,
  type AnnotationRequest,
} from './annotation-channel';

const screenshot: ScreenshotRef = {
  path: 'screenshots/viewport.png',
  width: 4,
  height: 4,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
};
const request: AnnotationRequest = { reportId: 'r1', screenshot };

describe('annotation-channel', () => {
  it('exposes the stashed request to the annotation side', () => {
    // A pending inject never resolves here — we only assert the request was stashed.
    const injected = new Promise<{ ok: boolean }>(() => {});
    void openAnnotation(request, { inject: () => injected, target: window });
    expect(readAnnotationRequest(window)).toEqual(request);
    reportAnnotationOutcome({ status: 'cancel' }, window); // settle + clean up so the key is cleared
  });

  it('resolves the canvas result on a done outcome and cleans up', async () => {
    const promise = openAnnotation(request, {
      inject: () => Promise.resolve({ ok: true }),
      target: window,
    });
    reportAnnotationOutcome(
      { status: 'done', result: { konvaJson: '{}', pngDataUrl: 'data:x', shapes: [] } },
      window,
    );
    await expect(promise).resolves.toEqual({ konvaJson: '{}', pngDataUrl: 'data:x', shapes: [] });
    expect(readAnnotationRequest(window)).toBeNull();
  });

  it('resolves null on a cancel outcome', async () => {
    const promise = openAnnotation(request, {
      inject: () => Promise.resolve({ ok: true }),
      target: window,
    });
    reportAnnotationOutcome({ status: 'cancel' }, window);
    await expect(promise).resolves.toBeNull();
  });

  it('rejects when the inject fails, without leaving a dangling request', async () => {
    const promise = openAnnotation(request, {
      inject: () => Promise.resolve({ ok: false, reason: 'restricted page' }),
      target: window,
    });
    await expect(promise).rejects.toThrow('restricted page');
    expect(readAnnotationRequest(window)).toBeNull();
  });

  it('ignores a late outcome after inject rejection (settles once)', async () => {
    const onSettled = vi.fn();
    await openAnnotation(request, {
      inject: () => Promise.resolve({ ok: false }),
      target: window,
    }).catch(onSettled);
    reportAnnotationOutcome({ status: 'cancel' }, window); // must be a no-op now
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
