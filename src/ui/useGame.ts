import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  computeTier,
  createPuzzle,
  dailySourceWord,
  dayIndex,
  endlessSourceWord,
  normalizeGuess,
  STORAGE_EPOCH,
  STREAK_TIER_INDEX,
  validateGuess,
  type GuessResult,
  type Puzzle,
  type TierStanding,
} from '@/engine/index.ts';
import { RUNG_NAMES } from './rarity.ts';
import {
  copy,
  sourceFoundAnnouncement,
  sourceFoundMessage,
} from './themeCopy.ts';
import type { Theme } from './useTheme.ts';
import type { GameData } from '@/data/gameData.ts';
import type { SourceEntry } from '@/data/types.ts';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';

export type Mode = 'daily' | 'endless';

export interface Tile {
  readonly id: number;
  readonly letter: string;
}

/**
 * What a feedback line says. Most lines are fixed text, settled the moment they
 * are produced. The source-word find is the one skinned line: state records the
 * find, never its wording, so the view supplies the active theme's framing and a
 * theme switch re-skins it live. The same split the rank label already uses.
 */
export type MessageBody =
  | { readonly kind: 'plain'; readonly text: string }
  | { readonly kind: 'source-found' }
  // A find inside the set. The word is structure, the framing is a skin, so the
  // reducer records which word landed and the view says it in the active
  // theme's vocabulary. Resolving here would freeze it at find time.
  | { readonly kind: 'set-found'; readonly word: string };

export interface Message {
  readonly body: MessageBody;
  readonly tone: 'info' | 'success' | 'error';
}

/**
 * The spoken twin of a message body. The source-word find carries the word (the
 * live region names it, the visible line leaves that to the reveal card) and the
 * tail: the rank or completion cue that follows the framing and is never skinned.
 */
export type AnnouncementBody =
  | { readonly kind: 'plain'; readonly text: string }
  | {
      readonly kind: 'source-found';
      readonly word: string;
      readonly tail: string;
    };

export interface Announcement {
  readonly body: AnnouncementBody;
  /** Bumped each time so screen readers re-announce identical text. */
  readonly seq: number;
}

/** What the message line reads under the active theme. */
export function messageText(message: Message, theme: Theme): string {
  const { body } = message;
  if (body.kind === 'plain') return body.text;
  if (body.kind === 'set-found') return copy(theme).setFind(body.word);
  return sourceFoundMessage(theme);
}

/** What the live region announces under the active theme. */
export function announcementText(
  announcement: Announcement,
  theme: Theme,
): string {
  const { body } = announcement;
  return body.kind === 'plain'
    ? body.text
    : sourceFoundAnnouncement(theme, body.word) + body.tail;
}

/**
 * The text the live region holds. An announcement is a point in time, not a
 * label: it is resolved in the theme that was on screen when it fired and then
 * held still. A screen reader speaks a polite region whenever its text changes,
 * so re-resolving on a theme switch would speak a stale find over again, with
 * no new find behind it. The visible message is a label and does re-skin live.
 *
 * Keyed by the announcement itself, which the reducer already counts. The count
 * is per mode (each slice starts its own at zero), so the key names the mode
 * too, or a fresh Endless would read as the daily's last event.
 */
export function useAnnouncedText(
  announcement: Announcement,
  mode: Mode,
  theme: Theme,
): string {
  const [spoken, setSpoken] = useState({ key: '', text: '' });
  const key = `${mode}:${announcement.seq}`;
  // Settling this during render (React's own adjust-state-on-change pattern)
  // keeps the region and the visible message in one paint, so the two never
  // disagree about which find is the current one.
  if (spoken.key !== key) {
    setSpoken({ key, text: announcementText(announcement, theme) });
  }
  return spoken.text;
}

/**
 * One mode's game. Daily and Endless each hold their own slice, so switching
 * modes is a view change and never disturbs the other.
 */
interface Slice {
  puzzle: Puzzle;
  sourceEntry: SourceEntry | undefined;
  /** Calendar day for the daily; null for endless. */
  dayIndex: number | null;
  tiles: Tile[];
  rackOrder: number[];
  composing: number[];
  found: string[];
  foundSet: Set<string>;
  tier: TierStanding;
  totalScore: number;
  sourceRevealed: boolean;
  revealOpen: boolean;
  /** The one-time Edition Complete card is showing. Transient, never persisted. */
  editionOpen: boolean;
  message: Message | null;
  announcement: Announcement;
}

interface SlicePayload {
  puzzle: Puzzle;
  sourceEntry: SourceEntry | undefined;
  dayIndex: number | null;
  restoreFound: string[];
}

interface Game {
  mode: Mode;
  daily: Slice;
  /** Null until Endless is first entered, then persists until New Puzzle. */
  endless: Slice | null;
}

/** The flattened view the UI reads: the active slice plus the current mode. */
export type GameView = Slice & { mode: Mode };

type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_ENDLESS'; slice: Slice }
  | { type: 'ADD_TILE'; id: number }
  | { type: 'ADD_LETTER'; letter: string }
  | { type: 'REMOVE_LAST' }
  | { type: 'CLEAR' }
  | { type: 'SHUFFLE' }
  | { type: 'SUBMIT_RESULT'; result: GuessResult }
  | { type: 'OPEN_REVEAL' }
  | { type: 'CLOSE_REVEAL' }
  | { type: 'CLOSE_EDITION' }
  | { type: 'PREVIEW'; kind: string };

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function tilesFor(puzzle: Puzzle): Tile[] {
  return [...puzzle.letters].map((letter, id) => ({ id, letter }));
}

function buildSlice(payload: SlicePayload): Slice {
  const tiles = tilesFor(payload.puzzle);
  const found = payload.restoreFound.filter((w) =>
    payload.puzzle.validationWords.has(w),
  );
  const tier = computeTier(new Set(found), payload.puzzle);
  return {
    puzzle: payload.puzzle,
    sourceEntry: payload.sourceEntry,
    dayIndex: payload.dayIndex,
    tiles,
    rackOrder: shuffled(tiles.map((t) => t.id)),
    composing: [],
    found,
    foundSet: new Set(found),
    tier,
    // The score is the points ladder's numerator: every find by length plus its
    // rarity bonus, set and off-page alike. Single-sourced from the tier so the
    // bar, the label, and this readout can never disagree.
    totalScore: tier.score,
    sourceRevealed: found.includes(payload.puzzle.sourceWord),
    revealOpen: false,
    // Rehydrated games never reopen the card; it fires only on the live moment.
    editionOpen: false,
    message: null,
    announcement: { body: { kind: 'plain', text: '' }, seq: 0 },
  };
}

function letterOf(slice: Slice, id: number): string {
  return slice.tiles[id]?.letter ?? '';
}

function bump(prev: Announcement, body: AnnouncementBody): Announcement {
  return { body, seq: prev.seq + 1 };
}

function messageForRejection(
  result: Exclude<GuessResult, { kind: 'valid' }>,
): string {
  switch (result.kind) {
    case 'too-short':
      return 'Too short. Words need three letters or more.';
    case 'not-a-word':
      return 'Not in the word list. Try another.';
    case 'already-found':
      return 'Already found. Keep going.';
  }
}

/** Gameplay actions, applied to whichever slice is active. */
function reduceSlice(slice: Slice, action: Action): Slice {
  switch (action.type) {
    case 'ADD_TILE':
      if (slice.composing.includes(action.id)) return slice;
      return { ...slice, composing: [...slice.composing, action.id] };

    case 'ADD_LETTER': {
      const id = slice.rackOrder.find(
        (tileId) =>
          letterOf(slice, tileId) === action.letter &&
          !slice.composing.includes(tileId),
      );
      if (id === undefined) return slice;
      return { ...slice, composing: [...slice.composing, id] };
    }

    case 'REMOVE_LAST':
      return { ...slice, composing: slice.composing.slice(0, -1) };

    case 'CLEAR':
      return { ...slice, composing: [] };

    case 'SHUFFLE':
      return { ...slice, rackOrder: shuffled(slice.rackOrder) };

    case 'SUBMIT_RESULT': {
      const { result } = action;
      if (result.kind !== 'valid') {
        const text = messageForRejection(result);
        return {
          ...slice,
          composing: [],
          message: { body: { kind: 'plain', text }, tone: 'error' },
          announcement: bump(slice.announcement, { kind: 'plain', text }),
        };
      }

      const found = [...slice.found, result.word];
      const foundSet = new Set(found);
      const tier = computeTier(foundSet, slice.puzzle);
      const justRevealed = result.isSourceWord && !slice.sourceRevealed;
      // Edition Complete stays a set-completion event (every set word found),
      // decoupled from the points ladder. Non-terminal: play continues. Stage 2
      // retargets this to the true-completion crown.
      const justComplete =
        slice.tier.setFound < slice.tier.setTotal &&
        tier.setFound >= tier.setTotal;

      const points = `${result.score} ${result.score === 1 ? 'point' : 'points'}`;
      // Rank name is theme-skinned in the view; the spoken cue stays generic.
      // The crown name is theme-skinned in the view; the spoken cue stays
      // generic, like the tier-up cue. Completion is the word-count peak.
      const tail = justComplete
        ? ' Completed. Every common word found.'
        : tier.index > slice.tier.index
          ? ' New rank.'
          : '';
      // The screen reader hears the rung on every off-page find ("Rare find: ...").
      const announceBody: AnnouncementBody = result.isSourceWord
        ? { kind: 'source-found', word: result.word, tail }
        : {
            kind: 'plain',
            text:
              (result.rung === 'set'
                ? `${result.word}, ${points}.`
                : `${RUNG_NAMES[result.rung]} find: ${result.word}, ${points}.`) +
              tail,
          };

      const messageBody: MessageBody = result.isSourceWord
        ? { kind: 'source-found' }
        : result.rung === 'set'
          ? { kind: 'set-found', word: result.word }
          : {
              kind: 'plain',
              text: `${result.word}, ${RUNG_NAMES[result.rung].toLowerCase()} find.`,
            };

      return {
        ...slice,
        composing: [],
        found,
        foundSet,
        tier,
        totalScore: tier.score,
        sourceRevealed: slice.sourceRevealed || result.isSourceWord,
        revealOpen: justRevealed ? true : slice.revealOpen,
        editionOpen: justComplete ? true : slice.editionOpen,
        message: { body: messageBody, tone: 'success' },
        announcement: bump(slice.announcement, announceBody),
      };
    }

    case 'OPEN_REVEAL':
      return { ...slice, revealOpen: true };

    case 'CLOSE_REVEAL':
      return { ...slice, revealOpen: false };

    case 'CLOSE_EDITION':
      return { ...slice, editionOpen: false };

    // Dev only: jump straight to a big moment. Gated at the dispatch site so it
    // is unreachable in a production build.
    case 'PREVIEW': {
      const source = slice.puzzle.sourceWord;
      const all = [...slice.puzzle.commonWords];
      const nonSource = all.filter((w) => w !== source);
      let words = all;
      let revealOpen = false;
      let editionOpen = false;
      if (action.kind === 'source-reveal') {
        words = [source];
        revealOpen = true;
      } else if (action.kind === 'tier-up') {
        // A high rung, not complete: source plus all but one other word.
        words = [
          source,
          ...nonSource.slice(0, Math.max(0, nonSource.length - 1)),
        ];
      } else if (action.kind === 'edition-complete') {
        editionOpen = true;
      } else {
        return slice;
      }
      const foundSet = new Set(words);
      const tier = computeTier(foundSet, slice.puzzle);
      return {
        ...slice,
        found: words,
        foundSet,
        tier,
        totalScore: tier.score,
        sourceRevealed: words.includes(source),
        revealOpen,
        editionOpen,
      };
    }

    default:
      return slice;
  }
}

function reduce(game: Game, action: Action): Game {
  switch (action.type) {
    // The toggle is a view change only: it never regenerates either puzzle.
    case 'SET_MODE':
      return game.mode === action.mode ? game : { ...game, mode: action.mode };

    // First entry into Endless, and New Puzzle, both replace only this slice.
    case 'SET_ENDLESS':
      return { ...game, endless: action.slice };

    default: {
      if (game.mode === 'endless') {
        if (!game.endless) return game;
        const next = reduceSlice(game.endless, action);
        return next === game.endless ? game : { ...game, endless: next };
      }
      const next = reduceSlice(game.daily, action);
      return next === game.daily ? game : { ...game, daily: next };
    }
  }
}

export interface GameApi {
  state: GameView;
  composedWord: string;
  addTile: (id: number) => void;
  addLetter: (letter: string) => void;
  removeLast: () => void;
  clear: () => void;
  shuffle: () => void;
  submit: () => void;
  setMode: (mode: Mode) => void;
  newEndless: () => void;
  openReveal: () => void;
  closeReveal: () => void;
  closeEdition: () => void;
  toggleMute: () => void;
  muted: boolean;
  streak: number;
  /**
   * Increments once on the submit that completes the set, the same beat the
   * Edition cue plays. A monotonic pulse, not the editionOpen flag: editionOpen
   * lives per slice and toggles on a mode switch, which would re-fire a burst.
   */
  editionPulse: number;
}

export function useGame(
  data: GameData,
  audio: AudioEngine,
  storage: GameStorage = new GameStorage(),
): GameApi {
  const makeDailyPayload = useCallback((): SlicePayload => {
    const today = new Date();
    // Two epochs on purpose. The crown is selected from the calendar's movable
    // epoch (re-anchored by a regeneration), but the storage and streak key is
    // days since the fixed STORAGE_EPOCH, so re-anchoring the calendar never
    // shifts day keys and a streak survives a regeneration with no migration.
    const { epoch, words } = data.dailyCalendar;
    const idx = dayIndex(today, STORAGE_EPOCH);
    const word = dailySourceWord(words, today, epoch);
    return {
      puzzle: createPuzzle(
        word,
        data.dictionary,
        data.commonPool,
        data.beyond70Pool,
        data.beyond95Pool,
      ),
      sourceEntry: data.sourceEntry(word),
      dayIndex: idx,
      restoreFound: storage.loadDayProgress(idx, word),
    };
  }, [data, storage]);

  const endlessPayload = useCallback(
    (word: string, restoreFound: string[]): SlicePayload => ({
      puzzle: createPuzzle(
        word,
        data.dictionary,
        data.commonPool,
        data.beyond70Pool,
        data.beyond95Pool,
      ),
      sourceEntry: data.sourceEntry(word),
      dayIndex: null,
      restoreFound,
    }),
    [data],
  );

  const freshEndlessSlice = useCallback((): Slice => {
    // Endless draws from the same eligible calendar words as the daily, so a
    // sub-floor word never headlines endless either.
    const word = endlessSourceWord(data.dailyCalendar.words);
    return buildSlice(endlessPayload(word, []));
  }, [data, endlessPayload]);

  const [game, dispatch] = useReducer(reduce, undefined, (): Game => {
    const stored = storage.loadEndless();
    // Only rehydrate a stored word the data still knows, so the reveal works.
    const endless =
      stored && data.sourceEntry(stored.sourceWord)
        ? buildSlice(endlessPayload(stored.sourceWord, stored.found))
        : null;
    return { mode: 'daily', daily: buildSlice(makeDailyPayload()), endless };
  });

  const active =
    game.mode === 'endless' && game.endless ? game.endless : game.daily;

  const view = useMemo<GameView>(
    () => ({ mode: game.mode, ...active }),
    [game.mode, active],
  );

  const composedWord = useMemo(
    () => active.composing.map((id) => active.tiles[id]?.letter ?? '').join(''),
    [active.composing, active.tiles],
  );

  // Persist daily progress only when durable state changes. The composing word
  // is transient, so keying on found (plus the puzzle identity) keeps tile taps,
  // backspace, clear, and shuffle off the synchronous disk-write path.
  const dailyDayIndex = game.daily.dayIndex;
  const dailyWord = game.daily.puzzle.sourceWord;
  const dailyFound = game.daily.found;
  useEffect(() => {
    if (dailyDayIndex !== null) {
      storage.saveDayProgress(dailyDayIndex, dailyWord, dailyFound);
    }
  }, [dailyFound, dailyDayIndex, dailyWord, storage]);

  // Same for endless: persist identity plus progress, never the composing word.
  const endlessWord = game.endless?.puzzle.sourceWord;
  const endlessFound = game.endless?.found;
  useEffect(() => {
    if (endlessWord !== undefined && endlessFound !== undefined) {
      storage.saveEndless(endlessWord, endlessFound);
    }
  }, [endlessFound, endlessWord, storage]);

  // Record the streak once the daily reaches the streak tier.
  const streakRecorded = useRef(false);
  useEffect(() => {
    const d = game.daily;
    if (
      d.dayIndex !== null &&
      d.tier.index >= STREAK_TIER_INDEX &&
      !streakRecorded.current
    ) {
      streakRecorded.current = true;
      storage.recordDailyCleared(d.dayIndex);
    }
  }, [game.daily, storage]);

  // Dev only: force-fire a big moment via ?preview=edition-complete |
  // source-reveal | tier-up. The guard is compiled out of production builds, so
  // the trigger is unreachable in the shipped UI.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const kind = new URLSearchParams(window.location.search).get('preview');
    if (kind) dispatch({ type: 'PREVIEW', kind });
    // So the preview shows the whole beat, including the cute confetti, which
    // rides the completion pulse rather than the editionOpen flag.
    if (kind === 'edition-complete') setEditionPulse((p) => p + 1);
  }, []);

  const submit = useCallback(() => {
    const word = normalizeGuess(composedWord);
    const result = validateGuess(word, active.puzzle, active.foundSet);
    dispatch({ type: 'SUBMIT_RESULT', result });
    if (result.kind !== 'valid') {
      audio.playInvalid();
      return;
    }
    // Did this find complete the set? Count-based, like the bar: the last set
    // word triggers the grander Edition cue, which takes over from the found cue.
    const wasComplete = active.tier.setFound >= active.tier.setTotal;
    const nowComplete =
      active.tier.setFound + (result.rung === 'set' ? 1 : 0) >=
      active.tier.setTotal;
    if (!wasComplete && nowComplete) {
      audio.playEdition();
      // One coordinated beat: the burst rides the same completion as the cue.
      setEditionPulse((p) => p + 1);
    } else if (result.isSourceWord) audio.playSource();
    else audio.playFound(result.word.length, result.rung);
  }, [composedWord, active.puzzle, active.tier, active.foundSet, audio]);

  const setMode = useCallback(
    (mode: Mode) => {
      // Generate Endless on first entry only; never regenerate on a switch.
      if (mode === 'endless' && game.endless === null) {
        dispatch({ type: 'SET_ENDLESS', slice: freshEndlessSlice() });
      }
      dispatch({ type: 'SET_MODE', mode });
    },
    [game.endless, freshEndlessSlice],
  );

  const newEndless = useCallback(() => {
    dispatch({ type: 'SET_ENDLESS', slice: freshEndlessSlice() });
  }, [freshEndlessSlice]);

  const [editionPulse, setEditionPulse] = useState(0);

  const [muted, setMuted] = useState(audio.muted);
  const toggleMute = useCallback(() => {
    const next = !audio.muted;
    audio.setMuted(next);
    setMuted(next);
  }, [audio]);

  const addTile = useCallback(
    (id: number) => {
      dispatch({ type: 'ADD_TILE', id });
      audio.tick();
    },
    [audio],
  );

  const addLetter = useCallback(
    (letter: string) => {
      dispatch({ type: 'ADD_LETTER', letter });
      audio.tick();
    },
    [audio],
  );

  return {
    state: view,
    composedWord,
    addTile,
    addLetter,
    removeLast: useCallback(() => dispatch({ type: 'REMOVE_LAST' }), []),
    clear: useCallback(() => dispatch({ type: 'CLEAR' }), []),
    shuffle: useCallback(() => dispatch({ type: 'SHUFFLE' }), []),
    submit,
    setMode,
    newEndless,
    openReveal: useCallback(() => dispatch({ type: 'OPEN_REVEAL' }), []),
    closeReveal: useCallback(() => dispatch({ type: 'CLOSE_REVEAL' }), []),
    closeEdition: useCallback(() => dispatch({ type: 'CLOSE_EDITION' }), []),
    toggleMute,
    muted,
    streak: storage.currentStreak(game.daily.dayIndex ?? 0),
    editionPulse,
  };
}
