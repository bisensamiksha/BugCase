// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReproductionControls } from './ReproductionControls';
import type { ReproductionSessionStatus } from './reproduction-session';

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

function render(
  status: ReproductionSessionStatus,
  handlers: { onStart?: () => void; onStop?: () => void; interrupted?: boolean } = {},
): void {
  act(() => {
    root.render(
      <ReproductionControls
        status={status}
        interrupted={handlers.interrupted ?? false}
        onStart={handlers.onStart ?? (() => {})}
        onStop={handlers.onStop ?? (() => {})}
      />,
    );
  });
}

function query<T extends HTMLElement>(testId: string): T | null {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

function click(el: HTMLElement | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ReproductionControls', () => {
  it('shows a Start button when idle and calls onStart', () => {
    const onStart = vi.fn();
    render('idle', { onStart });
    expect(query('reproduction-stop')).toBeNull();
    click(query('reproduction-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a Stop button while recording and calls onStop', () => {
    const onStop = vi.fn();
    render('recording', { onStop });
    expect(query('reproduction-start')).toBeNull();
    expect(query('reproduction-status')?.textContent).toMatch(/recording/i);
    click(query('reproduction-stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('shows a recorded summary with a re-record button that starts a new session', () => {
    const onStart = vi.fn();
    render('recorded', { onStart });
    expect(query('reproduction-status')?.textContent).toMatch(/recorded/i);
    click(query('reproduction-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('notes when a recording ended because the page changed', () => {
    render('recorded', { interrupted: true });
    expect(query('reproduction-status')?.textContent).toMatch(/page changed/i);
  });
});
