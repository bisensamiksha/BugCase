# BugCase Privacy Policy

**Version v2, last updated 2026-07-23**

<nav class="legal-nav"><a href="./index.html">Legal home</a> · <a href="./terms.html">Terms of Use</a></nav>

## The short version

BugCase **does not collect** any data. There is **no telemetry**, no analytics, no accounts, and no backend server. Everything happens on **your device**, inside your own browser. Reports are generated locally and saved to your Downloads folder; they are never uploaded anywhere by BugCase.

## Who publishes BugCase

BugCase is published by the project maintainer (see **the publisher** in Definitions). Because BugCase has no server and collects nothing, there is no data controller operating a database of your information. Questions about this policy can be raised on the public issue tracker at <https://github.com/bisensamiksha/BugCase>.

## What BugCase stores

- **Report history** (timestamps, origin, severity, size, title) is kept only in your browser's local storage so you can find past captures. It is device-local and never leaves your device.
- **The report ZIPs themselves** stay in your Downloads folder. You decide if and where to share them.
- BugCase keeps nothing else, and deletes nothing on your behalf. You control your local data.

## What a capture can contain

A report contains only what you choose to capture on the current page: console and network activity, a DOM snapshot, screenshots, and any optional data below. Text surfaces (page HTML, cookies, and headers) are run through always-on scrubbers before the report is written; cookie and storage values are masked.

> **Screenshots and element crops are stored as rendered images and are NOT auto-scrubbed.** Anything visible on screen when you captured, including a revealed password or other sensitive content, is saved as-is. Only the text surfaces above are automatically scrubbed. Redact sensitive regions by hand in the extension (using **Annotate**) before sharing a report.

## Permissions

BugCase installs with a minimal set of permissions and never requires broad access up front. The following permissions are **optional** and requested only at runtime, with your explicit consent:

- **Debugger access**: Attaches to the current tab briefly during a capture to record network response bodies and a full-page screenshot, then detaches immediately. A banner is shown while it is active.
- **Cookies**: Reads the current page's cookies only when you explicitly add them to a report. Values are masked by default.
- **Installed extensions**: Lists your installed extensions only when you choose to include them, to help reproduce conflicts.
- **Browsing history**: Includes recent navigation for the current site only when you opt in.
- **All sites**: Lets you capture pages on any site. Granted per-site at runtime, never required at install.

You can decline any optional permission; BugCase keeps working without it.

## Data sharing and transfers

BugCase shares nothing. Because there is no server, there is nobody for the publisher to share data with, and no international data transfers occur. Any sharing of a report is an action **you** take yourself with the ZIP file.

## Children

BugCase is a developer tool that collects no personal data and operates entirely on your device. It is not directed at children, and it does not knowingly process any child's personal data.

## Changes to this policy

Material changes are published on this page with a new version number and "last updated" date. Continued use of the extension after a change means the updated policy applies.

## Terms

Your use of BugCase is also governed by the [Terms of Use](https://bisensamiksha.github.io/BugCase/legal/terms).
