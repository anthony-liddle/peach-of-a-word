/**
 * Debug only: each picture of the run starts where it should, from the
 * address. Every entry point returns at once outside a development build,
 * where `import.meta.env.DEV` is false and the bundler drops the rest.
 *
 * - `?run=ready|progress|last|paused|ask|elsewhere|end|end-nopeach`, with
 *   `&runAt=52` for the clock and `&clock=180` for Longer clock: the run on
 *   screen in that state, its clock standing still.
 * - `&cardShown`: the result as it is after the card's Close.
 * - `?seedRun=end`: today's run kept and carried, as a played run leaves it.
 * - `?flight=paused&runAt=48`: a run waiting.
 *
 * The seeded words are 14 November's board, `clearing`, a day that has
 * passed, as the app's pictures use.
 */
import {
  createPuzzle,
  dailySourceWord,
  dayIndex,
  STORAGE_EPOCH,
  validateGuess,
} from '@/engine/index.ts';
import type { GameData } from '@/data/gameData.ts';
import type { GameStorage } from '@/persistence/storage.ts';
import type { Slice } from '@/ui/useGame.ts';
import { LONGER_RUN_MS, RUN_MS } from './clock.ts';
import { recordOf } from './record.ts';
import { runSlice, stepRun } from './play.ts';
import type { Core } from './useRush.ts';

export const SEED_SIX = ['ace', 'age', 'cage', 'race', 'rice', 'clear'];
export const SEED_TWELVE = [
  ...SEED_SIX,
  'nice',
  'lane',
  'lean',
  'real',
  'gain',
  'angle',
];

/** The address's parameters, in a development build. */
function params(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}

/** Which run state the address asks to open on, if any. */
export function debugRunKind(): string | null {
  // Each entry point checks the build itself, so the bundler drops its body.
  if (!import.meta.env.DEV) return null;
  return params()?.get('run') ?? null;
}

function play(slice: Slice, words: readonly string[]): Slice {
  let s = slice;
  for (const word of words)
    s = stepRun(s, {
      type: 'SUBMIT_RESULT',
      result: validateGuess(word, s.puzzle, s.foundSet),
    });
  return s;
}

/** The run in the state `?run=` asks for, or null. */
export function debugCore(
  slice: Slice,
  storage: GameStorage,
  day: number,
): Core | null {
  if (!import.meta.env.DEV) return null;
  const p = params();
  const kind = p?.get('run');
  if (!p || !kind) return null;
  const at = Number(p.get('runAt') ?? '52') * 1000;
  const clockMs = p.get('clock') === '180' ? LONGER_RUN_MS : RUN_MS;
  const base = { endsAt: null, endedEarly: false, frozen: true, clockMs };
  const all = [...SEED_TWELVE, 'regal'];
  switch (kind) {
    case 'ready':
      return { ...base, phase: 'ready', slice, leftMs: clockMs };
    case 'progress':
    case 'ask':
      return {
        ...base,
        phase: 'running',
        slice: play(slice, SEED_SIX),
        leftMs: at,
      };
    case 'last':
      return {
        ...base,
        phase: 'running',
        slice: play(slice, SEED_TWELVE),
        leftMs: at,
      };
    case 'paused':
      return {
        ...base,
        phase: 'paused',
        slice: play(slice, SEED_SIX),
        leftMs: at,
      };
    case 'elsewhere':
      return {
        ...base,
        phase: 'elsewhere',
        slice: play(slice, SEED_SIX),
        leftMs: at,
      };
    case 'end':
    case 'end-nopeach': {
      const words = kind === 'end' ? [...all, slice.puzzle.sourceWord] : all;
      const done = play(slice, words);
      const kept = recordOf({
        puzzle: slice.puzzle,
        found: done.found,
        endedEarly: false,
        leftMs: 0,
        clockMs,
      });
      storage.saveRun(
        day,
        { ...kept, peachCardOwed: kept.peach && !p.has('cardShown') },
        true,
      );
      return { ...base, phase: 'over', slice: done, leftMs: 0 };
    }
    default:
      return null;
  }
}

/**
 * Today's state written before the game reads the save, for the pictures of
 * the board after a run and of a run waiting.
 */
export function seedForPictures(data: GameData, storage: GameStorage): void {
  if (!import.meta.env.DEV) return;
  const p = params();
  if (!p) return;
  const seedRun = p.get('seedRun');
  const flight = p.get('flight');
  if (!seedRun && !flight) return;
  const today = new Date();
  const { epoch, words } = data.dailyCalendar;
  const word = dailySourceWord(words, today, epoch);
  const idx = dayIndex(today, STORAGE_EPOCH);
  const puzzle = createPuzzle(
    word,
    data.dictionary,
    data.commonPool,
    data.beyond70Pool,
    data.beyond95Pool,
  );
  if (seedRun === 'end') {
    const done = play(runSlice(puzzle, data.sourceEntry(word), idx), [
      ...SEED_TWELVE,
      'regal',
      word,
    ]);
    const kept = recordOf({
      puzzle,
      found: done.found,
      endedEarly: false,
      leftMs: 0,
      clockMs: RUN_MS,
    });
    storage.saveRun(idx, { ...kept, peachCardOwed: false }, true);
    storage.saveDayProgress(idx, word, kept.words);
  }
  if (flight === 'paused') {
    storage.saveRunInFlight({
      dayIndex: idx,
      sourceWord: word,
      words: SEED_SIX,
      leftMs: Number(p.get('runAt') ?? '48') * 1000,
      clockMs: RUN_MS,
      phase: 'paused',
      tab: 'seed',
    });
  }
}
