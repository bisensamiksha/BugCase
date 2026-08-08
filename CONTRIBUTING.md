# Contributing to BugCase

Thanks for your interest in BugCase, a source-available, privacy-first
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

| Path                       | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `packages/extension`       | The Chrome / Firefox extension           |
| `packages/dashboard`       | Client-side ZIP viewer (GitHub Pages)    |
| `packages/schema`          | Shared report schema                     |
| `packages/report-template` | Self-contained `report.html` template    |
| `packages/shared-ui`       | Components used by more than one surface |
| `packages/shared-tokens`   | Design tokens (light / dark / print)     |
| `apps/privacy-site`        | Static privacy site                      |

Read [ARCHITECTURE.md](./ARCHITECTURE.md) before your first substantial change. It explains why
the pieces are split this way, which is rarely obvious from the code.

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

## Tests come first

BugCase is developed test-first. Write the failing test, watch it fail for the reason you expect,
then make it pass. This is not ceremony: most of what this project promises (scrubbers remove what
they say, redaction is destructive, nothing is transmitted) is invisible in the UI, so a test is
the only thing standing between a regression and a user shipping their session cookies to a
stranger.

A test that has never failed has not been shown to test anything.

## Before you open a pull request

Run the full local gate and make sure each command exits cleanly:

```bash
pnpm format:check      # or `pnpm format` to fix
pnpm lint              # root ESLint 9, no new warnings
pnpm typecheck         # exit 0
pnpm test              # exit 0
pnpm check:no-em-dash  # user-visible copy uses no em dashes
pnpm check:mermaid     # every diagram still parses
pnpm test:workflows    # CI/release workflow contracts and build-gate scripts
```

Both content gates are already enforced by a test, so you cannot forget them: `pnpm test` covers the
em dash gate, and `pnpm test:workflows` covers the mermaid one. CI runs both. Invoking the
`check:*` scripts directly is just faster feedback while you are editing docs.

If you touched anything the extension builds from, also run the Firefox parity gate, because CI
will:

```bash
pnpm build:firefox && node scripts/check-firefox-lint.mjs
```

`husky` + `lint-staged` will also format and lint staged files on commit.

**One ticket per pull request.** If you find unrelated cleanup along the way, mention it in the
description or open a separate issue; do not bundle it. A reviewer should be able to hold the
whole change in their head.

In the PR description:

- Link the ticket the PR implements.
- Summarize the change and paste the verification command output. Do not claim a check passed
  without the output that proves it, and mark anything you could only verify by hand as manual.
- Call out any Chrome/Firefox behavior differences.

## Manual QA before a store release

Automated tests (`pnpm test`, `pnpm test:e2e`) run on every PR, but before a store submission a
human also works the extension across the messy real web. Follow the
[manual site checklist](./qa/manual-site-checklist.md), covering scenario archetypes (SPAs, iframes,
strict CSP, service-worker PWAs, video, login flows, and so on) with named example sites, and record
the run in a copy of the [results template](./qa/manual-qa-results-template.md).

**Run the sweep in the browsers you are actually shipping to.** A release ships only when every
archetype is green (or has an explicitly accepted limitation) in each browser being submitted.
BugCase currently publishes on Chrome only, so the v1.0.0 sweep was Chrome-only and Firefox is
recorded as "not run" rather than as passing. If you are preparing a Firefox or Edge submission,
that browser needs its own full sweep first; do not infer it from the Chrome run.

## Review and CI

- CI (GitHub Actions) must be green before merge.
- At least one maintainer review is required.
- Squash-merge keeps `main` history linear.

## Reporting bugs and proposing changes

Open a GitHub issue describing the problem or proposal. For anything touching
permissions, data flow, or the no-backend / zero-telemetry guarantees, explain
the privacy impact explicitly so reviewers can evaluate it.

**Security vulnerabilities are the exception: do not open an issue.** Report them privately
through [GitHub Security Advisories](https://github.com/bisensamiksha/BugCase/security/advisories/new).
See [SECURITY.md](./SECURITY.md) for scope and what to include. A public report on a tool that
handles cookies and session data is an exploit handed to everyone who reads it.

If you attach a BugCase report ZIP to any issue, remember it may contain your real cookies and
page content. Redact it, or capture the repro on a throwaway account.
