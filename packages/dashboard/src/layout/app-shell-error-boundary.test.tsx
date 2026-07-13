// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleError.mockRestore();
});

function Bomb(): never {
  throw new Error('pane exploded');
}

describe('AppShell', () => {
  it('wraps the pane outlet in an error boundary so a crashing pane cannot blank the shell', () => {
    act(() => {
      root.render(
        <AppShell route={{ activePane: 'overview', reportId: null }}>
          <Bomb />
        </AppShell>,
      );
    });
    // The shell chrome still renders; the crashing pane shows the recoverable fallback.
    expect(container.querySelector('[data-testid="app-topbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="app-sidenav"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="async-boundary-fallback"]')).not.toBeNull();
  });
});
