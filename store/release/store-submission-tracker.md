# Store submission tracker

> The durable record of every browser-store submission of the BugCase extension. The _act_ of
> submitting happens in the store dashboards (human accounts + gestures); this file is the auditable
> trail. Chrome + Edge are filed in **S4-24**; **S4-32** appends the Firefox AMO row(s) here.
>
> Artifact = the single Chromium ZIP `dist/bugcase-chrome-<version>.zip` (S4-18). Get its SHA-256 from
> `node scripts/verify-edge-brave-artifacts.mjs` (also gates manifest validity + ZIP layout before upload).

## v1.0.0

| Store                  | Artifact                   | SHA-256         | Submitted    | Review state         | Reviewer feedback | Resolution |
| ---------------------- | -------------------------- | --------------- | ------------ | -------------------- | ----------------- | ---------- |
| Chrome Web Store       | `bugcase-chrome-1.0.0.zip` | `69c24b3e…3466` | 2026-07-31   | ⏳ in review         | —                 | —          |
| Microsoft Edge Add-ons | `bugcase-chrome-1.0.0.zip` | `69c24b3e…3466` | _yyyy-mm-dd_ | 🟡 not yet submitted | —                 | —          |
| Firefox AMO            | —                          | —               | —            | ⬜ S4-32             | —                 | —          |

**Upload candidate — built 2026-07-31 from `main` @ `048f4c5`, tagged `v1.0.0` (PR #190 BUG-06,
PR #191 screenshot):**

```
sha256  69c24b3e4cb2c4e833caec5422d1f2c0e3c1ea9b3ca1f44f827fb2dc56343466
size    586,810 bytes · 24 entries · 9 sourcemaps excluded
```

Verified before recording: `verify:edge-brave` passes (MV3 valid, manifest at root, service worker and
all declared icons present, no `.map` files); `check:permission-justifications` matches 10/10; and both
recent fixes are present in the artifact — BUG-05 (`bugcase/overlay-open`, `bugcase/overlay-state`) and
BUG-06 (`bugcase/overlay-draft`, plus the reworded reproduction copy "Track reproduction steps" /
"never video or audio").

**Reproducible across platforms.** The same hash was produced by a local macOS build and by the
tag-driven `release.yml` run on `ubuntu-latest` — the GitHub Release asset for `v1.0.0` is byte-identical
to the ZIP uploaded to the store. GitHub, the store, and this row all pin the same bytes.

### Superseded candidates — do not upload

| SHA-256         | Size    | Built      | Source commit | Missing                        |
| --------------- | ------- | ---------- | ------------- | ------------------------------ |
| `aae5371c…60b1` | 579,355 | 2026-07-25 | `6afc58c`     | BUG-03, BUG-04, BUG-05, BUG-06 |
| `271a43a6…1bb9` | 584,501 | 2026-07-29 | `bbb5e57`     | BUG-06                         |

`aae5371c…60b1` was the original `v1.0.0` GitHub Release asset and the package first uploaded to the
Chrome draft. The release was re-cut at `048f4c5` on 2026-07-31 and that asset no longer exists.

⚠️ **Re-package before submitting if `main` has moved.** This hash pins one specific build — a
mismatch between what you upload and what is recorded here makes the trail worthless. Re-run
`rm dist/*.zip && pnpm build:chrome && pnpm package:chrome && pnpm verify:edge-brave` and update the
rows above.

### Review states

`🟡 not yet submitted` → `⏳ in review` → `✅ published`, or `❌ rejected` → resolve (see
[`store-review-log.md`](./store-review-log.md)) → resubmit.

## How to fill a row

1. `pnpm --filter @bugcase/extension build:chrome && pnpm package:chrome` → `dist/bugcase-chrome-<version>.zip`.
2. `node scripts/verify-edge-brave-artifacts.mjs` → exit 0; copy the printed `sha256`.
3. Upload the **same** ZIP to the store dashboard. Listing fields:
   [`../chrome/listing.md`](../chrome/listing.md) / [`../edge/listing.md`](../edge/listing.md);
   Chrome permission notes: [`../chrome/permission-justifications.md`](../chrome/permission-justifications.md).
4. Record the SHA-256 + submission date; set the review state to `⏳ in review`.
5. As review progresses, update the state and log any reviewer feedback in
   [`store-review-log.md`](./store-review-log.md); on resolution set `✅`/`❌` + the resolution.

## Guardrails

- No captured data leaves the local browser context; there is no backend or telemetry to disclose.
- "Collects user data?" → **No** (see the listing files).
- Edge/Brave install verification: [`edge-brave-verification.md`](./edge-brave-verification.md).
