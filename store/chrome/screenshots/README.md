# Store screenshots — what ships, and how to reproduce it

> Every screenshot here is captured from the **real, built extension and dashboard**, showing the
> actual shipped UI with **real captured data** — never a mockup, a render, or hand-edited pixels.
> Faking store screenshots would overpromise (an explicit ticket pitfall). This file documents the
> set that ships and how to regenerate it.

## Required specs

| Store            | Size                                | Count              | Format                |
| ---------------- | ----------------------------------- | ------------------ | --------------------- |
| Chrome Web Store | **1280×800** (preferred) or 640×400 | 1–5 (aim for 4–5)  | PNG or JPEG, no alpha |
| Edge Add-ons     | **1280×800** or 640×400             | 1–10 (aim for 4–5) | PNG or JPEG           |

The same image set is used for both stores. **Chrome uploads shots 1–5** (its maximum); **Edge can
take all six**. Every file here is 1280×800 PNG.

## The set that ships (in order)

### 1 — One-click capture

> _Caption:_ "Capture a bug in one click — screenshot, console, network, DOM and more."

The capture overlay open over a real article page, showing the minimize and close controls.

![The BugCase capture overlay open over a Wikipedia article, listing capture options](./screenshot-1-capture-overlay.png)

### 2 — The dashboard Overview

> _Caption:_ "Everything a developer needs, in one report."

A captured report open in the dashboard: severity badge, console/network stat tiles, page + browser +
viewport metadata, and the reporter's notes.

![The BugCase dashboard Overview pane showing severity, stat tiles and report metadata](./screenshot-2-dashboard-overview.png)

### 3 — Network pane

> _Caption:_ "Full network activity, with response bodies when you enable it."

The filterable network list — status/method/initiator chips, the waterfall column, and a selected
request's headers with **Copy as cURL**.

![The BugCase Network pane showing eleven requests, a waterfall column and a selected request's headers](./screenshot-3-network-pane.png)

### 4 — Review and redact

> _Caption:_ "Review everything before it leaves the browser — and redact what shouldn't."

The review screen before download: per-section sizes, the image-disclosure warning, and the
**Redact text** panel.

![The BugCase review screen listing report sections with the Redact text panel](./screenshot-4-review-redact.png)

### 5 — Privacy consent

> _Caption:_ "Privacy-first: text is scrubbed, and you control image redaction."

The consent step: scrubbers applied, permissions used at capture, and the image-disclosure note.

![The BugCase consent step showing scrubbers, permissions used and the image disclosure](./screenshot-5-privacy-consent.png)

### 6 — Settings _(Edge only — Chrome's limit is five)_

> _Caption:_ "Set your defaults once. Nothing is uploaded or synced."

Default capture options and scrubber settings.

![The BugCase settings page showing default capture options](./screenshot-6-settings.png)

### Deliberately not in the set

- **Dashboard Privacy pane** — its content overlaps shot 5, which carries the same privacy claims at
  the moment they matter (just before download). Shot 5 was chosen over it to avoid a near-duplicate.
- **Annotate / redaction in action** — a strong candidate, but it needs a capture with something
  genuinely worth redacting, and no shot may contain real personal data (see Rules). Add it if a safe
  subject is available; it would replace shot 6 for Chrome.

## How to reproduce the set

1. `pnpm --filter @bugcase/extension build:chrome` and `pnpm --filter @bugcase/dashboard build`.
2. Load `packages/extension/dist-chrome` unpacked in Chrome (`chrome://extensions` → Developer mode →
   Load unpacked).
3. Capture a **real** bug report on a safe demo page — no personal data, no credentials, no private
   URLs. The current set uses `en.wikipedia.org/wiki/Software_bug`: on-topic, public, and stable.
   - Enable the per-origin passive-monitoring opt-in, then **reload** so console and network are
     recorded from the start.
   - Tick **Console logs**, **Network log**, **DOM snapshot**, **Browser info**, **Local storage**.
   - Fill in a real severity and steps so the dashboard Overview has content to show.
   - The current set's report carries 3 console entries and 11 real requests (GET + POST, 200/403/404).
4. For the dashboard shots, open the built dashboard and load the captured ZIP. **Select a request**
   before shooting the Network pane — the detail panel is part of the shot.
5. Size the viewport to exactly **1280×800 at DPR 1**. A HiDPI screen yields 2560×1600, which the
   store rejects; set the device scale factor to 1 rather than downscaling afterwards.
6. Keep browser and OS furniture out of frame. Prefer light theme for legibility.

> On a fresh profile the **first-run onboarding modal** covers the settings page. Dismiss it before
> shooting shot 6, or it lands in the frame.

## Rules

- No real personal data, credentials, or private URLs in any shot (screenshots are raw pixels).
- Every UI state shown must exist in the shipped build — no mockups, no roadmap features.
- Keep captions consistent with the shared copy's privacy claims (no "auto-redacts images").
- Re-shoot whenever the UI changes. Shots 1 and 4 went stale once already: shot 1 predated the
  overlay's minimize control, and shot 4 predated the Redact text panel entirely.
