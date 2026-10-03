import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { SOUNDS } from '@/sounds/inventory.ts';
import { distinctSounds } from '@/testing/engineSweep.ts';

/**
 * The sound baseline is whole and is what it says it is.
 *
 * This checks the record, not the sound: nothing here renders the engine again
 * or compares a number against one. Comparing belongs to the Soundscape pass.
 * What it does hold is that every sound has an entry, and that each WAV on disk
 * is the file its entry was measured from. A sound with no baseline cannot be
 * compared later, so a new one fails here until it is captured.
 */
const DIR = resolve(process.cwd(), 'src/audio/baseline');

interface Entry {
  peakDbfs: number;
  fundamentalHz: number | null;
  wav: string;
  bytes: number;
  sha256: string;
}

const baseline = JSON.parse(
  readFileSync(resolve(DIR, 'sounds.json'), 'utf8'),
) as { sounds: Record<string, Entry> };
const entries = Object.entries(baseline.sounds);

describe('the sound baseline', () => {
  test('has one entry for every sound on the page, in page order', () => {
    expect(entries.map(([id]) => id)).toEqual(SOUNDS.map((s) => s.id));
  });

  test('has one entry for every sound the engine can make', () => {
    expect(entries).toHaveLength(distinctSounds().size);
  });

  test.each(entries)(
    '%s was heard, and its WAV is the one measured',
    (_id, e) => {
      expect(Number.isFinite(e.peakDbfs)).toBe(true);
      expect(e.fundamentalHz).not.toBeNull();
      const wav = readFileSync(resolve(DIR, e.wav));
      expect(wav.length).toBe(e.bytes);
      expect(createHash('sha256').update(wav).digest('hex')).toBe(e.sha256);
    },
  );
});
