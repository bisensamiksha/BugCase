# @bugcase/extension

The Chrome- and Firefox-flavored Manifest V3 browser extension for BugCase.

## Builds

| Command              | Output          | Browser                  |
| -------------------- | --------------- | ------------------------ |
| `pnpm build`         | `dist-chrome/`  | Chrome / Chromium        |
| `pnpm build:firefox` | `dist-firefox/` | Firefox                  |
| `pnpm build:all`     | both            | runs Chrome then Firefox |

## Dev

| Command            | Output                                     |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | Vite dev server with HMR, Chrome manifest  |
| `pnpm dev:firefox` | Vite dev server with HMR, Firefox manifest |

## Background script

- **Chrome** uses MV3's strict service worker (`background.service_worker`).
- **Firefox** uses an event page (`background.scripts` array) because Firefox's MV3 strict service-worker support is still flaky as of 2026.

`webextension-polyfill` smooths over the API differences so source code does not branch on browser.

## Validation

- `pnpm typecheck` — TypeScript
- `pnpm lint` — ESLint
- `pnpm lint:firefox-manifest` — `web-ext lint` on `dist-firefox/` (requires `pnpm build:firefox` first)

## Loading unpacked

- **Chrome:** `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist-chrome/`.
- **Firefox:** `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → select `dist-firefox/manifest.json`.
