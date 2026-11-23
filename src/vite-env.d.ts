/// <reference types="vite/client" />

/**
 * The suffix on the shipped data directory, a hash of the data's own contents,
 * injected at build time by the versioned-data plugin in vite.config.ts. Empty
 * in dev and under test, where there is only one version of anything.
 *
 * It exists so a bundle only ever requests the data it was built against. See
 * scripts/lib/dataVersion.ts for why the URL has to change when the data does.
 */
declare const __DATA_VERSION__: string;

/**
 * The build, sent as a flag's version: Vercel's commit SHA for the build, its
 * first seven characters, injected in vite.config.ts. "dev" on a local build
 * and "test" under test.
 */
declare const __APP_VERSION__: string;
