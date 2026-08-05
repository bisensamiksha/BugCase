/** Fixed-width mask — constant regardless of value length so it leaks no length information. */
const MASK = '••••••••';

export interface MaskedValueProps {
  readonly value: string;
  readonly revealed: boolean;
  readonly onToggle: () => void;
  /** Accessible context for the toggle (the cookie name / storage key). */
  readonly label: string;
  readonly testId: string;
}

/**
 * Controlled mask/reveal control (S4-12). Masked by default (privacy-first); the parent owns the
 * revealed flag so a global "Reveal all" and per-row toggles share one state model. The value is a
 * ZIP-derived string rendered as a text node only (never `dangerouslySetInnerHTML`).
 */
export function MaskedValue({ value, revealed, onToggle, label, testId }: MaskedValueProps) {
  if (value.length === 0) {
    return (
      <span data-testid={`${testId}-empty`} className="text-xs italic text-[var(--bc-fg-muted)]">
        (empty)
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-2">
      <span data-testid={testId} className="break-all font-mono text-xs text-[var(--bc-fg)]">
        {revealed ? value : MASK}
      </span>
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        aria-pressed={revealed}
        aria-label={revealed ? `Hide value for ${label}` : `Reveal value for ${label}`}
        onClick={onToggle}
        className="shrink-0 rounded border border-[var(--bc-border-strong)] px-1.5 py-0.5 text-xs text-[var(--bc-fg-muted)]"
      >
        {revealed ? 'Hide' : 'Reveal'}
      </button>
    </span>
  );
}
