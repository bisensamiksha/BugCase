import type { UserOptions } from '@bugcase/schema';
import { useState, type CSSProperties } from 'react';

import {
  REQUEST_PERMISSIONS,
  type RequestPermissionsRequest,
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
  /** Requests an optional permission; defaults to the REQUEST_PERMISSIONS SW bridge. Injectable for tests. */
  readonly requestPermission?: (permission: OptionalPermissionName) => Promise<boolean>;
}

/** Ask the service worker to run chrome.permissions.request (the overlay can't call it directly). */
async function requestPermissionViaBridge(permission: OptionalPermissionName): Promise<boolean> {
  const message: RequestPermissionsRequest = {
    type: REQUEST_PERMISSIONS,
    permissions: [permission],
  };
  try {
    const result = await browser.runtime.sendMessage<
      RequestPermissionsRequest,
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
const deniedStyle: CSSProperties = { fontSize: '11px', color: '#b91c1c' };

export function CaptureOptions({
  value,
  onChange,
  disabled,
  requestPermission,
}: CaptureOptionsProps) {
  const request = requestPermission ?? requestPermissionViaBridge;
  const [pending, setPending] = useState<CaptureOptionKey | null>(null);
  const [denied, setDenied] = useState<CaptureOptionKey | null>(null);

  async function handleToggle(key: CaptureOptionKey, nextChecked: boolean): Promise<void> {
    setDenied((current) => (current === key ? null : current));

    const permission = optionPermission(key);
    // Turning off, or a non-gated option: apply immediately.
    if (!nextChecked || permission === undefined) {
      onChange(captureOptionsReducer(value, { type: 'set', key, value: nextChecked }));
      return;
    }

    // Turning on a gated option: request the permission first.
    setPending(key);
    try {
      const granted = await request(permission);
      if (granted) {
        onChange(captureOptionsReducer(value, { type: 'set', key, value: true }));
      } else {
        setDenied(key);
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
            const gated = option.permission !== undefined;
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
                {gated ? <span style={hintStyle}>needs permission</span> : null}
                {isPending ? <span style={hintStyle}>Requesting…</span> : null}
                {denied === option.key ? (
                  <span data-testid={`capture-option-denied-${option.key}`} style={deniedStyle}>
                    Permission denied
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
