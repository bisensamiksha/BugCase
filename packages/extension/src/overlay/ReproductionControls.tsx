import type { CSSProperties } from 'react';

import type { ReproductionSessionStatus } from './reproduction-session';

export interface ReproductionControlsProps {
  readonly status: ReproductionSessionStatus;
  readonly onStart: () => void;
  readonly onStop: () => void;
  /** When a recorded session was cut short by a navigation, surface that in the summary (Part B). */
  readonly interrupted?: boolean;
}

// Inline styles keep the controls self-contained inside the Shadow DOM, matching the rest of the
// overlay; a shared stylesheet is deferred to a later UI ticket.
const sectionStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '8px 12px',
  margin: '0 0 8px',
};
const legendStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#475569' };
const hintStyle: CSSProperties = { fontSize: '11px', color: '#64748b', margin: '4px 0 8px' };
const statusStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0f172a',
  margin: '2px 0 8px',
};
const buttonStyle: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '6px 12px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};
const stopButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: '1px solid #b91c1c',
  background: '#fef2f2',
  color: '#b91c1c',
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
}: ReproductionControlsProps) {
  if (status === 'recording') {
    return (
      <section data-testid="reproduction-controls" aria-label="Reproduction recorder">
        <p data-testid="reproduction-status" style={statusStyle}>
          ● Recording — interact with the page, then Stop
        </p>
        <button
          type="button"
          data-testid="reproduction-stop"
          style={stopButtonStyle}
          onClick={onStop}
        >
          ■ Stop recording
        </button>
      </section>
    );
  }

  return (
    <section data-testid="reproduction-controls" aria-label="Reproduction recorder">
      <fieldset style={sectionStyle}>
        <legend style={legendStyle}>Reproduction steps</legend>
        {status === 'recorded' ? (
          <p data-testid="reproduction-status" style={statusStyle}>
            {interrupted
              ? '✓ Recording ended (page changed) — steps included on capture'
              : '✓ Reproduction steps recorded — included on capture'}
          </p>
        ) : (
          <p style={hintStyle}>Records where you click, type, and scroll — never what you type.</p>
        )}
        <button
          type="button"
          data-testid="reproduction-start"
          style={buttonStyle}
          onClick={onStart}
        >
          {status === 'recorded' ? 'Record again' : '▸ Record reproduction steps'}
        </button>
      </fieldset>
    </section>
  );
}
