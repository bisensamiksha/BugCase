# Store screenshots — capture spec / checklist

> The app screenshots are **captured by hand from the real, built extension** — not faked or rendered
> headless — because they must show the actual shipped UI and real captured data. Faking store
> screenshots would overpromise (an explicit ticket pitfall). This file is the durable spec for who
> shoots them, at what size, and of what.

## Required specs

| Store            | Size                                | Count              | Format                |
| ---------------- | ----------------------------------- | ------------------ | --------------------- |
| Chrome Web Store | **1280×800** (preferred) or 640×400 | 1–5 (aim for 4–5)  | PNG or JPEG, no alpha |
| Edge Add-ons     | **1280×800** or 640×400             | 1–10 (aim for 4–5) | PNG or JPEG           |

The same image set is used for both stores. Save the finished files here as
`screenshot-1-<slug>.png` … and reference them from the listing files.

## How to capture

1. `pnpm --filter @bugcase/extension build:chrome`.
2. Load `packages/extension/dist-chrome` unpacked in Chrome (`chrome://extensions` → Developer mode →
   Load unpacked).
3. Capture a **real** bug report on a safe demo page (use a page with **no personal data**, or redact
   with Annotate first — screenshots are not auto-scrubbed).
4. For each shot below, size the browser window so the captured region is ~1280×800 (or crop to exactly
   1280×800 afterward). Prefer light theme for legibility; keep chrome/OS furniture out of frame.

## Shot list (the product story, in order)

1. **One-click capture** — the capture overlay open on a real page, showing the toolbar/controls.
   _Caption:_ "Capture a bug in one click — screenshot, console, network, DOM and more."
2. **The dashboard Overview** — a captured report open in the dashboard, hero screenshot + severity +
   metadata visible. _Caption:_ "Everything a developer needs, in one report."
3. **Network pane** — the filterable network list with the waterfall column and a request's detail.
   _Caption:_ "Full network activity, with response bodies when you enable it."
4. **Privacy pane** — the recorded scrubber summary + permissions table + the image-disclosure note.
   _Caption:_ "Privacy-first: text is scrubbed, and you control image redaction."
5. **(optional) Annotate / redaction** — the Annotate tool blacking out a region before sharing.
   _Caption:_ "Redact anything sensitive before you share."

## Rules

- No real personal data, credentials, or private URLs in any shot (screenshots are raw pixels).
- Every UI state shown must exist in the shipped build — no mockups, no roadmap features.
- Keep captions consistent with the shared copy's privacy claims (no "auto-redacts images").
