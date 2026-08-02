// @vitest-environment jsdom
import type { DomSnapshot } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportSource } from './lib/report-source';
import { DomPane } from './panes/DomPane';
import type { DomViewState } from './router/hash-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HTML = '<html><body><button class="checkout-btn">Buy</button></body></html>';

const dom: DomSnapshot = {
  schemaVersion: 'v1',
  contentPath: 'dom/snapshot.html',
  bytes: HTML.length,
  truncated: false,
  scrubbed: true,
} as unknown as DomSnapshot;

const source = {
  readText: () => Promise.resolve(HTML),
} as unknown as ReportSource;

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

const tabButton = (name: 'rendered' | 'source') =>
  container.querySelector<HTMLButtonElement>(`[data-testid="dom-tab-${name}"]`);

async function render(props: Partial<React.ComponentProps<typeof DomPane>> = {}) {
  await act(async () => {
    root.render(<DomPane dom={dom} reportId="r1" source={source} {...props} />);
    // Let the pane's lazy snapshot read settle before assertions.
    await Promise.resolve();
  });
}

describe('DomPane hash state (S4-26)', () => {
  it('opens on the rendered tab by default', async () => {
    await render();
    expect(tabButton('rendered')?.getAttribute('aria-selected')).toBe('true');
  });

  it('seeds the source tab from the route', async () => {
    await render({ initialTab: 'source' });
    expect(tabButton('source')?.getAttribute('aria-selected')).toBe('true');
  });

  it('reports a tab change so the caller can reflect it into the hash', async () => {
    const onViewChange = vi.fn<(state: DomViewState) => void>();
    await render({ onViewChange });
    onViewChange.mockClear();

    await act(async () => {
      tabButton('source')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onViewChange).toHaveBeenCalled();
    expect(onViewChange.mock.calls.at(-1)?.[0].tab).toBe('source');
  });

  it('reports the element query alongside the tab', async () => {
    const onViewChange = vi.fn<(state: DomViewState) => void>();
    await render({ initialElementQuery: '.checkout-btn', onViewChange });

    expect(onViewChange.mock.calls.at(-1)?.[0].elementQuery).toBe('.checkout-btn');
  });

  it('falls back to the rendered tab for an unknown seeded value', async () => {
    await render({ initialTab: 'wireframe' as unknown as 'rendered' });
    expect(tabButton('rendered')?.getAttribute('aria-selected')).toBe('true');
  });
});
