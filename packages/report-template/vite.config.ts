import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig, type Plugin } from 'vite';

import { assertNoExternalRefs, buildInlineHtml } from './src/build-inline-html';

// Build the dashboard's own entry (index.html -> src/main.tsx, which imports the CSS) as a single
// eager bundle, then inline it. Root = the dashboard package so its source + assets resolve.
const dashboardRoot = fileURLToPath(new URL('../dashboard', import.meta.url));
const templatePath = fileURLToPath(new URL('./src/template.html', import.meta.url));
const outDir = fileURLToPath(new URL('./dist', import.meta.url));

// Tailwind resolves `content` globs against the cwd, which is this package (not the dashboard) when
// the build runs via `pnpm --filter`. Configure Tailwind explicitly with absolute globs into the
// dashboard source so the utility layer is generated (mirrors packages/dashboard/tailwind.config.ts).
const tailwindContent = [
  join(dashboardRoot, 'index.html'),
  join(dashboardRoot, 'src/**/*.{html,ts,tsx}'),
];

/** Collapse Vite's single eager bundle (one JS chunk + one CSS asset) into one report.html. */
function inlineSingleFile(): Plugin {
  return {
    name: 'bugcase-inline-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      let js = '';
      let css = '';
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          js = file.code;
        } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          css = typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString();
        }
      }
      if (!js || !css) {
        throw new Error('inlineSingleFile: expected exactly one entry chunk and one css asset');
      }
      // Under `inlineDynamicImports`, Vite emits its `__vitePreload(() => import(…), __VITE_PRELOAD__,
      // import.meta.url)` wrapper for the dashboard's React.lazy panes but never resolves the
      // `__VITE_PRELOAD__` marker, so the first lazy pane throws `__VITE_PRELOAD__ is not defined` at
      // runtime (found by the S4-16 integration test; the empty-data shell never triggers a lazy
      // pane, so earlier manual checks missed it). There are no separate chunks to preload here, so
      // neutralize the marker to `void 0` — the wrapper then short-circuits to the (inlined) module.
      js = js.replaceAll('__VITE_PRELOAD__', 'void 0');
      const templateHtml = readFileSync(templatePath, 'utf8');
      const html = buildInlineHtml({ templateHtml, js, css });
      assertNoExternalRefs(html);
      for (const name of Object.keys(bundle)) {
        delete bundle[name];
      }
      this.emitFile({ type: 'asset', fileName: 'report.html', source: html });
    },
  };
}

export default defineConfig({
  root: dashboardRoot,
  base: './',
  plugins: [react(), inlineSingleFile()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ content: tailwindContent, theme: { extend: {} }, plugins: [] }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
