import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Standalone test config so vitest does NOT pick up this package's build `vite.config.ts`, whose
  // `root` points at the dashboard (for the single-file build) and would otherwise run the dashboard
  // suite instead of this package's tests.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
