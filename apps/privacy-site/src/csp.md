# Content-Security-Policy

The policy of record for everything BugCase serves from
`https://bisensamiksha.github.io/BugCase/`: the dashboard at the project root and the legal pages
underneath it at `/legal/`.

`pnpm check:csp` compares the policies quoted here against the ones actually shipped, so this
document cannot drift away from the code. If you change a directive, change it here too or the
gate fails.

## Why this site needs one more than most

The dashboard's entire job is to open untrusted ZIP payloads captured from arbitrary web pages and
render their DOM snapshots, console strings and network entries. The sandboxed DOM-snapshot viewer
(`packages/shared-ui/src/sandbox-html.ts`) is the primary containment boundary. This policy is the
second one, and the only one that still helps if the first has a bug.

## How it is delivered, and what that costs

GitHub Pages cannot set response headers. There is no `_headers` file, no nginx, no CDN rule. The
policy therefore ships as `<meta http-equiv="Content-Security-Policy">`, which is enforced, not
report-only.

A meta-delivered policy **silently ignores three directives**. They are not set, and they are not
claimed as done:

| Directive                  | Why it is absent                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `frame-ancestors`          | Ignored in meta form. Clickjacking protection needs a real header                                                                   |
| `report-uri` / `report-to` | Ignored in meta form, and excluded on principle: a reporting endpoint is remote logging, which this product promises it does not do |
| `sandbox`                  | Ignored in meta form                                                                                                                |

If a custom domain ever puts a header-capable CDN in front of this site (S5-05), `frame-ancestors`
becomes available and should be added there. `report-uri` should not, at any point.

## Dashboard

Shipped in `packages/dashboard/index.html`:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src data:; media-src data:; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'
```

Every relaxation, one line each:

| Directive                            | Reason                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self'`                  | Vite emits one external module script plus same-origin lazy pane chunks. No inline script, no `'unsafe-eval'`, no WebAssembly |
| `style-src 'self'`                   | The single external stylesheet Vite emits                                                                                     |
| `style-src 'unsafe-inline'`          | Forced by iframe CSP inheritance, explained below                                                                             |
| `img-src blob:`                      | Screenshots and element crops are object URLs created from ZIP bytes                                                          |
| `img-src data:`                      | Inline images inside a captured snapshot, reaching the iframe through inheritance                                             |
| `font-src data:` / `media-src data:` | The same, for a captured page's inline fonts and media                                                                        |
| `connect-src 'none'`                 | The zero-telemetry backstop                                                                                                   |

Everything not listed falls through to `default-src 'none'`. `frame-src` is deliberately not
stated: `default-src 'none'` already covers it, and `about:srcdoc` frames are exempt from the check
regardless (measured, both engines).

### `connect-src 'none'` is the promise made enforceable

The dashboard and shared-ui sources contain no network API at all: no `fetch`, no
`XMLHttpRequest`, no `sendBeacon`, no `Worker`, no `WebSocket`. `connect-src 'none'` turns "this
app does not phone home" from a claim into something the browser enforces, and turns any future
regression into a visible violation rather than a silent leak.

### Why `'unsafe-inline'` is in `style-src`

This is the one relaxation that looks like a shrug and is not. It is forced by a measured browser
behaviour.

A `sandbox=""` `srcdoc` iframe **inherits the embedding document's CSP** and enforces the
intersection of that policy with its own. Verified directly in Chromium and Firefox, using a page
whose iframe contained a `<style>` block, a `style=""` attribute and a `data:` image:

```
parent: default-src 'none'; style-src 'self'; img-src 'self' blob:

chromium  styleElem rgb(0,0,0)    styleAttr rgb(0,0,0)    imgLoaded false
firefox   styleElem rgb(0,0,0)    styleAttr rgb(0,0,0)    imgLoaded false
          (blocked: style-src-elem, style-src-attr, img-src)

same page, no parent CSP
chromium  styleElem rgb(0,128,0)  styleAttr rgb(255,0,0)  imgLoaded true
firefox   styleElem rgb(0,128,0)  styleAttr rgb(255,0,0)  imgLoaded true
```

So a stricter parent policy does **not** harden the DOM-snapshot pane. It degrades it to unstyled
black text with no images, and logs a console error per violation. Containment is identical either
way, because the iframe's own `default-src 'none'` already blocks the network and its empty
`sandbox` grants neither scripts nor same-origin. Only fidelity is lost.

There is a second, independent reason: Shiki emits `style="..."` attributes in its highlighted
output, which reaches the DOM through `dangerouslySetInnerHTML` in `HtmlSnippet.tsx` and
`DomPane.tsx`. Measured at 12 console errors on the Element Inspections pane under
`style-src 'self'`.

### What it would take to remove it

Both causes have to go, and the first one is the hard one.

1. **The inherited policy.** CSP inheritance applies to local schemes, so `blob:` and `data:`
   iframes inherit too. The only real escape is navigating the iframe to a separate same-origin
   document, which cannot receive the snapshot without scripting, which means `allow-scripts` in
   the sandbox. That trades the primary containment boundary for the secondary one, on a surface
   whose whole purpose is rendering hostile markup. Rejected.
2. **Shiki.** Replace its inline-style output with a class-based transformer plus a generated
   stylesheet. Tractable on its own, but pointless in isolation: item 1 forces the same relaxation
   regardless.

### What the snapshot preview renders, and what it never will

Worth stating plainly, because a real captured page looks dramatically plainer in the preview than
it did on screen, and that reads as a bug when it is the privacy promise working.

| In the captured page                                       | In the preview      | Blocked by                |
| ---------------------------------------------------------- | ------------------- | ------------------------- |
| Inline `<style>` block                                     | Renders             | allowed                   |
| `style=""` attribute                                       | Renders             | allowed                   |
| `data:` image, font, media                                 | Renders             | allowed                   |
| **External stylesheet** (`<link rel=stylesheet href=...>`) | **Does not render** | `SNAPSHOT_CSP` (S4-09)    |
| **Remote image**                                           | **Does not render** | `SNAPSHOT_CSP` (S4-09)    |
| Any script                                                 | Never runs          | empty `sandbox` attribute |

Most real sites keep nearly all of their styling in external stylesheets, so most snapshots render
as close to unstyled text. That is deliberate and predates this ticket: fetching a captured page's
subresources would tell the origin site that someone is viewing the report, and leak the viewer's
IP address to it. A tool that promises no data leaves the device cannot go and fetch from the very
site the bug was captured on.

**S4-31 does not change any of this.** Measured by rendering the same page three ways: with
`SNAPSHOT_CSP` alone (the pre-S4-31 behaviour), with `SNAPSHOT_CSP` plus this ticket's parent
policy, and with no policy at all. The first two results are identical, because the parent's
`style-src 'self' 'unsafe-inline'` and `img-src 'self' blob: data:` are supersets of the child's
`style-src 'unsafe-inline'` and `img-src data:`, so the intersection is just the child policy.

One real side effect: a blocked remote subresource is now reported **twice** in the console, once
against each policy. Behaviour is unchanged; only the log is noisier.

### Why this is an acceptable residual risk

The usual danger of `'unsafe-inline'` styles is CSS-based exfiltration through a remote sink. There
is no sink here. `connect-src` is `'none'`, and no `img-src`, `font-src` or `media-src` source
permits a remote origin, so an injected `background: url(https://attacker/...)` has nowhere to go.
Combined with a sandbox granting neither scripts nor same-origin, the residual risk is defacement
of a locally opened page, not disclosure of captured data.

Note that `'unsafe-inline'` in `style-src` never affects `script-src`. No inline script executes on
this origin.

## Legal pages

Generated by `apps/privacy-site/src/render-legal.ts` into all three pages:

```
default-src 'none'; style-src 'sha256-<computed at build>'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

These pages are build-time Markdown with one inline `<style>` and no scripts, so they need none of
the dashboard's relaxations and get **no `'unsafe-inline'` at all**. The single stylesheet is
allowed by SHA-256 hash instead. `renderLegalPage()` computes that hash from the same `STYLE`
constant it interpolates into the page, so the two cannot drift, and a test recomputes it from the
rendered output rather than from the module.

`script-src 'none'` and `object-src 'none'` are stated explicitly even though `default-src 'none'`
already covers them, because the ticket's acceptance criteria name them individually.

Giving these pages the dashboard's policy was considered and rejected: one shared string is simpler
to maintain but would hand the legal pages script and inline-style privileges they demonstrably do
not need.

## report.html is deliberately not covered

`report.html` is a single self-contained file opened from `file://`, where `'self'` matches nothing
useful and both the script and the stylesheet are necessarily inline. Its constraints are not the
hosted origin's, and it ships no CSP.

It is reachable by accident, which is worth knowing: `packages/report-template/vite.config.ts` sets
`root` to the **dashboard package**, so it consumes `packages/dashboard/index.html` as its HTML
entry. It escapes the dashboard's CSP only because `inlineSingleFile()` deletes every bundle entry
and emits `report.html` from its own `src/template.html`. That was an untested invariant;
`tests/e2e/csp.spec.ts` now guards it, so a future Vite change that stops discarding the entry HTML
fails loudly instead of shipping a policy that breaks the offline report.

Note that `report.html` is not policy-free in practice: the snapshot iframe inside it still carries
`SNAPSHOT_CSP` from `sandbox-html.ts`, which is what the `Content-Security-Policy` string inside its
bundle is. That is the child policy, not a leaked parent one.

Giving `report.html` its own `file://`-appropriate policy is a reasonable follow-up. `connect-src
'none'` would be a genuine exfiltration backstop for the artifact users actually share, at the cost
of accepting `'unsafe-inline'` for both script and style. It was left out of S4-31 as out of scope.

## Deliberately not used

| Directive                   | Why not                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `require-trusted-types-for` | Would break `dangerouslySetInnerHTML` across the panes. Lighthouse treats the CSP-XSS audit as informative, not scored |
| `upgrade-insecure-requests` | Nothing to upgrade: no directive permits a remote origin                                                               |
| `report-uri` / `report-to`  | Remote logging. See above                                                                                              |

## Lighthouse

Best Practices scores "browser errors logged to the console", so a CSP that fires violations costs
the score directly. Reaching Best Practices 100 and shipping a policy that does not break the app
are therefore the same task, which is why every directive above was measured against a real
kitchen-sink report driven through all nine panes rather than written from assumption.

## Verifying

```
pnpm check:csp                 # directives present, forbidden tokens absent, this file in sync
pnpm --filter @bugcase/privacy-site test   # hash matches the bytes actually emitted
pnpm test:e2e:chromium         # zero violations across nine panes, snapshot fidelity intact
```
