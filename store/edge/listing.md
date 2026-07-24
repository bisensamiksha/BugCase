# Microsoft Edge Add-ons — listing (deltas from shared)

> Copy comes from [`../shared/listing-copy.md`](../shared/listing-copy.md); the permission text is the
> same as Chrome's [`../chrome/permission-justifications.md`](../chrome/permission-justifications.md)
> (the Chromium manifest is identical). This file records only the Edge-specific fields and assets.
> Actual upload happens in **S4-24** (the Chrome ZIP from S4-18 is uploaded as-is to Edge).

## Partner Center fields

| Field                                  | Value / source                                                                             | Edge limit     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Name                                   | **Bug Reporter Tool** (from manifest `name`)                                               | ≤ 45 chars     |
| Short description                      | shared **Tagline**                                                                         | ≤ 132 chars    |
| Description                            | shared **Detailed description**                                                            | ≤ 10,000 chars |
| Category                               | **Developer tools**                                                                        | single choice  |
| Privacy policy URL                     | https://bisensamiksha.github.io/BugCase/legal/privacy-policy                               | required       |
| Does this extension collect user data? | **No**                                                                                     | required       |
| Store logo                             | 300×300 PNG                                                                                | required       |
| Screenshots                            | 1280×800 or 640×400, 1–10                                                                  | required (≥ 1) |
| Website / support                      | https://bisensamiksha.github.io/BugCase/ · https://github.com/bisensamiksha/BugCase/issues | optional       |

## Edge deltas vs. Chrome

- **Name limit is shorter (45 chars).** "Bug Reporter Tool" (17 chars) fits — no change needed.
- **Description limit is 10,000 chars** (Chrome allows 16,000). The shared detailed description is well
  under both; no Edge-specific trim required.
- Edge requires a **300×300 store logo** (Chrome uses the 128×128 package icon). Generated:
  [`assets/store-logo-300x300.png`](./assets/store-logo-300x300.png).
- Edge has **no separate promo-tile fields**; the Chrome promo tiles are optional extras here.
- Edge asks a single "collects user data?" question → **No** (BugCase has no backend/telemetry).

## Image assets

| Asset                  | Required size             | Status              | Source                                                                     |
| ---------------------- | ------------------------- | ------------------- | -------------------------------------------------------------------------- |
| Store logo             | 300×300 PNG               | ✅ generated        | [`assets/store-logo-300x300.png`](./assets/store-logo-300x300.png)         |
| Screenshots            | 1280×800 or 640×400       | 🟡 capture by hand  | reuse [`../chrome/screenshots/README.md`](../chrome/screenshots/README.md) |
| Promo tiles (optional) | Chrome 440×280 / 1400×560 | ✅ reuse Chrome art | [`../chrome/assets/`](../chrome/assets/)                                   |

Regenerate the store logo with `pnpm store:assets`. See
[`submission-checklist.md`](./submission-checklist.md) for the upload steps.
