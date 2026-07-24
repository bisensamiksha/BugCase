# Store listing — shared copy (single source of truth)

> **This file is the one place listing copy is authored.** The Chrome
> ([`../chrome/listing.md`](../chrome/listing.md)), Edge ([`../edge/listing.md`](../edge/listing.md)),
> and — later — Firefox AMO (S4-32) listings **derive from here** and only add store-specific deltas
> (field names, length limits, submission steps). Editing a claim, description, or permission
> justification here changes it everywhere, so the stores can never drift.
>
> Every claim below is true of the **shipped build**, not the roadmap. Privacy claims mirror the
> hosted [Privacy Policy v2](https://bisensamiksha.github.io/BugCase/legal/privacy-policy) verbatim in
> spirit; the permission set mirrors `packages/extension/src/manifest.ts` (enforced for Chrome by
> `scripts/check-permission-justifications.mjs`).

## Identity

| Field              | Value                                    | Notes                                                                                                           |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Store item name    | **Bug Reporter Tool**                    | Matches the manifest `name`; do not rename in one store only.                                                   |
| Short name / brand | **BugCase**                              | Matches the manifest `short_name`; used throughout the copy.                                                    |
| Category           | **Developer Tools**                      | Same on Chrome and Edge.                                                                                        |
| Homepage / support | https://bisensamiksha.github.io/BugCase/ | Manifest `homepage_url`; issues at the public repo.                                                             |
| Version            | _read from the built manifest_           | **Never hard-code a version in copy** — the store shows the uploaded package version (the 1.0.0 bump is S4-24). |

## Tagline (≤ 132 chars — Chrome summary / Edge short description)

> Privacy-first bug capture. Capture screenshots, console, network, DOM and more into one local ZIP — no backend, no telemetry.

(125 characters — safe for both stores' 132-char short-description limit.)

## Single-purpose statement (Chrome-required)

> BugCase captures a comprehensive, privacy-first bug report of the current page — screenshots,
> console logs, network activity, a DOM snapshot, storage, and reproduction context — and saves it
> locally as a shareable ZIP. No captured data leaves the user's browser.

## Detailed description

> **BugCase turns a hard-to-reproduce bug into one shareable file — without sending your data anywhere.**
>
> Click the toolbar button on any page and BugCase captures the context a developer actually needs:
> a screenshot, the console log, network requests and responses, a DOM snapshot, cookies and storage,
> and step-by-step reproduction notes. Everything is bundled into a single ZIP and saved straight to
> your Downloads folder. You decide if and where to share it.
>
> **Privacy-first by design**
>
> - **No backend and no telemetry.** BugCase has no server and collects nothing. All processing
>   happens on your device, in your browser.
> - **Nothing is uploaded.** Reports are generated locally and saved to Downloads; sharing a report is
>   always an action you take with the file.
> - **Text is scrubbed automatically.** Page HTML, cookies, and request/response headers run through
>   always-on scrubbers before the report is written; cookie and storage values are masked by default.
> - **You stay in control of images.** Screenshots and element crops are saved as rendered images and
>   are **not** automatically scrubbed — anything visible on screen when you captured is stored as-is.
>   Use the built-in **Annotate** tool to redact sensitive regions by hand before you share.
>
> **Minimal permissions**
> BugCase installs with a minimal permission set and never asks for broad access up front. Optional
> capabilities (cookies, installed-extensions list, browsing history, and access to arbitrary sites)
> are requested only at runtime, with your explicit consent, and BugCase keeps working if you decline.
>
> **What's in a report**
> Screenshot(s) · console log · network log (with response bodies when you enable the on-demand
> capture) · DOM snapshot · cookies & storage (masked) · reproduction steps · page & browser metadata —
> plus a self-contained `report.html` viewer so anyone can open the report offline, with no server.
>
> Open source. No account. No tracking.

## Privacy claims (must stay identical to the Privacy Policy)

- No data collection, no telemetry, no analytics, no accounts, no backend server.
- All processing is local; reports are saved to Downloads and are never uploaded by BugCase.
- Report history stores **metadata only** (timestamps, origin, severity, size, title), on-device.
- Text surfaces (HTML, cookies, headers) are scrubbed; cookie/storage values masked.
- **Screenshots and element crops are NOT auto-scrubbed** — the user redacts them by hand via
  Annotate. (Do not write copy implying images are automatically sanitized — BUG-01.)

## Permissions (canonical list — Chrome detail in [`../chrome/permission-justifications.md`](../chrome/permission-justifications.md))

Built manifest permission set (`packages/extension/src/manifest.ts`):

| Permission   | Class                   | One-line justification                                                                                                                        |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`  | Required (install-time) | Access the current tab only on the user's click, to inject the overlay and read the page.                                                     |
| `scripting`  | Required (install-time) | Inject the overlay and run page-context capture steps.                                                                                        |
| `tabs`       | Required (install-time) | Read the active tab's URL/title and capture the viewport screenshot.                                                                          |
| `downloads`  | Required (install-time) | Save the report ZIP to the user's Downloads folder.                                                                                           |
| `storage`    | Required (install-time) | Persist settings + report-history metadata locally.                                                                                           |
| `debugger`   | Required (install-time) | On-demand network-body + full-page capture (opt-in, banner shown, then detaches); install-time because Chrome forbids `debugger` as optional. |
| `cookies`    | Optional                | Include the page's cookies (masked) only when the user opts in.                                                                               |
| `management` | Optional                | List installed extensions only when the user opts in, to reproduce conflicts.                                                                 |
| `history`    | Optional                | Include recent navigation for the current site only when the user opts in.                                                                    |
| `<all_urls>` | Optional host           | Capture on any site; granted per-site at runtime, never at install.                                                                           |

## Links

- **Privacy Policy:** https://bisensamiksha.github.io/BugCase/legal/privacy-policy
- **Terms of Use:** https://bisensamiksha.github.io/BugCase/legal/terms
- **Source / issues:** https://github.com/bisensamiksha/BugCase

## Image assets

See per-store listing files for exact required sizes. Generated brand art lives under
`store/chrome/assets/` and `store/edge/assets/` (regenerate with `pnpm store:assets`); the app
**screenshots** are captured by hand per `../chrome/screenshots/README.md`.
