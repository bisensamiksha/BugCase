import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { buildManifest, type Target } from './src/manifest';

const target = (process.env.BROWSER as Target) ?? 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist-chrome';

export default defineConfig({
  plugins: [
    react(),
    crx({
      manifest: buildManifest(target),
      browser: target === 'firefox' ? 'firefox' : 'chrome',
    }),
  ],
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  build: { outDir, emptyOutDir: true, sourcemap: true },
});
