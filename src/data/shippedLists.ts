/**
 * Reading the committed data off disk, for tests that assert against what
 * actually ships rather than against a fixture.
 *
 * The shipped lists carry the patch baked in (pnpm data:bake), so a test asserts
 * on them directly. It used to read the raw lists and apply the patch itself,
 * which meant the suite was checking a merge the runtime performed rather than
 * the bytes the player downloads. Asserting on the shipped bytes is stricter: a
 * bake that was never run, or run against a stale patch, now shows up.
 *
 * Test-only. Nothing in the app imports this, because the app no longer needs to
 * know the patch exists.
 */
import { readFileSync } from 'node:fs';
import type { DictionaryPatch, PatchableLists } from './patch.ts';
import { parsePatch } from './patch.ts';

/** Where the curated patch lives now: a build input, never a shipped asset. */
export const PATCH_PATH = 'scripts/data-raw/dictionary-patch.tsv';

/** One shipped word-list file, as a list of words. */
export function readList(name: string): string[] {
  return readFileSync(`public/data/${name}`, 'utf8')
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * The four pools exactly as loadGameData assembles them from the shipped files:
 * the complement pair unioned into validation, and the three bands as shipped.
 */
export function readShippedLists(): PatchableLists {
  return {
    enable: [...readList('enable.txt'), ...readList('scowl95-additions.txt')],
    common: readList('common-pool.txt'),
    beyond70: readList('beyond-size-70.txt'),
    beyond95: readList('beyond-size-95.txt'),
  };
}

/** The raw patch text, for tests that read its note column directly. */
export function readPatchText(): string {
  return readFileSync(PATCH_PATH, 'utf8');
}

/** The curated patch: no longer shipped, but still the record of the curation. */
export function readCommittedPatch(): DictionaryPatch {
  return parsePatch(readPatchText());
}

/** The daily calendar's word list, as shipped. */
export function readCalendarWords(): string[] {
  return (
    JSON.parse(readFileSync('public/data/daily-calendar.json', 'utf8')) as {
      words: string[];
    }
  ).words;
}

/**
 * The shipped lists with the patch's subtractions put back: denied words return
 * to validation, demoted words return to the common pool.
 *
 * This is a counterfactual, not a true inverse. It cannot know which rarity band
 * a denied word came from, so it restores validation only. That is enough for
 * what it is for: positive controls. A test that asserts a slur is absent proves
 * nothing unless the same assertion, run against lists where the slur was never
 * denied, finds it. This builds those lists.
 */
export function withPatchUndone(
  lists: PatchableLists,
  patch: DictionaryPatch,
): PatchableLists {
  const add = (base: readonly string[], back: readonly string[]) => {
    const seen = new Set(base);
    return [...base, ...back.filter((w) => !seen.has(w))];
  };
  return {
    enable: add(lists.enable, patch.deny),
    common: add(lists.common, patch.demote),
    beyond70: lists.beyond70,
    beyond95: lists.beyond95,
  };
}
