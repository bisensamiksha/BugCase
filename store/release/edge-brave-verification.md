# Edge & Brave install-path verification

> Edge and Brave are Chromium browsers and install the **same** package as Chrome; there is no separate
> build (see [`../edge/submission-checklist.md`](../edge/submission-checklist.md)). This checklist verifies
> that the one Chromium artifact (`dist/bugcase-chrome-<version>.zip`, S4-18) installs and runs on both,
> and records the results. The **Brave dedicated-listing decision is an open question** (below), not decided here.

## Pre-checks (automated)

- [ ] `pnpm --filter @bugcase/extension build:chrome && pnpm package:chrome` succeed.
- [ ] `node scripts/verify-edge-brave-artifacts.mjs` exits 0: valid Chrome MV3 manifest, clean ZIP layout,
      no Firefox-only keys, no `.map` sourcemaps.

## Edge (Microsoft Edge): 🟡 manual

- [ ] Load unpacked `packages/extension/dist-chrome/` via `edge://extensions` (Developer mode): the popup
      opens and a capture runs end-to-end.
- [ ] After the Edge Add-ons listing publishes: install from the store; same behavior.
- [ ] Optional permissions (cookies / history / management) still prompt at runtime and default off.

## Brave: 🟡 manual

- [ ] Load unpacked `packages/extension/dist-chrome/` via `brave://extensions` (Developer mode): the popup
      opens and a capture runs end-to-end.
- [ ] Install the published **Chrome Web Store** listing directly in Brave (Brave installs from the CWS):
      same behavior.
- [ ] Confirm no captured data leaves the local browser context (there is no network egress; Brave Shields
      don't change this).

## Results

| Browser | Version | Install method   | Result     | Notes |
| ------- | ------- | ---------------- | ---------- | ----- |
| Edge    | _fill_  | unpacked / store | 🟡 pending |       |
| Brave   | _fill_  | unpacked / CWS   | 🟡 pending |       |

## Open questions

- **Does Brave warrant a dedicated store listing?** Brave installs Chrome Web Store extensions directly, so
  a separate listing is **not required** to reach Brave users. Whether to create one (marginal
  discoverability vs. maintaining another listing + review queue) is a **product decision: left open**.
  This ticket verifies the install path only, per the ticket guardrail.
