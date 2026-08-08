# Manual QA checklist (30+ real sites)

The pre-submission manual gate for a store release (S4-21). It complements the automated Playwright
suite (S4-20): the automation proves the pipeline on controlled fixtures; this proves it on the messy
real web. Work through it in **both Chrome and Firefox** before any Chrome Web Store / Edge / AMO
submission, and record every run in [`manual-qa-results-template.md`](./manual-qa-results-template.md).

> Sites are grouped by **scenario archetype**, not treated as a fixed list — if a named example
> redesigns or disappears, swap in another site of the same archetype. Aim for at least the sites
> listed (38 across 10 archetypes); more is better.

## How to use

1. Build both targets and load them unpacked:

   ```bash
   pnpm build:chrome    # → packages/extension/dist-chrome
   pnpm build:firefox   # → packages/extension/dist-firefox
   ```

   - Chrome/Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
     `packages/extension/dist-chrome`.
   - Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
     `packages/extension/dist-firefox/manifest.json`.

2. For each site, run the **cross-cutting checks** below, then the **archetype-specific** checks.
3. Record each site's result (Chrome and Firefox) in the results template. Attach or link any bug you
   file.
4. A release is signed off only when every archetype has at least one green Chrome run and one green
   Firefox run (or a documented, accepted Firefox limitation).

## Non-negotiable invariants (verify on every site)

These restate the [project constraints](../CONTRIBUTING.md#non-negotiable-project-constraints) as
things you can watch for during a capture. If any fails, it is a release blocker.

- [ ] **Overlay injects cleanly** — clicking the toolbar action shows the BugCase overlay in a Shadow
      DOM, rendered above the page's own content (no z-index bleed, no page CSS leaking in).
- [ ] **Capture completes → ZIP downloads** — the capture finishes and a `bugcase-*.zip` is
      downloaded; no uncaught errors in the page or service-worker console.
- [ ] **`report.html` opens offline** — unzip, double-click `report.html`, open it with the network
      **disconnected**; every populated pane renders and there are **no external network requests**
      (the offline / no-egress guarantee).
- [ ] **Text secrets are masked** — password-field values, cookie values, and sensitive request/
      response headers (`authorization`, `set-cookie`, …) are masked in the report, per the enabled
      scrubbers.
- [ ] **Image pixels are raw (BUG-01)** — screenshots and element crops are **not** auto-scrubbed;
      confirm the pre-download warning is shown and no test secret is left visible on screen before
      capturing. This is expected behavior, not a bug — never overpromise image redaction.
- [ ] **No captured data leaves the device** — watch the DevTools Network tab during capture and while
      viewing the report: no request carries report contents off-device.
- [ ] **Chrome ↔ Firefox parity** — the same capture works in both, or the difference is a known,
      documented Firefox limitation (see [Known limitations](#known-limitations)).

## Archetype checklist

### 1. Single-page apps (SPA)

Client-side routing, dynamic DOM, `fetch`/XHR data. **Examples:** `react.dev`, `vuejs.org`,
`angular.dev`, `svelte.dev`.

- [ ] Capture **after** a client-side route change (navigate within the app first) — the DOM snapshot
      reflects the _current_ view, not the initial HTML.
- [ ] Console + network panes show the SPA's `fetch`/XHR activity, not just the document load.
- [ ] Reproduction steps recorded across in-app navigations replay in order.

### 2. Multi-page / server-rendered (MPA)

Full page loads, server HTML. **Examples:** `en.wikipedia.org`, `news.ycombinator.com`,
`developer.mozilla.org`, `www.gov.uk`.

- [ ] Capture on a fresh server-rendered page; DOM snapshot matches the visible page.
- [ ] Navigate to a second page and capture again — a clean second report, no state bleed from the
      first.

### 3. Iframe-heavy

Cross-origin embedded frames. **Examples:** `codepen.io`, `jsfiddle.net`, `stackblitz.com`.

- [ ] Overlay injects into the **top** frame only and is usable.
- [ ] Screenshot captures the visible iframe content; capture does **not** throw on cross-origin
      frames it can't read.
- [ ] DOM snapshot handles the frame boundary gracefully (no crash; cross-origin frame content is
      simply absent, not an error).

### 4. Strict Content-Security-Policy

CSP that blocks inline scripts/styles. **Examples:** `github.com`, `gitlab.com`,
`addons.mozilla.org`, `chromewebstore.google.com`.

- [ ] The Shadow-DOM overlay **and** the annotation canvas load despite the page CSP (no blocked-script
      console errors from BugCase).
- [ ] Capturing and annotating a screenshot works end-to-end under CSP.

### 5. Service-worker PWAs

An active service worker controls the page / serves cached responses. **Examples:**
`web.telegram.org`, `squoosh.app`, `excalidraw.com`, `web.dev`.

- [ ] Capture works while a service worker is active.
- [ ] The network log is sane (SW-served responses aren't double-counted or dropped in a confusing
      way).
- [ ] BugCase does not interfere with the site's own service worker.

### 6. Dialogs and modals

Native `<dialog>`/`alert`/`confirm` and CSS modals / cookie banners. **Examples:** `getbootstrap.com`
(modal demos), `www.theguardian.com` (consent modal), `www.w3schools.com` (`alert()` demos).

- [ ] With a modal open, the overlay renders **above** it and capture succeeds.
- [ ] A page-triggered `alert()`/`confirm()` does not wedge the capture (the service worker keeps
      working).
- [ ] The screenshot includes the open modal.

### 7. Infinite scroll

Lazily appended content, growing DOM. **Examples:** `www.reddit.com`, `www.pinterest.com`,
`unsplash.com`, `www.quora.com`.

- [ ] A full-page screenshot stitches the scrolled content; lazily loaded items appear.
- [ ] Capture stays within the [S4-05 performance budget](../packages/dashboard/) — no runaway memory
      or multi-second stalls on a long feed.

### 8. Video and heavy media

`<video>`, canvas, WebGL, DRM. **Examples:** `www.youtube.com`, `vimeo.com`, `www.twitch.tv`,
`threejs.org` (WebGL examples).

- [ ] Capture succeeds with media playing and paused.
- [ ] DRM-protected video frames may render **black** in the screenshot — this is expected (the OS
      blocks readback); confirm it does not crash the capture.
- [ ] WebGL/canvas content is captured without hanging.

### 9. Login and auth flows

Forms, password fields, OAuth redirects. **Examples:** `github.com/login`, `accounts.google.com`,
`gitlab.com/users/sign_in`, `wordpress.com/log-in`.

> Use a **throwaway/test account you own**. Never capture real production credentials into a report
> you will share.

- [ ] Type into a password field, then capture — the password value is **masked** in the DOM snapshot.
- [ ] If cookies/headers are captured (optional permission granted), cookie values and
      `authorization`/`set-cookie` headers on the auth request are **masked**.
- [ ] Confirm no plaintext secret survives anywhere in `report.json` or the rendered report text.

### 10. Heavy web-apps

Large DOM, many requests, long-lived state. **Examples:** `www.figma.com`, `www.notion.so`,
`linear.app`, `docs.google.com`.

- [ ] Capture completes on a large, busy app without freezing the tab.
- [ ] The produced ZIP and `report.html` open and render within the performance budget.

## Known limitations

Testers should recognize these so they don't file duplicates:

- **Screenshots/crops are raw pixels (BUG-01).** The scrubbers only touch text (DOM, cookies,
  headers). Anything visible on screen at capture time is in the image as-is. The pre-download warning
  covers this.
- **Firefox debugger gap (S5-01).** Firefox cannot attach the debugger the way Chrome does, so network
  **response bodies** are absent in Firefox captures. Note it as a documented limitation, not a bug.
- **DRM video frames** may be black in screenshots (OS-level readback protection).

## Sign-off

Record the final decision (build/version, tester, date, and per-archetype Chrome/Firefox verdicts) in
[`manual-qa-results-template.md`](./manual-qa-results-template.md). Do not submit to a store until every
archetype has a green run (or an explicitly accepted limitation) in both browsers.
