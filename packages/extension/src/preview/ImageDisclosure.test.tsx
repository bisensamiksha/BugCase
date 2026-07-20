// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImageDisclosure } from './ImageDisclosure';

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

const q = (testId: string) => container.querySelector(`[data-testid="${testId}"]`);

describe('ImageDisclosure', () => {
  it('warns that screenshots and crops are not scrubbed, as a role=note with the default testid', () => {
    act(() => root.render(<ImageDisclosure />));
    const note = q('image-disclosure');
    expect(note).not.toBeNull();
    expect(note?.getAttribute('role')).toBe('note');
    expect(note?.textContent).toMatch(/screenshots and element crops/i);
    expect(note?.textContent).toMatch(/not .*scrubbed/i);
    expect(note?.textContent).toMatch(/visible on screen/i);
  });

  it('supports a custom testid and a screen-specific follow-up line', () => {
    act(() =>
      root.render(
        <ImageDisclosure testId="review-image-disclosure">Use Annotate first.</ImageDisclosure>,
      ),
    );
    const note = q('review-image-disclosure');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/Use Annotate first/);
  });
});
