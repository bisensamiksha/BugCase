/**
 * Content-Security-Policy E2E (S4-31).
 *
 * This is the only spec that exercises the **hosted origin**. Every other dashboard spec opens the
 * self-contained `report.html` over `file://`, where `'self'` matches nothing and the policy this
 * ticket ships does not apply. So this one serves the real `packages/dashboard/dist` over HTTP and
 * drives a report in through the drop zone, exactly as a visitor to the GitHub Pages site does.
 *
 * Two things make the test non-obvious, and both were measured rather than assumed:
 *
 * 1. **A `sandbox=""` `srcdoc` iframe inherits the embedding document's CSP** and enforces the
 *    intersection with its own. So the parent policy decides whether the DOM-snapshot pane renders
 *    a captured page faithfully or silently degrades to unstyled black text with no images. That
 *    is why this spec asserts *fidelity*, not just the absence of violations.
 * 2. **The shared kitchen-sink fixture cannot detect any of that.** Its DOM snapshot has no
 *    `<style>` block, no `style=` attribute and no `data:` image, so a spec built on it passes
 *    while production breaks. This spec supplies its own adversarial snapshot instead.
 *
 * Rationale for every directive lives in `apps/privacy-site/src/csp.md`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize as normalizePath } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  sampleAssets,
  sampleReport,
  SAMPLE_ASSET_PATHS,
} from '../../packages/report-template/src/__fixtures__/sample-report';
import { embedReportData } from '../../packages/report-template/src/embed-data';
import type { BugReportV1 } from '../../packages/schema/src/v1/report';
import { writeBugReportZip } from '../../packages/schema/src/v1/zip-writer';

import { REPORT_HTML_PANES } from './helpers/extract-report-html';

const DASHBOARD_DIST = join(process.cwd(), 'packages/dashboard/dist');
const REPORT_HTML = join(process.cwd(), 'packages/report-template/dist/report.html');

/** Directives whose loss would quietly undo this ticket. */
const REQUIRED_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
];

/**
 * A captured page that actually exercises the policy: a `<style>` element, an inline `style=`
 * attribute, and a `data:` image. Each maps to a directive the parent must permit for the sandboxed
 * preview to render truthfully (`style-src-elem`, `style-src-attr`, `img-src`).
 *
 * The colours are deliberately unusual so a computed-style read cannot be satisfied by a default.
 */
const ADVERSARIAL_SNAPSHOT =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Adversarial</title>' +
  '<style>#by-element { color: rgb(0, 128, 0); }</style></head>' +
  '<body><main>' +
  '<h1 id="by-element">styled by a style element</h1>' +
  '<p id="by-attribute" style="color: rgb(255, 0, 0)">styled by a style attribute</p>' +
  '<img id="inline-image" alt="inline" src="data:image/gif;base64,' +
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">' +
  '</main></body></html>';

/** A CSP violation as reported by the page, or a console error that is not one. */
interface Problem {
  readonly kind: 'violation' | 'console';
  readonly text: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Serve `packages/dashboard/dist` on an ephemeral port. Playwright's config has no `webServer`
 * (every other spec runs over `file://`), and the policy under test is meaningful only over a real
 * origin, so this spec owns its own static server.
 */
function serveDashboard(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    // Strip any traversal before joining; this serves a build directory, not user input.
    const rel = normalizePath(requested).replace(/^(\.\.[/\\])+/, '');
    const file = join(DASHBOARD_DIST, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(DASHBOARD_DIST) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({ server, origin: `http://localhost:${port}` });
    }),
  );
}

/** The kitchen-sink report with its DOM snapshot swapped for {@link ADVERSARIAL_SNAPSHOT}. */
async function buildAdversarialZip(): Promise<Buffer> {
  const bytes = new TextEncoder().encode(ADVERSARIAL_SNAPSHOT);
  const report: BugReportV1 = {
    ...sampleReport,
    dom: { ...sampleReport.dom!, byteSize: bytes.length },
  };
  const assets = new Map(sampleAssets);
  assets.set(SAMPLE_ASSET_PATHS.domSnapshot, bytes);

  const reportHtml = await embedReportData({
    templateHtml: readFileSync(REPORT_HTML, 'utf8'),
    report,
    assets,
  });
  const blob = await writeBugReportZip(report, { files: assets }, { reportHtml });
  return Buffer.from(await blob.arrayBuffer());
}

/**
 * Record every CSP violation and console error the page produces.
 *
 * Both channels are needed. The `securitypolicyviolation` listener gives an attributable record but
 * cannot run inside the scripts-disabled snapshot iframe, so violations in there surface only as
 * console errors. Anything unexplained in either channel fails the test.
 */
async function collectProblems(page: Page, sink: Problem[]): Promise<void> {
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push({ kind: 'console', text: message.text() });
  });
  page.on('pageerror', (error) =>
    sink.push({ kind: 'console', text: `pageerror: ${error.message}` }),
  );
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const target = window.top as unknown as { __cspViolations?: string[] };
      target.__cspViolations ??= [];
      target.__cspViolations.push(
        `${event.violatedDirective} blocked ${event.blockedURI} (${event.sourceFile ?? 'unknown'})`,
      );
    });
  });
}

/** Drain the in-page violation log accumulated by {@link collectProblems}. */
async function reportedViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
}

let server: Server;
let origin: string;
let adversarialZip: Buffer;

test.beforeAll(async () => {
  if (!existsSync(join(DASHBOARD_DIST, 'index.html'))) {
    throw new Error(
      `dashboard not built at ${DASHBOARD_DIST} — run \`pnpm --filter @bugcase/dashboard build\` first`,
    );
  }
  ({ server, origin } = await serveDashboard());
  adversarialZip = await buildAdversarialZip();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Open the dashboard and load the adversarial report through the real drop-zone input. */
async function openAdversarialReport(page: Page): Promise<void> {
  await page.goto(origin);
  await page.locator('#dropzone-file-input').setInputFiles({
    name: 'bugcase-report.zip',
    mimeType: 'application/zip',
    buffer: adversarialZip,
  });
  await expect(page.getByTestId('overview-pane')).toBeVisible({ timeout: 30_000 });
}

test.describe('hosted dashboard CSP', () => {
  test('ships an enforced policy with the directives that make it strict', async ({ page }) => {
    await page.goto(origin);

    const enforced = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(enforced).toHaveCount(1);
    const policy = (await enforced.getAttribute('content')) ?? '';

    for (const directive of REQUIRED_DIRECTIVES) {
      expect(policy, `policy must contain ${directive}`).toContain(directive);
    }
    // Report-only would enforce nothing.
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy-Report-Only"]'),
    ).toHaveCount(0);
    // A reporting endpoint would be remote logging, which this product promises it does not do.
    expect(policy).not.toContain('report-uri');
    expect(policy).not.toContain('report-to');
    expect(policy).not.toContain('unsafe-eval');
    // connect-src 'none' is only a real backstop if nothing else lets an origin back in.
    expect(policy).not.toMatch(/https?:/);
    expect(policy).not.toContain('*');
  });

  test('renders every pane of a real report with zero CSP violations', async ({ page }) => {
    const problems: Problem[] = [];
    await collectProblems(page, problems);
    await openAdversarialReport(page);

    for (const pane of REPORT_HTML_PANES) {
      await page.getByTestId(pane.nav).click();
      await expect(page.getByTestId(pane.root)).toBeVisible({ timeout: 20_000 });
    }

    expect(await reportedViolations(page)).toEqual([]);
    expect(problems.map((p) => `[${p.kind}] ${p.text}`)).toEqual([]);
  });

  // "Faithful" here means the styling the sandbox permits at all: inline <style>, style="" and
  // data: assets. A captured page's EXTERNAL stylesheets and remote images are blocked by
  // SNAPSHOT_CSP (S4-09) and always have been, so a real snapshot legitimately looks far plainer
  // than the original. See the "What the snapshot preview renders" section of csp.md.
  test('preserves the snapshot styling the sandbox permits', async ({ page }) => {
    await openAdversarialReport(page);
    await page.getByTestId('nav-dom').click();
    await expect(page.getByTestId('dom-snapshot-pane')).toBeVisible({ timeout: 20_000 });

    const frame = page.frameLocator('[data-testid="dom-preview-frame"]');
    // Absence of violations is not enough: a policy that blocks the snapshot's styling degrades it
    // silently, so assert the captured page's own styling actually took effect.
    await expect(frame.locator('#by-element')).toHaveCSS('color', 'rgb(0, 128, 0)');
    await expect(frame.locator('#by-attribute')).toHaveCSS('color', 'rgb(255, 0, 0)');

    const imageLoaded = await frame
      .locator('#inline-image')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(imageLoaded, "the snapshot's data: image must load").toBe(true);
  });
});

test.describe('report.html is deliberately excluded', () => {
  test('carries no CSP meta tag of its own', async ({ page }) => {
    // report-template's Vite build uses the dashboard package as `root`, so it consumes
    // packages/dashboard/index.html as its HTML entry and escapes the dashboard's policy only
    // because inlineSingleFile() discards every bundle entry. That was an untested invariant: a
    // future Vite change could start emitting the entry HTML and ship a `'self'`-based policy into
    // a file:// document, where it would break the offline report. Fail loudly if that happens.
    expect(
      existsSync(REPORT_HTML),
      'run `pnpm --filter @bugcase/report-template build` first',
    ).toBe(true);

    // Assert against the parsed document, not the file's text. The bundle legitimately *contains*
    // the string `<meta http-equiv="Content-Security-Policy" content="${...}">` as the template
    // sandbox-html.ts uses to build the snapshot iframe's own policy; that is a string literal in
    // JS, not a tag governing this document, and a text search cannot tell the two apart.
    await page.goto(`file://${REPORT_HTML}`);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(0);
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy-Report-Only"]'),
    ).toHaveCount(0);
  });

  test('still packages the snapshot iframe policy from shared-ui', () => {
    // The one legitimate `Content-Security-Policy` string inside report.html is SNAPSHOT_CSP, the
    // *child* policy that sandbox-html.ts injects into the preview iframe. Its absence would mean
    // the snapshot containment boundary had been lost, so assert it is still there.
    const html = readFileSync(REPORT_HTML, 'utf8');
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  });
});

test.describe('built legal pages', () => {
  const LEGAL_DIST = join(process.cwd(), 'apps/privacy-site/dist');

  test('ship an enforced hash-based policy with no unsafe-inline', async ({ page }) => {
    const indexPath = join(LEGAL_DIST, 'index.html');
    expect(existsSync(indexPath), 'run `pnpm --filter @bugcase/privacy-site build` first').toBe(
      true,
    );

    const problems: Problem[] = [];
    await collectProblems(page, problems);
    await page.goto(`file://${indexPath}`);

    const enforced = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(enforced).toHaveCount(1);
    const policy = (await enforced.getAttribute('content')) ?? '';

    expect(policy).toContain("script-src 'none'");
    expect(policy).toMatch(/style-src 'sha256-[A-Za-z0-9+/]+=*'/);
    expect(policy).not.toContain('unsafe-inline');

    // The hash has to match the bytes the page actually shipped, or every legal page loses its
    // styling at once. Prove it by reading a styled property from the live document.
    await expect(page.locator('body')).toHaveCSS('line-height', /.+/);
    const maxWidth = await page.locator('body').evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth, 'the hashed stylesheet must have applied').not.toBe('none');

    expect(await reportedViolations(page)).toEqual([]);
    expect(problems.map((p) => `[${p.kind}] ${p.text}`)).toEqual([]);
  });
});
