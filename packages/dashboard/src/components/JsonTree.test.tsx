// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonTree } from './JsonTree';

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

describe('JsonTree', () => {
  it('renders object keys and formatted primitive values', () => {
    act(() => {
      root.render(<JsonTree name="report" data={{ a: 1, b: 'x', c: true, d: null }} />);
    });
    const text = container.textContent ?? '';
    expect(text).toContain('a');
    expect(text).toContain('1');
    expect(text).toContain('"x"');
    expect(text).toContain('true');
    expect(text).toContain('null');
  });

  it('renders nested arrays and objects', () => {
    act(() => {
      root.render(<JsonTree name="root" data={{ list: [10, 20], nested: { k: 'v' } }} />);
    });
    const text = container.textContent ?? '';
    expect(text).toContain('list');
    expect(text).toContain('nested');
    expect(text).toContain('10');
    expect(text).toContain('"v"');
  });
});
