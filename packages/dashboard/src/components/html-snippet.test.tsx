// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HIGHLIGHT_MAX_CHARS } from '../lib/shiki';

import { HtmlSnippet } from './HtmlSnippet';

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

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

async function waitFor(pred: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries && !pred(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe('HtmlSnippet', () => {
  it('shows plain text first, then the highlighted markup', async () => {
    act(() => {
      root.render(<HtmlSnippet html={'<button class="cta">Save</button>'} testId="snip" />);
    });
    expect(q('snip-plain')?.textContent).toContain('<button class="cta">Save</button>');

    await waitFor(() => q('snip-highlighted') !== null);
    const highlighted = q('snip-highlighted');
    expect(highlighted).not.toBeNull();
    // Shiki escapes every input character into token spans — the markup is text, not live DOM.
    expect(highlighted?.querySelector('button')).toBeNull();
    expect(highlighted?.textContent).toContain('cta');
  });

  it('keeps the plain rendering for over-cap input', async () => {
    const big = `<div>${'x'.repeat(HIGHLIGHT_MAX_CHARS)}</div>`;
    act(() => {
      root.render(<HtmlSnippet html={big} />);
    });
    await waitFor(() => q('html-snippet-plain') !== null, 10);
    expect(q('html-snippet-plain')).not.toBeNull();
    expect(q('html-snippet-highlighted')).toBeNull();
  });
});
