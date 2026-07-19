import type { PrivacySummary } from '@bugcase/shared-ui';
import { useState, type CSSProperties } from 'react';

export interface PrivacyNoticeModalProps {
  /** Permissions + scrubber state to show the user, from {@link summarizePrivacy}. */
  readonly summary: PrivacySummary;
  readonly reportId?: string;
  /** Held true while the download is in flight; keeps the consent gate closed. */
  readonly disabled?: boolean;
  /** Return to the review screen without downloading. */
  readonly onCancel?: () => void;
  /** Consent given — proceed with the download. */
  readonly onComplete?: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#ffffff',
  color: '#0f172a',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  padding: '24px',
  overflowY: 'auto',
  zIndex: 2,
};

const sectionHeadingStyle: CSSProperties = { margin: '20px 0 4px', fontSize: '14px' };
const mutedStyle: CSSProperties = { color: '#475569', margin: '4px 0' };
const listStyle: CSSProperties = { margin: '4px 0', paddingLeft: '20px', color: '#475569' };
const consentStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  margin: '20px 0 0',
};
const footerStyle: CSSProperties = { display: 'flex', gap: '12px', marginTop: '16px' };

export function PrivacyNoticeModal({
  summary,
  disabled,
  onCancel,
  onComplete,
}: PrivacyNoticeModalProps) {
  const [understood, setUnderstood] = useState(false);
  const busy = disabled ?? false;
  const canConfirm = understood && !busy;

  const scrubberSummary =
    summary.scrubbers.length === 0
      ? 'No sensitive values were detected or removed from this capture.'
      : `${summary.scrubbers.length} scrubber ${
          summary.scrubbers.length === 1 ? 'rule' : 'rules'
        } ran and removed ${summary.totalScrubberHits} ${
          summary.totalScrubberHits === 1 ? 'value' : 'values'
        } before download.`;

  return (
    <section
      data-testid="privacy-notice-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-notice-heading"
      aria-busy={busy}
      style={overlayStyle}
    >
      <h2 id="privacy-notice-heading" style={{ marginTop: 0 }}>
        Ready to download
      </h2>
      <p style={mutedStyle}>
        This report is saved to your computer only — nothing is uploaded. Review what it contains
        before you download.
      </p>

      <h3 style={sectionHeadingStyle}>Scrubbers</h3>
      <p data-testid="privacy-scrubber-summary" style={mutedStyle}>
        {scrubberSummary}
      </p>
      {summary.scrubbers.length > 0 ? (
        <ul style={listStyle}>
          {summary.scrubbers.map((s) => (
            <li key={s.id}>
              {s.description} — {s.hits} removed
            </li>
          ))}
        </ul>
      ) : null}

      <h3 style={sectionHeadingStyle}>Permissions used at capture</h3>
      <p data-testid="privacy-permissions" style={mutedStyle}>
        {summary.permissions.length === 0
          ? 'No optional permissions were used.'
          : summary.permissions.join(', ')}
      </p>

      <label style={consentStyle}>
        <input
          type="checkbox"
          data-testid="privacy-understand"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
        />
        <span>
          I understand this report may still contain sensitive data and will be saved to my device.
        </span>
      </label>

      <div style={footerStyle}>
        <button
          type="button"
          data-testid="privacy-cancel"
          onClick={() => onCancel?.()}
          disabled={busy}
        >
          Back
        </button>
        <button
          type="button"
          data-testid="privacy-confirm"
          onClick={() => onComplete?.()}
          disabled={!canConfirm}
        >
          Download
        </button>
      </div>
    </section>
  );
}
