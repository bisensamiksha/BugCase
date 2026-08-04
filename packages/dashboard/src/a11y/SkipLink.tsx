/**
 * Skip-to-content link (S4-27).
 *
 * Nine side-nav links sit between the top bar and the report content, and the side nav re-renders on
 * every pane change. Without this, reaching the content by keyboard costs a dozen Tab presses each
 * time. Hidden until focused — `sr-only` plus `focus:` overrides that pull it back into the layout —
 * so it costs sighted users nothing.
 */
export function SkipLink() {
  return (
    <a
      data-testid="skip-to-content"
      data-print-hide
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-[var(--bc-radius)] focus:bg-[var(--bc-accent)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--bc-accent-fg)]"
    >
      Skip to content
    </a>
  );
}
