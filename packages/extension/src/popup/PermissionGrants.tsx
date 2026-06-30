import { useEffect, useMemo, useState } from 'react';

import {
  hasOptionalPermissions,
  removeOptionalPermissions,
  requestOptionalPermissions,
  type OptionalPermissionName,
} from '../permissions/optional-permissions';

export interface PermissionGrantsProps {
  /** Requests the permission; defaults to `chrome.permissions.request`. Injectable for tests. */
  readonly request?: (permission: OptionalPermissionName) => Promise<boolean>;
  /** Checks the permission; defaults to `chrome.permissions.contains`. Injectable for tests. */
  readonly has?: (permission: OptionalPermissionName) => Promise<boolean>;
  /** Removes the permission; defaults to `chrome.permissions.remove`. Injectable for tests. */
  readonly remove?: (permission: OptionalPermissionName) => Promise<boolean>;
}

const GRANTS: readonly { permission: OptionalPermissionName; label: string }[] = [
  { permission: 'cookies', label: 'Cookies' },
  { permission: 'management', label: 'Installed extensions' },
  { permission: 'history', label: 'Navigation history' },
];

/**
 * Popup control for the optional data permissions (`cookies`, `management`, `history`).
 *
 * `chrome.permissions.request` must run inside a user-gesture handler in a privileged context. The
 * overlay is a content script and cannot do that — and routing the request through the service
 * worker loses the user gesture on Firefox ("Permission denied" with no prompt). The popup IS a
 * privileged extension page, so requesting here prompts correctly on both Chrome and Firefox.
 */
export function PermissionGrants({ request, has, remove }: PermissionGrantsProps) {
  const requestFn = useMemo(
    () =>
      request ?? ((p: OptionalPermissionName) => requestOptionalPermissions({ permissions: [p] })),
    [request],
  );
  const hasFn = useMemo(
    () => has ?? ((p: OptionalPermissionName) => hasOptionalPermissions({ permissions: [p] })),
    [has],
  );
  const removeFn = useMemo(
    () =>
      remove ?? ((p: OptionalPermissionName) => removeOptionalPermissions({ permissions: [p] })),
    [remove],
  );

  const [granted, setGranted] = useState<Partial<Record<OptionalPermissionName, boolean>>>({});
  const [busy, setBusy] = useState<OptionalPermissionName | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      GRANTS.map(async ({ permission }) => [permission, await hasFn(permission)] as const),
    )
      .then((entries) => {
        if (!cancelled) {
          setGranted(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        // A failed check just leaves every row unchecked.
      });
    return () => {
      cancelled = true;
    };
  }, [hasFn]);

  function handleToggle(permission: OptionalPermissionName, next: boolean): void {
    setBusy(permission);
    const action = next ? requestFn(permission) : removeFn(permission).then((removed) => !removed);
    void action
      .then((isGranted) => {
        setGranted((current) => ({ ...current, [permission]: isGranted }));
      })
      .catch(() => {
        // request/remove are best-effort; on failure leave the prior state.
      })
      .finally(() => setBusy(null));
  }

  return (
    <section className="mt-3 text-sm text-slate-700" aria-label="Optional data permissions">
      <h2 className="text-xs font-semibold text-slate-500">Optional data</h2>
      <p className="mt-1 text-xs text-slate-500">
        Grant these here so the prompt appears. The capture options use whatever is granted.
      </p>
      {GRANTS.map(({ permission, label }) => (
        <label key={permission} className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            data-testid={`permission-grant-${permission}`}
            checked={granted[permission] === true}
            disabled={busy === permission}
            onChange={(event) => {
              handleToggle(permission, event.target.checked);
            }}
          />
          <span>{label}</span>
        </label>
      ))}
    </section>
  );
}
