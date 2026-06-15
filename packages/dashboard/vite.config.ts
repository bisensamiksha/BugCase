import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative base so assets resolve under the GitHub Pages project subpath
  // (https://<owner>.github.io/BugCase/) and from an inlined report.html, without
  // hardcoding the repo name. Deployed by .github/workflows/gh-pages.yml (S1-20).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
