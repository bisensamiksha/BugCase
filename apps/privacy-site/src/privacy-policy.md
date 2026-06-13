# BugCase Privacy Policy

**Version v1 — last updated 2026-06-13**

## The short version

BugCase **does not collect** any data. There is **no telemetry**, no analytics, no accounts, and
no backend server. Everything happens on **your device**, inside your own browser. Bug reports are
generated locally and saved to your Downloads folder — they are never uploaded anywhere by BugCase.

## What BugCase stores

- **Report history** (timestamps, origin, severity, size, title) is kept only in your browser's
  local storage so you can find past captures. It never leaves your device.
- **The report ZIPs themselves** stay in your Downloads folder. You decide if and where to share them.

## Permissions

BugCase installs with a minimal set of permissions and never requires broad access up front. The
following permissions are **optional** and requested only at runtime, with your explicit consent:

- **Debugger access** — Attaches to the current tab briefly during a capture to record network
  response bodies and a full-page screenshot, then detaches immediately. A banner is shown while it
  is active.
- **Cookies** — Reads the current page's cookies only when you explicitly add them to a report.
  Values are masked by default.
- **Installed extensions** — Lists your installed extensions only when you choose to include them,
  to help reproduce conflicts.
- **Browsing history** — Includes recent navigation for the current site only when you opt in.
- **All sites** (`<all_urls>`) — Lets you capture pages on any site. Granted per-site at runtime,
  never required at install.

You can decline any optional permission; BugCase keeps working without it.

## Data sharing

BugCase shares nothing. Because there is no server, there is nobody for us to share data with. Any
sharing of a report is an action you take yourself with the ZIP file.

## Contact

Questions about this policy can be raised on the project's public issue tracker.
