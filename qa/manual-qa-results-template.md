# Manual QA results — <release / version>

Copy this file for each release run (e.g. `manual-qa-results-2026-07-23.md`) and fill it in while
working through [`manual-site-checklist.md`](./manual-site-checklist.md). Keep it local or attach it to
the release PR/issue — do **not** paste captured page contents here.

## Run info

| Field                 | Value                                       |
| --------------------- | ------------------------------------------- |
| Extension version     | `<packages/extension/package.json version>` |
| Commit                | `<git short SHA>`                           |
| Date                  | `<YYYY-MM-DD>`                              |
| Tester                | `<name>`                                    |
| OS                    | `<macOS / Windows / Linux + version>`       |
| Chrome / Edge version | `<version>`                                 |
| Firefox version       | `<version>`                                 |

## Results

One row per (site × browser). `Overlay` = overlay injected; `Capture` = capture → ZIP downloaded;
`report.html` = opens offline, panes render, no external requests; `Privacy` = text secrets masked +
image-pixel warning shown. Use ✅ / ❌ / ⚠️ (see note). Link any bug you file.

| Site             | Archetype       | Browser | Overlay | Capture | report.html | Privacy | Verdict | Notes / bug |
| ---------------- | --------------- | ------- | ------- | ------- | ----------- | ------- | ------- | ----------- |
| react.dev        | SPA             | Chrome  |         |         |             |         |         |             |
| react.dev        | SPA             | Firefox |         |         |             |         |         |             |
| en.wikipedia.org | MPA             | Chrome  |         |         |             |         |         |             |
| codepen.io       | Iframe          | Chrome  |         |         |             |         |         |             |
| github.com       | Strict CSP      | Chrome  |         |         |             |         |         |             |
| excalidraw.com   | SW PWA          | Chrome  |         |         |             |         |         |             |
| getbootstrap.com | Dialog/modal    | Chrome  |         |         |             |         |         |             |
| www.reddit.com   | Infinite scroll | Chrome  |         |         |             |         |         |             |
| www.youtube.com  | Video/media     | Chrome  |         |         |             |         |         |             |
| github.com/login | Login/auth      | Chrome  |         |         |             |         |         |             |
| www.figma.com    | Heavy web-app   | Chrome  |         |         |             |         |         |             |
| …                | …               | …       |         |         |             |         |         |             |

> ⚠️ means "works, with a known/accepted limitation" — always explain it in Notes (e.g. "Firefox: no
> network response bodies, S5-01", "DRM frames black — expected").

## Per-archetype coverage (release gate)

A release ships only when every archetype has at least one ✅ (or accepted ⚠️) run in **both**
browsers.

| Archetype             | Chrome | Firefox |
| --------------------- | ------ | ------- |
| SPA                   |        |         |
| MPA / server-rendered |        |         |
| Iframe-heavy          |        |         |
| Strict CSP            |        |         |
| Service-worker PWA    |        |         |
| Dialog / modal        |        |         |
| Infinite scroll       |        |         |
| Video / media         |        |         |
| Login / auth          |        |         |
| Heavy web-app         |        |         |

## Blockers found

- `<bug link>` — `<one-line summary>` — `<blocker | non-blocker>`

## Sign-off

- [ ] Every archetype green (or accepted limitation) in Chrome and Firefox.
- [ ] No unresolved release-blocking bug.
- [ ] Privacy invariants held on every site (text masked; image-pixel warning shown; no egress).

**Decision:** `<GO / NO-GO>` — `<name>`, `<date>`.
