import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{extensions,packages,scripts}/**/*.{test,spec}.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
      include: ['extensions/*/src/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/tests/**'],
      // Enforced in `npm run check`, so a drop fails the build rather than
      // being noticed later. See AGENTS.md: invariants live in tests.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
