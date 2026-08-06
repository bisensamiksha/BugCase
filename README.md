<p align="center">
  <img src="packages/extension/public/icons/icon-128.png" alt="BugCase logo" width="96" height="96" />
</p>

<h1 align="center">BugCase</h1>

<p align="center">
  A privacy-first browser extension that captures a complete, shareable bug report:
  console, network, DOM, screenshots, and more, as a single ZIP. No backend. No telemetry.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: PolyForm Small Business 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20SB%201.0.0-blue" /></a>
  <img alt="Node >= 22.13" src="https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=node.js&logoColor=white" />
  <img alt="pnpm >= 9" src="https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <a href="https://github.com/bisensamiksha/BugCase/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bisensamiksha/BugCase/actions/workflows/ci.yml/badge.svg" /></a>
</p>

<p align="center">
  <a href="https://bisensamiksha.github.io/BugCase/">Dashboard</a> ·
  <a href="https://bisensamiksha.github.io/BugCase/legal/privacy-policy">Privacy Policy</a> ·
  <a href="https://bisensamiksha.github.io/BugCase/legal/terms">Terms of Use</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

---

## About the project

Reproducing a bug from a vague description is hard. **BugCase** turns "it's broken on my
machine" into a self-contained evidence package: click the toolbar icon, choose what to
include, and BugCase captures the page's console logs, network traffic, DOM snapshot,
screenshots, storage, and environment into a single downloadable **ZIP**.

Everything runs **on your device**. There is no server, no account, and no telemetry: the
report is generated locally and saved to your Downloads folder. You decide if and where to
share it. Each ZIP also embeds a **self-contained `report.html`** that opens the whole report
in a browser with **zero network requests**, and a companion **dashboard** (hosted on GitHub
Pages) can render any ZIP entirely in the browser.

## Why BugCase

- **Privacy by architecture, not by policy.** No backend means there is nothing to upload,
  log, or leak. Optional permissions are requested at runtime with explicit consent and can
  always be declined.
- **Honest about redaction.** Text surfaces (page HTML, cookies, headers) are scrubbed
  automatically. Screenshots and element crops are rendered pixels and are **not**
  auto-scrubbed. BugCase says so plainly and gives you a manual redaction tool.
- **Portable evidence.** A report is just a ZIP with a schema-validated `report.json` and a
  `report.html` that works offline forever, with no proprietary viewer required.
- **Cross-browser.** One codebase targets Chrome, Edge, and Firefox, with browser
  differences kept behind small helpers.

## Features

**Capture**

- Console and network activity via always-on ring buffers, with on-demand full response
  bodies and full-page screenshots (Chrome DevTools Protocol, with a scroll-stitch fallback)
- DOM snapshot, viewport + full-page screenshots, and point-and-click **element inspection**
  (computed styles, HTML, and a cropped image of the element)
- Cookies, local/session storage, navigation history, installed extensions, and rich
  environment metadata (browser, screen, device-pixel-ratio, zoom)
- A reproduction-steps recorder and a passive error-detection badge

**Review & redact**

- A preview screen to inspect everything before it leaves your device
- Konva-powered annotation canvas for **destructive** redaction of sensitive regions in
  screenshots (the original pixels are discarded, not hidden)
- Per-rule scrubber summary and a privacy pane showing exactly what was removed and which
  permissions were held at capture

**Share & view**

- One ZIP containing `report.json`, all assets, and a self-contained `report.html`
- A GitHub Pages **dashboard** with panes for overview, console, network, DOM, screenshots,
  reproduction, element inspections, storage, and privacy, all rendered in your browser

## Privacy & legal

BugCase runs entirely on your device: no backend, no telemetry, no accounts. Reports are
generated locally and saved to your Downloads folder; nothing is uploaded by BugCase.

- **Privacy Policy:** <https://bisensamiksha.github.io/BugCase/legal/privacy-policy>
- **Terms of Use:** <https://bisensamiksha.github.io/BugCase/legal/terms>

> Screenshots and element crops are stored as rendered images and are **not** auto-scrubbed.
> Only text surfaces (page HTML, cookies, headers) are. Redact sensitive regions by hand
> before sharing a report.

## Built with

TypeScript · React · Vite · [`@crxjs/vite-plugin`](https://crxjs.dev/vite-plugin) (Manifest V3)
· Tailwind CSS · [Zod](https://zod.dev) · [JSZip](https://stuk.github.io/jszip/) · Konva ·
Shiki · Vitest · Playwright · ESLint 9 · Prettier · pnpm workspaces

## Project structure

BugCase is a pnpm monorepo. Each package has one clear responsibility.

```text
BugCase/
├─ packages/
│  ├─ extension/        # MV3 browser extension (Chrome + Firefox): capture UI + engine
│  ├─ dashboard/        # GitHub Pages report viewer: renders a ZIP entirely in-browser
│  ├─ report-template/  # Single-file, self-contained report.html build (embedded in each ZIP)
│  ├─ schema/           # BugReportV1 types + Zod validators + ZIP layout (shared contract)
│  └─ shared-ui/        # UI/logic shared by the extension and the dashboard
├─ apps/
│  └─ privacy-site/     # Hosted legal pages (privacy policy + terms) → /legal/
├─ scripts/             # Build, packaging, icon, and reproducibility utilities
├─ tests/               # Playwright E2E specs + CI workflow contract tests
├─ qa/                  # Manual QA site checklist + results template
├─ store/  legal/       # Store link inventory + legal review notes
└─ design/              # Icon source (SVG) + generator
```

## Getting started

### Prerequisites

- **Node.js `>= 22.13.0`** (see [`.nvmrc`](./.nvmrc))
- **pnpm `>= 9`**: `corepack enable` will pin the version from `package.json`

### Install

```bash
git clone https://github.com/bisensamiksha/BugCase.git
cd BugCase
pnpm install
```

### Build & load the extension

```bash
pnpm build:chrome     # → packages/extension/dist-chrome
pnpm build:firefox    # → packages/extension/dist-firefox
```

- **Chrome / Edge:** open `chrome://extensions`, enable **Developer mode**, click **Load
  unpacked**, and select `packages/extension/dist-chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary
  Add-on**, and select `packages/extension/dist-firefox/manifest.json`.

Then click the BugCase toolbar icon on any page to start a capture.

### Run the dashboard

Use the hosted viewer at <https://bisensamiksha.github.io/BugCase/>, or run it locally and
drag a report ZIP onto the drop zone:

```bash
pnpm --filter @bugcase/dashboard dev
```

## Development & testing

| Command                                    | What it does                       |
| ------------------------------------------ | ---------------------------------- |
| `pnpm install`                             | Install all workspace dependencies |
| `pnpm build`                               | Build every package                |
| `pnpm build:chrome` / `pnpm build:firefox` | Build the extension for one target |
| `pnpm --filter @bugcase/dashboard dev`     | Run the dashboard locally with HMR |
| `pnpm -r typecheck`                        | TypeScript across all packages     |
| `pnpm -r test`                             | Vitest unit + integration tests    |
| `pnpm test:e2e`                            | Playwright end-to-end tests        |
| `pnpm lint`                                | ESLint 9 (run from the repo root)  |
| `pnpm format`                              | Prettier write                     |

> **Note:** lint with the **root** `pnpm lint`. Per-package `lint` scripts are known-broken
> and should not be used.

## How it works

1. **Capture**: a content script injects a Shadow-DOM overlay; the MV3 service worker
   (an event page on Firefox) orchestrates the capture engine, attaching the `debugger`
   on-demand for network bodies and full-page screenshots.
2. **Contract**: everything is assembled into a `BugReportV1` object validated by Zod
   (`@bugcase/schema`) so a malformed report can never be written.
3. **Package**: the report, its assets, and a pre-built self-contained `report.html` are
   written into a ZIP via JSZip.
4. **Review**: before download, a preview screen lets you inspect, annotate, and redact.
5. **View**: open `report.html` offline, or drop the ZIP into the dashboard; both render the
   same panes with no network access.

## Browser support

| Browser | Status    | Notes                                                                                                      |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Chrome  | Supported | Primary target                                                                                             |
| Edge    | Supported | Chromium, same build as Chrome                                                                             |
| Firefox | Supported | Background is an event page; full-page CDP screenshots fall back to scroll-stitch (documented Firefox gap) |

BugCase is **source-available and in active development toward its first store release**
(Chrome + Edge first, Firefox AMO trailing). Until then, build from source and load it
unpacked as shown above.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and the
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) first. In short:

1. Fork the repo and create a feature branch.
2. Make your change with tests (`pnpm -r test`) and keep `pnpm -r typecheck` + `pnpm lint`
   green.
3. Run the manual QA checklist in [`qa/`](./qa) when your change affects capture behavior.
4. Open a focused pull request describing the change and how you verified it.

## License

**Source-available, not open source.** BugCase is licensed under the
[PolyForm Small Business License 1.0.0](./LICENSE), free to use and modify for small
businesses and individuals (see the license for the exact thresholds). See also
[`NOTICE`](./NOTICE) for the required attribution.
