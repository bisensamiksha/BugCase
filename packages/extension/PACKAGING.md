# Packaging BugCase for the Chrome Web Store (and Edge Add-ons)

This runbook covers producing the upload-ready Chrome package. Firefox/AMO packaging is a separate
path (`web-ext`, tracked in S4-31).

## One command

```bash
pnpm package:chrome
```

This runs a fresh production Chrome build and then packages it:

1. **Build** — `pnpm --filter @bugcase/extension run build:chrome` emits `dist-chrome/` (the crxjs
   manifest + all injected/content/background bundles). The build also runs the TD-03 gate
   (`check-overlay-no-konva`), so Konva stays in the on-demand `content/annotation.js` and out of the
   always-injected `content/overlay.js`.
2. **Validate** — `scripts/package-chrome.mjs` reads `dist-chrome/manifest.json` and checks it against
   the Chrome MV3 rules below.
3. **Zip** — a deterministic, reproducible ZIP is written to `dist/bugcase-chrome-<version>.zip`.

Run the packager alone (against an existing `dist-chrome/`) with
`node scripts/package-chrome.mjs [distDir] [outDir]`; add `--json` for a machine-readable result
(consumed by the S4-19 release pipeline).

## What "validated" means

`validateChromeManifest` asserts:

- `manifest_version === 3`
- `version` equals the extension's `package.json` version (**the versioning guardrail** — see below)
- `name`, `description`, `action`, and a non-empty `icons` map are present
- `background.service_worker` is set (Chrome MV3 uses a service worker, not `background.scripts`)
- no Firefox-only keys leak in (e.g. `browser_specific_settings`)

Every declared icon path is then confirmed to exist on disk. Any failure prints the specific
problem(s) and exits non-zero — the build is never packaged in a broken state.

## Versioning guardrail

The package version has **one** source of truth: `packages/extension/package.json` → `version`
(crxjs copies it into the manifest). Do **not** hand-edit the version in the manifest, and do not
introduce a separate pre-1.0 scheme here. The packager asserts the built manifest version matches the
package version and names the ZIP after it. Bumping to `1.0.0` for the actual store submission is
decided in S4-24, not here.

## Sourcemaps

The Vite build emits `*.map` files for on-disk debugging. Those are **excluded from the upload ZIP**
(smaller package, no source exposure) but remain in `dist-chrome/` locally. The packager reports how
many were dropped.

## Why not `web-ext lint`?

`web-ext lint` is Mozilla's AMO linter. Run against a **valid Chrome MV3 build** it reports two
false "errors":

- `MANIFEST_FIELD_UNSUPPORTED` — `/background/service_worker` "is not supported" (Firefox uses
  `background.scripts`; `service_worker` is correct for Chrome).
- `EXTENSION_ID_REQUIRED` — demands a `browser_specific_settings.gecko.id` (an AMO requirement;
  Chrome derives the ID from the store/key).

So it structurally cannot certify a Chrome build "clean". The Chrome gate is therefore the
purpose-built validator above; `web-ext lint` remains the **Firefox** manifest gate
(`pnpm --filter @bugcase/extension run lint:firefox-manifest`, formalized in S4-31).

## "Signed ZIP" / uploading

The Chrome Web Store (and Edge Add-ons) sign the package **server-side on upload** — there is no local
signing step and no private key in this repo. Upload `dist/bugcase-chrome-<version>.zip` through the
respective developer dashboard. The ZIP is byte-for-byte reproducible (fixed timestamps, sorted POSIX
paths, level-9 DEFLATE), so the same commit always yields the same artifact.

## Package size note

Since S4-15 the service worker bundles the self-contained `report.html` template (≤ 5 MB budget, ~1 MB
in practice) so every capture ZIP is offline-openable. Expect the packaged extension to be
correspondingly larger than a pre-S4-15 build; this is intended.

## Known follow-up (not blocking)

The build currently emits the icons twice — at `dist-chrome/icons/` (Vite public-dir copy) and at
`dist-chrome/public/icons/` (the manifest-referenced path). The ZIP carries both; the top-level copy
is unreferenced. Deduplicating is a build-config cleanup tracked separately, not part of packaging.
