# Security Policy

BugCase captures console logs, network traffic, DOM snapshots, cookies, storage, and screenshots
from pages you visit. That is a lot of sensitive material, and it is why the product is built so
that none of it leaves your device. A bug that breaks that property is the most serious kind of
bug this project can have, and we would rather hear about it early and awkwardly than late and
publicly.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅ Yes    |
| < 1.0   | ❌ No     |

BugCase is distributed through the Chrome Web Store, which auto-updates. Please reproduce against
the latest published version, or against `main` if you build from source.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public report is a working exploit
handed to everyone who reads it, before anyone can update.

Report privately through **GitHub Security Advisories**:

1. Go to <https://github.com/bisensamiksha/BugCase/security/advisories/new>
2. Or: the repository's **Security** tab → **Report a vulnerability**

This is a private channel visible only to the maintainers. It also gives us a place to work with
you on a fix and to credit you when it ships.

### What to include

The more of this you can provide, the faster it gets fixed:

- What the vulnerability lets an attacker do, in one sentence
- The affected version, browser, and operating system
- Reproduction steps, ideally against a page anyone can visit
- A proof of concept if you have one
- What you think the impact is, and any mitigation you have found

⚠️ **Please redact your own data before sending anything.** If a BugCase report ZIP demonstrates
the problem, remember that it may contain your real cookies, session tokens, and page content.
Reproduce against a throwaway account, or strip the sensitive entries first. We do not want your
credentials, and receiving them would make the report harder to handle, not easier.

### What to expect

| Stage              | Target                                               |
| ------------------ | ---------------------------------------------------- |
| Acknowledgement    | Within **5 business days**                           |
| Initial assessment | Within **10 business days**                          |
| Fix or mitigation  | Depends on severity; critical issues are prioritized |
| Public disclosure  | After a fix ships, coordinated with you              |

BugCase is maintained by a single developer, so these are honest targets rather than a
contractual SLA. If you have not heard back within the acknowledgement window, please send a
follow-up on the same advisory thread; it means the message was missed, not ignored.

We will credit you in the release notes and the advisory unless you would rather stay anonymous.
There is no paid bug bounty program.

## Scope

**In scope**

- Anything that causes captured data to leave the user's device
- Bypassing the consent gate, the optional-permission flow, or the per-origin allowlist
- Defeating **destructive redaction** so that redacted pixels or scrubbed text can be recovered
  from a saved report
- Scrubbers failing to remove values they claim to remove
- Code execution from opening a malicious report ZIP in the dashboard or in `report.html`
- Escaping the DOM-snapshot sandbox
- Privilege escalation through the extension's message passing or its content scripts

**Out of scope**

- **Sensitive content in screenshots and element crops.** These are rendered pixels and are
  deliberately **not** auto-scrubbed. This is a documented product limitation, stated in the
  README, the privacy policy, and in the product UI before download. Redact them yourself with the
  built-in annotation tool. (A previous attempt to auto-redact password fields was reverted after
  it proved unable to reach fields inside closed shadow roots and cross-origin iframes; a partial
  redaction that looks complete is more dangerous than an honest warning.)
- Vulnerabilities in the sites a user captures, rather than in BugCase
- Anything requiring a physically compromised device or a malicious browser build
- Missing hardening headers on the GitHub Pages host that have no demonstrated impact
- Reports from automated scanners with no working proof of concept

## Security properties BugCase intends to hold

State these back to us if you think you have broken one:

1. **No backend, no telemetry, no remote logging.** BugCase never transmits captured data. There
   is no server to compromise and no account to breach.
2. **`report.html` performs zero network requests.** It is fully self-contained and works offline
   forever.
3. **Redaction is destructive.** Redacted regions are composited away and the original pixels are
   discarded, not merely covered by an overlay.
4. **Elevated permissions are optional and revocable.** Cookies, storage, history, and installed
   extensions require explicit runtime consent and can always be declined.
5. **A malformed or hostile report cannot escape its viewer.** Untrusted report content is schema
   validated and rendered in a sandbox.

## Related documents

- [Privacy Policy](https://bisensamiksha.github.io/BugCase/legal/privacy-policy)
- [Terms of Use](https://bisensamiksha.github.io/BugCase/legal/terms)
- [ARCHITECTURE.md](./ARCHITECTURE.md) for the trust boundaries these properties rest on
