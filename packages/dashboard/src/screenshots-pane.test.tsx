// @vitest-environment jsdom
import type { BugReportV1, ScreenshotRef } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReportSource } from './lib/report-source';
import { ScreenshotsPane } from './panes/ScreenshotsPane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shot = (path: string, extra: Partial<ScreenshotRef> = {}): ScreenshotRef => ({
  path,
  width: 800,
  height: 600,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
  ...extra,
});

const konva = JSON.stringify({
  attrs: {},
  className: 'Stage',
  children: [{ attrs: {}, className: 'Layer', children: [{ attrs: {}, className: 'Rect' }] }],
});

function reportWith(screenshots: unknown, annotations: unknown = null): BugReportV1 {
  return {
    schemaVersion: 'v1',
    metadata: { id: 'r1' },
    screenshots,
    annotations,
  } as unknown as BugReportV1;
}

/** ReportSource that serves a stub object URL for the given paths and null otherwise. */
function stubSource(report: BugReportV1, urls: Record<string, string | null>): ReportSource {
  return {
    report,
    readText: () => Promise.resolve(null),
    readBlob: () => Promise.resolve(null),
    objectUrl: (path) => Promise.resolve(path in urls ? urls[path]! : null),
    dispose: () => {},
  };
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`);

async function render(report: BugReportV1, source: ReportSource) {
  await act(async () => {
    root.render(<ScreenshotsPane report={report} reportId="r1" source={source} />);
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ScreenshotsPane', () => {
  it('renders one card per screenshot in fullPage/viewport/crop order', async () => {
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: shot('screenshots/viewport.png'),
      fullPage: shot('screenshots/full.png'),
      elementCrops: [shot('screenshots/crop-0.png')],
    });
    const source = stubSource(report, {
      'screenshots/full.png': 'blob:full',
      'screenshots/viewport.png': 'blob:viewport',
      'screenshots/crop-0.png': 'blob:crop',
    });
    await render(report, source);

    const imgs = qa('screenshot-thumb-img');
    expect(imgs).toHaveLength(3);
    expect(imgs[0]!.getAttribute('src')).toBe('blob:full');
    expect(imgs[1]!.getAttribute('src')).toBe('blob:viewport');
  });

  it('renders the empty state when there are no screenshots', async () => {
    const report = reportWith({ schemaVersion: 'v1', elementCrops: [] });
    await render(report, stubSource(report, {}));
    expect(q('screenshots-empty')).not.toBeNull();
    expect(q('screenshot-card')).toBeNull();
  });

  it('shows "Image unavailable" for a screenshot whose entry is missing (no throw)', async () => {
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: shot('screenshots/viewport.png'),
      elementCrops: [],
    });
    await render(report, stubSource(report, { 'screenshots/viewport.png': null }));
    expect(q('screenshot-unavailable')).not.toBeNull();
    expect(q('screenshot-download')).toBeNull();
  });

  it('renders an annotation summary and ignores malformed konva JSON', async () => {
    const report = reportWith(
      {
        schemaVersion: 'v1',
        viewport: shot('screenshots/viewport.png', { hasAnnotations: true }),
        elementCrops: [],
      },
      {
        schemaVersion: 'v1',
        annotations: [
          { schemaVersion: 'v1', screenshotPath: 'screenshots/viewport.png', konvaJson: konva },
        ],
      },
    );
    await render(report, stubSource(report, { 'screenshots/viewport.png': 'blob:v' }));
    expect(q('screenshot-annotations')?.textContent).toContain('1 annotation · 1 rectangle');

    const bad = reportWith(
      { schemaVersion: 'v1', viewport: shot('screenshots/viewport.png'), elementCrops: [] },
      {
        schemaVersion: 'v1',
        annotations: [
          { schemaVersion: 'v1', screenshotPath: 'screenshots/viewport.png', konvaJson: '{bad' },
        ],
      },
    );
    await render(bad, stubSource(bad, { 'screenshots/viewport.png': 'blob:v' }));
    expect(q('screenshot-annotations')).toBeNull();
  });

  it('exposes a per-image download anchor with the basename filename', async () => {
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: shot('screenshots/viewport.png'),
      elementCrops: [],
    });
    await render(report, stubSource(report, { 'screenshots/viewport.png': 'blob:v' }));
    const dl = q('screenshot-download') as HTMLAnchorElement;
    expect(dl.getAttribute('download')).toBe('viewport.png');
    expect(dl.getAttribute('href')).toBe('blob:v');
  });

  it('opens the lightbox on the thumbnail and closes it on Escape', async () => {
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: shot('screenshots/viewport.png'),
      elementCrops: [],
    });
    await render(report, stubSource(report, { 'screenshots/viewport.png': 'blob:v' }));
    expect(q('lightbox-screenshot-viewer')).toBeNull();
    act(() => {
      q('screenshot-thumb')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(q('lightbox-screenshot-viewer')).not.toBeNull();
    act(() => {
      q('lightbox-screenshot-viewer')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(q('lightbox-screenshot-viewer')).toBeNull();
  });

  it('has no axe violations', async () => {
    const report = reportWith({
      schemaVersion: 'v1',
      viewport: shot('screenshots/viewport.png'),
      elementCrops: [],
    });
    await render(report, stubSource(report, { 'screenshots/viewport.png': 'blob:v' }));
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
