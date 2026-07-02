import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // react-konva's entry imports bare `konva`, whose `main` is the Node build that `require('canvas')`
    // (a native module we don't install). Point bare `konva` at its browser build so tests that reach the
    // annotation chain (even without rendering a stage) can load it. Production `vite build` already picks
    // konva's `browser` field. Annotation tests still mock `react-konva`, so no real canvas is exercised.
    alias: [{ find: /^konva$/, replacement: 'konva/lib/index.js' }],
  },
  test: {
    // Default to node; DOM-dependent suites opt in per file via `@vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
