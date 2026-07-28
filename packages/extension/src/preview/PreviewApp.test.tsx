// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PreviewApp's default finalize reaches lib/browser; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

// TD-03: PreviewApp no longer imports the Konva canvas — the Annotate action injects it on demand
// through the `annotate` dep, which these tests stub. No react-konva mock is needed here anymore.

import type { Annotation } from '../annotation/tools';

import { PreviewApp } from './PreviewApp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A non-empty annotation shape set, so a Done result reads as "annotated" (BUG-02 empty→cleared logic). */
const sampleShapes: readonly Annotation[] = [
  { type: 'redact', id: 'r1', x: 0, y: 0, width: 10, height: 10 },
];

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function q(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function makeReport(overrides: Partial<BugReportV1> = {}): BugReportV1 {
  return {
    schemaVersion: 'v1',
    metadata: { page: { origin: 'https://example.com' } },
    userInput: {
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: '',
      severity: 'minor',
      notes: '',
    },
    screenshots: { schemaVersion: 'v1', elementCrops: [] },
    browser: null,
    console: { schemaVersion: 'v1', entries: [], truncated: false, bufferSize: 200 },
    network: null,
    dom: null,
    storage: null,
    cookies: null,
    navigation: null,
    reproduction: null,
    elementInspections: null,
    ...overrides,
  } as unknown as BugReportV1;
}

describe('PreviewApp', () => {
  it('renders the scaffold with the artifact list', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    expect(q('preview-review-screen-scaffold')).not.toBeNull();
    expect(q('artifact-console')).not.toBeNull();
    expect(q('artifact-network')?.textContent).toContain('Not captured');
  });

  it('warns on the review screen that screenshots/crops are not scrubbed', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    const note = q('review-image-disclosure');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/not .*scrubbed/i);
    expect(note?.textContent).toMatch(/Annotate/);
  });

  it('keeps the service worker alive while mounted and stops it on unmount', () => {
    const stop = vi.fn();
    const keepAlive = vi.fn(() => ({ stop }));
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
          keepAlive={keepAlive}
        />,
      );
    });
    expect(keepAlive).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('disables View for an artifact with no viewer that was not captured', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    // dom is not JSON-viewable (it gets its own viewer in S3-04) and is not captured here.
    expect((q('view-dom') as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens the privacy consent modal from Download without finalizing yet', () => {
    const finalize = vi.fn(() => Promise.resolve({ ok: true, downloadId: 1, filename: 'f.zip' }));
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          finalize={finalize}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('privacy-notice-modal')).not.toBeNull();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('cancels the consent modal back to the review screen without downloading', () => {
    const finalize = vi.fn(() => Promise.resolve({ ok: true, downloadId: 1, filename: 'f.zip' }));
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          finalize={finalize}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('privacy-cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('privacy-notice-modal')).toBeNull();
    expect(q('preview-review-screen-scaffold')).not.toBeNull();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('surfaces the capture privacy summary inside the consent modal', () => {
    const report = makeReport({
      metadata: {
        page: { origin: 'https://example.com' },
        permissionsAtCapture: [{ name: 'cookies', grantedAtCapture: true }],
        scrubbersApplied: [
          { id: 'dom-password-input-mask', description: 'Mask password inputs', hits: 2 },
        ],
      },
    } as unknown as Partial<BugReportV1>);
    act(() => {
      root.render(
        <PreviewApp reportId="r1" report={report} onCancel={() => {}} onComplete={() => {}} />,
      );
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('privacy-notice-modal')?.textContent).toContain('Mask password inputs');
    expect(q('privacy-permissions')?.textContent).toContain('cookies');
  });

  it('removes an artifact, then finalizes with the removed id after consent', async () => {
    const finalize = vi.fn(() => Promise.resolve({ ok: true, downloadId: 1, filename: 'f.zip' }));
    const onComplete = vi.fn();
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          finalize={finalize}
          onCancel={() => {}}
          onComplete={onComplete}
        />,
      );
    });

    act(() => {
      q('remove-console')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    const dl = Promise.resolve({ ok: true, downloadId: 1, filename: 'f.zip' });
    await act(async () => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await dl;
    });

    // Annotations are a list and inspection removals ride alongside them now (BUG-05).
    expect(finalize).toHaveBeenCalledWith('r1', ['console'], undefined, undefined, undefined);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('records report history after a successful download', async () => {
    const finalize = vi.fn(() =>
      Promise.resolve({ ok: true, downloadId: 5, filename: 'f.zip', byteSize: 2048 }),
    );
    const saveHistory = vi.fn(() => Promise.resolve());
    const report = makeReport();
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={report}
          finalize={finalize}
          saveHistory={saveHistory}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    act(() => {
      q('remove-console')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    const dl = Promise.resolve({ ok: true, downloadId: 5, filename: 'f.zip', byteSize: 2048 });
    await act(async () => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await dl;
      await Promise.resolve();
    });

    expect(saveHistory).toHaveBeenCalledWith({
      report,
      removedIds: ['console'],
      filename: 'f.zip',
      byteSize: 2048,
      downloadId: 5,
    });
  });

  it('still completes the download when recording history fails', async () => {
    const finalize = vi.fn(() =>
      Promise.resolve({ ok: true, downloadId: 5, filename: 'f.zip', byteSize: 2048 }),
    );
    const saveHistory = vi.fn(() => Promise.reject(new Error('storage full')));
    const onComplete = vi.fn();
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          finalize={finalize}
          saveHistory={saveHistory}
          onCancel={() => {}}
          onComplete={onComplete}
        />,
      );
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    const dl = Promise.resolve({ ok: true, downloadId: 5, filename: 'f.zip', byteSize: 2048 });
    await act(async () => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await dl;
      await Promise.resolve();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen and shows the reason when finalize fails after consent', async () => {
    const finalize = vi.fn(() => Promise.resolve({ ok: false, reason: 'expired' }));
    const onComplete = vi.fn();
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          finalize={finalize}
          onCancel={() => {}}
          onComplete={onComplete}
        />,
      );
    });
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    const done = Promise.resolve({ ok: false, reason: 'expired' });
    await act(async () => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await done;
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(q('preview-error')?.textContent).toContain('expired');
  });

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={onCancel}
          onComplete={() => {}}
        />,
      );
    });
    act(() => {
      q('preview-cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens the screenshot lightbox from the screenshot View button', async () => {
    const peekAsset = vi.fn(() =>
      Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,AAAA' }),
    );
    const reportWithShot = makeReport({
      screenshots: {
        schemaVersion: 'v1',
        viewport: {
          path: 'raw/screenshot-viewport.png',
          width: 800,
          height: 600,
          devicePixelRatio: 1,
          captureMethod: 'visibleTab',
          hasAnnotations: false,
        },
        elementCrops: [],
      },
    } as unknown as Partial<BugReportV1>);

    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot}
          peekAsset={peekAsset}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });

    expect((q('view-screenshot') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      q('view-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve(); // flush the peekAsset promise started by the lightbox
    });
    expect(q('lightbox-screenshot-viewer')).not.toBeNull();
    expect(peekAsset).toHaveBeenCalledWith('r1', 'raw/screenshot-viewport.png');
  });

  it('opens the sandboxed DOM viewer from the dom View button', async () => {
    const peekAsset = vi.fn(() =>
      Promise.resolve({
        ok: true,
        dataUrl: `data:text/plain,${encodeURIComponent('<html></html>')}`,
      }),
    );
    const reportWithDom = makeReport({
      dom: {
        schemaVersion: 'v1',
        contentPath: 'raw/dom-snapshot.html',
        byteSize: 10,
        scrubbed: true,
        scrubberHits: 0,
      },
    } as unknown as Partial<BugReportV1>);

    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithDom}
          peekAsset={peekAsset}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });

    expect((q('view-dom') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      q('view-dom')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(q('sandboxed-dom-snapshot-viewer')).not.toBeNull();
    expect(peekAsset).toHaveBeenCalledWith('r1', 'raw/dom-snapshot.html');

    // close returns to the list
    act(() => {
      q('dom-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('preview-review-screen-scaffold')).not.toBeNull();
  });

  it('opens the JSON tree viewer from a JSON artifact View button', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    // metadata is always present and JSON-viewable, so its View is enabled.
    expect((q('view-metadata') as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      q('view-metadata')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('json-tree-viewer')).not.toBeNull();
    // close returns to the list
    act(() => {
      q('json-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('preview-review-screen-scaffold')).not.toBeNull();
  });

  const reportWithShot = () =>
    makeReport({
      screenshots: {
        schemaVersion: 'v1',
        viewport: {
          path: 'raw/screenshot-viewport.png',
          width: 800,
          height: 600,
          devicePixelRatio: 1,
          captureMethod: 'visibleTab',
          hasAnnotations: false,
        },
        elementCrops: [],
      },
    } as unknown as Partial<BugReportV1>);

  it('shows an Annotate action when a screenshot was captured', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    expect((q('annotate-screenshot') as HTMLButtonElement).disabled).toBe(false);
  });

  it('injects the annotation surface via the annotate dep and stores its result', async () => {
    const annotate = vi.fn(() =>
      Promise.resolve({
        konvaJson: '{"a":1}',
        pngDataUrl: 'data:image/png;base64,ANNOT',
        shapes: sampleShapes,
      }),
    );
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(annotate).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1' }));
    expect(q('screenshot-annotated')).not.toBeNull();
    expect(q('annotate-screenshot')!.textContent).toBe('Re-annotate');
  });

  it('leaves state unchanged when the user cancels (null result)', async () => {
    const annotate = vi.fn(() => Promise.resolve(null));
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(annotate).toHaveBeenCalledTimes(1);
    expect(q('screenshot-annotated')).toBeNull();
  });

  it('surfaces an inject failure as an error, without throwing', async () => {
    const annotate = vi.fn(() => Promise.reject(new Error('restricted page')));
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(q('preview-error')!.textContent).toMatch(/restricted page/);
    expect(q('preview-review-screen-scaffold')).not.toBeNull();
  });

  it('forwards a prior annotation result to finalize on download', async () => {
    const annotate = vi.fn(() =>
      Promise.resolve({
        konvaJson: '{"m":1}',
        pngDataUrl: 'data:image/png;base64,PNG',
        shapes: sampleShapes,
      }),
    );
    const finalize = vi.fn(() => Promise.resolve({ ok: true, downloadId: 1, filename: 'f.zip' }));
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          finalize={finalize}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    // Annotate (dep resolves the result).
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    // Download → consent → confirm.
    act(() => {
      q('preview-download')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      (q('privacy-understand') as HTMLInputElement).click();
    });
    await act(async () => {
      q('privacy-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Each annotation is tagged with the screenshot it covers, so crops can be annotated too (BUG-05).
    expect(finalize).toHaveBeenCalledWith(
      'r1',
      [],
      [
        {
          konvaJson: '{"m":1}',
          screenshotDataUrl: 'data:image/png;base64,PNG',
          screenshotPath: 'raw/screenshot-viewport.png',
        },
      ],
      undefined,
      undefined,
    );
  });

  it('reloads prior marks into the canvas on Re-annotate (BUG-02)', async () => {
    const annotate = vi.fn(() =>
      Promise.resolve({ konvaJson: '{"a":1}', pngDataUrl: 'data:png', shapes: sampleShapes }),
    );
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    // Annotate once, then Re-annotate — the second call must carry the prior marks as initialShapes.
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(annotate).toHaveBeenCalledTimes(2);
    expect(annotate).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialShapes: sampleShapes }),
    );
  });

  it('clears the annotation when Re-annotate returns no marks (BUG-02)', async () => {
    let call = 0;
    const annotate = vi.fn(() =>
      Promise.resolve(
        call++ === 0
          ? { konvaJson: '{"a":1}', pngDataUrl: 'data:png', shapes: sampleShapes }
          : { konvaJson: '{}', pngDataUrl: 'data:orig', shapes: [] as readonly Annotation[] },
      ),
    );
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(q('screenshot-annotated')).not.toBeNull();
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(q('screenshot-annotated')).toBeNull();
    expect(q('annotate-screenshot')!.textContent).toBe('Annotate');
  });

  it('removes the annotation via the Remove button (BUG-02)', async () => {
    const annotate = vi.fn(() =>
      Promise.resolve({ konvaJson: '{"a":1}', pngDataUrl: 'data:png', shapes: sampleShapes }),
    );
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(q('screenshot-annotated')).not.toBeNull();
    act(() => {
      q('remove-annotation')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('screenshot-annotated')).toBeNull();
    expect(q('remove-annotation')).toBeNull();
    expect(q('annotate-screenshot')!.textContent).toBe('Annotate');
  });

  it('shows the redacted result in View once annotated (BUG-02)', async () => {
    const peekAsset = vi.fn(() =>
      Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,ORIGINAL' }),
    );
    const annotate = vi.fn(() =>
      Promise.resolve({
        konvaJson: '{"a":1}',
        pngDataUrl: 'data:image/png;base64,REDACTED',
        shapes: sampleShapes,
      }),
    );
    await act(async () => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithShot()}
          annotate={annotate}
          peekAsset={peekAsset}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      q('annotate-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      q('view-screenshot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    // View shows the flattened redacted image, and the SW peek is bypassed (the annotated preview is used).
    expect(q('lightbox-image')?.getAttribute('src')).toBe('data:image/png;base64,REDACTED');
    expect(peekAsset).not.toHaveBeenCalled();
  });
});

describe('PreviewApp — per-element-crop annotate/remove (BUG-05)', () => {
  /** A report with two inspected elements, each with its own crop image. */
  function reportWithInspections() {
    const crop = (n: number) =>
      ({
        path: `raw/element-crop-${n}.png`,
        width: 100,
        height: 40,
        devicePixelRatio: 1,
        captureMethod: 'visibleTab',
        hasAnnotations: false,
      }) as const;
    return makeReport({
      screenshots: { schemaVersion: 'v1', elementCrops: [crop(1), crop(2)] },
      elementInspections: {
        schemaVersion: 'v1',
        inspections: [
          {
            id: 'i1',
            outerHtml: '<input id="password" type="text" value="[scrubbed]">',
            computedStyles: {},
            boundingClientRect: { x: 0, y: 0, width: 100, height: 40 },
            ancestors: [],
            screenshotCropPath: 'raw/element-crop-1.png',
          },
          {
            id: 'i2',
            outerHtml: '<button class="submit-btn">Go</button>',
            computedStyles: {},
            boundingClientRect: { x: 0, y: 0, width: 100, height: 40 },
            ancestors: [],
            screenshotCropPath: 'raw/element-crop-2.png',
          },
        ],
      },
    });
  }

  function renderWith(props: Record<string, unknown> = {}) {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={reportWithInspections()}
          onCancel={() => {}}
          onComplete={() => {}}
          {...props}
        />,
      );
    });
  }

  it('lists one row per inspected element with View, Annotate and Remove', () => {
    renderWith();
    expect(q('element-inspection-rows')).not.toBeNull();
    for (const id of ['i1', 'i2']) {
      expect(q(`inspection-view-${id}`)).not.toBeNull();
      expect(q(`inspection-annotate-${id}`)).not.toBeNull();
      expect(q(`inspection-remove-${id}`)).not.toBeNull();
    }
  });

  it('labels each row with the element it came from', () => {
    renderWith();
    expect(q('inspection-label-i1')?.textContent).toContain('input#password');
    expect(q('inspection-label-i2')?.textContent).toContain('button.submit-btn');
  });

  it('annotates the crop, not the primary screenshot', async () => {
    const annotate = vi.fn((_request: { reportId: string; screenshot: { path: string } }) =>
      Promise.resolve({
        konvaJson: '{"m":1}',
        pngDataUrl: 'data:image/png;base64,CROP',
        shapes: [{}] as unknown as Annotation[],
      }),
    );
    renderWith({ annotate });
    act(() => {
      q('inspection-annotate-i1')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(annotate.mock.calls[0]?.[0]).toMatchObject({
      reportId: 'r1',
      screenshot: { path: 'raw/element-crop-1.png' },
    });
    expect(q('inspection-annotated-i1')).not.toBeNull();
    expect(q('inspection-annotated-i2')).toBeNull();
  });

  it('sends the crop annotation tagged with its own path on download', async () => {
    const annotate = vi.fn((_request: { reportId: string; screenshot: { path: string } }) =>
      Promise.resolve({
        konvaJson: '{"m":1}',
        pngDataUrl: 'data:image/png;base64,CROP',
        shapes: [{}] as unknown as Annotation[],
      }),
    );
    const finalize = vi.fn(
      (
        _reportId: string,
        _removedIds: readonly string[],
        _annotations?: readonly { screenshotPath?: string }[],
        _deps?: unknown,
        _removedInspectionIds?: readonly string[],
      ) => Promise.resolve({ ok: true, filename: 'f.zip' }),
    );
    renderWith({ annotate, finalize, saveHistory: () => Promise.resolve() });
    act(() => {
      q('inspection-annotate-i1')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      q('preview-download')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('privacy-understand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('privacy-confirm')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const sent = finalize.mock.calls[0]?.[2];
    expect(sent).toHaveLength(1);
    expect(sent?.[0]?.screenshotPath).toBe('raw/element-crop-1.png');
  });

  it('marks an inspection removed and sends its id on download', async () => {
    const finalize = vi.fn(
      (
        _reportId: string,
        _removedIds: readonly string[],
        _annotations?: readonly { screenshotPath?: string }[],
        _deps?: unknown,
        _removedInspectionIds?: readonly string[],
      ) => Promise.resolve({ ok: true, filename: 'f.zip' }),
    );
    renderWith({ finalize, saveHistory: () => Promise.resolve() });
    act(() => {
      q('inspection-remove-i2')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(q('inspection-remove-i2')?.textContent).toBe('Restore');
    act(() => {
      q('preview-download')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('privacy-understand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('privacy-confirm')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finalize.mock.calls[0]?.[4]).toEqual(['i2']);
  });

  it('renders no inspection rows when nothing was inspected', () => {
    act(() => {
      root.render(
        <PreviewApp
          reportId="r1"
          report={makeReport()}
          onCancel={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    expect(q('element-inspection-rows')).toBeNull();
  });
});
