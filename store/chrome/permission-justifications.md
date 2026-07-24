# Chrome Web Store — per-permission justifications

> **Single source of truth:** [`../shared/listing-copy.md`](../shared/listing-copy.md). This file
> only expands the shared permission table into the per-permission text the Chrome Web Store review
> form asks for. Do not add a permission here that the extension does not request, or remove one it
> does — the mapping is enforced by `scripts/check-permission-justifications.mjs` (run after
> `build:chrome`), which fails CI if this table and the built `dist-chrome/manifest.json` drift apart.

Chrome asks for a justification for **each** requested permission and for the host permission. The
first column below holds the exact permission id (as it appears in `manifest.json`), which the
no-drift checker parses. Every entry is true of the shipped build, not the roadmap.

## Install-time permissions

| Permission  | Class                   | Justification                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab` | Required (install-time) | Grants access to the tab the user is on **only when they click the BugCase toolbar button**, so the capture overlay can be injected and the current page read without a broad host permission.                                                                                                                                                                        |
| `scripting` | Required (install-time) | Injects the capture overlay and runs the page-context capture steps (viewport metrics, freeze/restore for full-page stitching) via `chrome.scripting.executeScript`.                                                                                                                                                                                                  |
| `tabs`      | Required (install-time) | Reads the active tab's URL and title for the report metadata and calls `chrome.tabs.captureVisibleTab` to take the viewport screenshot.                                                                                                                                                                                                                               |
| `downloads` | Required (install-time) | Saves the finished bug-report ZIP to the user's Downloads folder — the only way a report leaves the extension, and always a local file the user controls.                                                                                                                                                                                                             |
| `storage`   | Required (install-time) | Persists the user's settings and report-history **metadata** (timestamps, origin, severity, size) in local `chrome.storage`; this data never leaves the device.                                                                                                                                                                                                       |
| `debugger`  | Required (install-time) | Attaches briefly to the current tab during a capture to record network **response bodies** and a full-page screenshot via the DevTools protocol, then detaches. It is install-time because Chrome forbids `debugger` in `optional_permissions`; its use is **off by default**, gated behind an explicit stored opt-in and shown with an active banner while attached. |

## Optional permissions (requested at runtime, with consent)

| Permission   | Class    | Justification                                                                                                                                                      |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cookies`    | Optional | Reads the current page's cookies **only when the user chooses to include them** in a report; values are masked by default. Declining leaves BugCase fully working. |
| `management` | Optional | Lists the user's installed extensions **only when they opt in**, to help reproduce extension-conflict bugs. Declining leaves BugCase fully working.                |
| `history`    | Optional | Includes recent navigation for the current site **only when the user opts in**, as reproduction context. Declining leaves BugCase fully working.                   |

## Optional host permission (requested per-site at runtime)

| Permission   | Class         | Justification                                                                                                                                                                                                     |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<all_urls>` | Optional host | Lets the user capture pages on any site. It is an **optional** host permission granted per-site at runtime — never requested at install — so BugCase asks for access to a site only when the user captures on it. |
