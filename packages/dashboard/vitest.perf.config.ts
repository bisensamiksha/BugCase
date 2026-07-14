import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Separate perf lane (S4-05). The `.perf.tsx` files live under `src/` (so tsc + eslint cover them)
 * but are named `.perf.tsx`, not `.test.tsx`, so the default unit `vitest run` skips them and the
 * suite stays fast; run explicitly via `pnpm test:perf`. Generates a ~50 MB fixture at runtime, so it
 * needs setup headroom while the 2 s budget assertion is what actually gates.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/perf/**/*.perf.tsx'],
    testTimeout: 30000,
  },
});
