# Microsoft Edge Add-ons — submission checklist

> Prepared here in S4-23; the actual submission + review tracking is **S4-24**. Edge accepts the same
> Chromium package as Chrome, so no separate build is required.

## Prerequisites

- [ ] A Microsoft Partner Center account with **Edge Add-ons** enrollment (human step).
- [ ] `pnpm --filter @bugcase/extension build:chrome` succeeds.
- [ ] `pnpm package:chrome` produced the upload ZIP (`dist/bugcase-chrome-<version>.zip`, S4-18).
- [ ] `node scripts/check-permission-justifications.mjs` exits 0 (permissions ↔ justifications match).

## Assets ready

- [ ] Store logo 300×300 → [`assets/store-logo-300x300.png`](./assets/store-logo-300x300.png).
- [ ] At least one screenshot 1280×800 → captured per [`../chrome/screenshots/README.md`](../chrome/screenshots/README.md).
- [ ] Promo tiles (optional) available in [`../chrome/assets/`](../chrome/assets/).

## Listing fields (from [`listing.md`](./listing.md) → shared copy)

- [ ] Name: **Bug Reporter Tool** (≤ 45 chars).
- [ ] Short description = shared tagline (≤ 132 chars).
- [ ] Description = shared detailed description (≤ 10,000 chars).
- [ ] Category: **Developer tools**.
- [ ] Privacy policy URL: https://bisensamiksha.github.io/BugCase/legal/privacy-policy
- [ ] "Collects user data?" → **No**.
- [ ] Permission notes (if prompted) = the Chrome justifications.

## Submit

- [ ] Upload the Chrome ZIP as-is to Partner Center → **Extensions** → **Overview** → **Update/Submit**.
- [ ] Fill the Store listing + Availability + Properties from the fields above.
- [ ] Submit for certification.

## Track (in S4-24)

- [ ] Record artifact hash, submission date, and review state in [`../release/store-submission-tracker.md`](../release/store-submission-tracker.md) (created in S4-24).
- [ ] Verify the Chrome ZIP installs on **Edge** and that the **Brave** install path works (Brave listing decision stays open — S4-24).

## Notes

- Do not add telemetry, analytics, or a backend to satisfy any store field.
- Do not broaden permissions for Edge; the manifest is identical across Chromium stores.
