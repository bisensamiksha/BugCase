import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Empty-data report.html must stay under this ceiling; enforced in the report-template build + CI
// (S4-14). Mirrors the constant asserted by check-report-html-size.test.ts.
const MAX_REPORT_HTML_BYTES = 5 * 1024 * 1024; // 5 MiB

const defaultTarget = fileURLToPath(
  new URL('../packages/report-template/dist/report.html', import.meta.url),
);

async function main() {
  const target = process.argv[2] ?? defaultTarget;
  let bytes;
  try {
    bytes = (await readFile(target)).byteLength;
  } catch {
    console.error(
      `check-report-html-size: not found: ${target} (run the report-template build first)`,
    );
    process.exit(1);
  }
  const mib = (bytes / (1024 * 1024)).toFixed(2);
  if (bytes >= MAX_REPORT_HTML_BYTES) {
    console.error(`check-report-html-size: report.html is ${mib} MiB — over the 5 MiB budget`);
    process.exit(1);
  }
  console.log(`check-report-html-size: report.html is ${mib} MiB — under the 5 MiB budget`);
}

await main();
