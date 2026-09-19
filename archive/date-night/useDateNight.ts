import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { normalizeGuess, validateGuess } from '@/engine/index.ts';
import {
  buildSlice,
  reduceSlice,
  type PlayApi,
  type Slice,
} from '@/ui/useGame.ts';
import { DATE_NIGHT_ENTRY, DATE_NIGHT_PUZZLE } from './puzzle.ts';
import { loadFound, saveFound, storagePersists } from './storage.ts';

/**
 * Everything the page reads, and nothing the daily needs that this board does
 * not have. It satisfies `PlayApi` structurally, so the compose row, the rack,
 * the buttons and the key handler take it without knowing the difference.
 */
export interface DateNightApi extends PlayApi {
  state: Slice;
  openReveal: () => void;
  closeReveal: () => void;
  /** False when this browser will not keep anything, so the page can say so. */
  persistent: boolean;
}

/**
 * One rack, played with the daily's own reducer.
 *
 * `reduceSlice` is the function the daily dispatches into, so adding a tile,
 * deleting, clearing, shuffling and submitting behave identically here by
 * construction rather than by imitation. That matters most on the rejection
 * branch: the daily clears the compose row, puts the reason in the well and
 * bumps the announcement, and a hand-written twin of that is exactly the kind
 * of thing that drifts.
 *
 * What is deliberately absent: no modes, no streak, no calendar, no audio, and
 * no `GameStorage`. This board has one slice that never switches and one key of
 * its own.
 */
export function useDateNight(): DateNightApi {
  const [state, dispatch] = useReducer(reduceSlice, undefined, (): Slice =>
    buildSlice({
      puzzle: DATE_NIGHT_PUZZLE,
      sourceEntry: DATE_NIGHT_ENTRY,
      // Not a calendar day: this page has none. A non-null value is what
      // selects the seeded, guarded rack order over a fresh random draw, and
      // a stable rack is the point. Nothing here reads the number itself.
      dayIndex: 0,
      // Filtered against the puzzle inside buildSlice, the same guard a
      // restored daily gets.
      restoreFound: loadFound(),
    }),
  );

  // Probed once: the answer cannot change under a session, and probing on every
  // render would write to storage on every render.
  const [persistent] = useState(storagePersists);

  const composedWord = useMemo(
    () => state.composing.map((id) => state.tiles[id]?.letter ?? '').join(''),
    [state.composing, state.tiles],
  );

  useEffect(() => {
    saveFound(state.found);
  }, [state.found]);

  const submit = useCallback(() => {
    const word = normalizeGuess(composedWord);
    // The engine decides, against a puzzle whose validation set is the twenty.
    // Too short, not in the list and already found all come back from here, so
    // the three rejections carry the daily's wording without this page owning
    // a single one of those strings.
    const result = validateGuess(word, state.puzzle, state.foundSet);
    dispatch({ type: 'SUBMIT_RESULT', result });
  }, [composedWord, state.puzzle, state.foundSet]);

  return {
    state,
    composedWord,
    persistent,
    addTile: useCallback(
      (id: number) => dispatch({ type: 'ADD_TILE', id }),
      [],
    ),
    addLetter: useCallback(
      (letter: string) => dispatch({ type: 'ADD_LETTER', letter }),
      [],
    ),
    removeLast: useCallback(() => dispatch({ type: 'REMOVE_LAST' }), []),
    clear: useCallback(() => dispatch({ type: 'CLEAR' }), []),
    shuffle: useCallback(() => dispatch({ type: 'SHUFFLE' }), []),
    submit,
    openReveal: useCallback(() => dispatch({ type: 'OPEN_REVEAL' }), []),
    closeReveal: useCallback(() => dispatch({ type: 'CLOSE_REVEAL' }), []),
  };
}
