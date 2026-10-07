import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'node:path';

/**
 * Tests that only mean something in a real browser: every Soundscape cue held
 * to the game's previous engine, both rendered offline in the same browser in
 * the same run, in Chromium, Firefox and WebKit. Kept out of the jsdom suite,
 * which has no Web Audio, because they need Playwright's browsers installed.
 *
 *   pnpm test:browser                    every browser
 *   pnpm test:browser --browser=firefox  one of them
 */
export default defineConfig({
  // As in vitest.config.ts: the versioned-data plugin's value in a real build
  define: { __DATA_VERSION__: '""' },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.browser.test.ts'],
    // Each browser logs the largest difference it found, passing or not
    silent: false,
    // A cue renders its whole instrument chain from time 0, eight convolvers
    // included, so a group's 10 s takes about a second in Chromium. Past the
    // defaults, a slow render would run on under the next test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      // The page renders audio, not pixels, so a failure's screenshot shows nothing
      screenshotFailures: false,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
