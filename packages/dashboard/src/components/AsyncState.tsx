import type { ReactNode } from 'react';

/**
 * Shared async-state primitive (S4-04). Renders one of four presentational states — loading skeleton,
 * empty, error (with an optional Retry), or ready `children`. Built once so every dashboard pane
 * (S4-06 … S4-13) consumes the same loading/empty/error UI instead of inventing its own. Pure and
 * stateless; the caller owns the status and the retry action.
 */

export type AsyncStatus = 'loading' | 'empty' | 'error' | 'ready';

export interface AsyncStateProps {
  readonly status: AsyncStatus;
  /** Rendered only when `status === 'ready'`. */
  readonly children?: ReactNode;
  /** Rendered when `status === 'empty'` (message, dropzone, …). */
  readonly empty?: ReactNode;
  /** Visually-hidden label announced while loading. */
  readonly loadingLabel?: string;
  /** Rendered when `status === 'error'`. */
  readonly errorMessage?: ReactNode;
  /** When provided, the error state shows a Retry button that invokes this. */
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly className?: string;
}

export function AsyncState({
  status,
  children,
  empty,
  loadingLabel = 'Loading…',
  errorMessage,
  onRetry,
  retryLabel = 'Retry',
  className,
}: AsyncStateProps) {
  if (status === 'loading') {
    return (
      <div data-testid="async-loading" role="status" aria-busy="true" className={className}>
        <div className="animate-pulse space-y-2" aria-hidden="true">
          <div className="h-6 w-1/3 rounded bg-[var(--bc-border)]" />
          <div className="h-24 rounded bg-[var(--bc-border)]" />
          <div className="h-24 rounded bg-[var(--bc-border)]" />
        </div>
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div data-testid="async-empty" className={className}>
        {empty}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        data-testid="async-error"
        role="alert"
        className={`rounded-[var(--bc-radius)] border border-red-300 bg-red-50 p-4 text-sm text-red-700 ${
          className ?? ''
        }`}
      >
        <p>{errorMessage}</p>
        {onRetry ? (
          <button
            type="button"
            data-testid="async-retry"
            onClick={onRetry}
            className="mt-2 rounded-[var(--bc-radius)] border border-red-300 px-3 py-1 text-sm font-medium hover:bg-red-100"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
