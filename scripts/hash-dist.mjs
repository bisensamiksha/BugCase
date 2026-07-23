import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// S4-19: a deterministic content hash over a build directory (or a single file), used by the release
// workflow's reproducibility gate — build twice, `hashDist` both, assert they match. Independent of
// filesystem enumeration order (paths are sorted) so the same bytes always yield the same hash, and
// both the path and the content of every file feed the hash (a rename changes the result).

async function listFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

/**
 * @param {string} target Absolute path to a directory or file.
 * @returns {Promise<string>} lowercase hex sha256.
 */
export async function hashDist(target) {
  const info = await stat(target); // throws ENOENT if the target is missing
  if (info.isFile()) {
    return createHash('sha256')
      .update(await readFile(target))
      .digest('hex');
  }
  const files = (await listFiles(target))
    .map((file) => ({ file, rel: path.relative(target, file).split(path.sep).join('/') }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const hash = createHash('sha256');
  for (const { file, rel } of files) {
    hash.update(rel);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function main(argv = process.argv.slice(2)) {
  const target = argv[0];
  if (!target) {
    console.error('usage: node scripts/hash-dist.mjs <dir-or-file>');
    process.exitCode = 1;
    return;
  }
  try {
    const hex = await hashDist(path.resolve(target));
    process.stdout.write(`${hex}\n`);
  } catch (err) {
    console.error(`hash-dist: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
