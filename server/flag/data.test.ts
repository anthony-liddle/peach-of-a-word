// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFlagData } from './data.ts';

describe('the data a flag is checked against', () => {
  it('reads both lists, the calendar and only the deny rows', () => {
    const root = mkdtempSync(join(tmpdir(), 'flagdata-'));
    mkdirSync(join(root, 'public/data'), { recursive: true });
    mkdirSync(join(root, 'vendor/lexicon'), { recursive: true });
    writeFileSync(join(root, 'public/data/enable.txt'), 'bad\nbid\n');
    writeFileSync(join(root, 'public/data/scowl95-additions.txt'), 'hide\n\n');
    writeFileSync(
      join(root, 'public/data/daily-calendar.json'),
      JSON.stringify({
        epoch: { year: 2026, month: 6, day: 23 },
        words: ['abdeghil'],
      }),
    );
    writeFileSync(
      join(root, 'vendor/lexicon/dictionary-patch.tsv'),
      'word\taction\tband\tnote\n# a comment\nhag\tdeny\t\t\nzap\tallow\tcommon\t\ndab\tdemote\t\t\n',
    );
    const data = readFlagData(root);
    expect(data.accepted('bad')).toBe(true);
    expect(data.accepted('hide')).toBe(true);
    expect(data.accepted('dab')).toBe(false);
    expect(data.denied('hag')).toBe(true);
    expect(data.denied('zap')).toBe(false);
    expect(data.denied('dab')).toBe(false);
    expect(data.calendar).toEqual(['abdeghil']);
    expect(data.epoch).toEqual({ year: 2026, month: 6, day: 23 });
  });

  it('loads the files the site ships, which the function bundles', () => {
    // Counts only: no word from the real lists or calendar reaches CI output.
    const data = readFlagData(resolve(__dirname, '../..'));
    expect(data.calendar.length).toBeGreaterThan(100);
    expect(data.calendar.every((w) => /^[a-z]{8}$/.test(w))).toBe(true);
    expect(data.accepted(data.calendar[0]!)).toBe(true);
  });
});
