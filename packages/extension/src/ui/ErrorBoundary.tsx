import { palette } from '@bugcase/shared-tokens';
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

/**
 * Recoverable error boundary for the extension UI (S4-04) — the mirror of the dashboard
 * `ErrorBoundary`. Catches render errors in its subtree and shows a "Try again" fallback instead of
 * a broken/blank overlay. `onError` is a local hook only — never log captured values (privacy-first,
 * no telemetry). Inline styles because the overlay renders inside an injected Shadow DOM.
 */

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: (reset: () => void) => ReactNode;
  readonly onError?: (error: Error, info: { readonly componentStack: string }) => void;
  readonly onReset?: () => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

const fallbackBox: CSSProperties = {
  border: `1px solid ${palette.red300}`,
  background: palette.red50,
  color: palette.red700,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
};

const retryButton: CSSProperties = {
  marginTop: 8,
  border: `1px solid ${palette.red300}`,
  background: 'transparent',
  color: palette.red700,
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 13,
  cursor: 'pointer',
};

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
      <div data-testid="async-boundary-fallback" role="alert" style={fallbackBox}>
        <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong displaying this view.</p>
        <button
          type="button"
          data-testid="async-boundary-retry"
          onClick={this.reset}
          style={retryButton}
        >
          Try again
        </button>
      </div>
    );
  }
}
