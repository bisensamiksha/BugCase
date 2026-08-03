import { useState } from 'react';

/**
 * Copy the current view's link (S4-26).
 *
 * The hash carries the active pane and its filters, so the copied URL reproduces exactly what is on
 * screen for anyone who opens the same report ZIP — the report id is the capture id baked into the
 * ZIP, not a per-session value. Nothing about the report itself travels in the URL.
 *
 * Follows `ReproductionPane`'s copy pattern: an absent clipboard API and a rejected write are both
 * surfaced inline. Neither is theoretical — a `report.html` opened from `file://` may expose no
 * clipboard at all.
 */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyLink(): Promise<void> {
    if (!navigator.clipboard) {
      setCopied(false);
      setCopyError('Clipboard unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopied(false);
      setCopyError('Copying to the clipboard failed.');
    }
  }

  return (
    <div data-print-hide className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        data-testid="copy-link"
        onClick={() => void copyLink()}
        title="Copy a link to this view"
        className="rounded-[var(--bc-radius)] border border-[var(--bc-border)] px-2 py-1 text-xs text-[var(--bc-fg)] hover:bg-[var(--bc-bg)]"
      >
        Copy link
      </button>

      {/* Announced rather than shown — the button label stays stable so its width does not jump. */}
      <span data-testid="copy-link-status" role="status" className="sr-only">
        {copied ? 'Link to this view copied to the clipboard' : ''}
      </span>

      {copyError ? (
        <span
          data-testid="copy-link-error"
          role="alert"
          className="text-xs text-[var(--bc-danger)]"
        >
          {copyError}
        </span>
      ) : null}
    </div>
  );
}
