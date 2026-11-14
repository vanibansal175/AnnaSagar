import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      MONGOMS_DISABLE_POSTINSTALL: '1'
    }
  }
});
