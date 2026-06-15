import { useState, type CSSProperties } from 'react';

import {
  REQUEST_PERMISSIONS,
  type RequestPermissionsRequest,
  type RequestPermissionsResponse,
} from '../../background/permissions-handler';
import browser from '../../lib/browser';
import type {
  OptionalPermissionName,
  OptionalPermissionRequest,
} from '../../permissions/optional-permissions';

export interface PermissionPromptProps {
  readonly permissions?: readonly OptionalPermissionName[];
  readonly origins?: readonly string[];
  /** Short human explanation of why the permission is needed. */
  readonly reason?: string;
  /** Defaults to the real overlay → service-worker bridge; injectable for tests. */
  readonly onRequest?: (request: OptionalPermissionRequest) => Promise<RequestPermissionsResponse>;
  readonly onResult?: (result: RequestPermissionsResponse) => void;
  /** Called when the user declines the prompt (Deny). */
  readonly onDismiss?: () => void;
}

type Status = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

/** Send the request to the service-worker permissions bridge. */
function requestViaBridge(request: OptionalPermissionRequest): Promise<RequestPermissionsResponse> {
  const message: RequestPermissionsRequest = {
    type: REQUEST_PERMISSIONS,
    ...(request.permissions ? { permissions: request.permissions } : {}),
    ...(request.origins ? { origins: request.origins } : {}),
  };
  return browser.runtime.sendMessage<RequestPermissionsRequest, RequestPermissionsResponse>(
    message,
  );
}

const panelStyle: CSSProperties = {
  padding: '12px',
  borderRadius: '8px',
  background: '#f8fafc',
  color: '#0f172a',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
};

const rowStyle: CSSProperties = { display: 'flex', gap: '8px', marginTop: '8px' };

const allowStyle: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const denyStyle: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const statusStyle: CSSProperties = { margin: '8px 0 0', fontSize: '12px', color: '#475569' };

function buildRequest(props: PermissionPromptProps): OptionalPermissionRequest {
  return {
    ...(props.permissions && props.permissions.length > 0
      ? { permissions: props.permissions }
      : {}),
    ...(props.origins && props.origins.length > 0 ? { origins: props.origins } : {}),
  };
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const { permissions = [], origins = [], reason, onRequest, onResult, onDismiss } = props;
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const labels = [...permissions, ...origins].join(', ');

  async function handleAllow(): Promise<void> {
    setStatus('requesting');
    setMessage('');
    try {
      const result = await (onRequest ?? requestViaBridge)(buildRequest(props));
      if (result.granted) {
        setStatus('granted');
        setMessage('Permission granted');
      } else if (result.ok) {
        setStatus('denied');
        setMessage('Permission denied');
      } else {
        setStatus('error');
        setMessage(result.reason ?? 'Permission request failed');
      }
      onResult?.(result);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Permission request failed');
    }
  }

  function handleDeny(): void {
    setStatus('denied');
    setMessage('');
    onDismiss?.();
  }

  const busy = status === 'requesting';

  return (
    <div
      role="dialog"
      aria-label="Permission request"
      data-testid="permission-prompt"
      style={panelStyle}
    >
      <p style={{ margin: 0 }}>
        BugCase needs the following{' '}
        {permissions.length + origins.length === 1 ? 'permission' : 'permissions'}:{' '}
        <strong data-testid="permission-list">{labels}</strong>
      </p>
      {reason ? <p style={{ margin: '4px 0 0', color: '#475569' }}>{reason}</p> : null}
      <div style={rowStyle}>
        <button
          type="button"
          data-testid="permission-allow"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            void handleAllow();
          }}
          style={allowStyle}
        >
          {busy ? 'Requesting…' : 'Allow'}
        </button>
        <button
          type="button"
          data-testid="permission-deny"
          disabled={busy}
          onClick={handleDeny}
          style={denyStyle}
        >
          Deny
        </button>
      </div>
      {message ? (
        <p data-testid="permission-status" role="status" style={statusStyle}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
