// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OnboardingTour's default markSeen reaches lib/browser; stub the polyfill so import succeeds. Every
// test injects markSeen, so the real storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { ONBOARDING_SLIDES, OnboardingTour } from './OnboardingTour';

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

function render(props: Partial<Parameters<typeof OnboardingTour>[0]> = {}): {
  markSeen: ReturnType<typeof vi.fn>;
  onComplete: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
} {
  const markSeen = vi.fn(() => Promise.resolve());
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  act(() => {
    root.render(
      <OnboardingTour markSeen={markSeen} onComplete={onComplete} onCancel={onCancel} {...props} />,
    );
  });
  return { markSeen, onComplete, onCancel };
}

function q(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function click(el: HTMLElement | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('OnboardingTour', () => {
  it('has exactly three slides', () => {
    expect(ONBOARDING_SLIDES).toHaveLength(3);
  });

  it('starts on the first slide with no Back and a Next', () => {
    render();
    expect(q('onboarding-tour')).not.toBeNull();
    expect(q('onboarding-slide-title')?.textContent).toBe(ONBOARDING_SLIDES[0]!.title);
    expect(q('onboarding-back')).toBeNull();
    expect(q('onboarding-next')).not.toBeNull();
    expect(q('onboarding-done')).toBeNull();
    expect(q('onboarding-progress')?.textContent).toContain('1');
  });

  it('navigates forward and back through the slides', () => {
    render();
    click(q('onboarding-next'));
    expect(q('onboarding-slide-title')?.textContent).toBe(ONBOARDING_SLIDES[1]!.title);
    click(q('onboarding-next'));
    expect(q('onboarding-slide-title')?.textContent).toBe(ONBOARDING_SLIDES[2]!.title);
    // Last slide: Next becomes Done, Back still available.
    expect(q('onboarding-next')).toBeNull();
    expect(q('onboarding-done')).not.toBeNull();
    click(q('onboarding-back'));
    expect(q('onboarding-slide-title')?.textContent).toBe(ONBOARDING_SLIDES[1]!.title);
  });

  it('Skip marks the tour seen and calls onCancel', () => {
    const { markSeen, onCancel, onComplete } = render();
    click(q('onboarding-skip'));
    expect(markSeen).toHaveBeenCalledWith(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('Done on the last slide marks seen and calls onComplete', () => {
    const { markSeen, onComplete } = render();
    click(q('onboarding-next'));
    click(q('onboarding-next'));
    click(q('onboarding-done'));
    expect(markSeen).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
