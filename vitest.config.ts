import { defineConfig } from 'vitest/config';

// Root-level Vitest config, scoped to the workflow contract tests (S4-19). Per-package suites run via
// `pnpm -r test` with their own configs; this one runs via `pnpm test:workflows` (like tests/e2e runs
// via `pnpm test:e2e`), because the repo root is not a workspace member.
export default defineConfig({
  test: {
    include: ['tests/workflows/**/*.test.ts'],
  },
});
