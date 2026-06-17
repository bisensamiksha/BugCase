import { defineConfig } from 'vite';

import { type Target } from './src/manifest';

// Build step for the passive-monitoring injected scripts (S2-03). Like the overlay content build,
// these run AFTER the CRXJS build (which empties dist) with `emptyOutDir: false`, because
// `chrome.scripting.registerContentScripts` loads files from the packaged extension and runs them as
// classic scripts (no ES modules). Each is bundled as a self-contained IIFE at a fixed dist path.
//
// IIFE output requires a single entry per build, so this config builds one entry per invocation,
// selected by the INJECTED_ENTRY env var; the package build script runs it once per entry.
const ENTRIES = {
  'main-entry': {
    entry: 'src/injected/main-entry.ts',
    fileName: 'injected/main-entry.js',
    name: 'BugCasePassiveMain',
  },
  'passive-bridge': {
    entry: 'src/content/passive-bridge.ts',
    fileName: 'content/passive-bridge.js',
    name: 'BugCasePassiveBridge',
  },
} as const;

type EntryKey = keyof typeof ENTRIES;

const which = (process.env.INJECTED_ENTRY as EntryKey) ?? 'main-entry';
const selected = ENTRIES[which];
if (!selected) {
  throw new Error(
    `Unknown INJECTED_ENTRY "${process.env.INJECTED_ENTRY ?? ''}"; expected one of ${Object.keys(ENTRIES).join(', ')}`,
  );
}

const target = (process.env.BROWSER as Target) ?? 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist-chrome';

export default defineConfig({
  // A content/page script runs where `process` is undefined; fold NODE_ENV so no reference survives.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: selected.entry,
      formats: ['iife'],
      name: selected.name,
      fileName: () => selected.fileName,
    },
    rollupOptions: {
      // Inline everything so the injected file is standalone (no chunk imports the page can't load).
      output: { inlineDynamicImports: true },
    },
  },
});
