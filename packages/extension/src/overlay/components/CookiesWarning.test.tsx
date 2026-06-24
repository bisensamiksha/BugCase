// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CookiesWarning } from './CookiesWarning';

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

describe('CookiesWarning', () => {
  it('warns that cookies are included and that values are masked when active', () => {
    act(() => {
      root.render(<CookiesWarning active />);
    });
    const warning = container.querySelector('[data-testid="cookies-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('role')).toBe('alert');
    const text = warning?.textContent?.toLowerCase() ?? '';
    expect(text).toContain('cookie');
    expect(text).toContain('masked');
  });

  it('renders nothing when inactive', () => {
    act(() => {
      root.render(<CookiesWarning active={false} />);
    });
    expect(container.querySelector('[data-testid="cookies-warning"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('names the host when provided', () => {
    act(() => {
      root.render(<CookiesWarning active hostName="example.com" />);
    });
    expect(container.textContent).toContain('example.com');
  });
});
