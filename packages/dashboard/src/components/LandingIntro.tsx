import { BUGCASE_REPO_URL, BUGCASE_STORE_URL } from '../landing-links';

interface ValueProp {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/**
 * Copy is derived from `store/shared/listing-copy.md` (the S4-23 single source) so the landing and
 * the store listing say the same things.
 *
 * The redaction card is deliberate, not hedging: scrubbers cover TEXT only, and screenshots and
 * element crops ship as raw pixels (BUG-01). A landing page is where the pull toward rounding that
 * up to "your report is sanitized" is strongest, so the limitation is stated plainly.
 */
const VALUE_PROPS: readonly ValueProp[] = [
  {
    id: 'local',
    title: 'Your data never leaves this tab',
    body: 'Reports are read locally, in your browser. No server, no account, no telemetry, and nothing is uploaded.',
  },
  {
    id: 'redaction',
    title: 'Honest about redaction',
    body: 'Page HTML, cookies and headers are scrubbed automatically. Screenshots and element crops are not. They are rendered pixels, so redact them yourself before sharing.',
  },
  {
    id: 'portable',
    title: 'Portable evidence',
    body: 'A report is just a ZIP with a schema-validated report.json and a report.html that opens offline, forever. No proprietary viewer.',
  },
];

/**
 * Marketing intro above the drop zone (S4-28).
 *
 * `packages/dashboard` is deployed at the GitHub Pages project root, so the empty state is the first
 * thing a visitor to the project's public URL sees — not merely an "app with nothing open" state.
 *
 * Purely presentational and prop-less, like `DropZone`: `App.tsx` renders it inside `AsyncState`'s
 * `empty` slot, so "only when no report is open" falls out of the existing state machine rather than
 * needing a conditional here.
 *
 * Headings start at `h2` — `AppShell` owns the page's only `h1` ("BugCase Dashboard"), and a second
 * one would trip the axe `heading-order` gate added in S4-27.
 *
 * The CTA is a styled text link, never the official "Add to Chrome" badge image: that badge is
 * CDN-hosted, so embedding it would fire a third-party request from a product whose whole claim is
 * that it makes none, and would render as a broken image in the offline `report.html`.
 */
export function LandingIntro() {
  return (
    <section
      data-testid="landing-intro"
      data-print-hide
      aria-labelledby="landing-intro-heading"
      className="mx-auto max-w-3xl text-center"
    >
      <h2 id="landing-intro-heading" className="text-xl font-bold sm:text-2xl">
        Turn a hard-to-reproduce bug into one shareable file
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--bc-fg-muted)]">
        Drop a BugCase report .zip below: screenshots, console, network, DOM and more, decoded right
        here in this tab.
      </p>

      <ul className="mt-6 grid gap-3 text-left sm:grid-cols-3">
        {VALUE_PROPS.map((prop) => (
          <li
            key={prop.id}
            data-testid={`landing-value-${prop.id}`}
            className="rounded-[var(--bc-radius)] border border-[var(--bc-border)] bg-[var(--bc-surface)] p-3"
          >
            <h3 className="text-sm font-semibold">{prop.title}</h3>
            <p className="mt-1 text-xs text-[var(--bc-fg-muted)]">{prop.body}</p>
          </li>
        ))}
      </ul>

      {/*
        No explicit focus-ring utilities: `index.css` sets a global `:focus-visible` ring (S4-27),
        which these anchors inherit.
      */}
      <p className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <a
          data-testid="landing-store-link"
          href={BUGCASE_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[var(--bc-radius)] bg-[var(--bc-accent)] px-4 py-2 text-sm font-medium text-[var(--bc-accent-fg)]"
        >
          Add to Chrome
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a
          data-testid="landing-repo-link"
          href={BUGCASE_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--bc-fg-muted)] underline"
        >
          View on GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </section>
  );
}
