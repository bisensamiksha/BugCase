// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppShell } from './AppShell';

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

describe('AppShell legal footer', () => {
  it('links the hosted privacy policy and terms', () => {
    act(() => {
      root.render(
        <AppShell route={{ activePane: 'overview', reportId: null }}>
          <div />
        </AppShell>,
      );
    });
    const footer = container.querySelector('[data-testid="legal-footer"]');
    expect(footer).not.toBeNull();
    const hrefs = [...footer!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://bisensamiksha.github.io/BugCase/legal/privacy-policy');
    expect(hrefs).toContain('https://bisensamiksha.github.io/BugCase/legal/terms');
  });
});
