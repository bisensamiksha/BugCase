/**
 * Dashboard accessibility E2E (S4-27).
 *
 * Runs against the self-contained `report.html` over `file://` — the same artefact the sharing and
 * report-html specs use — in both the chromium and firefox projects.
 *
 * This is where `color-contrast` is actually verified. The per-pane vitest axe tests disable that
 * rule because jsdom has no layout engine and cannot evaluate it; here there is a real renderer, so
 * it runs with the full rule set.
 *
 * Lighthouse's accessibility category is a weighted set of these same axe rules, which is why the
 * ticket's "≥ 95" bar is gated here rather than by adding a Lighthouse runner to CI.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  sampleAssets,
  sampleReport,
} from '../../packages/report-template/src/__fixtures__/sample-report';
import { embedReportData } from '../../packages/report-template/src/embed-data';
import type { ConsoleEntry } from '../../packages/schema/src/v1/console';
import type { BugReportV1 } from '../../packages/schema/src/v1/report';

import {
  createReportHtmlTempDir,
  emptyDataReportHtml,
  extractReportHtmlFromRealZip,
  removeReportHtmlTempDir,
  writeReportHtml,
  REPORT_HTML_PANES,
  type TempReportHtml,
} from './helpers/extract-report-html';

/**
 * axe-core is a `@bugcase/dashboard` devDependency, and pnpm links it only into that package —
 * there is no `node_modules/axe-core` at the repo root, where Playwright executes. The same
 * constraint is documented in `helpers/extract-report-html.ts` for `@bugcase/*` specifiers.
 * `require.resolve` is unavailable (this repo is `"type": "module"`), and a bare `axe-core`
 * specifier would try — and fail — to resolve from the repo root rather than the dashboard package.
 */
const AXE_PATH = join(process.cwd(), 'packages/dashboard/node_modules/axe-core/axe.min.js');

interface AxeViolation {
  readonly id: string;
  readonly impact: string | null;
  readonly help: string;
  readonly nodes: readonly {
    readonly target: readonly string[];
    readonly failureSummary: string;
  }[];
}

let tempDir: string;
/** The kitchen-sink report (every pane populated) — the axe sweep and most keyboard journeys. */
let report: TempReportHtml;
/** `window.__BUG_REPORT__` is `null` — the drop UI a keyboard user meets with no report open. */
let emptyReport: TempReportHtml;
/**
 * 200 console entries — enough to make `useVirtualWindow`'s overscan window (a handful of rows)
 * genuinely not include the last row on first render. The shared kitchen-sink fixture has only two
 * console entries, which would always be fully rendered regardless of whether virtualization keyboard
 * plumbing (`onScrollSync`) actually works — see `use-active-descendant.ts`'s doc comment on why that
 * sync matters. A real (if synthetic) large log is the only way to exercise the failure mode.
 */
let bigConsoleReport: TempReportHtml;

test.beforeAll(async () => {
  if (!existsSync(AXE_PATH)) {
    throw new Error(
      `axe-core not found at ${AXE_PATH} — run \`pnpm install\` so it is linked into ` +
        'packages/dashboard/node_modules, then re-run this suite.',
    );
  }

  tempDir = createReportHtmlTempDir();
  report = writeReportHtml(tempDir, 'a11y-report.html', await extractReportHtmlFromRealZip());
  emptyReport = writeReportHtml(tempDir, 'a11y-empty.html', emptyDataReportHtml());

  const manyConsoleEntries: ConsoleEntry[] = Array.from({ length: 200 }, (_, i) => ({
    id: `gen-${i}`,
    timestamp: new Date(Date.parse('2026-05-30T12:00:00.000Z') + i * 1000).toISOString(),
    level: i % 7 === 0 ? 'error' : i % 5 === 0 ? 'warn' : 'log',
    args: [{ type: 'string', preview: `Generated console entry ${i}` }],
  }));
  if (!sampleReport.console) {
    throw new Error('sampleReport.console is null — the kitchen-sink fixture changed shape');
  }
  const bigReport: BugReportV1 = {
    ...sampleReport,
    console: { ...sampleReport.console, entries: manyConsoleEntries },
  };
  const bigConsoleHtml = await embedReportData({
    templateHtml: emptyDataReportHtml(),
    report: bigReport,
    assets: sampleAssets,
  });
  bigConsoleReport = writeReportHtml(tempDir, 'a11y-big-console.html', bigConsoleHtml);
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

/** Run axe over the whole page and return only the violations, with readable context. */
async function analyze(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const results = await (
      window as unknown as {
        axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return results.violations;
  });
}

function describeViolations(violations: AxeViolation[]): string {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact ?? 'unknown'}): ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.failureSummary}`).join('\n'),
    )
    .join('\n');
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.getByTestId(`theme-${theme}`).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** `getComputedStyle(el).outline*` as a plain object, so callers can assert on it directly. */
async function outlineOf(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
}

test.describe('sanity: the compiled stylesheet is actually applied', () => {
  test('Tailwind is live — not a jsdom-style false negative', async ({ page }) => {
    // Everything else in this file assumes the app's real CSS is loaded (Tailwind utilities, the
    // `--bc-*` theming tokens, the S4-27 focus-ring rules). If either check below ever fails, treat
    // every other result in this file as suspect — they were not exercising real layout/paint.
    await page.goto(report.url);

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bc-accent').trim(),
    );
    expect(accent).not.toBe('');

    // App.tsx's tab-bar "+" picker (`<input type="file" className="hidden" />`) is always present,
    // in both the empty and populated states — a stable target for "does `.hidden` really hide".
    const hiddenDisplay = await page.evaluate(
      () =>
        document.querySelector('input.hidden') &&
        getComputedStyle(document.querySelector('input.hidden')!).display,
    );
    expect(hiddenDisplay).toBe('none');
  });
});

test.describe('axe: zero violations on every pane', () => {
  for (const pane of REPORT_HTML_PANES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${pane.pane} pane (${theme})`, async ({ page }) => {
        await page.goto(report.url);
        await setTheme(page, theme);
        await page.getByTestId(pane.nav).click();
        await expect(page.getByTestId(pane.root)).toBeVisible();

        const violations = await analyze(page);

        expect(violations, describeViolations(violations)).toEqual([]);
      });
    }
  }
});

test.describe('keyboard navigation', () => {
  test('the first Tab reaches the skip link, which moves focus to the content', async ({
    page,
  }) => {
    await page.goto(report.url);

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('skip-to-content')).toBeFocused();

    // SkipLink.tsx deliberately calls `preventDefault()` and focuses `#main` directly rather than
    // letting the browser apply `#main` to `location.hash` — this app is hash-routed, and
    // `parseHash` would treat the unrecognized `main` fragment as garbage input and reset to the
    // Overview pane, discarding the open report tab (S4-27 review finding documented in
    // SkipLink.tsx). So the correct observable effect is that focus moves into the content region,
    // NOT that the URL hash changes — asserting the hash would be testing for a regression that was
    // deliberately fixed.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('app-content')).toBeFocused();
  });

  test('the skip link shows a visible focus ring on Tab', async ({ page }) => {
    // A bug fixed moments before this task excluded the skip link from the focus ring via a
    // class-based `:not(.sr-only)` selector (index.css's S4-27 comment explains why that guard is
    // wrong: Tailwind's `focus:not-sr-only` never removes the literal `sr-only` class token). Confirm
    // the fix holds in a real browser, not just via a string assertion on the stylesheet.
    await page.goto(report.url);

    await page.keyboard.press('Tab');
    const skipLink = page.getByTestId('skip-to-content');
    await expect(skipLink).toBeFocused();

    const outline = await outlineOf(skipLink);
    expect(outline.style).not.toBe('none');
    expect(outline.width).not.toBe('0px');
  });

  test('every side-nav link is reachable and activatable by keyboard', async ({ page }) => {
    await page.goto(report.url);
    await page.getByTestId('nav-console').focus();

    await page.keyboard.press('Enter');

    await expect(page.getByTestId('console-pane')).toBeVisible();
  });

  test('changing pane moves focus into the content region and announces it', async ({ page }) => {
    await page.goto(report.url);
    await page.getByTestId('nav-network').click();

    await expect(page.getByTestId('app-content')).toBeFocused();
    await expect(page.getByTestId('route-announcer')).toHaveText('Network');
  });

  test('the content region shows a visible focus ring after a route change, in this browser', async ({
    page,
    browserName,
  }) => {
    // index.css carries BOTH a global `:focus-visible` rule and an explicit `#main:focus` rule,
    // because `useRouteFocus` calls `.focus()` from a `useEffect` (outside any keyboard event's own
    // call stack), where `:focus-visible` heuristics are known to be unreliable. This determines
    // empirically, per browser, whether that fallback is load-bearing — the answer decides whether a
    // queued follow-up (a transient class set at the two `.focus()` call sites, replacing
    // `#main:focus`) is needed or can be dropped.
    await page.goto(report.url);
    await page.getByTestId('nav-network').click();
    const main = page.getByTestId('app-content');
    await expect(main).toBeFocused();

    const outline = await outlineOf(main);
    // Deliberate: this line's stdout across both browsers is the empirical answer to (4).
    console.log(
      `[S4-27 Task 15] #main focus outline in ${browserName}: ${JSON.stringify(outline)}`,
    );

    expect(outline.style).not.toBe('none');
    expect(outline.width).not.toBe('0px');
  });

  test('the console list is one tab stop, driven by the arrow keys', async ({ page }) => {
    await page.goto(report.url);
    await page.getByTestId('nav-console').click();
    await expect(page.getByTestId('console-pane')).toBeVisible();

    const list = page.getByTestId('console-list');
    await list.focus();
    const first = await list.getAttribute('aria-activedescendant');

    await page.keyboard.press('ArrowDown');

    expect(await list.getAttribute('aria-activedescendant')).not.toBe(first);
  });

  test('End scrolls the console list past the virtual window and the active row still exists', async ({
    page,
  }) => {
    // Uses the 200-entry synthetic report, not the shared 2-entry kitchen-sink fixture — with only
    // two rows, everything is always rendered and this test would pass even if the virtual-window
    // resync (`onScrollSync`) were broken. This is the failure mode a roving tabindex (or a missed
    // resync) would produce: `aria-activedescendant` naming a row the DOM hasn't rendered yet.
    await page.goto(bigConsoleReport.url);
    await page.getByTestId('nav-console').click();
    await expect(page.getByTestId('console-pane')).toBeVisible();

    const list = page.getByTestId('console-list');
    await list.focus();

    await page.keyboard.press('End');

    const activeId = await list.getAttribute('aria-activedescendant');
    expect(activeId).toBe('console-option-199');
    await expect(page.locator(`#${activeId}`)).toHaveCount(1);
  });

  test('the drop zone file input is keyboard-reachable, with a visible ring on its label', async ({
    page,
  }) => {
    // The empty-data report — `window.__BUG_REPORT__` is null, so App.tsx renders DropZone. The
    // kitchen-sink `report` artefact seeds a tab on mount (`initialSource`), so `activeReport` is
    // always truthy there and DropZone never renders regardless of the hash — this is the state a
    // keyboard user with no report actually meets.
    await page.goto(emptyReport.url);
    await expect(page.getByTestId('dropzone')).toBeVisible();

    const input = page.locator('#dropzone-file-input');
    const label = page.locator('label[for="dropzone-file-input"]');

    // Real Tab presses, not `.focus()` — the ticket's most severe defect was that a keyboard user
    // could not open a report at all, which a `.focus()`-based test cannot catch. Bounded well above
    // the small number of controls that precede it (skip link, topbar, nine side-nav links).
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await input.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    await expect(input).toBeFocused();

    // `sr-only` clips the input's own paint region (outline included), so its indicator lives on the
    // visible LABEL via `peer-focus-visible:` utilities (DropZone.tsx) — assert the label, not the
    // (invisible-by-design) input.
    const outline = await outlineOf(label);
    expect(outline.style).not.toBe('none');
    expect(outline.width).not.toBe('0px');
  });

  test('Escape closes the lightbox and returns focus to the thumbnail', async ({ page }) => {
    await page.goto(report.url);
    await page.getByTestId('nav-screenshots').click();
    await expect(page.getByTestId('screenshots-pane')).toBeVisible();

    const thumb = page.getByTestId('screenshot-thumb').first();
    await thumb.click();
    await expect(page.getByTestId('lightbox-screenshot-viewer')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('lightbox-screenshot-viewer')).toHaveCount(0);
    await expect(thumb).toBeFocused();
  });
});
