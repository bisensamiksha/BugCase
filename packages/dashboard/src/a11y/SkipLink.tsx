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
      onClick={(event) => {
        // This app is hash-routed: letting the browser apply `#main` would fire `hashchange`, and
        // `parseHash` treats an unrecognized fragment like `main` the same as garbage input — a
        // reset to the Overview pane, discarding the active report tab and every pane filter
        // (S4-27 review finding). Focus the region directly instead; `location.hash` is never
        // written, so the router never sees it. `href="#main"` stays so the element remains a
        // semantically correct skip link (and still works if JavaScript fails to load).
        event.preventDefault();
        document.getElementById('main')?.focus();
      }}
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-[var(--bc-radius)] focus:bg-[var(--bc-accent)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--bc-accent-fg)]"
    >
      Skip to content
    </a>
  );
}
