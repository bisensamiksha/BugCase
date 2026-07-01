// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PreviewApp's default finalize reaches lib/browser; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { PreviewApp } from './PreviewApp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

    expect(finalize).toHaveBeenCalledWith('r1', ['console']);
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
});
