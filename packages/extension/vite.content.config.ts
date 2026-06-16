import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { type Target } from './src/manifest';

// Second build step — run AFTER the CRXJS build (which empties dist). It bundles the overlay
// content entry as a self-contained IIFE that `chrome.scripting.executeScript({ files })` can
// inject. CRXJS only emits manifest-referenced entries (popup HTML + service worker), and files
// injected via executeScript run as classic scripts (no ES modules), so the overlay needs its
// own build that inlines React/react-dom/webextension-polyfill into one classic script at the
// fixed path `<dist>/content/overlay.js`. `emptyOutDir: false` preserves the CRXJS output.
const target = (process.env.BROWSER as Target) ?? 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist-chrome';

export default defineConfig({
  plugins: [react()],
  // Lib mode does not auto-replace process.env.NODE_ENV like the app build does. A content script
  // runs in a page context where `process` is undefined, so any leftover reference throws
  // "process is not defined" and React fails to render. Statically fold it to production.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: 'src/content/overlay.tsx',
      formats: ['iife'],
      name: 'BugCaseOverlay',
      fileName: () => 'content/overlay.js',
    },
    rollupOptions: {
      // Inline everything so the injected file is standalone (no chunk imports the page can't load).
      output: { inlineDynamicImports: true },
    },
  },
});
