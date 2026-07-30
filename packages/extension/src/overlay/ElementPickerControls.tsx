import type { CSSProperties } from 'react';

import type { ElementPickerStatus } from './element-inspection-session';

export interface ElementPickerControlsProps {
  readonly status: ElementPickerStatus;
  readonly count: number;
  readonly onStartPicking: () => void;
  readonly onStopPicking: () => void;
  /** Set when the last pick's image was dropped for the crop budget (BUG-06); shown while picking. */
  readonly budgetNotice?: string | null;
}

// Inline styles keep the controls self-contained inside the Shadow DOM, matching the rest of the overlay.
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
const noticeStyle: CSSProperties = {
  fontSize: '11px',
  color: '#b45309',
  margin: '0 0 8px',
};

function inspectedLine(count: number): string {
  return `✓ ${count} element${count === 1 ? '' : 's'} inspected`;
}

/**
 * Start/Done controls for the element inspector (S3-13). While picking, the overlay collapses so the
 * user can hover + click page elements; each pick adds one inspection to the pending capture.
 */
export function ElementPickerControls({
  status,
  count,
  onStartPicking,
  onStopPicking,
  budgetNotice,
}: ElementPickerControlsProps) {
  if (status === 'picking') {
    return (
      <section data-testid="element-picker-controls" aria-label="Element inspector">
        <p data-testid="element-picker-status" style={statusStyle}>
          ◎ Click elements to inspect — {count} so far (Esc to cancel)
        </p>
        {budgetNotice ? (
          <p data-testid="element-picker-budget-notice" role="status" style={noticeStyle}>
            {budgetNotice}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="element-picker-done"
          style={buttonStyle}
          onClick={onStopPicking}
        >
          Done inspecting
        </button>
      </section>
    );
  }

  return (
    <section data-testid="element-picker-controls" aria-label="Element inspector">
      <fieldset style={sectionStyle}>
        <legend style={legendStyle}>Element inspector</legend>
        {count > 0 ? (
          <p data-testid="element-picker-status" style={statusStyle}>
            {inspectedLine(count)}
          </p>
        ) : (
          <p style={hintStyle}>
            Hover to highlight, click to capture an element (HTML, styles, box, screenshot).
          </p>
        )}
        <button
          type="button"
          data-testid="element-picker-start"
          style={buttonStyle}
          onClick={onStartPicking}
        >
          {count > 0 ? 'Inspect another element' : '▸ Inspect an element'}
        </button>
      </fieldset>
    </section>
  );
}
