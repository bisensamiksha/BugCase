// @vitest-environment jsdom
import type { CookiesDump, StorageDump } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StoragePane } from './panes/StoragePane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COOKIES: CookiesDump = {
  schemaVersion: 'v1',
  entries: [
    {
      name: 'session_id',
      value: '[scrubbed]',
      domain: '.app.com',
      path: '/',
      expiresAt: null,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      session: false,
      masked: true,
    },
    {
      name: 'theme',
      value: 'dark',
      domain: '.app.com',
      path: '/',
      expiresAt: '2026-08-01T00:00:00.000Z',
      httpOnly: false,
      secure: false,
      sameSite: 'unspecified',
      session: false,
      masked: false,
    },
  ],
};

const STORAGE: StorageDump = {
  schemaVersion: 'v1',
  localStorage: [
    { key: 'feature_flags', value: '{"beta":true}', sizeBytes: 1300 },
    { key: 'user_prefs', value: 'compact', sizeBytes: 340 },
  ],
  sessionStorage: [{ key: 'nav_from', value: '/home', sizeBytes: 20 }],
  note: 'Captured from https://app.com',
};

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

function q(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function render(cookies: CookiesDump | null, storage: StorageDump | null): void {
  act(() => root.render(<StoragePane cookies={cookies} storage={storage} />));
}

function click(el: Element | null): void {
  if (!el) {
    throw new Error('missing element');
  }
  act(() => (el as HTMLElement).click());
}

function type(testId: string, value: string): void {
  const input = q(testId) as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('StoragePane', () => {
  it('renders cookies + storage tables with values masked by default', () => {
    render(COOKIES, STORAGE);
    expect(q('storage-pane')).not.toBeNull();
    expect(q('cookie-value-0')?.textContent).toBe('••••••••');
    expect(q('cookie-value-0')?.textContent).not.toContain('scrubbed');
    expect(q('local-value-0')?.textContent).toBe('••••••••');
    expect(q('session-value-0')?.textContent).toBe('••••••••');
    expect(q('storage-note')?.textContent).toBe('Captured from https://app.com');
  });

  it('reveals one row via its own toggle', () => {
    render(COOKIES, STORAGE);
    click(q('cookie-value-1-toggle'));
    expect(q('cookie-value-1')?.textContent).toBe('dark');
    expect(q('cookie-value-0')?.textContent).toBe('••••••••');
  });

  it('reveals all, then hides one while the rest stay revealed', () => {
    render(COOKIES, STORAGE);
    click(q('storage-reveal-all'));
    expect(q('cookie-value-1')?.textContent).toBe('dark');
    expect(q('local-value-0')?.textContent).toBe('{"beta":true}');
    // A masked-at-capture cookie honestly reveals its stored placeholder.
    expect(q('cookie-value-0')?.textContent).toBe('[scrubbed]');
    click(q('cookie-value-1-toggle'));
    expect(q('cookie-value-1')?.textContent).toBe('••••••••');
    expect(q('local-value-0')?.textContent).toBe('{"beta":true}');
  });

  it('surfaces the Masked flag on a captured-masked cookie', () => {
    render(COOKIES, STORAGE);
    expect(q('storage-cookies')?.textContent).toContain('Masked');
  });

  it('filters storage rows by key with a no-match note', () => {
    render(COOKIES, STORAGE);
    type('local-filter', 'flags');
    expect(q('local-value-0')?.textContent).toBe('••••••••'); // feature_flags still present
    expect(q('local-value-1')).toBeNull(); // user_prefs filtered out
    type('local-filter', 'zzz');
    expect(q('local-nomatch')).not.toBeNull();
  });

  it('handles null cookies and null storage without throwing', () => {
    render(null, null);
    expect(q('storage-pane')).not.toBeNull();
    expect(q('cookies-empty')?.textContent).toBe('Cookies were not captured.');
    expect(q('storage-empty')?.textContent).toBe('Storage was not captured.');
  });

  it('handles empty + null sub-collections', () => {
    render(
      { schemaVersion: 'v1', entries: [] },
      { schemaVersion: 'v1', localStorage: [], sessionStorage: null, note: '' },
    );
    expect(q('cookies-empty')?.textContent).toBe('No cookies.');
    expect(q('local-empty')?.textContent).toBe('No local storage entries.');
    expect(q('session-empty')?.textContent).toBe('Session storage was not captured.');
    expect(q('storage-note')).toBeNull();
  });

  it('has no axe violations', async () => {
    render(COOKIES, STORAGE);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
