# CI/CD pipeline — operator runbook

Three GitHub Actions workflows, all on standard `ubuntu-latest` runners with first-party
`actions/*` + the built-in `gh` CLI only — no paid runners, marketplace actions, or external deploy
providers. This repo is **public**, so Actions minutes, artifact storage, and cache are free and
unmetered; the "private-repo controls" section is a contingency only.

## Workflow map

| Workflow                         | Trigger                                       | Does                                                                                                                             | Permissions                       |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`ci.yml`](./ci.yml)             | `pull_request`, `push: main`, `workflow_call` | lint · typecheck (+e2e, +workflows) · unit (+perf, +workflows) · build (+report.html size gate) · E2E matrix (chromium, firefox) | `contents: read`                  |
| [`gh-pages.yml`](./gh-pages.yml) | `push: main`, `workflow_dispatch`             | build the dashboard → deploy to GitHub Pages (only after build succeeds)                                                         | `pages: write`, `id-token: write` |
| [`release.yml`](./release.yml)   | `push: tags: v*`                              | reuse `ci.yml` → build all targets → reproducible-hash gate → attach artifacts to the GitHub Release                             | `contents: write`                 |

Every job sets `timeout-minutes`; every workflow sets `concurrency` (`cancel-in-progress: true` for
CI to save minutes; `false` for Pages and Release so a publish is never aborted).

## Required status checks (branch protection for `main`)

Mark these `ci.yml` jobs required before merge: **lint**, **typecheck**, **unit**, **build**,
**e2e (chromium)**, **e2e (firefox)**. PRs never deploy to Pages (that trigger is `push: main` +
manual dispatch only), and unreviewed PR code is therefore never published.

## GitHub Pages setup

Settings → Pages → **Source: GitHub Actions**. `gh-pages.yml` publishes `packages/dashboard/dist`
via `actions/upload-pages-artifact` + `actions/deploy-pages` over OIDC. No branch or token config
needed.

## Release process

1. Set the release version once, in `packages/extension/package.json` → `version` (the single source
   of truth; crxjs copies it into the manifest — see `packages/extension/PACKAGING.md`). Do **not**
   invent a separate versioning scheme.
2. Tag the commit `vX.Y.Z` **matching that version** and push the tag:
   ```bash
   git tag v0.0.1 && git push origin v0.0.1
   ```
3. `release.yml` runs: it re-validates via `ci.yml`, builds all targets, asserts the reproducible
   dist hash, and attaches to the GitHub Release:
   - `bugcase-chrome-<version>.zip` — the Chrome/Edge store upload (S4-18)
   - `bugcase-report-template-<version>.html` — the self-contained report template
   - `bugcase-dashboard-<version>.zip` — the built dashboard
4. Uploading to the Chrome Web Store / Edge Add-ons / AMO is a **separate, credentialed** step
   (S4-24 / S4-32); this pipeline holds no store secrets.

The Firefox target (S4-31) is added later as an additive matrix entry — no rewrite.

## Reproducible builds & hash verification

`scripts/hash-dist.mjs <dir|file>` prints a deterministic sha256 over sorted path+content, so the
same bytes always hash the same and a rename changes the result. The release job builds twice and
fails on any mismatch. Verify locally:

```bash
pnpm build:chrome && node scripts/hash-dist.mjs packages/extension/dist-chrome
pnpm build:chrome && node scripts/hash-dist.mjs packages/extension/dist-chrome   # identical hash
```

The store ZIP itself is byte-identical across runs (fixed timestamps, sorted POSIX paths, level-9
DEFLATE — `scripts/zip-extension.mjs`).

## Artifact retention

CI uploads only the Playwright HTML report, **on failure**, with `retention-days: 7`. Release assets
live on the GitHub Release (durable, intended). Do not add unbounded `upload-artifact` steps — the
workflow contract test (`tests/workflows/ci-cd-pipeline.test.ts`) fails any `upload-artifact` without
`retention-days` ≤ 7. There are no scheduled workflows.

## Private-repo controls (contingency)

If this repo is ever made private, Actions/Pages/storage draw on the account's included free quota.
To stay within it: keep `cancel-in-progress: true` on CI, keep retention at 7 days, avoid adding
scheduled jobs, and — if needed — disable a workflow from the Actions tab (⋯ → _Disable workflow_)
or gate it behind `if: github.repository == '<owner>/<repo>'`.

## Rollback

- **Bad Pages deploy:** push a fix to `main` (redeploys), or re-run the last good `gh-pages.yml` run.
- **Bad Release:** `gh release delete <tag>` and/or delete the tag; re-tag from a good commit. Store
  submissions are separate and are not triggered by this pipeline.

## Local equivalents

```bash
pnpm lint && pnpm typecheck && pnpm typecheck:e2e && pnpm typecheck:workflows
pnpm test && pnpm test:perf && pnpm test:workflows
pnpm build && node scripts/check-report-html-size.mjs
pnpm test:e2e:chromium && pnpm test:e2e:firefox
pnpm package:chrome
```
