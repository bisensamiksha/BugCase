import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative base so the static build also works under a GitHub Pages subpath (deploy is S1-20).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
