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
| Chrome Web Store       | `bugcase-chrome-1.0.0.zip` | `271a43a6…1bb9` | _yyyy-mm-dd_ | 🟡 not yet submitted | —                 | —          |
| Microsoft Edge Add-ons | `bugcase-chrome-1.0.0.zip` | `271a43a6…1bb9` | _yyyy-mm-dd_ | 🟡 not yet submitted | —                 | —          |
| Firefox AMO            | —                          | —               | —            | ⬜ S4-32             | —                 | —          |

**Upload candidate — built 2026-07-29 from `main` (BUG-05 merged, PR #187):**

```
sha256  271a43a6141863895938d87a36ea95577e2be1f739b4bd096d6fe7ce45eb1bb9
size    584,501 bytes · 24 entries · 9 sourcemaps excluded
```

Verified before recording: `verify:edge-brave` passes (MV3 valid, manifest at root, service worker and
all declared icons present, no `.map` files); `check:permission-justifications` matches 10/10; the
build is **reproducible** (byte-identical hash across two runs separated by a wall-clock boundary);
and the BUG-05 fix is present in the artifact (`content/overlay.js` + the shared `messages` chunk the
service worker imports).

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
