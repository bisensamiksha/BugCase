// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FREEZE_STYLE_ID, freezePageForCapture, restoreFrozenPage } from './freeze-page';

let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-bugcase-scroll-x');
  document.documentElement.removeAttribute('data-bugcase-scroll-y');
  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  scrollToSpy.mockRestore();
});

function el(position: string): HTMLElement {
  const node = document.createElement('div');
  node.style.position = position;
  document.body.appendChild(node);
  return node;
}

describe('freezePageForCapture / restoreFrozenPage', () => {
  it('injects a freeze style and removes it on restore', () => {
    freezePageForCapture();
    expect(document.getElementById(FREEZE_STYLE_ID)).not.toBeNull();
    restoreFrozenPage();
    expect(document.getElementById(FREEZE_STYLE_ID)).toBeNull();
  });

  it('hides fixed and sticky elements and restores their visibility', () => {
    const fixed = el('fixed');
    const sticky = el('sticky');
    const normal = el('static');

    freezePageForCapture();
    expect(fixed.style.visibility).toBe('hidden');
    expect(sticky.style.visibility).toBe('hidden');
    expect(normal.style.visibility).toBe('');

    restoreFrozenPage();
    expect(fixed.style.visibility).toBe('');
    expect(sticky.style.visibility).toBe('');
    expect(fixed.hasAttribute('data-bugcase-prev-visibility')).toBe(false);
  });

  it('preserves a prior inline visibility through the freeze/restore cycle', () => {
    const fixed = el('fixed');
    fixed.style.visibility = 'visible';

    freezePageForCapture();
    expect(fixed.style.visibility).toBe('hidden');
    restoreFrozenPage();
    expect(fixed.style.visibility).toBe('visible');
  });

  it('saves the scroll position and restores it', () => {
    Object.defineProperty(window, 'scrollX', { value: 30, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });

    freezePageForCapture();
    expect(document.documentElement.getAttribute('data-bugcase-scroll-y')).toBe('120');

    restoreFrozenPage();
    expect(scrollToSpy).toHaveBeenCalledWith(30, 120);
    expect(document.documentElement.hasAttribute('data-bugcase-scroll-y')).toBe(false);
  });

  it('is idempotent on restore when never frozen (no throw)', () => {
    expect(() => restoreFrozenPage()).not.toThrow();
  });
});
