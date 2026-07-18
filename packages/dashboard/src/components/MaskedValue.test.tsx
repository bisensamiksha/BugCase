// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaskedValue } from './MaskedValue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function render(node: ReactElement): void {
  act(() => root.render(node));
}

describe('MaskedValue', () => {
  it('masks by default with a constant-width mask (no length leak)', () => {
    render(<MaskedValue value="short" revealed={false} onToggle={vi.fn()} label="k" testId="v" />);
    const masked = q('v')?.textContent ?? '';
    render(
      <MaskedValue
        value="a-much-longer-secret-value"
        revealed={false}
        onToggle={vi.fn()}
        label="k"
        testId="v"
      />,
    );
    expect(q('v')?.textContent).toBe(masked);
    expect(q('v')?.textContent).not.toContain('secret');
  });

  it('shows the value when revealed', () => {
    render(<MaskedValue value="hunter2" revealed onToggle={vi.fn()} label="pw" testId="v" />);
    expect(q('v')?.textContent).toBe('hunter2');
  });

  it('flips the accessible label and fires onToggle', () => {
    const onToggle = vi.fn();
    render(<MaskedValue value="x" revealed={false} onToggle={onToggle} label="theme" testId="v" />);
    const btn = q('v-toggle') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Reveal value for theme');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => btn.click());
    expect(onToggle).toHaveBeenCalledTimes(1);

    render(<MaskedValue value="x" revealed onToggle={onToggle} label="theme" testId="v" />);
    expect((q('v-toggle') as HTMLButtonElement).getAttribute('aria-label')).toBe(
      'Hide value for theme',
    );
  });

  it('renders (empty) with no toggle for an empty value', () => {
    render(<MaskedValue value="" revealed={false} onToggle={vi.fn()} label="k" testId="v" />);
    expect(q('v-empty')?.textContent).toBe('(empty)');
    expect(q('v-toggle')).toBeNull();
  });
});
