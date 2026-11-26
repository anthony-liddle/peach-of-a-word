/**
 * The run's board: its own slice of today's puzzle, played through the same
 * `reduceSlice` the basket uses, so a find is scored and said exactly as it
 * is there. Nothing reaches the basket while the clock runs.
 */
import { validateGuess, type Puzzle } from '@/engine/index.ts';
import type { SourceEntry } from '@/data/types.ts';
import {
  buildSlice,
  reduceSlice,
  type Action,
  type Slice,
} from '@/ui/useGame.ts';

/**
 * The basket's cards and its rank cues have no place in a run: a find of the
 * peach of a word opens no card mid-run, and no find says "New rank."
 */
function apart(slice: Slice): Slice {
  const body = slice.announcement.body;
  const announcement =
    body.kind === 'plain'
      ? {
          ...slice.announcement,
          body: {
            kind: 'plain' as const,
            text: body.text
              .replace(' Completed. Every common word found.', '')
              .replace(' New rank.', ''),
          },
        }
      : body.kind === 'source-found'
        ? { ...slice.announcement, body: { ...body, tail: '' } }
        : slice.announcement;
  return { ...slice, revealOpen: false, editionOpen: false, announcement };
}

export function stepRun(slice: Slice, action: Action): Slice {
  return apart(reduceSlice(slice, action));
}

/**
 * A run's board with these words found, said by nothing: a run rebuilt from
 * the save said its finds already.
 */
export function runSlice(
  puzzle: Puzzle,
  sourceEntry: SourceEntry | undefined,
  dayIndex: number,
  words: readonly string[] = [],
): Slice {
  let s = buildSlice({ puzzle, sourceEntry, dayIndex, restoreFound: [] });
  for (const word of words) {
    s = stepRun(s, {
      type: 'SUBMIT_RESULT',
      result: validateGuess(word, s.puzzle, s.foundSet),
    });
  }
  return {
    ...s,
    message: null,
    announcement: { body: { kind: 'plain', text: '' }, seq: 0 },
  };
}
