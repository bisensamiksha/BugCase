// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PermissionGrants reaches lib/browser via the optional-permissions helpers; stub the polyfill.
// All three effects are injected in every test, so the real browser.permissions API is never hit.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { OptionalPermissionName } from '../permissions/optional-permissions';

import { PermissionGrants } from './PermissionGrants';

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

function checkbox(permission: OptionalPermissionName): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `[data-testid="permission-grant-${permission}"]`,
  );
  if (!el) {
    throw new Error(`missing permission row ${permission}`);
  }
  return el;
}

describe('PermissionGrants', () => {
  it('reflects the initial granted state from the contains check', async () => {
    const has = vi.fn((p: OptionalPermissionName) => Promise.resolve(p === 'cookies'));
    const settled = Promise.resolve(true);
    act(() => {
      root.render(<PermissionGrants has={has} request={() => settled} remove={() => settled} />);
    });
    await act(async () => {
      await settled;
    });
    expect(checkbox('cookies').checked).toBe(true);
    expect(checkbox('management').checked).toBe(false);
    expect(checkbox('history').checked).toBe(false);
  });

  it('requests the permission directly when a row is checked (real prompt context)', async () => {
    const grant = Promise.resolve(true);
    const request = vi.fn(() => grant);
    const initial = Promise.resolve(false);
    act(() => {
      root.render(
        <PermissionGrants
          has={() => initial}
          request={request}
          remove={() => Promise.resolve(true)}
        />,
      );
    });
    // Let the mount-time contains check settle first, or it would overwrite the grant.
    await act(async () => {
      await initial;
    });
    await act(async () => {
      checkbox('cookies').click();
      await grant;
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith('cookies');
    expect(checkbox('cookies').checked).toBe(true);
  });

  it('leaves the row unchecked when the request is denied', async () => {
    const denied = Promise.resolve(false);
    act(() => {
      root.render(
        <PermissionGrants
          has={() => Promise.resolve(false)}
          request={() => denied}
          remove={() => Promise.resolve(true)}
        />,
      );
    });
    await act(async () => {
      checkbox('history').click();
      await denied;
    });
    expect(checkbox('history').checked).toBe(false);
  });

  it('removes the permission when a granted row is unchecked', async () => {
    const remove = vi.fn(() => Promise.resolve(true));
    const has = vi.fn(() => Promise.resolve(true));
    const settled = Promise.resolve(true);
    act(() => {
      root.render(<PermissionGrants has={has} request={() => settled} remove={remove} />);
    });
    await act(async () => {
      await settled;
    });
    expect(checkbox('management').checked).toBe(true);
    await act(async () => {
      checkbox('management').click();
      await settled;
    });
    expect(remove).toHaveBeenCalledWith('management');
    expect(checkbox('management').checked).toBe(false);
  });
});
