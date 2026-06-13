import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to node; DOM-dependent suites opt in per file via `@vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
