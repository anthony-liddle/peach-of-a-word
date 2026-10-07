import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The game's sounds play on Soundscape, Antoine's engine. A range would let an
 * install pick up whatever comes next, so the version is pinned exactly, and
 * the engine brings nothing else with it.
 */
const root = resolve(__dirname, '../..');
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8')) as {
    version?: string;
    dependencies?: Record<string, string>;
  };

describe('soundscape-engine', () => {
  test('is pinned to exactly 0.4.0, not a range', () => {
    expect(read('package.json').dependencies?.['soundscape-engine']).toBe(
      '0.4.0',
    );
  });

  test('is installed at that version, with no runtime dependencies of its own', () => {
    const installed = read('node_modules/soundscape-engine/package.json');
    expect(installed.version).toBe('0.4.0');
    expect(installed.dependencies ?? {}).toEqual({});
  });
});
