import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['.worktrees/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': '/home/wuxf/Develop/openlearnadmin/src',
    },
  },
});
