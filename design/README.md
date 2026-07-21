# BugCase — brand & icon source

The **source of truth** for the BugCase icon is [`bugcase-icon.svg`](./bugcase-icon.svg) — an editable
vector master. The extension's raster icons are generated from it, never hand-edited.

## The mark

A **beetle inside a shield**: the beetle is the universal software "bug", the shield is BugCase's
privacy-first promise (_"No backend, no telemetry"_). Single flat fill in the brand accent, with the
bug rendered as negative white space so it stays crisp when scaled down.

## Palette

| Token                   | Hex         | Use                            |
| ----------------------- | ----------- | ------------------------------ |
| Brand accent (blue-600) | `#2563eb`   | shield fill, wing seam         |
| White                   | `#ffffff`   | beetle body/head/legs/antennae |
| —                       | transparent | everything outside the shield  |

`#2563eb` matches the dashboard's `--bc-accent` (light theme) so the extension and dashboard read as
one product.

## Generated files

`bugcase-icon.svg` → the four PNGs the manifest declares
(`packages/extension/src/manifest.ts` → `icons`):

| Size | Path                                           |
| ---- | ---------------------------------------------- |
| 16   | `packages/extension/public/icons/icon-16.png`  |
| 32   | `packages/extension/public/icons/icon-32.png`  |
| 48   | `packages/extension/public/icons/icon-48.png`  |
| 128  | `packages/extension/public/icons/icon-128.png` |

## Regenerating the PNGs

After editing `bugcase-icon.svg`:

```bash
pnpm icons:generate
```

This runs [`scripts/generate-icons.mjs`](../scripts/generate-icons.mjs), which rasterizes the SVG at
each size in headless Chromium (via Playwright — already a dev dependency, so no extra image
toolchain) and writes transparent PNGs at exact pixel dimensions. Commit the regenerated PNGs
alongside the SVG. `packages/extension/src/icons.test.ts` verifies every committed PNG exists and
matches its declared size.

## Design notes

- **Legibility first:** the shield + bold white beetle body/head carry the mark at 16px; the finer
  detail (antennae, legs, wing seam) enriches the 32/48/128 sizes and gracefully fades at 16px.
- **No gradients / no external refs** — flat fills only, to match the product's flat aesthetic and
  keep the SVG self-contained.
- **Editing in Figma/Illustrator:** import the SVG, edit, then export back to `bugcase-icon.svg`
  (keep the `viewBox="0 0 128 128"`), and regenerate.
