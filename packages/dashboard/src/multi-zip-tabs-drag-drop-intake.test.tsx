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
function all(selector: string): Element[] {
  return Array.from(container.querySelectorAll(selector));
}

const zip = (name: string): File =>
  new File([new Uint8Array([1])], name, { type: 'application/zip' });

const report = (id: string, title: string): BugReportV1 =>
  ({
    schemaVersion: 'v1',
    metadata: { id, page: { title, origin: null } },
  }) as unknown as BugReportV1;

// Maps a dropped file's name → a distinct report (or an error for "bad.zip").
const read = vi.fn((input: Blob): Promise<ReadReportResult> => {
  const name = (input as File).name;
  if (name === 'bad.zip') {
    return Promise.resolve({ ok: false, error: 'File is not a valid ZIP archive' });
  }
  const map: Record<string, [string, string]> = {
    'a.zip': ['report-a', 'Alpha'],
    'b.zip': ['report-b', 'Bravo'],
    'c.zip': ['report-c', 'Charlie'],
  };
  const [id, title] = map[name] ?? [name, name];
  return Promise.resolve({ ok: true, source: fakeReportSource(report(id, title)) });
});

function dropOn(testId: string, files: File[]): void {
  const node = q(testId);
  if (!node) throw new Error(`${testId} not found`);
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  node.dispatchEvent(event);
}

function renderApp(): void {
  read.mockClear();
  act(() => {
    root.render(<App read={read} />);
  });
}

async function flushLazyPane(): Promise<void> {
  // Panes are lazy chunks (S4-05); drain the dynamic import + its Suspense re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function drop(testId: string, files: File[]): Promise<void> {
  await act(async () => {
    dropOn(testId, files);
    await Promise.resolve();
    await Promise.resolve();
  });
  await flushLazyPane();
}

/** Set the hash + fire hashchange, mirroring what an anchor-click navigation does. */
async function navigate(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
    await Promise.resolve();
  });
  await flushLazyPane();
}

describe('multi-ZIP tabs + drag-drop intake', () => {
  it('opens one tab per dropped ZIP and shows the active report', async () => {
    renderApp();
    expect(q('dropzone')).not.toBeNull();

    await drop('dropzone', [zip('a.zip'), zip('b.zip')]);

    expect(read).toHaveBeenCalledTimes(2);
    expect(q('report-tab-report-a')).not.toBeNull();
    expect(q('report-tab-report-b')).not.toBeNull();
    // The active report renders in the (default overview) pane.
    expect(q('pane-overview')?.textContent).toContain('report-a');
    // Tabs are mounted into the S4-01 top-bar slot.
    expect(q('app-topbar-slot')?.contains(q('report-tab-report-a'))).toBe(true);
  });

  it('dedupes by capture id — re-dropping the same report focuses the existing tab', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip')]);
    await drop('app-content-dropzone', [zip('a.zip')]);

    expect(all('[data-testid^="report-tab-report-"]')).toHaveLength(1);
  });

  it('switches the active report when the tab hash changes, preserving the pane', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip'), zip('b.zip')]);

    // Each tab is an href that carries pane + reportId.
    expect(q('report-tab-report-b')?.getAttribute('href')).toBe('#/overview/report-b');

    await navigate('#/console/report-b');
    expect(q('console-pane')).not.toBeNull();
    expect(q('report-tab-report-b')?.getAttribute('aria-current')).toBe('page');
  });

  it('closes the active tab and activates a neighbor', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip'), zip('b.zip')]);
    // report-a is active (first opened).
    expect(q('pane-overview')?.textContent).toContain('report-a');

    await act(async () => {
      (q('report-tab-close-report-a') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(q('report-tab-report-a')).toBeNull();
    expect(q('pane-overview')?.textContent).toContain('report-b');
  });

  it('returns to the empty dropzone when the last tab is closed', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip')]);

    await act(async () => {
      (q('report-tab-close-report-a') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(q('dropzone')).not.toBeNull();
    expect(q('empty')).not.toBeNull();
    expect(q('report-tab-report-a')).toBeNull();
  });

  it('reorders tabs via native drag-and-drop', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip'), zip('b.zip'), zip('c.zip')]);
    expect(
      all('[data-testid^="report-tab-report-"]').map((e) => e.getAttribute('data-testid')),
    ).toEqual(['report-tab-report-a', 'report-tab-report-b', 'report-tab-report-c']);

    const dt = {
      data: {} as Record<string, string>,
      setData(k: string, v: string) {
        this.data[k] = v;
      },
      getData(k: string) {
        return this.data[k];
      },
    };
    const fire = (testId: string, type: string) => {
      const node = q(testId)!;
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      act(() => {
        node.dispatchEvent(ev);
      });
    };
    // Drag the last tab (c) onto the first (a) → c moves before a.
    fire('report-tab-report-c', 'dragstart');
    fire('report-tab-report-a', 'dragover');
    fire('report-tab-report-a', 'drop');

    expect(
      all('[data-testid^="report-tab-report-"]').map((e) => e.getAttribute('data-testid')),
    ).toEqual(['report-tab-report-c', 'report-tab-report-a', 'report-tab-report-b']);
  });

  it('surfaces an error for a bad ZIP but still opens the valid ones in the batch', async () => {
    renderApp();
    await drop('dropzone', [zip('a.zip'), zip('bad.zip')]);

    expect(q('report-tab-report-a')).not.toBeNull();
    expect(q('error')?.textContent).toContain('not a valid ZIP');
  });

  it('keeps the file input in the tab order (S4-27)', () => {
    renderApp();

    const input = q('dropzone')!.querySelector<HTMLInputElement>('input[type="file"]')!;

    // `hidden` (display:none) removes an element from the tab order entirely; `sr-only` does not.
    // This is the dashboard's only entry point, so a non-focusable input locks keyboard users out.
    //
    // jsdom has no layout/CSS engine — it never loads the compiled Tailwind stylesheet that gives
    // `hidden` its `display:none`, so `.focus()`/`activeElement` below succeeds regardless of which
    // class is present and can NOT, on its own, distinguish `hidden` from `sr-only` (confirmed by
    // mutation testing: reverting to `className="hidden"` left this assertion green). It is kept
    // because it still guards a different regression class jsdom CAN see — a stray `disabled` or
    // `tabIndex={-1}` — but the className assertions below are the actually load-bearing check for
    // this ticket's hidden-vs-sr-only distinction. Real visibility and real Tab traversal belong to
    // the Playwright/axe task later in this ticket.
    input.focus();
    expect(document.activeElement).toBe(input);

    expect(input.className).not.toContain('hidden');
    expect(input.className).toContain('sr-only');
  });

  it('labels the file input so its purpose is announced (S4-27)', () => {
    renderApp();

    const input = q('dropzone')!.querySelector<HTMLInputElement>('input[type="file"]')!;

    expect(input.getAttribute('id')).toBe('dropzone-file-input');
    const label = container.querySelector<HTMLLabelElement>('label[for="dropzone-file-input"]');
    expect(label?.textContent).toContain('choose files');
  });

  it('gives the sr-only file input a visible focus indicator via the peer pattern (S4-27)', () => {
    renderApp();

    const input = q('dropzone')!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const label = container.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)!;

    // jsdom loads no CSS (confirmed above for the hidden-vs-sr-only check), so it can't render the
    // ring or prove Tab lands on this input with visible styling in a real browser — that
    // verification belongs to the Playwright/axe task later in this ticket. What IS verifiable
    // here, statically, is the wiring the "peer" pattern depends on:
    //   1. the input carries the `peer` marker class;
    //   2. the label carries a `peer-focus-visible:` utility that targets it;
    //   3. — load-bearing and easy to get backwards — Tailwind's `peer` variant compiles to
    //      `.peer:focus-visible ~ &`, a general-sibling selector that only matches LATER siblings,
    //      so the input must precede the label in DOM order or the rule silently never fires.
    expect(input.className).toContain('peer');
    expect(label.className).toMatch(/peer-focus-visible:/);
    expect(input.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
