import type { BugReportV1, ScreenshotRef } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { resolveScreenshot } from './screenshot-source';

const ref = (path: string): ScreenshotRef => ({
  path,
  width: 1,
  height: 1,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
});

const report = (s: Partial<BugReportV1['screenshots']>): BugReportV1 =>
  ({ screenshots: { schemaVersion: 'v1', elementCrops: [], ...s } }) as unknown as BugReportV1;

describe('resolveScreenshot', () => {
  it('prefers the viewport screenshot', () => {
    expect(resolveScreenshot(report({ viewport: ref('v'), fullPage: ref('f') }))?.path).toBe('v');
  });

  it('falls back to fullPage', () => {
    expect(resolveScreenshot(report({ fullPage: ref('f') }))?.path).toBe('f');
  });

  it('falls back to the first element crop', () => {
    expect(resolveScreenshot(report({ elementCrops: [ref('c')] }))?.path).toBe('c');
  });

  it('returns null when there is no screenshot', () => {
    expect(resolveScreenshot(report({}))).toBeNull();
  });
});
