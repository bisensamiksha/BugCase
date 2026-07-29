# Chrome Web Store — listing (deltas from shared)

> Copy comes from [`../shared/listing-copy.md`](../shared/listing-copy.md). This file only records the
> Chrome-specific fields, limits, and the asset checklist. Permission text lives in
> [`permission-justifications.md`](./permission-justifications.md).

## Developer Dashboard fields

| Field                         | Value / source                                                                               | Chrome limit                       |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| Item name                     | **BugCase — Bug Reporter Tool** (from manifest `name`)                                       | ≤ 75 chars                         |
| Summary (short description)   | shared **Tagline**                                                                           | ≤ 132 chars                        |
| Detailed description          | shared **Detailed description**                                                              | ≤ 16,000 chars                     |
| Category                      | **Developer Tools**                                                                          | single choice                      |
| Language                      | English (United States)                                                                      | —                                  |
| Single purpose                | shared **Single-purpose statement**                                                          | required free text                 |
| Permission justifications     | one per permission — see [`permission-justifications.md`](./permission-justifications.md)    | required per permission            |
| Privacy policy URL            | https://bisensamiksha.github.io/BugCase/legal/privacy-policy                                 | required (MV3 has no manifest key) |
| Host-permission justification | see the `<all_urls>` row in [`permission-justifications.md`](./permission-justifications.md) | required when host perms present   |
| Data-usage disclosures        | **No user data collected / sold / transferred** — certify all three                          | required                           |
| Homepage URL                  | https://bisensamiksha.github.io/BugCase/                                                     | optional                           |
| Support URL                   | https://github.com/bisensamiksha/BugCase/issues                                              | optional                           |

## Data-usage certification (Chrome's required disclosures)

Because BugCase collects nothing, certify:

- **We do NOT collect or use** any of the listed data categories.
- **We do NOT sell** user data to third parties.
- **We do NOT use or transfer** user data for purposes unrelated to the item's single purpose.
- **We do NOT use or transfer** user data to determine creditworthiness or for lending.

These are true because BugCase has no server and no telemetry (see the Privacy Policy).

## Image assets

| Asset              | Required size                     | Status                     | Source                                                                      |
| ------------------ | --------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Store icon         | 128×128 PNG                       | ✅ ships in the package    | `packages/extension/public/icons/icon-128.png` (S4-17)                      |
| Small promo tile   | 440×280 PNG                       | ✅ generated               | [`assets/promo-tile-440x280.png`](./assets/promo-tile-440x280.png)          |
| Marquee promo tile | 1400×560 PNG                      | ✅ generated (optional)    | [`assets/promo-marquee-1400x560.png`](./assets/promo-marquee-1400x560.png)  |
| Screenshots        | 1280×800 or 640×400 PNG/JPEG, 1–5 | ✅ captured (6 × 1280×800) | [`screenshots/`](./screenshots/README.md) — upload **1–5**; #6 is Edge-only |

Regenerate the promo tiles with `pnpm store:assets`. The screenshots are real captures of the shipped
build — see [`screenshots/README.md`](./screenshots/README.md) for the set, their captions, and how to
reproduce them. Do **not** fake them; every marketing image must reflect the shipped build, and
**re-shoot whenever the UI changes**.

## Pre-submission checklist (Chrome)

- [ ] `pnpm --filter @bugcase/extension build:chrome` succeeds.
- [ ] `pnpm package:chrome` produces the upload ZIP (S4-18).
- [ ] `node scripts/check-permission-justifications.mjs` exits 0 (permissions ↔ justifications match).
- [ ] Summary ≤ 132 chars; single-purpose statement filled from shared copy.
- [ ] Every requested permission has a justification pasted from `permission-justifications.md`.
- [ ] Privacy policy URL set to the hosted policy; data-usage disclosures certified as "no collection".
- [ ] Promo tiles uploaded; screenshots **1–5** uploaded in order (1280×800) with their captions.
- [ ] (Filing + review tracking happens in **S4-24**.)
