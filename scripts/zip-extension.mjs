import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

// Fixed timestamp so the same input bytes always produce a byte-identical archive
// (reproducible release artifacts; ordering is made deterministic by sorting below).
const FIXED_DATE = new Date('2020-01-01T00:00:00.000Z');

async function listFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Zip a directory deterministically (sorted POSIX paths, fixed timestamps, level-9 DEFLATE).
 *
 * @param {string} sourceDir
 * @param {string} outFile
 * @param {{ filter?: (posixRelPath: string) => boolean }} [options] Optional `filter` receives each
 *   entry's POSIX-relative path and returns whether to include it (default: include everything, so
 *   existing callers like `zip:chrome`/`zip:firefox` are unaffected). `package-chrome` uses it to drop
 *   sourcemaps from the store upload.
 */
export async function zipDirectory(sourceDir, outFile, { filter } = {}) {
  let files = (await listFiles(sourceDir)).sort();
  const totalFound = files.length;
  if (filter) {
    files = files.filter((file) => filter(relative(sourceDir, file).split(sep).join('/')));
  }
  const excluded = totalFound - files.length;
  const zip = new JSZip();
  for (const file of files) {
    const name = relative(sourceDir, file).split(sep).join('/');
    // createFolders:false — JSZip would otherwise auto-add intermediate folder entries stamped with
    // `new Date()` (ignoring our fixed date), breaking reproducibility. Loaders don't need them.
    zip.file(name, await readFile(file), { date: FIXED_DATE, createFolders: false });
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, buffer);
  const paths = files.map((file) => relative(sourceDir, file).split(sep).join('/'));
  return { outFile, entries: files.length, bytes: buffer.length, paths, excluded };
}

async function main() {
  const [sourceDir, outFile] = process.argv.slice(2);
  if (!sourceDir || !outFile) {
    console.error('usage: node scripts/zip-extension.mjs <sourceDir> <outFile>');
    process.exit(1);
  }

  let isDir = false;
  try {
    isDir = (await stat(sourceDir)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    console.error(`source directory not found: ${sourceDir} — build the target first`);
    process.exit(1);
  }

  const result = await zipDirectory(sourceDir, outFile);
  console.log(`wrote ${result.outFile} (${result.entries} entries, ${result.bytes} bytes)`);
}

// Run as a CLI only when invoked directly; importing this file (e.g. for tests) is side-effect free.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
