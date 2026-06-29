import { useState, type CSSProperties } from 'react';

import type { CaptureReportResponse } from '../background/messages';

import { requestCapture } from './request-capture';

export interface CaptureButtonProps {
  /** Defaults to the real overlay → service-worker capture flow; injectable for tests. */
  readonly onCapture?: () => Promise<CaptureReportResponse>;
  readonly onComplete?: (result: CaptureReportResponse) => void;
  readonly disabled?: boolean;
}

type Status = 'idle' | 'capturing' | 'done' | 'error';

const buttonStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const statusStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: '12px',
  color: '#475569',
};

export function CaptureButton({ onCapture, onComplete, disabled }: CaptureButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleClick(): Promise<void> {
    setStatus('capturing');
    setMessage('');
    try {
      const result = await (onCapture ?? requestCapture)();
      if (result.ok) {
        setStatus('done');
        setMessage('Captured');
        onComplete?.(result);
      } else {
        setStatus('error');
        setMessage(result.reason ?? 'Capture failed');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Capture failed');
    }
  }

  const busy = status === 'capturing';

  return (
    <div>
      <button
        type="button"
        data-testid="capture-button"
        disabled={disabled === true || busy}
        aria-busy={busy}
        onClick={() => {
          void handleClick();
        }}
        style={buttonStyle}
      >
        {busy ? 'Capturing…' : 'Capture'}
      </button>
      {message ? (
        <p data-testid="capture-status" role="status" style={statusStyle}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
