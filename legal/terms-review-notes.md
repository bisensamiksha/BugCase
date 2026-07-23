# Legal review — open questions (BugCase v2 policy + terms)

🟡 The lawyer/human review is a manual step. Do not mark it ✅ until a reviewer signs off here.

Documents to review:

- `apps/privacy-site/src/privacy-policy-v2.md` (rendered at https://bisensamiksha.github.io/BugCase/legal/privacy-policy)
- `apps/privacy-site/src/terms.md` (rendered at https://bisensamiksha.github.io/BugCase/legal/terms)
- Shared `apps/privacy-site/src/legal-definitions.md`

Open questions for the reviewer:

1. **Publisher legal identity** — individual maintainer vs. a registered entity? Affects the "Who publishes BugCase" section and the terms' liability clause.
2. **Governing law & venue** — the Terms leave this to be confirmed. Provide jurisdiction.
3. **Hosted-dashboard terms** — the Terms forward-reference future hosted-service terms as a placeholder. Confirm this framing (there is no hosted service today).
4. **GDPR / CCPA applicability** — BugCase collects nothing and runs on-device; confirm no controller/processor obligations or disclosures are triggered.
5. **PolyForm SB thresholds** — confirm the extension license summary in the Terms does not misstate the PolyForm Small Business revenue/headcount conditions.
6. **Effective date** — both docs use 2026-07-23; confirm or set the public effective date.

Engineering facts the reviewer should know:

- **No MV3 privacy manifest key** — the store privacy-policy URL is a listing field (see `store/privacy-links.md`).
- **Canonical URLs are GitHub Pages** — a later custom domain (S4-35) would be a redirect/swap, not a re-canonicalization.
- **BUG-01 honesty** — screenshots and element crops are stored as rendered pixels and are NOT auto-scrubbed; the policy states this plainly and must keep doing so.
