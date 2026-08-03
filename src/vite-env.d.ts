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
