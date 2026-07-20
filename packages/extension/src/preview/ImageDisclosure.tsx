import type { CSSProperties, ReactNode } from 'react';

const noteStyle: CSSProperties = {
  border: '1px solid #f59e0b',
  background: '#fffbeb',
  color: '#78350f',
  borderRadius: '8px',
  padding: '12px',
  margin: '12px 0',
  fontSize: '13px',
  lineHeight: 1.5,
};

export interface ImageDisclosureProps {
  /** Optional screen-specific follow-up (e.g. "Use Annotate to redact the screenshot"). */
  readonly children?: ReactNode;
  /** Overrides the default `image-disclosure` test id so each screen can target its own. */
  readonly testId?: string;
}

/**
 * Standing warning that image surfaces — screenshots and element crops — are stored as rendered
 * pixels and are NOT automatically scrubbed, so anything visible on screen (a password, other
 * sensitive content) is saved into the report as-is. Shown at the last gates before download so the
 * user can redact it by hand first. Automatic sensitive-field redaction is deferred — see BUG-01.
 */
export function ImageDisclosure({ children, testId = 'image-disclosure' }: ImageDisclosureProps) {
  return (
    <div data-testid={testId} role="note" style={noteStyle}>
      <strong>Screenshots and element crops are not scrubbed.</strong> They are saved as images, so
      anything visible on screen when you captured — including a password — is stored in the report
      as-is.
      {children ? <> {children}</> : null}
    </div>
  );
}
