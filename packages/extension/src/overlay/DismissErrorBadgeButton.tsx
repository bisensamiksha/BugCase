import { palette } from '@bugcase/shared-tokens';
import type { CSSProperties } from 'react';

export interface DismissErrorBadgeButtonProps {
  /** Uncaught errors detected on this page (S3-14); the banner is hidden at zero. */
  readonly count: number;
  readonly onDismiss: () => void;
}

// Inline styles keep the banner self-contained inside the Shadow DOM, matching the rest of the overlay.
const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  border: `1px solid ${palette.red200}`,
  background: palette.red50,
  borderRadius: '8px',
  padding: '8px 12px',
  margin: '0 0 8px',
};
const textStyle: CSSProperties = { fontSize: '13px', color: palette.red800 };
const buttonStyle: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '12px',
  padding: '4px 10px',
  borderRadius: '6px',
  border: `1px solid ${palette.red300}`,
  background: palette.white,
  color: palette.red800,
  cursor: 'pointer',
  flexShrink: 0,
};

/**
 * Passive error badge dismiss UI (S3-14). Shown in the overlay when the current page logged uncaught
 * errors; clicking Dismiss clears the toolbar badge for the tab. Hidden when there are no errors.
 */
export function DismissErrorBadgeButton({ count, onDismiss }: DismissErrorBadgeButtonProps) {
  if (count <= 0) {
    return null;
  }
  return (
    <div data-testid="dismiss-error-badge-banner" style={bannerStyle}>
      <span data-testid="dismiss-error-badge-count" style={textStyle}>
        ⚠ This page logged {count} error{count === 1 ? '' : 's'}.
      </span>
      <button
        type="button"
        data-testid="dismiss-error-badge"
        style={buttonStyle}
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
