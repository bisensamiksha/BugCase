import { palette } from '@bugcase/shared-tokens';
import { useState, type CSSProperties } from 'react';

import { setOnboardingSeen } from '../storage/onboarding';

/** One tour slide: a title and a few short body points. */
export interface OnboardingSlide {
  readonly title: string;
  readonly points: readonly string[];
}

/**
 * The three first-install slides (S3-18): what BugCase captures, what it never captures, and how to use
 * it. Copy is intentionally concrete about the privacy stance (on-device, no telemetry, review-before-
 * download) to match the rest of the product.
 */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    title: 'What BugCase captures',
    points: [
      'A screenshot of the page, plus the console and network logs, a DOM snapshot, and page metadata. Only what you choose to include.',
      'Everything is assembled into a single report ZIP on your device.',
    ],
  },
  {
    title: 'What it never captures',
    points: [
      'No telemetry, no backend, no remote logging. BugCase has no server.',
      'Passwords and sensitive input values are masked by default, and you can review and remove anything before saving.',
      'Nothing leaves your browser until you download the ZIP yourself.',
    ],
  },
  {
    title: 'How to use it',
    points: [
      'On a page with a bug, click the BugCase toolbar icon and pick what to include.',
      'Review the capture, then annotate or redact the screenshot on the preview screen.',
      'Download the ZIP and attach it to your bug report.',
    ],
  },
];

export interface OnboardingTourProps {
  /** Called after the tour is finished (Done on the last slide). */
  readonly onComplete: () => void;
  /** Called when the tour is skipped; defaults to `onComplete` when omitted. */
  readonly onCancel?: () => void;
  /** Persists the seen flag; defaults to `setOnboardingSeen`. Injectable for tests. */
  readonly markSeen?: (seen: boolean) => Promise<void>;
  readonly disabled?: boolean;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.55)',
  zIndex: 1000,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const cardStyle: CSSProperties = {
  width: 'min(440px, calc(100vw - 32px))',
  background: palette.white,
  color: palette.slate900,
  borderRadius: '12px',
  padding: '24px',
  boxShadow: '0 20px 50px rgba(2, 6, 23, 0.35)',
};
const titleStyle: CSSProperties = { fontSize: '18px', fontWeight: 700, margin: '0 0 12px' };
const listStyle: CSSProperties = { margin: '0 0 20px', paddingLeft: '18px', lineHeight: 1.5 };
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};
const primaryBtn: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '14px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: `1px solid ${palette.blue600}`,
  background: palette.blue600,
  color: palette.white,
  cursor: 'pointer',
};
const secondaryBtn: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '14px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: `1px solid ${palette.slate300}`,
  background: palette.white,
  color: palette.slate900,
  cursor: 'pointer',
};
const linkBtn: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '8px 4px',
  border: 'none',
  background: 'transparent',
  color: palette.slate600,
  cursor: 'pointer',
};
const progressStyle: CSSProperties = { fontSize: '12px', color: palette.slate500 };

/**
 * First-install onboarding tour (S3-18) — three slides shown once, overlaid on the options page. Back/
 * Next navigate; Skip (any slide) or Done (last slide) mark the tour seen so it never shows again.
 */
export function OnboardingTour({ onComplete, onCancel, markSeen, disabled }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const persist = markSeen ?? setOnboardingSeen;
  const slide = ONBOARDING_SLIDES[index]!;
  const isFirst = index === 0;
  const isLast = index === ONBOARDING_SLIDES.length - 1;

  function finish(done: boolean): void {
    void persist(true);
    if (done) {
      onComplete();
    } else {
      (onCancel ?? onComplete)();
    }
  }

  return (
    <div
      data-testid="onboarding-tour"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to BugCase"
      style={overlayStyle}
    >
      <div style={cardStyle}>
        <h2 data-testid="onboarding-slide-title" style={titleStyle}>
          {slide.title}
        </h2>
        <ul data-testid="onboarding-slide-body" style={listStyle}>
          {slide.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div style={footerStyle}>
          <button
            type="button"
            data-testid="onboarding-skip"
            style={linkBtn}
            onClick={() => finish(false)}
            disabled={disabled}
          >
            Skip
          </button>
          <span data-testid="onboarding-progress" style={progressStyle}>
            {index + 1} / {ONBOARDING_SLIDES.length}
          </span>
          <span style={{ display: 'flex', gap: '8px' }}>
            {!isFirst ? (
              <button
                type="button"
                data-testid="onboarding-back"
                style={secondaryBtn}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={disabled}
              >
                Back
              </button>
            ) : null}
            {isLast ? (
              <button
                type="button"
                data-testid="onboarding-done"
                style={primaryBtn}
                onClick={() => finish(true)}
                disabled={disabled}
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                data-testid="onboarding-next"
                style={primaryBtn}
                onClick={() => setIndex((i) => Math.min(ONBOARDING_SLIDES.length - 1, i + 1))}
                disabled={disabled}
              >
                Next
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
