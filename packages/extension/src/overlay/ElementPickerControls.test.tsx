// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementPickerControls } from './ElementPickerControls';
import type { ElementPickerStatus } from './element-inspection-session';

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
  status: ElementPickerStatus,
  count: number,
  handlers: { onStartPicking?: () => void; onStopPicking?: () => void } = {},
): void {
  act(() => {
    root.render(
      <ElementPickerControls
        status={status}
        count={count}
        onStartPicking={handlers.onStartPicking ?? (() => {})}
        onStopPicking={handlers.onStopPicking ?? (() => {})}
      />,
    );
  });
}

function query(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function click(el: HTMLElement | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ElementPickerControls', () => {
  it('shows a start button when idle and calls onStartPicking', () => {
    const onStartPicking = vi.fn();
    render('idle', 0, { onStartPicking });
    expect(query('element-picker-done')).toBeNull();
    click(query('element-picker-start'));
    expect(onStartPicking).toHaveBeenCalledTimes(1);
  });

  it('shows a Done button while picking and calls onStopPicking', () => {
    const onStopPicking = vi.fn();
    render('picking', 2, { onStopPicking });
    expect(query('element-picker-start')).toBeNull();
    expect(query('element-picker-status')?.textContent).toMatch(/2/);
    click(query('element-picker-done'));
    expect(onStopPicking).toHaveBeenCalledTimes(1);
  });

  it('reports how many elements were inspected when idle', () => {
    render('idle', 3);
    expect(query('element-picker-status')?.textContent).toMatch(/3/);
  });
});
