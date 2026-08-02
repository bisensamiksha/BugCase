import { palette } from '@bugcase/shared-tokens';
import type { CSSProperties } from 'react';

export interface DebuggerBannerProps {
  /** Whether the debugger is currently attached to the tab. */
  readonly active: boolean;
  /** Optional host name to name in the banner (e.g. `example.com`). */
  readonly hostName?: string;
}

// A high-visibility bar: the user must always know when the privileged debugger is attached.
const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '8px',
  background: palette.orange900,
  color: palette.orange100,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
};

const dotStyle: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: palette.orange500,
  flex: '0 0 auto',
};

/**
 * Visible banner shown for the lifetime of an attached `chrome.debugger` session. Renders nothing
 * when inactive so callers can mount it unconditionally and toggle the `active` prop.
 */
export function DebuggerBanner({ active, hostName }: DebuggerBannerProps) {
  if (!active) {
    return null;
  }
  return (
    <div role="alert" aria-live="assertive" data-testid="debugger-banner" style={bannerStyle}>
      <span aria-hidden="true" style={dotStyle} />
      <span>
        BugCase is inspecting network activity via the browser debugger
        {hostName ? ` on ${hostName}` : ''}. This is only active during capture.
      </span>
    </div>
  );
}
