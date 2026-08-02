import { palette } from '@bugcase/shared-tokens';
import type { CSSProperties } from 'react';

export interface CookiesWarningProps {
  /** Whether the optional `cookies` permission is granted, so cookies will be captured. */
  readonly active: boolean;
  /** Optional host name to name in the warning (e.g. `example.com`). */
  readonly hostName?: string;
}

// A warning bar: the user must know cookies are pulled into the report (values are masked, but the
// presence and names of cookies still carry information). Amber palette, distinct from the red
// debugger banner so the two read as different severities.
const warningStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '8px',
  background: palette.amber900,
  color: palette.amber100,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
};

const dotStyle: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: palette.amber500,
  flex: '0 0 auto',
};

/**
 * Warning shown while the optional `cookies` permission is granted, so the user knows this site's
 * cookies are included in the report. Renders nothing when inactive so callers can mount it
 * unconditionally and toggle the `active` prop.
 */
export function CookiesWarning({ active, hostName }: CookiesWarningProps) {
  if (!active) {
    return null;
  }
  return (
    <div role="alert" aria-live="polite" data-testid="cookies-warning" style={warningStyle}>
      <span aria-hidden="true" style={dotStyle} />
      <span>
        BugCase is including {hostName ? `${hostName}'s` : 'this site’s'} cookies in the report. All
        cookie values are masked — only names and attributes are recorded.
      </span>
    </div>
  );
}
