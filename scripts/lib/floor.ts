import { MIN_SET_SIZE } from '../../src/engine/config.ts';

/** A crown on the calendar below MIN_SET_SIZE by decision: its size and why. */
export interface FloorException {
  readonly size: number;
  readonly reason: string;
}

/**
 * Crowns that sit below the set-size floor by decision, each at its exact size
 * with its reason.
 *
 * The floor admits crowns; a committed day never moves. So when a later list
 * change takes a crown under the floor, the crown keeps its day and is named
 * here, and the floor still holds for every other crown. The calendar build
 * checks it, and so do the tests that pin the floor.
 */
export const FLOOR_EXCEPTIONS: ReadonlyMap<string, FloorException> = new Map([
  [
    'approach',
    {
      size: 14,
      reason:
        'crap left every basket in orchard v1.10.0 (Antoine, 2026-10-27). ' +
        'approach keeps 27 December 2027 for the 1.0 build: no fresh crown can ' +
        'replace it until the etymology fetcher reads entries Wiktionary has, ' +
        'such as ultimate and neighbor.',
    },
  ],
]);

/**
 * Every crown below the floor that is not a named exception at its recorded
 * size, as a sentence each. Empty when the floor holds.
 */
export function floorProblems(
  sizes: Iterable<readonly [string, number]>,
): string[] {
  const problems: string[] = [];
  for (const [word, size] of sizes) {
    const exception = FLOOR_EXCEPTIONS.get(word);
    if (exception) {
      if (size !== exception.size) {
        problems.push(
          `${word} is a named exception at ${exception.size}, but its basket holds ${size}`,
        );
      }
    } else if (size < MIN_SET_SIZE) {
      problems.push(
        `${word} holds ${size}, under the floor of ${MIN_SET_SIZE}`,
      );
    }
  }
  return problems;
}
