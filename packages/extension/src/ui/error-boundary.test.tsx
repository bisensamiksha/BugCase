// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  consoleError.mockRestore();
});

function q(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

function makeBomb() {
  let explode = true;
  function Bomb() {
    if (explode) {
      throw new Error('kaboom');
    }
    return <div data-testid="child">safe</div>;
  }
  return { Bomb, defuse: () => (explode = false) };
}

describe('ErrorBoundary (extension)', () => {
  it('shows a recoverable fallback and reports the error when a child throws', () => {
    const onError = vi.fn();
    const { Bomb } = makeBomb();
    act(() => {
      root.render(
        <ErrorBoundary onError={onError}>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(q('async-boundary-fallback')).not.toBeNull();
    expect(q('child')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('re-renders children after "Try again"', () => {
    const { Bomb, defuse } = makeBomb();
    act(() => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    defuse();
    act(() => (q('async-boundary-retry') as HTMLButtonElement).click());
    expect(q('child')?.textContent).toBe('safe');
  });

  it('renders children when nothing throws', () => {
    act(() => {
      root.render(
        <ErrorBoundary>
          <div data-testid="child">safe</div>
        </ErrorBoundary>,
      );
    });
    expect(q('child')?.textContent).toBe('safe');
    expect(q('async-boundary-fallback')).toBeNull();
  });
});
