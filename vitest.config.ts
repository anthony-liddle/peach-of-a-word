import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Injected by the versioned-data plugin in a real build. Empty here, matching
  // dev, so tests assert against the unversioned paths.
  define: { __DATA_VERSION__: '""' },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
