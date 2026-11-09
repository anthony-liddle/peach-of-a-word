import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MIX, gainOf } from '@/audio/mix.ts';

/**
 * The store art's cues, frozen: the game's cue file as it was when the store
 * art's sound was mixed, so the game's own mix since leaves the store art's
 * sound as it is.
 */
const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
const frozen = read('soundtrack.cues.json');
const game = read('../audio/peach.cues.json');

interface Doc {
  instruments: Record<string, { envelopeFloor: number }>;
  cues: Record<string, { notes: { instrument: string; level: number }[] }>;
}

describe("the store art's cues", () => {
  test('are the game\'s cue file at web commit 7b3957d, "a few tiles knocking for Shuffle", byte for byte', () => {
    expect(createHash('sha256').update(frozen).digest('hex')).toBe(
      '834d06338e43a4a384a46f851fc81172521d5950014fcf987cdf1f3b961d3830',
    );
  });

  test("are the game's cues without Bea's mix: its gains on them make the game's file", () => {
    const doc = JSON.parse(frozen) as Doc;
    for (const name of Object.keys(MIX.gains)) {
      doc.instruments[name]!.envelopeFloor *= gainOf(name);
      for (const cue of Object.values(doc.cues))
        for (const note of cue.notes)
          if (note.instrument === name) note.level *= gainOf(name);
    }
    expect(doc).toEqual(JSON.parse(game));
  });
});
