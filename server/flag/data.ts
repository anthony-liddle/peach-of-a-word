import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a flag is checked against: the same files the site serves.
 *
 * The two validation lists (ENABLE and the SCOWL 95 additions) decide whether
 * a word is accepted, exactly as `loadGameData` builds the game's dictionary.
 * They arrive patched, so a denied word is already absent from them; the
 * patch's deny rows are read as well, so a refused word suggested as one that
 * should count can be dropped without storing it. `vercel.json` bundles these
 * four files with the function.
 */
export interface FlagData {
  readonly epoch: { year: number; month: number; day: number };
  /** The calendar's long words. The daily's and Endless's racks are these. */
  readonly calendar: readonly string[];
  readonly accepted: (word: string) => boolean;
  readonly denied: (word: string) => boolean;
}

const FILES = {
  enable: 'public/data/enable.txt',
  additions: 'public/data/scowl95-additions.txt',
  calendar: 'public/data/daily-calendar.json',
  patch: 'vendor/lexicon/dictionary-patch.tsv',
} as const;

function words(text: string): string[] {
  return text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

export function readFlagData(root: string): FlagData {
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const accepted = new Set([
    ...words(read(FILES.enable)),
    ...words(read(FILES.additions)),
  ]);
  const denied = new Set(
    read(FILES.patch)
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('\t'))
      .filter((cols) => cols[1] === 'deny')
      .map((cols) => cols[0]!.trim()),
  );
  const calendar = JSON.parse(read(FILES.calendar)) as {
    epoch: FlagData['epoch'];
    words: string[];
  };
  return {
    epoch: calendar.epoch,
    calendar: calendar.words,
    accepted: (word) => accepted.has(word),
    denied: (word) => denied.has(word),
  };
}

let cached: FlagData | null = null;

/** Read once per instance, from the function's own directory. */
export function loadFlagData(): FlagData {
  cached ??= readFlagData(process.cwd());
  return cached;
}
