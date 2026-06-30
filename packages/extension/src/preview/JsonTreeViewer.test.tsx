// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JsonTreeViewer, type JsonTreeViewerProps } from './JsonTreeViewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const DATA = { authorization: 'Bearer secret', count: 2, nested: { keepName: 'v' } };

function render(props: Partial<JsonTreeViewerProps> = {}) {
  act(() => {
    root.render(
      <JsonTreeViewer
        title="Console log"
        data={'data' in props ? props.data : DATA}
        onCancel={props.onCancel ?? (() => {})}
        {...props}
      />,
    );
  });
}

// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change, then dispatch `input` (mirrors UserReportForm.test.tsx).
function type(id: string, value: string) {
  act(() => {
    const el = q(id) as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(id: string) {
  act(() => {
    q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

// A controlled checkbox: `.click()` runs the native activation (toggles + fires change → onChange).
function toggleCheckbox(id: string) {
  act(() => {
    (q(id) as HTMLInputElement).click();
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

describe('JsonTreeViewer', () => {
  it('renders the title and the tree content', () => {
    render();
    expect(q('json-tree-viewer')).not.toBeNull();
    expect(q('json-tree')?.textContent).toContain('authorization');
    expect(q('json-tree')?.textContent).toContain('Bearer secret');
  });

  it('closes from the × button', () => {
    const onCancel = vi.fn();
    render({ onCancel });
    click('json-close');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onCancel = vi.fn();
    render({ onCancel });
    act(() => {
      q('json-tree-viewer')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('filters the tree to matches when searching', () => {
    render();
    type('json-search-input', 'authorization');
    const text = q('json-tree')?.textContent ?? '';
    expect(text).toContain('authorization');
    expect(text).not.toContain('count');
  });

  it('shows a no-matches message when nothing matches', () => {
    render();
    type('json-search-input', 'zzzznotfound');
    expect(q('json-no-matches')).not.toBeNull();
  });

  it('shows an invalid-regex hint and does not crash', () => {
    render();
    toggleCheckbox('json-regex-toggle');
    type('json-search-input', '(');
    expect(q('json-invalid-regex')).not.toBeNull();
  });

  it('copies the full section JSON and reports success', async () => {
    const copyText = vi.fn(() => Promise.resolve());
    render({ copyText });
    await act(async () => {
      q('json-copy')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copyText).toHaveBeenCalledWith(JSON.stringify(DATA, null, 2));
    expect(q('json-copy-status')?.textContent).toMatch(/copied/i);
  });

  it('reports a copy failure without throwing', async () => {
    const copyText = vi.fn(() => Promise.reject(new Error('denied')));
    render({ copyText });
    await act(async () => {
      q('json-copy')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(q('json-copy-status')?.textContent).toMatch(/failed/i);
  });

  it('marks aria-busy when disabled', () => {
    render({ disabled: true });
    expect(q('json-tree-viewer')?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders null data without throwing', () => {
    render({ data: null });
    expect(q('json-tree')?.textContent).toContain('null');
  });
});
