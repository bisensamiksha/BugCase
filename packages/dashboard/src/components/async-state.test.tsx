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
  act(() => {
    root.unmount();
  });
  container.remove();
});

function q(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

describe('AsyncState', () => {
  it('renders a skeleton with an accessible label when loading, and hides children', () => {
    act(() => {
      root.render(
        <AsyncState status="loading" loadingLabel="Reading report…">
          <div data-testid="child">content</div>
        </AsyncState>,
      );
    });
    const loading = q('async-loading');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.textContent).toContain('Reading report…');
    expect(q('child')).toBeNull();
  });

  it('renders the empty node when empty', () => {
    act(() => {
      root.render(
        <AsyncState status="empty" empty={<div data-testid="my-empty">nothing here</div>}>
          <div data-testid="child">content</div>
        </AsyncState>,
      );
    });
    expect(q('async-empty')).not.toBeNull();
    expect(q('my-empty')?.textContent).toBe('nothing here');
    expect(q('child')).toBeNull();
  });

  it('renders the error message with an alert role, and a Retry that calls onRetry', () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<AsyncState status="error" errorMessage="Boom failed" onRetry={onRetry} />);
    });
    const error = q('async-error');
    expect(error).not.toBeNull();
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Boom failed');

    const retry = q('async-retry');
    expect(retry).not.toBeNull();
    act(() => {
      (retry as HTMLButtonElement).click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the Retry button when no onRetry is provided', () => {
    act(() => {
      root.render(<AsyncState status="error" errorMessage="Boom failed" />);
    });
    expect(q('async-error')).not.toBeNull();
    expect(q('async-retry')).toBeNull();
  });

  it('renders children when ready and nothing else', () => {
    act(() => {
      root.render(
        <AsyncState status="ready">
          <div data-testid="child">content</div>
        </AsyncState>,
      );
    });
    expect(q('child')?.textContent).toBe('content');
    expect(q('async-loading')).toBeNull();
    expect(q('async-empty')).toBeNull();
    expect(q('async-error')).toBeNull();
  });
});
