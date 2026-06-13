import { defineConfig } from 'vite';

export default defineConfig({
  // The static site lives in src/; build it to apps/privacy-site/dist with relative asset URLs.
  root: 'src',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
});
