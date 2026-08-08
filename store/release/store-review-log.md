# Store review log

> Append-only, dated notes on each store's review of the BugCase extension: reviewer questions,
> rejections, and how each was resolved. Pairs with [`store-submission-tracker.md`](./store-submission-tracker.md)
> (which holds the current state); this file holds the narrative. Newest entries at the top.

## Format

`### YYYY-MM-DD: <Store>: v<version>` followed by bullets: what the reviewer said, what changed,
and the outcome.

## Log

### 2026-08-07: Chrome Web Store: v1.0.1

- Submitted `bugcase-chrome-1.0.1.zip` (`49d51a0b…f5c1`, 592,991 bytes) built from `main` @ `d085902`,
  tag `v1.0.1`. Filed as an update to the existing published item `inbgbkepikijkgeagehcbaofambgcdck`.
- Contents are S4-36 only: the extension renamed to "BugCase - Bug Reporter Tool" and user-visible
  strings reworded off em dashes, plus CI gates to keep them out. **No capture-engine, schema,
  manifest-permission, or message-contract change.** The permission set is the same 10 as 1.0.0, so no
  new permission review is expected.
- ⚠️ **Screenshot 1 is stale as of this build and was submitted anyway.** The screenshot PNGs were not
  touched between `v1.0.0` and `v1.0.1` (only their README was, for the em dash pass). But
  `screenshot-1-capture-overlay.png` still shows the gated capture rows in their pre-S4-36 phrasing,
  which used an em dash before "enable in the toolbar popup"; the shipped build now reads
  "needs permission. Enable in the toolbar popup". The listing therefore shows copy the submitted
  package no longer contains. Not review-blocking, since stores do not require pixel-current
  screenshots, but it should be re-shot. Found 2026-08-07 while recording this row, after submission.
  The overlay's own title is still "BugCase" (`short_name`), so the rename itself invalidated no
  screenshot.
- Outcome: ⏳ awaiting review.

### 2026-08-05: Chrome Web Store: v1.0.0

- Outcome: ✅ published. No reviewer questions were raised; the submission cleared review as filed.
- Item ID `inbgbkepikijkgeagehcbaofambgcdck`; listing live at
  https://chromewebstore.google.com/detail/bugcase-%E2%80%94-bug-reporter-to/inbgbkepikijkgeagehcbaofambgcdck
- Verified the published artifact is the submitted one: the CRX update endpoint serves
  `INBGBKEPIKIJKGEAGEHCBAOFAMBGCDCK_1_0_0_0.crx` for this item, i.e. version 1.0.0; the build
  recorded as `69c24b3e…3466` in [`store-submission-tracker.md`](./store-submission-tracker.md).
- Edge Add-ons remains `🟡 not yet submitted`; Firefox AMO remains S4-32.

### 2026-07-31: Chrome Web Store: v1.0.0

- Submitted `bugcase-chrome-1.0.0.zip` (`69c24b3e…3466`, 586,810 bytes) built from `main` @ `048f4c5`,
  tag `v1.0.0`. Byte-identical to the `v1.0.0` GitHub Release asset.
- Filed into the **existing draft item** rather than a new listing; the Chrome Web Store has no way to
  delete a draft, and a second item would be permanent clutter with a different extension ID. Chrome
  accepted the replacement package under the same version number (`1.0.0`) over the draft's earlier upload.
- The replaced draft package was `aae5371c…60b1` (2026-07-25, commit `6afc58c`), which predated BUG-03,
  BUG-04, BUG-05 and BUG-06. It was caught before submission; nothing was ever published from it.
- Screenshot 1 was re-shot (PR #191) because BUG-06 reworded the gated capture options' hint to
  name the toolbar popup (reworded again in S4-36).
- Outcome: ⏳ awaiting review. (Superseded; see the 2026-08-05 entry: published.)
