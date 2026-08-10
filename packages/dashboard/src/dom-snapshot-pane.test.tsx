// @vitest-environment jsdom
import type { BugReportV1, DomSnapshot } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReportSource } from './lib/report-source';
import { DomPane } from './panes/DomPane';
import { ACTIVE_MATCH_ATTR } from './panes/dom-search';
import { formatHash } from './router/hash-router';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOT = [
  '<!doctype html><html><head><title>t</title></head><body>',
  '<main id="root"><section class="card featured"><button class="cta">Buy</button></section>',
  '<section class="card"><button class="cta">Try</button></section></main>',
  '</body></html>',
].join('');

const snap = (over: Partial<DomSnapshot> = {}): DomSnapshot => ({
  schemaVersion: 'v1',
  contentPath: 'raw/dom-snapshot.html',
  byteSize: SNAPSHOT.length,
  scrubbed: true,
  scrubberHits: 2,
  ...over,
});

const report = { schemaVersion: 'v1', metadata: { id: 'r1' } } as unknown as BugReportV1;

/** ReportSource serving the snapshot text for its path and null for everything else. */
function stubSource(text: string | null): ReportSource {
  return {
    report,
    readText: (path) => Promise.resolve(path === 'raw/dom-snapshot.html' ? text : null),
    readBlob: () => Promise.resolve(null),
    objectUrl: () => Promise.resolve(null),
    dispose: () => {},
  };
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change, then dispatch `input` (mirrors ConsolePane tests).
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** Flush microtasks/timers until `probe` returns non-null (Shiki loads its grammar async). */
async function until<T>(probe: () => T | null, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found !== null) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error('until(): probe never became non-null');
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function render(
  dom: DomSnapshot | null,
  source: ReportSource,
  initialElementQuery: string | null = null,
) {
  await act(async () => {
    root.render(
      <DomPane dom={dom} reportId="r1" source={source} initialElementQuery={initialElementQuery} />,
    );
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

describe('DomPane', () => {
  it('renders the snapshot in a locked sandbox iframe with the scrub note', async () => {
    await render(snap(), stubSource(SNAPSHOT));
    expect(q('dom-snapshot-pane')).not.toBeNull();
    expect(q('dom-scrub-note')?.textContent).toContain('2 masked');
    const frame = q('dom-preview-frame')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
    // Byte-faithful: with no active match the raw snapshot rides in untouched.
    expect(frame.getAttribute('srcdoc')).toContain('<main id="root">');
    expect(frame.getAttribute('srcdoc')).not.toContain(ACTIVE_MATCH_ATTR);
  });

  it('renders the empty state when the report has no DOM snapshot', async () => {
    await render(null, stubSource(SNAPSHOT));
    expect(q('dom-empty')).not.toBeNull();
    expect(q('dom-preview-frame')).toBeNull();
  });

  it('renders the error state when the ZIP entry is missing (no throw)', async () => {
    await render(snap(), stubSource(null));
    expect(q('async-error')).not.toBeNull();
    expect(q('dom-preview-frame')).toBeNull();
  });

  it('searches elements by CSS selector with prev/next, breadcrumb, snippet, and preview outline', async () => {
    await render(snap(), stubSource(SNAPSHOT));
    typeInto(q('dom-search-input') as HTMLInputElement, 'button.cta');

    expect(q('dom-match-count')?.textContent).toContain('1 of 2');
    expect(q('dom-match-breadcrumb')?.textContent).toBe(
      'main#root > section.card.featured > button.cta',
    );
    expect(q('dom-match-snippet')?.textContent).toContain('Buy');
    // The active match is baked into the srcDoc (the sandbox allows no scripts to do it live).
    expect(q('dom-preview-frame')!.getAttribute('srcdoc')).toContain(ACTIVE_MATCH_ATTR);

    click(q('dom-match-next')!);
    expect(q('dom-match-count')?.textContent).toContain('2 of 2');
    expect(q('dom-match-snippet')?.textContent).toContain('Try');
    // Next wraps around; prev returns.
    click(q('dom-match-next')!);
    expect(q('dom-match-count')?.textContent).toContain('1 of 2');
    click(q('dom-match-prev')!);
    expect(q('dom-match-count')?.textContent).toContain('2 of 2');

    // Clearing the search restores the untouched snapshot.
    typeInto(q('dom-search-input') as HTMLInputElement, '');
    expect(q('dom-match-count')).toBeNull();
    expect(q('dom-preview-frame')!.getAttribute('srcdoc')).not.toContain(ACTIVE_MATCH_ATTR);
  });

  it('reports no matches and an invalid selector without touching the preview', async () => {
    await render(snap(), stubSource(SNAPSHOT));
    typeInto(q('dom-search-input') as HTMLInputElement, '.does-not-exist');
    expect(q('dom-match-count')?.textContent).toContain('0 matches');

    typeInto(q('dom-search-input') as HTMLInputElement, ':::nope');
    const alert = q('dom-search-error')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Invalid CSS selector');
    expect(q('dom-preview-frame')!.getAttribute('srcdoc')).not.toContain(ACTIVE_MATCH_ATTR);
  });

  it('opens at an element from the ?el= deep-link (S4-11 seam)', async () => {
    await render(snap(), stubSource(SNAPSHOT), '#root');
    expect((q('dom-search-input') as HTMLInputElement).value).toBe('#root');
    expect(q('dom-match-count')?.textContent).toContain('1 of 1');
    expect(q('dom-preview-frame')!.getAttribute('srcdoc')).toContain(ACTIVE_MATCH_ATTR);
  });

  it('switches to a Shiki-highlighted source view and back, tabs staying accessible', async () => {
    await render(snap(), stubSource(SNAPSHOT));
    const renderedTab = q('dom-tab-rendered')!;
    const sourceTab = q('dom-tab-source')!;
    expect(renderedTab.getAttribute('aria-selected')).toBe('true');
    expect(sourceTab.getAttribute('aria-selected')).toBe('false');

    click(sourceTab);
    expect(sourceTab.getAttribute('aria-selected')).toBe('true');
    const highlighted = await until(() => q('dom-source-highlighted'));
    expect(highlighted.innerHTML).toContain('shiki');
    // Escaped tokens, never live captured markup in the dashboard DOM.
    expect(highlighted.querySelector('main')).toBeNull();
    expect(highlighted.textContent).toContain('<main id="root">');

    click(renderedTab);
    expect(q('dom-preview-frame')).not.toBeNull();
    expect(q('dom-source-highlighted')).toBeNull();
  });

  it('falls back to plain text above the highlight size cap', async () => {
    const huge = `<html><head></head><body>${'<p>x</p>'.repeat(70_000)}</body></html>`;
    await render(snap({ byteSize: huge.length }), stubSource(huge));
    click(q('dom-tab-source')!);
    const plain = await until(() => q('dom-source-plain'));
    expect(plain.textContent).toContain('<p>x</p>');
    expect(q('dom-source-too-large')).not.toBeNull();
    expect(q('dom-source-highlighted')).toBeNull();
  });

  describe('fidelity notice (S4-32)', () => {
    it('explains the omission in the rendered tab, without reading as an error', async () => {
      await render(snap(), stubSource(SNAPSHOT));
      const notice = q('dom-preview-fidelity-notice');
      expect(notice).not.toBeNull();

      // All three facts a reader needs: what is missing, why, and where appearance lives.
      const text = notice!.textContent ?? '';
      expect(text).toMatch(/stylesheets/i);
      expect(text).toMatch(/images/i);
      expect(text).toMatch(/never contacts/i);
      expect(text).toMatch(/screenshots/i);

      // This is the product working correctly, not a failure. Announcing it as an alert would
      // interrupt screen-reader users and reinforce the exact misreading the notice exists to fix.
      expect(notice!.getAttribute('role')).toBeNull();
      expect(notice!.closest('[role="alert"]')).toBeNull();
    });

    it('links to the Screenshots pane through the hash router, keeping the report id', async () => {
      await render(snap(), stubSource(SNAPSHOT));
      const link = q('dom-preview-fidelity-notice')?.querySelector('a');
      expect(link).not.toBeNull();
      // Built from formatHash, not hand-written, so a route-format change cannot strand it.
      expect(link!.getAttribute('href')).toBe(
        formatHash({ activePane: 'screenshots', reportId: 'r1' }),
      );
    });

    it('is absent from the Source tab, where it would be meaningless', async () => {
      await render(snap(), stubSource(SNAPSHOT));
      click(q('dom-tab-source')!);
      await until(() => q('dom-source-highlighted') ?? q('dom-source-plain'));
      expect(q('dom-preview-fidelity-notice')).toBeNull();
    });

    it('does not squeeze the preview frame out of the panel', async () => {
      await render(snap(), stubSource(SNAPSHOT));
      // The notice shares the tabpanel with the frame; the frame must still be rendered and
      // flex-sized rather than collapsed by the added sibling.
      const panel = document.getElementById('dom-panel-rendered');
      expect(panel?.querySelector('[data-testid="dom-preview-frame"]')).not.toBeNull();
      expect(panel?.className).toContain('flex-1');
    });
  });

  describe('inactive tab panel (BUG-07)', () => {
    // Tailwind preflight's `[hidden]:where(:not([hidden="until-found"])){display:none}` ties with
    // any display utility at specificity (0,1,0) — `:where()` counts zero — and loses on source
    // order, so a `flex` left on a hidden panel keeps it laid out as an empty `flex-1` box.
    //
    // jsdom cannot see this: its `getComputedStyle` special-cases the `hidden` attribute and
    // answers `display: none` whatever the stylesheet says, so asserting computed display here
    // would pass with the bug present. The class list is the part jsdom can honestly check; the
    // rendered geometry is covered in a real engine by tests/e2e/dom-source-tab-layout.spec.ts.
    const DISPLAY_UTILITIES = new Set([
      'block',
      'inline-block',
      'inline',
      'flex',
      'inline-flex',
      'table',
      'inline-table',
      'grid',
      'inline-grid',
      'contents',
      'flow-root',
      'list-item',
      'hidden',
    ]);
    const displayClassesOf = (el: Element) =>
      [...el.classList].filter((name) => DISPLAY_UTILITIES.has(name));

    it('strips the layout classes off the rendered panel while Source is active', async () => {
      await render(snap(), stubSource(SNAPSHOT));
      click(q('dom-tab-source')!);
      await until(() => q('dom-source-highlighted') ?? q('dom-source-plain'));

      const rendered = document.getElementById('dom-panel-rendered')!;
      expect(rendered.hasAttribute('hidden')).toBe(true);
      expect(displayClassesOf(rendered)).toEqual(['hidden']);
      expect(rendered.className).not.toContain('flex-1');
    });

    it('strips them off the source panel while Rendered is active', async () => {
      await render(snap(), stubSource(SNAPSHOT));

      const sourcePanel = document.getElementById('dom-panel-source')!;
      expect(sourcePanel.hasAttribute('hidden')).toBe(true);
      expect(displayClassesOf(sourcePanel)).toEqual(['hidden']);
      expect(sourcePanel.className).not.toContain('flex-1');
    });

    it('keeps the active panel fully styled', async () => {
      await render(snap(), stubSource(SNAPSHOT));

      // The fix must not cost the visible panel its flex sizing (the S4-32 notice depends on it).
      const rendered = document.getElementById('dom-panel-rendered')!;
      expect(rendered.hasAttribute('hidden')).toBe(false);
      expect(rendered.className).toContain('flex-1');
      expect(displayClassesOf(rendered)).toEqual(['flex']);
    });
  });

  it('has no axe violations', async () => {
    await render(snap(), stubSource(SNAPSHOT));
    typeInto(q('dom-search-input') as HTMLInputElement, 'button.cta');
    // `iframes: false`: the preview frame holds the CAPTURED page (not our UI), and jsdom frames
    // can't take axe's postMessage bridge anyway. The pane's own DOM is fully scanned.
    const results = await axe.run(container, {
      iframes: false,
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
