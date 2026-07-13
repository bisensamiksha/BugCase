// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncState } from './AsyncState';

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

function q(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

describe('AsyncState (extension)', () => {
  it('shows an accessible skeleton when loading and hides children', () => {
    act(() => {
      root.render(
        <AsyncState status="loading" loadingLabel="Working…">
          <span data-testid="child">c</span>
        </AsyncState>,
      );
    });
    expect(q('async-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(q('async-loading')?.textContent).toContain('Working…');
    expect(q('child')).toBeNull();
  });

  it('renders the empty node when empty', () => {
    act(() => {
      root.render(<AsyncState status="empty" empty={<span data-testid="e">none</span>} />);
    });
    expect(q('async-empty')).not.toBeNull();
    expect(q('e')?.textContent).toBe('none');
  });

  it('renders an alert with a working Retry on error, and omits Retry without onRetry', () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<AsyncState status="error" errorMessage="nope" onRetry={onRetry} />);
    });
    expect(q('async-error')?.getAttribute('role')).toBe('alert');
    expect(q('async-error')?.textContent).toContain('nope');
    act(() => (q('async-retry') as HTMLButtonElement).click());
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<AsyncState status="error" errorMessage="nope" />);
    });
    expect(q('async-retry')).toBeNull();
  });

  it('renders children when ready', () => {
    act(() => {
      root.render(
        <AsyncState status="ready">
          <span data-testid="child">c</span>
        </AsyncState>,
      );
    });
    expect(q('child')?.textContent).toBe('c');
    expect(q('async-loading')).toBeNull();
  });
});
