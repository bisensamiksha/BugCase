import type { UserOptions } from '@bugcase/schema';
import { useState, type CSSProperties } from 'react';

import {
  CONTAINS_PERMISSIONS,
  type ContainsPermissionsRequest,
  type RequestPermissionsResponse,
} from '../background/permissions-handler';
import browser from '../lib/browser';
import type { OptionalPermissionName } from '../permissions/optional-permissions';

import {
  CAPTURE_OPTION_GROUPS,
  captureOptionsReducer,
  optionPermission,
  type CaptureOptionKey,
} from './capture-options-state';

export interface CaptureOptionsProps {
  readonly value: UserOptions;
  readonly onChange: (next: UserOptions) => void;
  readonly disabled?: boolean;
  /**
   * Checks whether an optional permission is already granted. Defaults to the gesture-free
   * CONTAINS_PERMISSIONS SW bridge. The overlay can't *request* permissions (it's a content script,
   * and the user gesture is lost crossing into the worker on Firefox) — granting happens in the
   * popup; the overlay only reflects what is already granted. Injectable for tests.
   */
  readonly checkPermission?: (permission: OptionalPermissionName) => Promise<boolean>;
  /**
   * Optional permissions currently granted. `undefined` means "not yet known" — no permission label
   * renders, so nothing flashes before the check resolves. The overlay reconciles its options against
   * this set (so gated+ungranted is always unticked there); Settings does not, so a ticked+ungranted
   * option there renders as revoked.
   */
  readonly grantedPermissions?: ReadonlySet<OptionalPermissionName>;
}

/** Gesture-free "is this granted?" check via the service worker (`permissions.contains`). */
async function checkPermissionViaBridge(permission: OptionalPermissionName): Promise<boolean> {
  const message: ContainsPermissionsRequest = {
    type: CONTAINS_PERMISSIONS,
    permissions: [permission],
  };
  try {
    const result = await browser.runtime.sendMessage<
      ContainsPermissionsRequest,
      RequestPermissionsResponse
    >(message);
    return result.granted === true;
  } catch {
    return false;
  }
}

const fieldsetStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '8px 12px',
  margin: '0 0 8px',
};
const legendStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#475569' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '4px 0',
};
const labelStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 };
const hintStyle: CSSProperties = { fontSize: '11px', color: '#94a3b8' };
const needsGrantStyle: CSSProperties = { fontSize: '11px', color: '#b45309' };
const revokedStyle: CSSProperties = { fontSize: '11px', color: '#b45309' };

export function CaptureOptions({
  value,
  onChange,
  disabled,
  checkPermission,
  grantedPermissions,
}: CaptureOptionsProps) {
  const check = checkPermission ?? checkPermissionViaBridge;
  const [pending, setPending] = useState<CaptureOptionKey | null>(null);
  const [needsGrant, setNeedsGrant] = useState<CaptureOptionKey | null>(null);

  async function handleToggle(key: CaptureOptionKey, nextChecked: boolean): Promise<void> {
    setNeedsGrant((current) => (current === key ? null : current));

    const permission = optionPermission(key);
    // Turning off, or a non-gated option: apply immediately.
    if (!nextChecked || permission === undefined) {
      onChange(captureOptionsReducer(value, { type: 'set', key, value: nextChecked }));
      return;
    }

    // Turning on a gated option: it can only be enabled if the permission is already granted (in the
    // toolbar popup). Granting can't happen here — the overlay is a content script with no
    // gesture-bound permissions.request — so just reflect the current grant.
    setPending(key);
    try {
      const granted = await check(permission);
      if (granted) {
        onChange(captureOptionsReducer(value, { type: 'set', key, value: true }));
      } else {
        setNeedsGrant(key);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <section data-testid="capture-options" aria-label="Capture options">
      {CAPTURE_OPTION_GROUPS.map((group) => (
        <fieldset key={group.id} style={fieldsetStyle}>
          <legend style={legendStyle}>{group.label}</legend>
          {group.options.map((option) => {
            const isPending = pending === option.key;
            return (
              <div key={option.key} style={rowStyle}>
                <label style={labelStyle}>
                  <input
                    type="checkbox"
                    data-testid={`capture-option-${option.key}`}
                    checked={value[option.key]}
                    disabled={disabled === true || isPending}
                    onChange={(event) => {
                      void handleToggle(option.key, event.target.checked);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
                {(() => {
                  const permission = optionPermission(option.key);
                  if (permission === undefined || grantedPermissions === undefined) {
                    return null;
                  }
                  if (grantedPermissions.has(permission)) {
                    return null;
                  }
                  return value[option.key] ? (
                    <span
                      data-testid={`capture-option-permission-revoked-${option.key}`}
                      style={revokedStyle}
                    >
                      permission revoked — grant it in the toolbar popup to use this
                    </span>
                  ) : (
                    <span
                      data-testid={`capture-option-needs-permission-${option.key}`}
                      style={hintStyle}
                    >
                      needs permission — enable in the toolbar popup
                    </span>
                  );
                })()}
                {isPending ? <span style={hintStyle}>Checking…</span> : null}
                {needsGrant === option.key ? (
                  <span
                    data-testid={`capture-option-needs-grant-${option.key}`}
                    style={needsGrantStyle}
                  >
                    Enable from the toolbar popup
                  </span>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ))}
    </section>
  );
}
