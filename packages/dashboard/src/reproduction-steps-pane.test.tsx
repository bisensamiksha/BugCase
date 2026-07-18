// @vitest-environment jsdom
import type { ReproductionRecording, ReproductionStep } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reproMarkdown } from './lib/repro-markdown';
import { ReproductionPane } from './panes/ReproductionPane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const step = (over: Partial<ReproductionStep>): ReproductionStep => ({
  id: 'step-1',
  timestamp: '2026-07-18T10:00:00.000Z',
  type: 'click',
  selector: '#login',
  description: 'Clicked "Login" (button)',
  metadata: {},
  ...over,
});

const recording = (steps: readonly ReproductionStep[]): ReproductionRecording => ({
  schemaVersion: 'v1',
  startedAt: '2026-07-18T10:00:00.000Z',
  endedAt: '2026-07-18T10:00:42.000Z',
  steps,
});

// Gaps: s1→s2 = 3000 ms (clamps to 2500), s2→s3 = 100 ms (clamps to 400).
const THREE_STEPS = recording([
  step({}),
  step({
    id: 'step-2',
    timestamp: '2026-07-18T10:00:03.000Z',
    type: 'input',
    selector: 'input[name="email"]',
    description: 'Typed into input',
    metadata: { label: 'Email' },
  }),
  step({
    id: 'step-3',
    timestamp: '2026-07-18T10:00:03.100Z',
    type: 'navigation',
    selector: '',
    description: 'Navigated to /home',
  }),
]);

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function render(reproduction: ReproductionRecording | null): void {
  act(() => {
    root.render(<ReproductionPane reproduction={reproduction} reportId="abc-123" />);
  });
}

function click(el: Element | null): void {
  if (!el) {
    throw new Error('element not found');
  }
  act(() => {
    (el as HTMLElement).click();
  });
}

describe('ReproductionPane', () => {
  it('shows the empty state for a null recording and for zero steps', () => {
    render(null);
    expect(q('repro-empty')).not.toBeNull();
    render(recording([]));
    expect(q('repro-empty')).not.toBeNull();
  });

  it('renders a numbered timeline with offsets, type badges, and descriptions', () => {
    render(THREE_STEPS);
    expect(q('repro-summary')?.textContent).toContain('3 steps');
    const rows = container.querySelectorAll('[data-testid^="repro-step-"]');
    expect(q('repro-timeline')?.tagName).toBe('OL');
    expect(q('repro-step-0')?.textContent).toContain('1.');
    expect(q('repro-step-0')?.textContent).toContain('+0:00');
    expect(q('repro-step-0')?.textContent).toContain('Clicked "Login" (button)');
    expect(q('repro-step-0')?.textContent).toContain('click');
    expect(q('repro-step-1')?.textContent).toContain('+0:03');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('selecting a step marks it aria-current and expands selector, metadata, and DOM link', () => {
    render(THREE_STEPS);
    click(q('repro-step-1'));
    expect(q('repro-step-1')?.getAttribute('aria-current')).toBe('step');
    expect(q('repro-detail-selector')?.textContent).toBe('input[name="email"]');
    expect(q('repro-step-detail')?.textContent).toContain('Email');
    expect(q('repro-dom-link')?.getAttribute('href')).toBe(
      '#/dom/abc-123?el=input%5Bname%3D%22email%22%5D',
    );
  });

  it('omits the DOM link when the step has no selector', () => {
    render(THREE_STEPS);
    click(q('repro-step-2'));
    expect(q('repro-step-detail')).not.toBeNull();
    expect(q('repro-dom-link')).toBeNull();
  });

  it('play walks the highlight at clamped real-time gaps and auto-stops at the end', () => {
    vi.useFakeTimers();
    render(THREE_STEPS);
    click(q('repro-play'));
    expect(q('repro-step-0')?.getAttribute('aria-current')).toBe('step');
    expect(q('repro-play')?.textContent).toBe('Pause');

    act(() => {
      vi.advanceTimersByTime(2499); // 3000 ms gap clamps to 2500
    });
    expect(q('repro-step-0')?.getAttribute('aria-current')).toBe('step');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(q('repro-step-1')?.getAttribute('aria-current')).toBe('step');

    act(() => {
      vi.advanceTimersByTime(400); // 100 ms gap clamps to 400; landing on the last step stops
    });
    expect(q('repro-step-2')?.getAttribute('aria-current')).toBe('step');
    expect(q('repro-play')?.textContent).toBe('Play');
  });

  it('prev/next move the highlight without playing', () => {
    render(THREE_STEPS);
    click(q('repro-next'));
    expect(q('repro-step-0')?.getAttribute('aria-current')).toBe('step');
    click(q('repro-next'));
    expect(q('repro-step-1')?.getAttribute('aria-current')).toBe('step');
    click(q('repro-prev'));
    expect(q('repro-step-0')?.getAttribute('aria-current')).toBe('step');
    expect(q('repro-play')?.textContent).toBe('Play');
  });

  it('copies the Markdown export and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(THREE_STEPS);
    await act(async () => {
      (q('repro-copy') as HTMLElement).click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(reproMarkdown(THREE_STEPS));
    expect(q('repro-copy')?.textContent).toBe('Copied');
  });

  it('shows an error when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(THREE_STEPS);
    await act(async () => {
      (q('repro-copy') as HTMLElement).click();
      await Promise.resolve();
    });
    expect(q('repro-copy-error')).not.toBeNull();
  });

  it('does not throw on malformed step timestamps', () => {
    render(recording([step({ timestamp: 'nonsense' })]));
    expect(q('repro-step-0')?.textContent).toContain('Clicked "Login" (button)');
  });

  it('has no axe violations', async () => {
    render(THREE_STEPS);
    click(q('repro-step-0'));
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
