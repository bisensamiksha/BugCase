import { useState, type CSSProperties } from 'react';

import {
  ORIGIN_ALLOWLIST_MESSAGE,
  type OriginAllowlistRequest,
  type OriginAllowlistResponse,
} from '../../background/origin-allowlist-handler';
import browser from '../../lib/browser';

export interface OriginOptInModalProps {
  /** The page origin being prompted, e.g. `https://example.com`. */
  readonly origin: string;
  /** Defaults to the real overlay → service-worker bridge; injectable for tests. */
  readonly onEnable?: (origin: string) => Promise<OriginAllowlistResponse>;
  readonly onResult?: (result: OriginAllowlistResponse) => void;
  /** Called when the user declines ("Not now"). */
  readonly onDismiss?: () => void;
}

type Status = 'idle' | 'enabling' | 'enabled' | 'dismissed' | 'error';

/** Add the origin to the allowlist via the service-worker bridge. */
function enableViaBridge(origin: string): Promise<OriginAllowlistResponse> {
  const message: OriginAllowlistRequest = { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'add', origin };
  return browser.runtime.sendMessage<OriginAllowlistRequest, OriginAllowlistResponse>(message);
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

const enableStyle: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const dismissStyle: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const statusStyle: CSSProperties = { margin: '8px 0 0', fontSize: '12px', color: '#475569' };

export function OriginOptInModal(props: OriginOptInModalProps) {
  const { origin, onEnable, onResult, onDismiss } = props;
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleEnable(): Promise<void> {
    setStatus('enabling');
    setMessage('');
    try {
      const result = await (onEnable ?? enableViaBridge)(origin);
      if (result.ok) {
        setStatus('enabled');
        setMessage('Passive monitoring enabled');
      } else {
        setStatus('error');
        setMessage(result.reason ?? 'Could not enable passive monitoring');
      }
      onResult?.(result);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not enable passive monitoring');
    }
  }

  function handleDismiss(): void {
    setStatus('dismissed');
    setMessage('');
    onDismiss?.();
  }

  const busy = status === 'enabling';

  return (
    <div
      role="dialog"
      aria-label="Enable passive monitoring"
      data-testid="origin-opt-in"
      style={panelStyle}
    >
      <p style={{ margin: 0 }}>
        Enable passive monitoring on <strong data-testid="origin-name">{origin}</strong>?
      </p>
      <p style={{ margin: '4px 0 0', color: '#475569' }}>
        BugCase will buffer console and network activity for this origin in memory only, so it can
        be included in a future capture. Nothing is recorded until you opt in, and nothing leaves
        your browser.
      </p>
      <div style={rowStyle}>
        <button
          type="button"
          data-testid="origin-enable"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            void handleEnable();
          }}
          style={enableStyle}
        >
          {busy ? 'Enabling…' : 'Enable'}
        </button>
        <button
          type="button"
          data-testid="origin-dismiss"
          disabled={busy}
          onClick={handleDismiss}
          style={dismissStyle}
        >
          Not now
        </button>
      </div>
      {message ? (
        <p data-testid="origin-status" role="status" style={statusStyle}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
