import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{extensions,packages,scripts}/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
