import { palette } from '@bugcase/shared-tokens';
import { useState, type CSSProperties } from 'react';

import {
  REDACT_TEXT,
  type RedactTextRequest,
  type RedactTextResponse,
} from '../background/messages';
import browser from '../lib/browser';

/**
 * Manual text redaction on the review screen (BUG-04).
 *
 * The always-on scrubbers cannot know every secret — a value can reach the report through a field no
 * heuristic flags. This removes an exact string from the held report (both `report.json` and the DOM
 * snapshot html) before the ZIP is written.
 *
 * Deliberately states that images are NOT covered: screenshots and element crops are raw pixels and
 * are redacted by hand in Annotate (BUG-01). Overpromising here would be the same mistake.
 */

export interface RedactTextPanelProps {
  readonly reportId: string;
  /** Defaults to the real runtime bridge; injected in tests. */
  readonly send?: (message: RedactTextRequest) => Promise<RedactTextResponse>;
  readonly disabled?: boolean;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'done'; readonly reportHits: number; readonly assetHits: number }
  | { readonly kind: 'error'; readonly message: string };

const wrapStyle: CSSProperties = {
  border: `1px solid ${palette.slate200}`,
  borderRadius: '8px',
  padding: '12px',
  margin: '12px 0',
};

const rowStyle: CSSProperties = { display: 'flex', gap: '8px', alignItems: 'center' };

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: `1px solid ${palette.slate300}`,
  borderRadius: '6px',
  fontSize: '13px',
};

const buttonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  border: 'none',
  background: palette.blue600,
  color: palette.white,
  fontWeight: 600,
  cursor: 'pointer',
};

const noteStyle: CSSProperties = { margin: '8px 0 0', fontSize: '12px', color: palette.slate600 };

function defaultSend(message: RedactTextRequest): Promise<RedactTextResponse> {
  return browser.runtime.sendMessage<RedactTextRequest, RedactTextResponse>(message);
}

export function RedactTextPanel({ reportId, send, disabled }: RedactTextPanelProps) {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const busy = status.kind === 'working';

  async function handleRedact(): Promise<void> {
    setStatus({ kind: 'working' });
    try {
      const result = await (send ?? defaultSend)({ type: REDACT_TEXT, reportId, secret });
      if (result.ok) {
        setStatus({
          kind: 'done',
          reportHits: result.reportHits ?? 0,
          assetHits: result.assetHits ?? 0,
        });
        // Clear the field so the secret does not linger on screen after it has been removed.
        setSecret('');
      } else {
        setStatus({ kind: 'error', message: result.reason ?? 'Redaction failed.' });
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Redaction failed.',
      });
    }
  }

  const total = status.kind === 'done' ? status.reportHits + status.assetHits : 0;

  return (
    <section style={wrapStyle} data-testid="redact-text-panel">
      <strong>Redact text</strong>
      <p style={noteStyle}>
        Remove an exact string from this report: the DOM snapshot, element inspections, console,
        network, and storage. Images are <strong>not</strong> covered; use <strong>Annotate</strong>{' '}
        for screenshots.
      </p>
      <div style={{ ...rowStyle, marginTop: '8px' }}>
        <input
          type="text"
          data-testid="redact-text-input"
          aria-label="Text to redact"
          placeholder="Paste the value to remove"
          value={secret}
          disabled={disabled === true || busy}
          onChange={(event) => setSecret(event.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          data-testid="redact-text-apply"
          disabled={disabled === true || busy || secret.trim().length === 0}
          aria-busy={busy}
          onClick={() => {
            void handleRedact();
          }}
          style={buttonStyle}
        >
          {busy ? 'Redacting…' : 'Redact'}
        </button>
      </div>
      {status.kind === 'done' ? (
        <p style={noteStyle} data-testid="redact-text-status" role="status">
          {total === 0
            ? 'Not found in this report, so nothing changed.'
            : `Redacted ${total} occurrence${total === 1 ? '' : 's'} ` +
              `(${status.reportHits} in report data, ${status.assetHits} in the DOM snapshot).`}
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p
          style={{ ...noteStyle, color: palette.red700 }}
          data-testid="redact-text-status"
          role="alert"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
