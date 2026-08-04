// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { ReadReportResult } from './lib/read-report-zip';
import { fakeReportSource } from './test-utils/fake-report-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Panes are lazy chunks (S4-05); preload them so React.lazy resolves within one Suspense flush.
beforeAll(async () => {
  await Promise.all([
    import('./panes/OverviewPane'),
    import('./panes/ConsolePane'),
    import('./panes/NetworkPane'),
    import('./panes/ScreenshotsPane'),
    import('./panes/DomPane'),
    import('./panes/ElementInspectionsPane'),
    import('./panes/ReproductionPane'),
    import('./panes/StoragePane'),
    import('./panes/PrivacyPane'),
    import('./panes/PanePlaceholder'),
  ]);
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  window.location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  window.location.hash = '';
});

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function dropFile(node: Element, file: File): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  node.dispatchEvent(event);
}

const zipFile = (): File =>
  new File([new Uint8Array([1, 2, 3])], 'report.zip', { type: 'application/zip' });

/** Render <App> and load a report synchronously via an injected reader. */
async function renderLoaded(report: BugReportV1): Promise<void> {
  const read = vi.fn((_input: Blob) =>
    Promise.resolve<ReadReportResult>({ ok: true, source: fakeReportSource(report) }),
  );
  act(() => {
    root.render(<App read={read} />);
  });
  const dropzone = q('dropzone');
  if (!dropzone) {
    throw new Error('dropzone not found');
  }
  await act(async () => {
    dropFile(dropzone, zipFile());
    await Promise.resolve();
  });
  // Panes are lazy chunks (S4-05); flush the dynamic import + its Suspense re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const reportWith = (extra: Partial<BugReportV1>): BugReportV1 =>
  ({ schemaVersion: 'v1', metadata: { id: 'abc-123' }, ...extra }) as unknown as BugReportV1;

describe('dashboard layout shell', () => {
  it('renders the top bar, side nav for all nine panes, and the dropzone when empty', () => {
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    expect(q('app-topbar')).not.toBeNull();
    expect(q('app-sidenav')).not.toBeNull();
    for (const pane of [
      'overview',
      'screenshots',
      'console',
      'network',
      'dom',
      'inspections',
      'reproduction',
      'storage',
      'privacy',
    ]) {
      expect(q(`nav-${pane}`)).not.toBeNull();
    }
    // Persistent shell: the dropzone/empty state lives in the content area until a report loads.
    expect(q('dropzone')).not.toBeNull();
    expect(q('empty')).not.toBeNull();
  });

  it('marks the pane from the current hash as aria-current="page"', () => {
    window.location.hash = '#/console';
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    expect(q('nav-console')?.getAttribute('aria-current')).toBe('page');
    expect(q('nav-overview')?.getAttribute('aria-current')).toBeNull();
  });

  it('falls back to the overview pane for an unknown hash', () => {
    window.location.hash = '#/bogus';
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    expect(q('nav-overview')?.getAttribute('aria-current')).toBe('page');
  });

  it('renders the overview pane with the report capture id once loaded', async () => {
    window.location.hash = '#/overview';
    await renderLoaded(reportWith({}));

    const overview = q('pane-overview');
    expect(overview).not.toBeNull();
    expect(overview?.textContent).toContain('abc-123');
  });

  it('renders the console table in the console pane once loaded', async () => {
    window.location.hash = '#/console';
    await renderLoaded(reportWith({}));

    expect(q('console-pane')).not.toBeNull();
    expect(q('pane-overview')).toBeNull();
  });

  it('renders the privacy pane on #/privacy', async () => {
    window.location.hash = '#/privacy';
    await renderLoaded(reportWith({}));

    expect(q('privacy-pane')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
    expect(q('console-pane')).toBeNull();
  });

  it('renders the storage pane on #/storage', async () => {
    window.location.hash = '#/storage';
    await renderLoaded(reportWith({ cookies: null, storage: null }));

    expect(q('storage-pane')).not.toBeNull();
    expect(q('storage-empty')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
  });

  it('renders the reproduction pane on #/reproduction', async () => {
    window.location.hash = '#/reproduction';
    await renderLoaded(reportWith({ reproduction: null }));

    expect(q('reproduction-pane')).not.toBeNull();
    expect(q('repro-empty')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
  });

  it('renders the element inspections pane on #/inspections', async () => {
    window.location.hash = '#/inspections';
    await renderLoaded(reportWith({ elementInspections: null }));

    expect(q('element-inspections-pane')).not.toBeNull();
    expect(q('inspections-empty')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
  });

  it('renders the DOM snapshot pane (empty state) once loaded', async () => {
    window.location.hash = '#/dom';
    await renderLoaded(reportWith({ dom: null }));

    expect(q('dom-snapshot-pane')).not.toBeNull();
    expect(q('dom-empty')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
  });

  it('threads the ?el= deep-link into the DOM pane (S4-11 seam)', async () => {
    window.location.hash = '#/dom';
    const report = reportWith({
      dom: {
        schemaVersion: 'v1',
        contentPath: 'raw/dom-snapshot.html',
        byteSize: 24,
        scrubbed: false,
        scrubberHits: 0,
      },
    });
    const source = {
      ...fakeReportSource(report),
      readText: () => Promise.resolve('<main id="root">x</main>'),
    };
    const read = vi.fn((_input: Blob) => Promise.resolve<ReadReportResult>({ ok: true, source }));
    act(() => {
      root.render(<App read={read} />);
    });
    await act(async () => {
      dropFile(q('dropzone')!, zipFile());
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Deep-link fires while the report is open — exactly how S4-11 will link to an element.
    await act(async () => {
      window.location.hash = '#/dom/abc-123?el=%23root';
      window.dispatchEvent(new Event('hashchange'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect((q('dom-search-input') as HTMLInputElement).value).toBe('#root');
    expect(q('dom-match-count')?.textContent).toContain('1 of 1');
  });

  it('renders the screenshots pane once loaded', async () => {
    window.location.hash = '#/screenshots';
    await renderLoaded(reportWith({}));

    expect(q('screenshots-pane')).not.toBeNull();
    expect(q('pane-placeholder')).toBeNull();
  });

  it('switches panes reactively on hashchange without re-loading the report', async () => {
    window.location.hash = '#/overview';
    await renderLoaded(reportWith({}));
    expect(q('pane-overview')).not.toBeNull();

    await act(async () => {
      window.location.hash = '#/network';
      window.dispatchEvent(new Event('hashchange'));
      await Promise.resolve();
    });

    expect(q('network-pane')).not.toBeNull();
    expect(q('pane-overview')).toBeNull();
  });

  it('offers a skip link as the first focusable element', () => {
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    const skip = q('skip-to-content') as HTMLElement | null;
    expect(skip).not.toBeNull();
    expect(skip!.getAttribute('href')).toBe('#main');
    // It must precede the nav in DOM order or it cannot do its job.
    const nav = q('app-sidenav')!;
    expect(skip!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the content region an id and makes it programmatically focusable', () => {
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    const main = q('app-content') as HTMLElement | null;
    expect(main!.id).toBe('main');
    expect(main!.tabIndex).toBe(-1);
  });

  it('marks the banner and contentinfo landmarks', () => {
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    expect(q('app-topbar')!.getAttribute('role')).toBe('banner');
    expect(q('legal-footer')!.getAttribute('role')).toBe('contentinfo');
  });

  it('exposes a polite live region for route announcements', () => {
    act(() => {
      root.render(<App read={vi.fn()} />);
    });

    const live = q('route-announcer') as HTMLElement | null;
    expect(live!.getAttribute('role')).toBe('status');
    expect(live!.className).toContain('sr-only');
  });

  it('activates the skip link without letting the hash router reset the route', async () => {
    window.location.hash = '#/network';
    act(() => {
      root.render(<App read={vi.fn()} />);
    });
    expect(q('nav-network')?.getAttribute('aria-current')).toBe('page');

    const skip = q('skip-to-content') as HTMLAnchorElement;
    await act(async () => {
      skip.click();
      // jsdom defers an anchor's default navigation via setTimeout(0) (verified directly against
      // jsdom's HTMLHyperlinkElementUtils-impl.js). Flush it so an unguarded click would already
      // have let `#main` reach the hash router by the time we assert — parseHash treats an
      // unrecognized fragment like '#main' as unknown and falls back to Overview, discarding the
      // active pane and, via App's tab lookup, the active report tab (S4-27 review finding).
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(window.location.hash).toBe('#/network');
    expect(q('nav-network')?.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(q('app-content'));
  });
});
