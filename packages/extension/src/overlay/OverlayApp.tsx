import type { CSSProperties } from 'react';

import { CaptureButton } from './CaptureButton';

export interface OverlayAppProps {
  readonly onClose: () => void;
}

// Inline styles keep the overlay self-contained inside the Shadow DOM; a Tailwind-in-shadow
// stylesheet is deferred to a later UI ticket. The host element handles positioning/z-index.
const panelStyle: CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '320px',
  padding: '16px',
  borderRadius: '12px',
  background: '#ffffff',
  color: '#0f172a',
  boxShadow: '0 10px 30px rgba(2, 6, 23, 0.25)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const closeStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '20px',
  lineHeight: 1,
  color: '#475569',
};

export function OverlayApp({ onClose }: OverlayAppProps) {
  return (
    <div
      role="dialog"
      aria-label="BugCase capture overlay"
      data-testid="bugcase-overlay"
      style={panelStyle}
    >
      <header style={headerStyle}>
        <strong>Bug Reporter</strong>
        <button
          type="button"
          aria-label="Close overlay"
          data-testid="bugcase-overlay-close"
          onClick={onClose}
          style={closeStyle}
        >
          ×
        </button>
      </header>
      <p style={{ margin: '0 0 8px', color: '#475569' }}>
        Capture the visible tab and download a bug report ZIP.
      </p>
      <CaptureButton onComplete={onClose} />
    </div>
  );
}
