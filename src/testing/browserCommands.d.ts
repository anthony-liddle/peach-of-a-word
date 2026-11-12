/**
 * The custom commands `vitest.browser.config.ts` gives browser tests, typed
 * for `import { commands } from 'vitest/browser'`.
 */
declare module 'vitest/browser' {
  interface BrowserCommands {
    /** The browser's `prefers-color-scheme`, as a phone or computer set so. */
    emulateColorScheme: (scheme: 'light' | 'dark') => Promise<void>;
  }
}
export {};
