/**
 * Build the frozen daily calendar. Runs offline against the already-baked data.
 *
 *   pnpm data:calendar
 *
 * Outputs public/data/daily-calendar.json: { epoch, words }, the ordered daily
 * sequence. Eligibility (set size at least MIN_SET_SIZE, crown-inclusive) is
 * computed through the engine's createPuzzle, reused via eligibleSourceWords,
 * never reimplemented.
 *
 * APPEND-ONLY INVARIANT (load-bearing, do not break):
 *   The daily calendar is append-only. Never reorder it, never remove from it.
 *   New words go on the end. The generator enforces this: existing entries keep
 *   their position and order, and any newly eligible word is appended to the
 *   end. Removing or reordering an entry re-dates every day after it and breaks
 *   the promise that a given day is a fixed puzzle.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eligibleSourceWords } from '../src/engine/eligibility.ts';
import { generateCalendar } from '../src/engine/calendar.ts';
import { DAILY_EPOCH } from '../src/engine/config.ts';
import type { SourceEntry } from '../src/data/types.ts';
import { loadExclusions } from './lib/exclusions.ts';
import { loadPatchedPools } from './lib/pools.ts';
import { writeAsset } from './lib/util.ts';

const DATA = join(import.meta.dirname, '..', 'public', 'data');

interface CalendarFile {
  epoch: typeof DAILY_EPOCH;
  words: string[];
}

async function loadExistingCalendar(): Promise<CalendarFile | null> {
  try {
    const raw = await readFile(join(DATA, 'daily-calendar.json'), 'utf8');
    return JSON.parse(raw) as CalendarFile;
  } catch {
    return null;
  }
}

function sameEpoch(a: typeof DAILY_EPOCH, b: typeof DAILY_EPOCH): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

async function main(): Promise<void> {
  console.log('Building the daily calendar.\n');

  // Patched pools: the denylist is subtracted before anything is derived from
  // them, so a denied word cannot sit inside a set size, and therefore cannot
  // sit inside a par value or a completion count. See lib/pools.ts.
  const [pools, sourceJson] = await Promise.all([
    loadPatchedPools(),
    readFile(join(DATA, 'source-pool.json'), 'utf8'),
  ]);
  const { dictionary, commonPool, beyond70Pool, beyond95Pool } = pools;

  // Subtract the source-word exclusion list (Phase 2 cull): inflected forms
  // stay valid, scorable finds but cannot headline a day. Offline and
  // reproducible: the committed list replaces the kaikki derivation.
  const exclusions = await loadExclusions();
  const allSource = (JSON.parse(sourceJson) as SourceEntry[]).map(
    (e) => e.word,
  );
  const sourceWords = allSource.filter((w) => !exclusions.has(w));
  console.log(
    `  ${allSource.length} source words, ${exclusions.size} excluded by the cull, ` +
      `${sourceWords.length} clean candidates.`,
  );
  const eligible = eligibleSourceWords(
    sourceWords,
    dictionary,
    commonPool,
    beyond70Pool,
    beyond95Pool,
  );
  console.log(
    `  ${eligible.length} of ${sourceWords.length} clear the floor ` +
      `(the rest are sub-floor, kept as found words but never headlining).`,
  );

  // Re-anchor on an epoch change: when the committed epoch differs from
  // DAILY_EPOCH, this is the one intended reshuffle, so regenerate fresh from
  // the clean pool. When the epoch matches, the append-only invariant holds and
  // newly eligible words are appended to the end.
  const existing = await loadExistingCalendar();
  const reanchor = !existing || !sameEpoch(existing.epoch, DAILY_EPOCH);
  const base = reanchor ? [] : existing.words;
  const words = generateCalendar(eligible, base);
  console.log(
    reanchor
      ? `  Re-anchored: regenerated ${words.length} days from the clean pool ` +
          `at epoch ${DAILY_EPOCH.year}-${DAILY_EPOCH.month}-${DAILY_EPOCH.day}.`
      : `  Append-only: kept ${base.length} days, appended ${words.length - base.length} new.`,
  );

  const calendar: CalendarFile = { epoch: DAILY_EPOCH, words };
  await writeAsset('daily-calendar.json', JSON.stringify(calendar));
  console.log('\nDone. Wrote public/data/daily-calendar.json.');
}

main().catch((err) => {
  console.error('\nCalendar build failed:', err);
  process.exitCode = 1;
});
