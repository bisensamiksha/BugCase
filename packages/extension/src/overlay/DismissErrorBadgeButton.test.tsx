// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DismissErrorBadgeButton } from './DismissErrorBadgeButton';

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

function render(count: number, onDismiss: () => void = () => {}): void {
  act(() => {
    root.render(<DismissErrorBadgeButton count={count} onDismiss={onDismiss} />);
  });
}

function query(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

describe('DismissErrorBadgeButton', () => {
  it('renders nothing when there are no errors', () => {
    render(0);
    expect(query('dismiss-error-badge-banner')).toBeNull();
  });

  it('shows the error count and a Dismiss button', () => {
    render(3);
    expect(query('dismiss-error-badge-count')?.textContent).toMatch(/3 errors/);
    expect(query('dismiss-error-badge')).not.toBeNull();
  });

  it('uses the singular for a single error', () => {
    render(1);
    expect(query('dismiss-error-badge-count')?.textContent).toMatch(/1 error\b/);
  });

  it('calls onDismiss when Dismiss is clicked', () => {
    const onDismiss = vi.fn();
    render(2, onDismiss);
    act(() => {
      query('dismiss-error-badge')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
