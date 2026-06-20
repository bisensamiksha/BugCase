// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DebuggerBanner } from './DebuggerBanner';

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

describe('DebuggerBanner', () => {
  it('shows an explanatory banner while the debugger is active', () => {
    act(() => {
      root.render(<DebuggerBanner active />);
    });
    const banner = container.querySelector('[data-testid="debugger-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent?.toLowerCase()).toContain('debugger');
  });

  it('renders nothing when inactive', () => {
    act(() => {
      root.render(<DebuggerBanner active={false} />);
    });
    expect(container.querySelector('[data-testid="debugger-banner"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('names the host when provided', () => {
    act(() => {
      root.render(<DebuggerBanner active hostName="example.com" />);
    });
    expect(container.textContent).toContain('example.com');
  });
});
