import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', '.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/api/**/*.ts', 'src/components/ui/**/*.tsx'],
      exclude: [
        'src/lib/api/**/*.test.ts',
        'src/lib/api/__tests__/**',
        'src/lib/api/types.ts',
        'src/components/ui/index.ts',
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
