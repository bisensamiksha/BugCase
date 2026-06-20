// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PermissionPrompt's default onRequest sends via lib/browser; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { RequestPermissionsResponse } from '../../background/permissions-handler';

import { PermissionPrompt } from './PermissionPrompt';

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

function byTestId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) {
    throw new Error(`element not found: ${id}`);
  }
  return el;
}

describe('PermissionPrompt', () => {
  it('lists the requested permissions', () => {
    act(() => {
      root.render(<PermissionPrompt permissions={['management', 'cookies']} />);
    });
    expect(container.textContent).toContain('management');
    expect(container.textContent).toContain('cookies');
  });

  it('requests the permission on Allow and shows the granted state', async () => {
    const response: RequestPermissionsResponse = { ok: true, granted: true };
    const promise = Promise.resolve(response);
    const onRequest = vi.fn(() => promise);
    const onResult = vi.fn();

    act(() => {
      root.render(
        <PermissionPrompt permissions={['management']} onRequest={onRequest} onResult={onResult} />,
      );
    });
    await act(async () => {
      byTestId('permission-allow').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await promise;
    });

    expect(onRequest).toHaveBeenCalledWith({ permissions: ['management'] });
    expect(onResult).toHaveBeenCalledWith(response);
    expect(byTestId('permission-status').textContent?.toLowerCase()).toContain('granted');
  });

  it('shows a denied state when the request resolves not granted', async () => {
    const promise = Promise.resolve<RequestPermissionsResponse>({ ok: true, granted: false });
    const onRequest = vi.fn(() => promise);

    act(() => {
      root.render(<PermissionPrompt permissions={['cookies']} onRequest={onRequest} />);
    });
    await act(async () => {
      byTestId('permission-allow').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await promise;
    });

    expect(byTestId('permission-status').textContent?.toLowerCase()).toMatch(/denied|not granted/);
  });

  it('dismisses on Deny without requesting', () => {
    const onRequest = vi.fn(() =>
      Promise.resolve<RequestPermissionsResponse>({ ok: true, granted: true }),
    );
    const onDismiss = vi.fn();

    act(() => {
      root.render(
        <PermissionPrompt permissions={['history']} onRequest={onRequest} onDismiss={onDismiss} />,
      );
    });
    act(() => {
      byTestId('permission-deny').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRequest).not.toHaveBeenCalled();
  });
});
