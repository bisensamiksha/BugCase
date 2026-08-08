#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Firefox parity ratchet (S4-29).
 *
 * Firefox is built on every commit but published nowhere: the store tickets are parked in
 * `docs/sprint-5-deferred/` until Chrome shows demand. Before this gate, CI never ran
 * `build:firefox` at all (the `build` job runs `pnpm build`, which resolves to the extension's
 * `build` script, which is `build:chrome`), so a Chrome-only change could silently break the
 * Firefox target and nobody would find out until the Firefox packaging ticket started.
 *
 * This is deliberately a **ratchet, not a cleanup**:
 *   - any lint ERROR fails the build,
 *   - the WARNING count may not rise above the committed baseline.
 *
 * That passes at today's real state and still catches regressions. Driving the warnings to zero
 * is Firefox store work (S5-02 / S5-04), not this gate's job. The baseline number is the honest
 * record of how far Firefox is from AMO-ready; a suppression list would hide exactly the debt
 * those tickets exist to pay down.
 */

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Relative to `packages/extension`, because that is where web-ext is installed and run. */
const DEFAULT_SOURCE_DIR = 'dist-firefox';
const DEFAULT_BASELINE = path.join(REPO_ROOT, 'scripts/firefox-lint-baseline.json');

/**
 * @typedef {{ code?: string, message?: string, file?: string }} LintMessage
 * @typedef {{ errors: LintMessage[], warnings: LintMessage[] }} LintReport
 */

/**
 * Runs `web-ext lint` and returns its JSON report.
 *
 * web-ext exits non-zero whenever it finds anything, so a thrown error is the normal path and its
 * stdout still holds the report. Only a genuinely empty stdout means the tool itself failed.
 *
 * web-ext is a devDependency of `@bugcase/extension`, not of the root, so it is reached through
 * `pnpm --filter`. A bare root `pnpm exec web-ext` prints "Command not found" and no report.
 *
 * @param {string} sourceDir Built extension directory, relative to `packages/extension`.
 * @returns {string} Raw JSON on stdout.
 */
function runWebExtLint(sourceDir) {
  const args = [
    '--filter',
    '@bugcase/extension',
    'exec',
    'web-ext',
    'lint',
    `--source-dir=${sourceDir}`,
    '--output=json',
  ];
  try {
    return execFileSync('pnpm', args, { encoding: 'utf8', stdio: 'pipe', cwd: REPO_ROOT });
  } catch (err) {
    const stdout = /** @type {{ stdout?: string }} */ (err).stdout ?? '';
    if (!stdout.trim()) {
      throw new Error(
        `web-ext lint produced no report for ${sourceDir}. ` +
          `Is the target built? Run: pnpm build:firefox`,
      );
    }
    return stdout;
  }
}

/**
 * @param {string} raw Raw JSON from web-ext.
 * @returns {LintReport}
 */
export function parseReport(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('lint report is not an object');
  const { errors, warnings } = /** @type {Partial<LintReport>} */ (parsed);
  if (!Array.isArray(errors) || !Array.isArray(warnings)) {
    throw new Error('lint report is missing an `errors` or `warnings` array');
  }
  return { errors, warnings };
}

/**
 * Groups messages by rule code so a failure names the rule, not just a number.
 *
 * @param {LintMessage[]} messages
 * @returns {{ code: string, count: number, files: string[] }[]} Sorted by count, descending.
 */
export function groupByRule(messages) {
  /** @type {Map<string, string[]>} */
  const byCode = new Map();
  for (const m of messages) {
    const code = m.code ?? 'UNKNOWN';
    const files = byCode.get(code) ?? [];
    if (m.file && !files.includes(m.file)) files.push(m.file);
    byCode.set(code, files);
  }
  return [...byCode.entries()]
    .map(([code, files]) => ({
      code,
      count: messages.filter((m) => (m.code ?? 'UNKNOWN') === code).length,
      files,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/**
 * @param {{ code: string, count: number, files: string[] }[]} groups
 * @param {(line: string) => void} write
 */
function printGroups(groups, write) {
  for (const g of groups) {
    write(`  ${String(g.count).padStart(3)} x ${g.code}`);
    for (const f of g.files.slice(0, 4)) write(`        ${f}`);
    if (g.files.length > 4) write(`        ... and ${g.files.length - 4} more file(s)`);
  }
}

/**
 * @param {string[]} argv
 * @returns {string | undefined}
 */
function flag(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

export async function main(argv = process.argv.slice(2)) {
  const sourceDir = flag(argv, '--source-dir') ?? DEFAULT_SOURCE_DIR;
  const baselinePath = flag(argv, '--baseline') ?? DEFAULT_BASELINE;
  const reportPath = flag(argv, '--report');

  /** @type {LintReport} */
  let report;
  try {
    const raw = reportPath ? readFileSync(reportPath, 'utf8') : runWebExtLint(sourceDir);
    report = parseReport(raw);
  } catch (err) {
    console.error(`check-firefox-lint: could not read a lint report.`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  /** @type {{ warnings: number }} */
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!Number.isInteger(baseline.warnings) || baseline.warnings < 0) {
      throw new Error('`warnings` must be a non-negative integer');
    }
  } catch (err) {
    console.error(`check-firefox-lint: invalid baseline at ${baselinePath}.`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const errorCount = report.errors.length;
  const warningCount = report.warnings.length;
  console.log(
    `check-firefox-lint: errors: ${errorCount}, warnings: ${warningCount} (baseline ${baseline.warnings})`,
  );

  if (errorCount > 0) {
    console.error(`\nweb-ext lint reported ${errorCount} error(s). Errors always fail this gate:`);
    printGroups(groupByRule(report.errors), (l) => console.error(l));
    console.error('\nFix the error. Unlike warnings, there is no baseline for these.');
    process.exitCode = 1;
    return;
  }

  if (warningCount > baseline.warnings) {
    console.error(
      `\nWarnings rose from ${baseline.warnings} to ${warningCount}. ` +
        `The Firefox build regressed on this branch:`,
    );
    printGroups(groupByRule(report.warnings), (l) => console.error(l));
    console.error(
      `\nFix the new warning, or if it is genuinely unavoidable, raise \`warnings\` in ` +
        `${path.relative(REPO_ROOT, baselinePath)} in the same PR and say why in the description.`,
    );
    process.exitCode = 1;
    return;
  }

  if (warningCount < baseline.warnings) {
    console.log(
      `\nWarnings dropped below the baseline. Lower the baseline to ${warningCount} in ` +
        `${path.relative(REPO_ROOT, baselinePath)} so the gain is locked in.`,
    );
    return;
  }

  console.log('Firefox target builds and lints at its recorded baseline.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
