import { palette } from '@bugcase/shared-tokens';
import type { CSSProperties } from 'react';

import type { ReproductionSessionStatus } from './reproduction-session';

export interface ReproductionControlsProps {
  readonly status: ReproductionSessionStatus;
  readonly onStart: () => void;
  readonly onStop: () => void;
  /** When a recorded session was cut short by a navigation, surface that in the summary (Part B). */
  readonly interrupted?: boolean;
  /**
   * Whether any screenshot option is enabled. Gates the screenshot-timing hint only — it must not
   * claim "the screenshot is taken when you press Capture" when the user has turned every screenshot
   * off. Defaults to `true` so callers that don't track capture options keep the hint.
   */
  readonly screenshotEnabled?: boolean;
}

// Inline styles keep the controls self-contained inside the Shadow DOM, matching the rest of the
// overlay; a shared stylesheet is deferred to a later UI ticket.
const sectionStyle: CSSProperties = {
  border: `1px solid ${palette.slate200}`,
  borderRadius: '8px',
  padding: '8px 12px',
  margin: '0 0 8px',
};
const legendStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: palette.slate600 };
const hintStyle: CSSProperties = { fontSize: '11px', color: palette.slate500, margin: '4px 0 8px' };
const statusStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: palette.slate900,
  margin: '2px 0 8px',
};
const buttonStyle: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '6px 12px',
  borderRadius: '6px',
  border: `1px solid ${palette.slate300}`,
  background: palette.white,
  color: palette.slate900,
  cursor: 'pointer',
};
const stopButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: `1px solid ${palette.red700}`,
  background: palette.red50,
  color: palette.red700,
};

/**
 * Start/Stop controls for the reproduction recorder (S3-12). It only reflects and toggles the session
 * status — never any recorded content, which is flushed once at capture time. The overlay collapses to
 * a small pill while `recording`, so the page underneath stays interactive.
 */
export function ReproductionControls({
  status,
  onStart,
  onStop,
  interrupted,
  screenshotEnabled = true,
}: ReproductionControlsProps) {
  if (status === 'recording') {
    return (
      <section data-testid="reproduction-controls" aria-label="Reproduction step tracker">
        <p data-testid="reproduction-status" style={statusStyle}>
          ● Tracking steps. Interact with the page, then Stop
        </p>
        <button
          type="button"
          data-testid="reproduction-stop"
          style={stopButtonStyle}
          onClick={onStop}
        >
          ■ Stop tracking
        </button>
      </section>
    );
  }

  return (
    <section data-testid="reproduction-controls" aria-label="Reproduction step tracker">
      <fieldset style={sectionStyle}>
        <legend style={legendStyle}>Reproduction steps</legend>
        {status === 'recorded' ? (
          <p data-testid="reproduction-status" style={statusStyle}>
            {interrupted
              ? '✓ Step tracking ended (page changed). Steps included on capture'
              : '✓ Reproduction steps tracked, included on capture'}
          </p>
        ) : (
          <p style={hintStyle}>
            Logs where you click, type, and scroll. Never what you type, and never video or audio.
          </p>
        )}
        <button
          type="button"
          data-testid="reproduction-start"
          style={buttonStyle}
          onClick={onStart}
        >
          {status === 'recorded' ? 'Track again' : '▸ Track reproduction steps'}
        </button>
        {/* Only true when a screenshot is actually part of the capture; with every screenshot option
            off, this would promise something that never happens. Copy only — the capture flow that
            takes the shot on Capture is untouched. */}
        {screenshotEnabled ? (
          <p data-testid="reproduction-screenshot-hint" style={hintStyle}>
            The screenshot is taken when you press Capture, so make sure the bug is on screen then.
          </p>
        ) : null}
      </fieldset>
    </section>
  );
}
