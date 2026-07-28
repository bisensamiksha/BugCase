import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// Pulls in dataUrlToBlob's module graph (lib/browser); stub the polyfill for node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { buildAnnotationExport } from './annotation-finalize';

function reportWith(screenshots: unknown): BugReportV1 {
  return { schemaVersion: 'v1', screenshots } as unknown as BugReportV1;
}

const payload = { konvaJson: '{"k":1}', screenshotDataUrl: 'data:image/png;base64,AAAA' };

describe('buildAnnotationExport', () => {
  it('builds an export for the present viewport screenshot', () => {
    const fakeBlob = new Blob(['x']);
    const toBlob = vi.fn(() => fakeBlob);
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: { path: 'screenshots/viewport.png', width: 1, height: 1, devicePixelRatio: 1 },
      elementCrops: [],
    });

    const result = buildAnnotationExport(report, payload, toBlob);

    expect(toBlob).toHaveBeenCalledWith('data:image/png;base64,AAAA');
    expect(result).toEqual({
      screenshotPath: 'screenshots/viewport.png',
      annotatedScreenshot: fakeBlob,
      annotationFile: {
        schemaVersion: 'v1',
        screenshotPath: 'screenshots/viewport.png',
        konvaJson: '{"k":1}',
      },
    });
  });

  it('falls back to the full-page screenshot path', () => {
    const report = reportWith({
      schemaVersion: 'v1',
      fullPage: { path: 'screenshots/full-page.png', width: 1, height: 1, devicePixelRatio: 1 },
      elementCrops: [],
    });
    const result = buildAnnotationExport(report, payload, () => new Blob(['y']));
    expect(result?.screenshotPath).toBe('screenshots/full-page.png');
  });

  it('returns null when there is no screenshot to annotate', () => {
    const report = reportWith({ schemaVersion: 'v1', elementCrops: [] });
    expect(buildAnnotationExport(report, payload, () => new Blob(['z']))).toBeNull();
  });
});

describe('buildAnnotationExport — explicit target path (BUG-05)', () => {
  it('annotates the element crop when a screenshotPath is supplied', () => {
    const report = {
      screenshots: {
        schemaVersion: 'v1',
        viewport: {
          path: 'screenshots/viewport.png',
          width: 1,
          height: 1,
          devicePixelRatio: 1,
          captureMethod: 'visibleTab',
          hasAnnotations: false,
        },
        elementCrops: [
          {
            path: 'screenshots/element-1.png',
            width: 1,
            height: 1,
            devicePixelRatio: 1,
            captureMethod: 'visibleTab',
            hasAnnotations: false,
          },
        ],
      },
    } as unknown as BugReportV1;

    const result = buildAnnotationExport(
      report,
      {
        konvaJson: '{}',
        screenshotDataUrl: 'data:image/png;base64,AAAA',
        screenshotPath: 'screenshots/element-1.png',
      },
      () => new Blob(),
    );

    expect(result?.screenshotPath).toBe('screenshots/element-1.png');
  });

  it('falls back to the primary screenshot when no path is supplied', () => {
    const report = {
      screenshots: {
        schemaVersion: 'v1',
        viewport: {
          path: 'screenshots/viewport.png',
          width: 1,
          height: 1,
          devicePixelRatio: 1,
          captureMethod: 'visibleTab',
          hasAnnotations: false,
        },
        elementCrops: [],
      },
    } as unknown as BugReportV1;

    const result = buildAnnotationExport(
      report,
      { konvaJson: '{}', screenshotDataUrl: 'data:image/png;base64,AAAA' },
      () => new Blob(),
    );

    expect(result?.screenshotPath).toBe('screenshots/viewport.png');
  });
});
