import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/api/**/*.ts'],
      exclude: [
        'src/lib/api/**/*.test.ts',
        'src/lib/api/__tests__/**',
        'src/lib/api/types.ts', // type-only file, no executable code
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@fixtures': resolve(__dirname, './fixtures'),
    },
  },
});
