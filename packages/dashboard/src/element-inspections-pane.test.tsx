// @vitest-environment jsdom
import type { ElementInspectionsManifest } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportSource } from './lib/report-source';
import { ElementInspectionsPane } from './panes/ElementInspectionsPane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CROP_PATH = 'screenshots/crops/element-1.png';

const MANIFEST: ElementInspectionsManifest = {
  schemaVersion: 'v1',
  inspections: [
    {
      id: 'insp-1',
      outerHtml: '<button id="save" class="cta primary">Save</button>',
      computedStyles: {
        color: 'rgb(255, 255, 255)',
        display: 'flex',
        'margin-top': '8px',
        'font-weight': '700',
        cursor: 'pointer',
      },
      boundingClientRect: { x: 120.4, y: 340.2, width: 200.6, height: 47.5 },
      ancestors: [
        { tag: 'form', id: 'login', classes: [] },
        { tag: 'main', id: null, classes: ['content'] },
      ],
      screenshotCropPath: CROP_PATH,
    },
    {
      id: 'insp-2',
      outerHtml: '<div class="card featured">Card</div>',
      computedStyles: {},
      boundingClientRect: { x: 0, y: 0, width: 300, height: 100 },
      ancestors: [],
      screenshotCropPath: '',
    },
  ],
};

function stubSource(): ReportSource {
  return {
    report: {} as ReportSource['report'],
    readText: () => Promise.resolve(null),
    readBlob: () => Promise.resolve(null),
    objectUrl: vi.fn((path: string) => Promise.resolve(path === CROP_PATH ? 'blob:crop-1' : null)),
    dispose: () => {},
  };
}

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

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

async function render(manifest: ElementInspectionsManifest | null): Promise<void> {
  act(() => {
    root.render(
      <ElementInspectionsPane manifest={manifest} reportId="abc-123" source={stubSource()} />,
    );
  });
  // Flush the async objectUrl thumbnail reads.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function click(el: Element | null): void {
  if (!el) {
    throw new Error('element not found');
  }
  act(() => {
    (el as HTMLElement).click();
  });
}

// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change, then dispatch `input` (mirrors the DomPane tests).
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('ElementInspectionsPane', () => {
  it('shows the empty state for a null manifest and for zero inspections', async () => {
    await render(null);
    expect(q('inspections-empty')).not.toBeNull();
    await render({ schemaVersion: 'v1', inspections: [] });
    expect(q('inspections-empty')).not.toBeNull();
  });

  it('lists inspections with labels and selects the first by default', async () => {
    await render(MANIFEST);
    expect(q('inspections-list')?.tagName).toBe('OL');
    expect(q('inspection-row-0')?.textContent).toContain('button#save');
    expect(q('inspection-row-1')?.textContent).toContain('div.card.featured');
    expect(q('inspection-row-0')?.getAttribute('aria-current')).toBe('true');
    expect(q('inspection-row-1')?.getAttribute('aria-current')).toBeNull();
  });

  it('loads crop thumbnails and marks missing crops', async () => {
    await render(MANIFEST);
    expect(q('inspection-thumb-0-img')?.getAttribute('src')).toBe('blob:crop-1');
    expect(q('inspection-thumb-1-none')).not.toBeNull();
  });

  it('shows position, breadcrumb, DOM link, and the crop in the detail panel', async () => {
    await render(MANIFEST);
    expect(q('inspection-position')?.textContent).toBe('120, 340 · 201 × 48 px');
    expect(q('inspection-breadcrumb')?.textContent).toBe('main.content > form#login > button#save');
    expect(q('inspection-dom-link')?.getAttribute('href')).toBe('#/dom/abc-123?el=%23save');
    expect(q('inspection-crop-img')?.getAttribute('src')).toBe('blob:crop-1');
    // Plain first, upgraded to Shiki once the memoized highlighter resolves — accept either.
    const html = q('inspection-html-highlighted') ?? q('inspection-html-plain');
    expect(html?.textContent).toContain('id="save"');
  });

  it('switches the detail when another inspection is selected', async () => {
    await render(MANIFEST);
    click(q('inspection-row-1'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(q('inspection-row-1')?.getAttribute('aria-current')).toBe('true');
    expect(q('inspection-breadcrumb')?.textContent).toBe('div.card.featured');
    expect(q('inspection-dom-link')?.getAttribute('href')).toBe(
      '#/dom/abc-123?el=div.card.featured',
    );
    expect(q('inspection-crop-none')).not.toBeNull();
    expect(q('inspection-styles-empty')).not.toBeNull();
  });

  it('groups computed styles and filters them', async () => {
    await render(MANIFEST);
    const groups = container.querySelectorAll('[data-testid="inspection-style-group"]');
    expect(groups.length).toBe(5);
    expect(q('inspection-detail')?.textContent).toContain('Layout (1)');
    expect(q('inspection-detail')?.textContent).toContain('Other (1)');

    const input = q('inspection-style-filter') as HTMLInputElement;
    typeInto(input, 'margin');
    expect(container.querySelectorAll('[data-testid="inspection-style-group"]').length).toBe(1);
    expect(q('inspection-detail')?.textContent).toContain('margin-top');

    typeInto(input, 'zzz');
    expect(q('inspection-styles-nomatch')).not.toBeNull();
  });

  it('handles malformed outerHtml without a link and without throwing', async () => {
    await render({
      schemaVersion: 'v1',
      inspections: [
        {
          id: 'bad-1',
          outerHtml: 'just text, no element',
          computedStyles: {},
          boundingClientRect: { x: 0, y: 0, width: 0, height: 0 },
          ancestors: [],
          screenshotCropPath: '',
        },
      ],
    });
    expect(q('inspection-row-0')?.textContent).toContain('<unknown>');
    expect(q('inspection-dom-link')).toBeNull();
    expect(q('inspection-breadcrumb')?.textContent).toBe('<unknown>');
  });

  it('has no axe violations', async () => {
    await render(MANIFEST);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
