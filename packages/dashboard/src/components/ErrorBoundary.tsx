import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Recoverable error boundary (S4-04). Catches render errors in its subtree and shows a fallback with
 * a "Try again" reset instead of blanking the app. `onError` is a local hook only — no remote logging
 * (privacy-first, no telemetry).
 */

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Custom fallback; receives a `reset` callback that clears the error and re-renders children. */
  readonly fallback?: (reset: () => void) => ReactNode;
  readonly onError?: (error: Error, info: { readonly componentStack: string }) => void;
  readonly onReset?: () => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, { componentStack: info.componentStack ?? '' });
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(this.reset);
    }
    return (
      <div
        data-testid="async-boundary-fallback"
        role="alert"
        className="rounded-[var(--bc-radius)] border border-[var(--bc-danger-border)] bg-[var(--bc-danger-bg)] p-4 text-sm text-[var(--bc-danger-strong)]"
      >
        <p className="font-medium">Something went wrong displaying this view.</p>
        <button
          type="button"
          data-testid="async-boundary-retry"
          onClick={this.reset}
          className="mt-2 rounded-[var(--bc-radius)] border border-[var(--bc-danger-strong)] px-3 py-1 text-sm font-medium hover:bg-[var(--bc-danger-bg-strong)]"
        >
          Try again
        </button>
      </div>
    );
  }
}
