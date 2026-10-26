import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['backend/tests/**/*.test.ts'],
    setupFiles: ['./backend/tests/setup.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 10000,
    restoreMocks: true,
    clearMocks: true,
  },
});
