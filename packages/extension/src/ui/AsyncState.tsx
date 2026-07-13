import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared async-state primitive for the extension UI (S4-04) — the mirror of the dashboard
 * `AsyncState`, kept API-identical so both sides stay consistent. Uses inline styles because the
 * overlay renders inside an injected Shadow DOM (no Tailwind). Loading skeleton / empty / error
 * (with optional Retry) / ready children.
 */

export type AsyncStatus = 'loading' | 'empty' | 'error' | 'ready';

export interface AsyncStateProps {
  readonly status: AsyncStatus;
  readonly children?: ReactNode;
  readonly empty?: ReactNode;
  readonly loadingLabel?: string;
  readonly errorMessage?: ReactNode;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const skeletonBlock: CSSProperties = { background: '#e2e8f0', borderRadius: 6, height: 20 };

const errorBox: CSSProperties = {
  border: '1px solid #fca5a5',
  background: '#fef2f2',
  color: '#b91c1c',
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
};

const retryButton: CSSProperties = {
  marginTop: 8,
  border: '1px solid #fca5a5',
  background: 'transparent',
  color: '#b91c1c',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 13,
  cursor: 'pointer',
};

export function AsyncState({
  status,
  children,
  empty,
  loadingLabel = 'Loading…',
  errorMessage,
  onRetry,
  retryLabel = 'Retry',
}: AsyncStateProps) {
  if (status === 'loading') {
    return (
      <div data-testid="async-loading" role="status" aria-busy="true">
        <div aria-hidden="true" style={{ display: 'grid', gap: 8 }}>
          <div style={{ ...skeletonBlock, width: '33%' }} />
          <div style={{ ...skeletonBlock, height: 80 }} />
          <div style={{ ...skeletonBlock, height: 80 }} />
        </div>
        <span style={srOnly}>{loadingLabel}</span>
      </div>
    );
  }

  if (status === 'empty') {
    return <div data-testid="async-empty">{empty}</div>;
  }

  if (status === 'error') {
    return (
      <div data-testid="async-error" role="alert" style={errorBox}>
        <p style={{ margin: 0 }}>{errorMessage}</p>
        {onRetry ? (
          <button type="button" data-testid="async-retry" onClick={onRetry} style={retryButton}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
