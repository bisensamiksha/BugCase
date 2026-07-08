import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build the standalone visual-regression harness (S3-17) — a self-contained IIFE bundle of the real
 * PreviewApp mounted with fixture data. Not part of the shipped extension; consumed only by
 * `tests/e2e/preview-visual.spec.ts`. `webextension-polyfill` is aliased to a no-op stub (the harness
 * injects every runtime dep), and the output is a classic-script IIFE so it loads over `file://`.
 */
const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'webextension-polyfill': dir('./visual-harness/webext-stub.ts') },
  },
  publicDir: dir('./visual-harness/public'),
  build: {
    outDir: dir('./visual-harness/dist'),
    emptyOutDir: true,
    // Deterministic, self-contained output; no hashed names so index.html can reference it directly.
    lib: {
      entry: dir('./visual-harness/main.tsx'),
      formats: ['iife'],
      name: 'BugcaseVisualHarness',
      fileName: () => 'preview-harness.iife.js',
    },
  },
});
