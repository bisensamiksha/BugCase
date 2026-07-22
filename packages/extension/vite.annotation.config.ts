import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { type Target } from './src/manifest';

// On-demand annotation surface (TD-03). Built like the overlay content build: a self-contained IIFE that
// `chrome.scripting.executeScript({ files })` injects only when the user clicks Annotate, so Konva ships
// here instead of in overlay.js. Runs AFTER the CRXJS build (which empties dist) with `emptyOutDir: false`
// to preserve that output, and after the content build, at the fixed path `<dist>/content/annotation.js`.
const target = (process.env.BROWSER as Target) ?? 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist-chrome';

export default defineConfig({
  plugins: [react()],
  // Lib mode does not auto-replace process.env.NODE_ENV; a classic injected script has no `process`, so
  // any leftover reference throws "process is not defined". Statically fold it to production.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: 'src/content/annotation.tsx',
      formats: ['iife'],
      name: 'BugCaseAnnotation',
      fileName: () => 'content/annotation.js',
    },
    rollupOptions: {
      // Inline everything so the injected file is standalone (no chunk imports the page can't load).
      output: { inlineDynamicImports: true },
    },
  },
});
