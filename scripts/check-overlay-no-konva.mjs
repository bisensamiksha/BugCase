import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// TD-03: overlay.js is injected on EVERY capture, so it must NOT carry the ~150 kB Konva canvas engine;
// Konva ships only in the on-demand content/annotation.js (injected when the user clicks Annotate).
// `Konva` is the library's namespace token — present throughout the Konva bundle and absent from a
// Konva-free overlay. This gate runs in the extension build (chrome + firefox) so a stray static import
// that pulls Konva back into overlay.js fails the build instead of silently re-inflating every capture.
const SIGNATURE = 'Konva';

async function readOrFail(file, label) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    console.error(`check-overlay-no-konva: ${label} not found: ${file} (build the extension first)`);
    process.exit(1);
  }
}

async function main() {
  const target = process.argv[2] === 'firefox' ? 'firefox' : 'chrome';
  // Optional explicit content dir (used by the boundary test); otherwise the built dist for the target.
  const defaultDir = fileURLToPath(
    new URL(`../packages/extension/dist-${target}/content/`, import.meta.url),
  );
  const contentDir = process.argv[3] ? path.resolve(process.argv[3]) : defaultDir;
  const overlayPath = path.join(contentDir, 'overlay.js');
  const annotationPath = path.join(contentDir, 'annotation.js');

  const overlay = await readOrFail(overlayPath, 'overlay.js');
  const annotation = await readOrFail(annotationPath, 'annotation.js');

  const problems = [];
  if (overlay.includes(SIGNATURE)) {
    problems.push(
      `overlay.js contains "${SIGNATURE}" — Konva leaked back into the always-injected overlay`,
    );
  }
  if (!annotation.includes(SIGNATURE)) {
    problems.push(
      `annotation.js is missing "${SIGNATURE}" — the on-demand bundle did not include Konva`,
    );
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`check-overlay-no-konva (${target}): ${p}`);
    process.exit(1);
  }
  console.log(
    `check-overlay-no-konva (${target}): overlay.js is Konva-free; annotation.js carries Konva.`,
  );
}

await main();
