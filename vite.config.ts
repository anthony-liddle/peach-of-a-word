import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dataVersion } from './scripts/lib/dataVersion.ts';

const DATA_DIR = resolve(__dirname, './public/data');

/**
 * Version the shipped data directory by its contents, so the JS and the data it
 * parses cannot desync.
 *
 * Vite content-hashes the JS bundle but copies public/ verbatim, so the data
 * assets kept a stable URL across deploys and a cached bundle could fetch newer
 * data. This renames the built directory to data-<hash> and hands the same
 * suffix to the app through __DATA_VERSION__, so a bundle only ever requests the
 * data it was built against. When that data is gone, the fetch 404s rather than
 * quietly returning something the bundle cannot parse.
 *
 * In dev the suffix is empty and the files are served from public/data as usual,
 * because there is only ever one version of anything on a dev server.
 */
function versionedData(isBuild: boolean): Plugin {
  const suffix = isBuild ? `-${dataVersion(DATA_DIR)}` : '';
  return {
    name: 'versioned-data',
    config: () => ({
      define: { __DATA_VERSION__: JSON.stringify(suffix) },
    }),
    // After Vite has copied public/ into the output, move the data directory to
    // its versioned name. Nothing references the unversioned path by then.
    closeBundle: async () => {
      if (!isBuild) return;
      const out = resolve(__dirname, './dist');
      const target = resolve(out, `data${suffix}`);
      // Vite empties the output directory by default, so the target is normally
      // absent. Clearing it anyway keeps a build into a dirty dist from either
      // merging two deploys' data or failing on a rename onto a live directory.
      await rm(target, { recursive: true, force: true });
      await rename(resolve(out, 'data'), target);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), versionedData(command === 'build')],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
}));
