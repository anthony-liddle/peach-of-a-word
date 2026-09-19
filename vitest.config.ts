import { configDefaults, defineConfig } from 'vitest/config';
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
    // archive/ holds retired pages kept as a record. Nothing there is built or
    // served, and nothing there should be collected as a test.
    exclude: [...configDefaults.exclude, 'archive/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
