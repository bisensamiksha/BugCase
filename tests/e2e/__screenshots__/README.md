# Visual regression baselines (S3-17)

`toHaveScreenshot` baselines for the preview-screen states, produced by
[`../preview-visual.spec.ts`](../preview-visual.spec.ts). Each image is one preview state rendered by
the standalone harness in `packages/extension/visual-harness` (the real `PreviewApp` mounted with fixed
fixture data — no extension runtime, no clock, no network).

## Files

```
preview-visual.spec.ts/
  preview-review-screen-visual-<platform>.png   # the review screen
  preview-privacy-modal-visual-<platform>.png    # the privacy-notice modal
  preview-annotation-canvas-visual-<platform>.png # the Konva annotation canvas
```

Names are `{arg}{-projectName}{-platform}` (see `snapshotPathTemplate` in `playwright.config.ts`).

## Running

The visual project is **opt-in** — it is excluded from the default `pnpm test:e2e` (and CI), because
its baselines are platform-specific and CI runs on Linux while these committed baselines are **darwin**
(the dev platform). Build the harness, then run:

```bash
pnpm build:harness       # builds packages/extension/visual-harness/dist (a self-contained IIFE page)
pnpm test:e2e:visual     # PWTEST_VISUAL=1 playwright test --project=visual
```

## Updating baselines

When a preview-screen change is intended, regenerate and review the diffs before committing:

```bash
pnpm build:harness
pnpm test:e2e:visual --update-snapshots
```

## Cross-platform / CI

Playwright suffixes baselines per OS, so a darwin baseline will not match a Linux run. The committed
baselines are darwin-only; to enable the `visual` project in CI (ubuntu), generate Linux baselines in a
matching environment — e.g. the Playwright Docker image —

```bash
docker run --rm -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.60.0-jammy \
  bash -lc "pnpm install && pnpm build:harness && pnpm test:e2e:visual --update-snapshots"
```

commit the resulting `*-linux.png` files, then add `PWTEST_VISUAL=1 pnpm test:e2e:visual` to the CI e2e
job. Until then the visual suite is a local, dev-platform regression guard.
