# Manual QA results — v1.0.0 (Chrome pre-submission, re-run at HEAD + BUG-05 fix)

> Produced by an automated run of `manual-site-checklist.md` driving the **shipped** unpacked
> `dist-chrome` build through its real flow on each site:
> `overlay inject → Capture → preview review → Download → privacy modal → ZIP`.
>
> **Why this re-run:** the 2026-07-27 results were produced at `f5e2a02` (BUG-03). BUG-04 then
> changed 34 files including `capture-flow.ts`, `service-worker.ts`, `PreviewApp.tsx`,
> `OverlayApp.tsx`, `request-capture.ts`, `report-hold.ts` and the DOM scrubbers — i.e. the exact
> hot path this sweep exists to exercise. This run re-validates the artifact that would actually
> be submitted. **Supersedes `manual-qa-results-2026-07-27.md`.**

## Run info

| Field             | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Extension version | `1.0.0`                                                                      |
| Commit            | `c842492` (`origin/main`, BUG-04 merged) **+ the BUG-05 fix on this branch** |
| Artifact SHA-256  | `cdb0d0e2aa68623c05a834f49e82a4ced978ee795c2471e673ddb8de0b716037`           |
| Date              | 2026-07-28                                                                   |
| Tester            | automated harness (Playwright + real Chromium, headed)                       |
| OS                | macOS (darwin 25.5.0)                                                        |
| Chrome            | Chromium 148.0.7778.96 (Chrome for Testing)                                  |
| Firefox           | **not run** — out of scope for a Chrome-only launch (S4-30/31/32 are wave 2) |

### Deviations from a hand-run (important)

1. **Host access pre-granted.** The test profile's manifest adds `host_permissions: ["<all_urls>"]`.
   A real user grants this by clicking the toolbar button (`activeTab`) or via the per-origin opt-in.
   Playwright cannot click browser chrome, and the `<all_urls>` prompt cannot be auto-accepted.
   _No capture code differs_ — only how host access is obtained.
2. **`chrome.downloads.download` intercepted** so ZIP bytes could be asserted in-process. Everything
   before it runs as shipped, including real `tabs.captureVisibleTab` pixels.
3. Consequently the literal **toolbar-button click** and the **real save-to-disk** remain 🟡 manual.

Build provenance was checked before the run: the loaded profile contains the BUG-04 markers
`manual-text-redaction` and `dom-password-input-mask` in `service-worker.js` and `content/overlay.js`.

## Automated suite (pre-flight)

| Check                             | Result                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm -r typecheck`               | ✅ 0 errors                                                                                            |
| `pnpm lint`                       | ✅ 0                                                                                                   |
| `pnpm -r test`                    | ✅ **1,587 passed** (ext 971 · dash 293 · schema 253 · shared-ui 32 · report-tpl 25 · privacy-site 13) |
| `build:chrome` / `build:firefox`  | ✅ both emit                                                                                           |
| `check:permission-justifications` | ✅ 10/10 match built manifest 1:1                                                                      |
| `verify:edge-brave`               | ✅ MV3 valid, no `.map`, icons present, sha256 `cdb0d0e2…`                                             |

## Results — 39 sites, 33 ✅ / 6 ⚠️ / 0 ❌

| Site                                            | Archetype | Verdict | Notes                                                |
| ----------------------------------------------- | --------- | ------- | ---------------------------------------------------- |
| react.dev/                                      | SPA       | ✅      | 259 KB shot, 7 entries                               |
| vuejs.org/                                      | SPA       | ✅      | 208 KB shot, 7 entries                               |
| angular.dev/                                    | SPA       | ✅      | 280 KB shot, 7 entries                               |
| svelte.dev/                                     | SPA       | ✅      | 1257 KB shot, 7 entries                              |
| en.wikipedia.org/wiki/Software_bug              | MPA       | ✅      | 475 KB shot, 7 entries                               |
| news.ycombinator.com/                           | MPA       | ✅      | 449 KB shot, 7 entries                               |
| developer.mozilla.org/en-US/                    | MPA       | ✅      | 817 KB shot, 7 entries                               |
| www.gov.uk/                                     | MPA       | ✅      | 170 KB shot, 7 entries                               |
| codepen.io/pen/                                 | Iframe    | ⚠️      | TIMEOUT >150s at stage=navigated                     |
| jsfiddle.net/                                   | Iframe    | ⚠️      | TIMEOUT >150s at stage=navigated                     |
| stackblitz.com/                                 | Iframe    | ✅      | 455 KB shot, 7 entries                               |
| codesandbox.io/                                 | Iframe    | ⚠️      | TIMEOUT >150s at stage=navigated                     |
| github.com/                                     | CSP       | ✅      | 760 KB shot, 7 entries                               |
| gitlab.com/                                     | CSP       | ✅      | 839 KB shot, 7 entries                               |
| addons.mozilla.org/en-US/firefox/               | CSP       | ✅      | 1054 KB shot, 7 entries                              |
| chromewebstore.google.com/                      | CSP       | ✅      | 228 KB shot, 7 entries                               |
| web.telegram.org/                               | SW-PWA    | ✅      | 1410 KB shot, 7 entries                              |
| squoosh.app/                                    | SW-PWA    | ✅      | 146 KB shot, 7 entries                               |
| excalidraw.com/                                 | SW-PWA    | ✅      | 123 KB shot, 7 entries                               |
| web.dev/                                        | SW-PWA    | ✅      | 276 KB shot, 7 entries                               |
| getbootstrap.com/docs/5.3/components/modal/     | Dialog    | ✅      | 500 KB shot, 7 entries                               |
| www.theguardian.com/international               | Dialog    | ✅      | 452 KB shot, 7 entries                               |
| www.w3schools.com/js/js_popup.asp               | Dialog    | ✅      | 409 KB shot, 7 entries                               |
| www.reddit.com/                                 | InfScroll | ✅      | 89 KB shot, 7 entries                                |
| www.pinterest.com/                              | InfScroll | ✅      | 648 KB shot, 7 entries                               |
| unsplash.com/                                   | InfScroll | ✅      | 2470 KB shot, 7 entries                              |
| www.quora.com/                                  | InfScroll | ⚠️      | TIMEOUT >150s at stage=navigated                     |
| www.youtube.com/                                | Video     | ✅      | 270 KB shot, 7 entries                               |
| vimeo.com/                                      | Video     | ✅      | 1118 KB shot, 7 entries                              |
| www.twitch.tv/                                  | Video     | ⚠️      | TIMEOUT >150s at stage=injecting                     |
| threejs.org/examples/#webgl_animation_keyframes | Video     | ✅      | 1998 KB shot, 7 entries                              |
| github.com/login                                | Login     | ✅      | 88 KB shot, 7 entries — see F-1                      |
| accounts.google.com/                            | Login     | ✅      | 88 KB shot, 7 entries                                |
| gitlab.com/users/sign_in                        | Login     | ⚠️      | TIMEOUT >150s at stage=navigated                     |
| wordpress.com/log-in                            | Login     | ✅      | 204 KB shot, 7 entries — **fixed by BUG-05**, was ❌ |
| www.figma.com/                                  | HeavyApp  | ✅      | 699 KB shot, 7 entries                               |
| www.notion.so/                                  | HeavyApp  | ✅      | 390 KB shot, 7 entries                               |
| linear.app/                                     | HeavyApp  | ✅      | 229 KB shot, 7 entries                               |
| docs.google.com/                                | HeavyApp  | ✅      | 88 KB shot, 7 entries                                |

⚠️ = could not be automated (page never became interactive under automation), **not** a BugCase failure.
Identical set to the 2026-07-27 run. These need a manual pass.

**Two runs were made on this date.** A pre-fix run at plain HEAD reproduced the 2026-07-27 baseline
exactly (32 ✅ / 6 ⚠️ / 1 ❌), confirming BUG-04 introduced no site-level regression. The BUG-05 fix
was then implemented and the sweep re-run: **`wordpress.com/log-in` now passes end-to-end**, taking
the suite to 33 ✅ / 0 ❌. Every other site is unchanged. The numbers below are the post-fix run.

⚠️ **Scope caveat:** this 39-site sweep predates the bfcache follow-up described in F-2. That
follow-up adds a `pageshow` listener and a restore-time query and touches no capture code, so the
site results stand — but they were **not** re-run against the final build. The final build is
covered by the full unit suite, the gap tests, the bfcache behavioural matrix, and a manual pass.
A full sweep under the corrected (bfcache-enabled) harness has not been completed.

## Per-archetype coverage (release gate)

| Archetype             | Chrome              | Firefox |
| --------------------- | ------------------- | ------- |
| SPA                   | ✅ 4/4              | not run |
| MPA / server-rendered | ✅ 4/4              | not run |
| Iframe-heavy          | ✅ 1/4 (stackblitz) | not run |
| Strict CSP            | ✅ 4/4              | not run |
| Service-worker PWA    | ✅ 4/4              | not run |
| Dialog / modal        | ✅ 3/3              | not run |
| Infinite scroll       | ✅ 3/4              | not run |
| Video / media         | ✅ 3/4              | not run |
| Login / auth          | ✅ 3/4              | not run |
| Heavy web-app         | ✅ 4/4              | not run |

## Non-negotiable invariants — all held across 33 passing sites

| Invariant                                        | Evidence                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Overlay injects in Shadow DOM above page content | 33/33; `z-index: 2147483647` uniformly                                                                     |
| Capture completes → ZIP downloaded               | 33/33                                                                                                      |
| `report.json` + `report.html` present            | 33/33, 7 entries each                                                                                      |
| `report.html` has no external references         | 33/33; **0** external `src`/`href` matches                                                                 |
| Password fields not leaked                       | github.com/login, accounts.google.com **and now wordpress.com/log-in**: test secret **absent** from report |
| Image disclosure shown on review screen (BUG-01) | 33/33                                                                                                      |
| Privacy modal shown before download              | 33/33                                                                                                      |
| Minimize / expand works (BUG-03 B)               | 33/33                                                                                                      |
| Screenshot contains real pixels                  | 33/33                                                                                                      |
| No uncaught errors                               | **0** BugCase console errors; **0** service-worker errors                                                  |

## Gap tests re-run at HEAD

| #   | Test                                                      | Result                                                                                                                                 |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A   | MV3 worker killed between capture and finalize            | ✅ handled — no download, review screen retained, expiry message shown                                                                 |
| B   | `report.html` offline with all network blocked            | ✅ **0** external requests attempted; 2.49 MB rendered, 0 page errors                                                                  |
| C   | Settings migration (BUG-03 G) + single-select (BUG-03 F)  | ✅ repaired to `viewport:true, fullPage:false`; click flips to `fullPage` only                                                         |
| D3  | Console + network capture with opt-in and options enabled | ✅ 3 console entries (log/warn/error), 1 network entry; `Authorization` + `X-Api-Key` → `[scrubbed]`, rule `header-secret-mask` 2 hits |
| E   | Full-page screenshot (scroll-stitch)                      | ✅ 16,000 px page → **1280 × 16,000** PNG (2.25 MB) in 13.1 s                                                                          |
| F   | Overlay absent from captured screenshot (BUG-03 A)        | ✅ all-white page + visible overlay → **0 non-white px / 4,096,000**                                                                   |

### BUG-04 targeted verification (re-run against the HEAD build)

The site sweep does not exercise BUG-04's own surfaces, so both targeted checks were re-run:

| Test                                       | Result                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credential masking + manual text redaction | ✅ revealed password (`type=password` → `text`) masked; `Redacted 101 occurrences (3 in report data, 98 in the DOM snapshot)`; secret **absent** from `report.json` **and** `dom-snapshot.html`; scrubbers recorded: `dom-password-input-mask` (1 hit), `manual-text-redaction` (101 hits) |
| Element-crop picker pill + annotate/remove | ✅ picker pill visible with grip; 2 inspections captured (`input#password`, `button#submit`); Remove → "Restore"; removed crop **absent** from ZIP (1 of 2 crops shipped), `elementCrops` manifest count = 1; secret absent from `report.json`                                             |

Both reproduce the pre-merge results exactly.

## Findings

### F-1 — `github.com/login` can be captured before first paint (harness timing, not a defect)

The **pre-fix** run recorded an 8.5 KB screenshot for `github.com/login` (88 KB on 2026-07-27).
Investigated rather than assumed: an isolated re-probe of the same URL against the same build
produced a correct **89,626-byte** render of the full sign-in page, with the overlay correctly absent
from the pixels. The sweep had captured ~507 ms after navigation settled, before GitHub painted.
**Harness timing artifact, not a product regression** — the post-fix run recorded 88 KB for the same
site. Worth noting a real user can also capture an unpainted page, but that is user-driven timing.

### F-2 — Overlay silently lost if the page navigates right after injection — ✅ **FIXED (BUG-05)**

`wordpress.com/log-in` fires two self-navigations ~700 ms after the overlay mounts, destroying the
overlay host with **no user feedback** — the toolbar button looked broken.

**Root cause** (not the symptom the 2026-07-27 write-up described): no per-tab record existed that
the overlay was open. `tabs.onUpdated` already re-injected, but only when a _recording_ was active
(`recording-navigation.ts`), so for a plain overlay open the worker could not distinguish "the page
navigated out from under the overlay" from "the overlay was never opened".

**Fix:** persist a per-tab overlay-open flag (`storage/overlay-session.ts`, mirroring
`recording-session.ts`), have the page report its resulting mounted state after every mount/remove
(`content/overlay-state-report.ts` — injection _toggles_, so only the page is authoritative), and
re-mount on completed navigation while open (`background/overlay-navigation.ts`). State is cleared on
explicit close and on `tabs.onRemoved`. **No new permissions** (`tabs` was already held).

Behaviour is _sticky until dismissed_, matching the recording path.

**Follow-up defect found by the user during manual testing on `smhi.se`:** after closing the overlay
with ×, pressing **Back** brought it back. Root cause was _not_ re-injection — the stored flag was
correctly cleared. The back/forward cache restores a document **verbatim, overlay host included**;
closing the overlay on a later page cannot reach a cached earlier document. Latent before this fix
(any page navigated away from was cached with its overlay), but this fix made it far more reachable
because the overlay is now present on every page the user passes through.

Fixed by reconciling on restore: `mountOverlay` registers a `pageshow` listener, and on
`event.persisted` the page asks the worker for the authoritative flag (`QUERY_OVERLAY_STATE`) and
removes or mounts itself to match. An unreachable worker returns `null` and the page is left alone,
so a transient messaging failure cannot rip away a working overlay. The listener is guarded by a
window flag because the content entry re-executes on every inject.

**Harness gap this exposed:** Playwright launches Chromium with `--disable-back-forward-cache` by
default, so every sweep and gap test run before this was structurally incapable of exercising
bfcache. `runner.mjs` now passes `ignoreDefaultArgs: ['--disable-back-forward-cache']`. Any bfcache
result from a run before 2026-07-28 21:00 is meaningless.

Verified with bfcache confirmed active (same document object restored across Back):

| Behaviour                                                      | Result |
| -------------------------------------------------------------- | ------ |
| Survives a self-navigation right after opening (the F-2 case)  | ✅     |
| Survives a user link navigation, twice                         | ✅     |
| Still open going **Back** to a cached page while open          | ✅     |
| Still open going **Forward** again                             | ✅     |
| Closes on the × button                                         | ✅     |
| **Stays closed going Back to a cached page** (no zombie)       | ✅     |
| **Stays closed going Back a second cached page**               | ✅     |
| **Stays closed going Forward to a cached page**                | ✅     |
| Re-opens when asked again                                      | ✅     |
| Sticky again going Back after re-opening                       | ✅     |
| Toggles off on a second inject, stays closed across navigation | ✅     |

Also re-verified on `smhi.se`, the site where the defect was reported.

33 new unit tests (extension 938 → 971), all written test-first and watched fail.

🟡 **Not machine-verified:** the literal browser **Back button** in a real Chrome profile. The
automation now genuinely exercises bfcache, but a hand-check is still the authoritative confirmation
— this defect was found by hand and missed by automation.

### F-3 — Stale artifacts in `dist/` (submission hazard, still open)

`bugcase-chrome-0.0.1.zip`, `bugcase-chrome.zip`, `bugcase-firefox.zip` sit beside the real
`bugcase-chrome-1.0.0.zip`. Run `rm dist/*.zip && pnpm package:chrome` before submitting.

### F-4 — Duplicate icons in the package (cosmetic, still open)

The ZIP ships both `icons/*` and `public/icons/*`; the manifest references only `public/icons/*`.
~6.5 KB of dead weight.

### F-5 — `new Function(` in the shipped service worker (review-prep, not a defect)

Two occurrences, both from the bundled `setimmediate` polyfill in JSZip's dependency chain. No remote
code is fetched. Worth knowing if a reviewer greps.

### F-6 — The QA harness is not committed

This sweep is driven by scratch scripts (`runner.mjs`, `sites.mjs`, `gapsv2.mjs`, `gapsv4.mjs`,
`verify-bug04.mjs`, `verify-bug05.mjs`) that live only in a temporary session directory. They were
recovered from a prior session by luck. If the sweep is a release gate, the harness should graduate
into the repo (candidate: `qa/harness/`) so it is reproducible by anyone.

## Not covered — needs a human

- **Firefox** entirely (Playwright cannot load MV3 add-ons in Firefox; wave 2).
- **The literal toolbar-button click** and real save-to-disk.
- **Real login/OAuth flows** with your own throwaway accounts.
- **DRM video** black-frame behaviour (needs a real Widevine session).
- **The 6 ⚠️ sites** above (codepen, jsfiddle, codesandbox, quora, twitch, gitlab sign-in).
- **Annotate flow through the real UI** — zoom (BUG-03 E), eraser hit area (H), and the chunked
  large-annotation download (I). Unit tests cover these; the BUG-04 element-crop annotate/remove
  path _is_ covered above, but the drawing surface itself is not driven here.
- Incognito, multi-profile, HiDPI/multi-monitor, and a >100 MB report.

## Sign-off

- [x] Every archetype has a green Chrome run.
- [x] Privacy invariants held on every passing site (text masked, image warning shown, no egress).
- [x] Re-validated at HEAD — no regression from BUG-03 → BUG-04.
- [x] BUG-05 fixed and re-validated — **no ❌ sites remain**.
- [ ] Firefox — **deliberately out of scope** for the Chrome-only v1.0.0 launch.
- [ ] Annotate drawing surface + the 6 ⚠️ sites — manual pass outstanding.

**Decision: GO for Chrome Web Store submission**, conditional on the manual items above and on
re-packaging from a clean `dist/`. No release-blocking defect found.
