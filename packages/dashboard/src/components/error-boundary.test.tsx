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
  // React logs caught render errors to console.error; silence it so the suite output stays clean.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleError.mockRestore();
});

function q(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

/** A component that throws until `defuse()` is called, then renders safely. */
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

describe('ErrorBoundary', () => {
  it('renders the recoverable fallback (not children) when a child throws, and reports the error', () => {
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
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('re-renders children after "Try again" resets the boundary', () => {
    const onReset = vi.fn();
    const { Bomb, defuse } = makeBomb();
    act(() => {
      root.render(
        <ErrorBoundary onReset={onReset}>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(q('async-boundary-fallback')).not.toBeNull();

    defuse();
    act(() => {
      (q('async-boundary-retry') as HTMLButtonElement).click();
    });
    expect(q('child')?.textContent).toBe('safe');
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders a custom fallback when provided', () => {
    const { Bomb } = makeBomb();
    act(() => {
      root.render(
        <ErrorBoundary fallback={() => <div data-testid="custom">custom fallback</div>}>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(q('custom')?.textContent).toBe('custom fallback');
    expect(q('async-boundary-fallback')).toBeNull();
  });

  it('renders children untouched when nothing throws', () => {
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
