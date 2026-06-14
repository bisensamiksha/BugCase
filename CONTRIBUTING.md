# Contributing to BugCase

Thanks for your interest in BugCase — a source-available, privacy-first
browser extension that captures a downloadable bug-report ZIP, plus a
companion dashboard that renders the ZIP entirely in the browser.

By contributing, you agree that your contributions are licensed under the
project's [PolyForm Small Business License 1.0.0](./LICENSE), the same terms
that cover the rest of the repository. You also confirm that you have the
right to submit the work under that license.

Please also read and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Non-negotiable project constraints

These are locked architectural decisions. A change that violates one of them
will not be merged:

- **No backend.** Everything runs on the user's device or as a static site.
- **Zero telemetry.** No analytics, no remote logging, no phone-home.
- **Captured data never leaves the local browser context.**
- **Minimal extension permissions.** Do not broaden the manifest's required
  permissions; runtime-optional permissions stay optional.
- **Chrome and Firefox parity.** Keep browser differences behind small
  helpers, and document any explicit Firefox limitation.

## Prerequisites

- **Node.js** `>=22.13.0` (see `.nvmrc`)
- **pnpm** `9.12.0` (the repo pins this via `packageManager`)

This is a pnpm workspace monorepo:

| Path                       | Purpose                               |
| -------------------------- | ------------------------------------- |
| `packages/extension`       | The Chrome / Firefox extension        |
| `packages/dashboard`       | Client-side ZIP viewer (GitHub Pages) |
| `packages/schema`          | Shared report schema                  |
| `packages/report-template` | Self-contained `report.html` template |
| `apps/privacy-site`        | Static privacy site                   |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

## Branching

Branch off the current `main`. Name branches after the ticket they implement:

```bash
git checkout -b feature/s1-18-license-files
```

Use the pattern `feature/sN-NN-short-description`.

## Commit and PR titles

Match the existing git history: prefix commits and PR titles with the ticket
ID in a `chore`/`feat`/`fix` scope, for example:

```
chore(s1-18): replace LICENSE with PolyForm SB + add NOTICE/CONTRIBUTING/CoC
```

Keep the subject in the imperative mood and under ~72 characters.

## Before you open a pull request

Run the full local gate and make sure each command exits cleanly:

```bash
pnpm format:check   # or `pnpm format` to fix
pnpm lint           # no new warnings
pnpm typecheck      # exit 0
pnpm test           # exit 0
```

`husky` + `lint-staged` will also format and lint staged files on commit.

In the PR description:

- Link the ticket the PR implements.
- Summarize the change and paste the verification command output.
- Call out any Chrome/Firefox behavior differences.

## Review and CI

- CI (GitHub Actions) must be green before merge.
- At least one maintainer review is required.
- Squash-merge keeps `main` history linear.

## Reporting bugs and proposing changes

Open a GitHub issue describing the problem or proposal. For anything touching
permissions, data flow, or the no-backend / zero-telemetry guarantees, explain
the privacy impact explicitly so reviewers can evaluate it.
