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

/**
 * Gesture-free "is this granted?" check via the service worker (`permissions.contains`).
 *
 * The component's documented default; in production both call sites now inject their own (the
 * overlay a snapshot-tracking wrapper, Settings a stub), so this runs only if a future caller omits
 * the prop. Guard shape deliberately matches `OverlayApp`'s copy: the whole body is inside
 * `try`/`catch`, not just a trailing `.catch()`, because `browser.runtime` can itself be undefined
 * outside a real extension context and that property access throws *synchronously*, before there is
 * any promise chain to reject.
 */
function checkPermissionViaBridge(permission: OptionalPermissionName): Promise<boolean> {
  try {
    const message: ContainsPermissionsRequest = {
      type: CONTAINS_PERMISSIONS,
      permissions: [permission],
    };
    return browser.runtime
      .sendMessage<ContainsPermissionsRequest, RequestPermissionsResponse>(message)
      .then((result) => result.granted === true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
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
/** Amber: something the user has to act on (grant in the popup). Shared by both grant notices. */
const needsGrantStyle: CSSProperties = { fontSize: '11px', color: '#b45309' };

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
    let granted = false;
    try {
      granted = await check(permission);
    } catch {
      // `check` is an injectable prop. Both production implementations swallow their own errors, but
      // a future one (or a test double) may reject or throw synchronously — an unhandled rejection
      // out of a click handler is not acceptable, and "not granted" is the safe reading anyway: it
      // only declines to switch on something the capture could not have collected.
      granted = false;
    } finally {
      setPending(null);
    }

    if (granted) {
      onChange(captureOptionsReducer(value, { type: 'set', key, value: true }));
    } else {
      setNeedsGrant(key);
    }
  }

  return (
    <section data-testid="capture-options" aria-label="Capture options">
      {CAPTURE_OPTION_GROUPS.map((group) => (
        <fieldset key={group.id} style={fieldsetStyle}>
          <legend style={legendStyle}>{group.label}</legend>
          {group.options.map((option) => {
            const isPending = pending === option.key;
            const permission = optionPermission(option.key);
            // `undefined` grants mean "not yet known" — render nothing rather than flash a label
            // before the check resolves.
            const ungranted =
              permission !== undefined &&
              grantedPermissions !== undefined &&
              !grantedPermissions.has(permission);
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
                {ungranted ? (
                  value[option.key] ? (
                    // Ticked but ungranted. Reachable in Settings, which records intent and never
                    // reconciles — so the permission was very often never granted at all, not
                    // revoked. The wording has to be true in both cases.
                    <span
                      data-testid={`capture-option-permission-revoked-${option.key}`}
                      style={needsGrantStyle}
                    >
                      permission not granted — grant it in the toolbar popup to use this
                    </span>
                  ) : (
                    <span
                      data-testid={`capture-option-needs-permission-${option.key}`}
                      style={hintStyle}
                    >
                      needs permission — enable in the toolbar popup
                    </span>
                  )
                ) : null}
                {isPending ? <span style={hintStyle}>Checking…</span> : null}
                {/*
                  Only when the label above is absent: a failed toggle on a row that already reads
                  "needs permission — enable in the toolbar popup" would otherwise stack a second,
                  near-identical instruction beside it.
                */}
                {needsGrant === option.key && !ungranted ? (
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
