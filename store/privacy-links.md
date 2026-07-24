# Privacy & Terms link inventory

Every place the hosted legal URLs must appear. Canonical URLs are GitHub Pages (S4-22);
S4-35 may later add a custom-domain redirect without changing which document is canonical.

- **Privacy Policy:** https://bisensamiksha.github.io/BugCase/legal/privacy-policy
- **Terms of Use:** https://bisensamiksha.github.io/BugCase/legal/terms
- **Legal landing:** https://bisensamiksha.github.io/BugCase/legal/
- **Site base / manifest homepage_url:** https://bisensamiksha.github.io/BugCase/

| Location                                            | What to set                   | Owning ticket | Status     |
| --------------------------------------------------- | ----------------------------- | ------------- | ---------- |
| `packages/extension/src/manifest.ts` `homepage_url` | site base URL                 | S4-22         | ✅ done    |
| Chrome Web Store listing → "Privacy policy" field   | Privacy Policy URL            | S4-23 / S4-24 | ⬜ pending |
| Microsoft Edge Add-ons listing → privacy field      | Privacy Policy URL            | S4-23 / S4-24 | ⬜ pending |
| Firefox AMO listing → privacy field                 | Privacy Policy URL            | S4-32         | ⬜ pending |
| Extension options page footer                       | Policy + Terms + Source links | S4-22         | ✅ done    |
| Dashboard shell footer                              | Policy + Terms links          | S4-22         | ✅ done    |
| Privacy-site landing (`/legal/`)                    | Policy + Terms + Source links | S4-22         | ✅ done    |
| Repo `README.md` (Privacy & legal section)          | Policy + Terms links          | S4-22         | ✅ done    |

**Note — no MV3 privacy key.** Manifest V3 has no `privacy_policy` field; the store privacy-policy
URL is entered in each store's Developer Dashboard listing, not in `manifest.json`.
