import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeGuess, validateGuess, type Puzzle } from '@/engine/index.ts';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import type { SourceEntry } from '@/data/types.ts';
import {
  STORAGE_KEY,
  type GameStorage,
  type RunInFlight,
  type RunRecord,
} from '@/persistence/storage.ts';
import type { Action, Message, PlayApi, Slice, Tile } from '@/ui/useGame.ts';
import {
  clockText,
  markPassed,
  PAUSED_LINE,
  resumedLine,
  runLength,
  startedLine,
  timeLeft,
} from './clock.ts';
import { recordOf, TIMES_UP, timesUpLine } from './record.ts';
import { browserLock, type RushLock } from './lock.ts';
import { runSlice, stepRun } from './play.ts';
import { debugCore } from './debug.ts';

/**
 * Peach rush on the web: one run a day on today's board.
 *
 * **Played apart, carried at the end.** The run is its own slice of today's
 * puzzle. Nothing reaches the basket while the clock runs; when the run ends,
 * by the clock or by End, its words go into the basket at once (`onCarry`).
 *
 * **The letters are hidden whenever the clock isn't running:** before Start
 * and while paused, so neither can be used to study the board for free. The
 * tiles are blank, so no letter is in the page at all.
 *
 * **Leaving pauses it:** the tab hidden, or the page going away (a reload, a
 * closed tab, the back-forward cache). Not the window losing the focus
 * (Antoine, 25 November), so another window in front leaves the clock running.
 *
 * **One run in flight, shared by every tab,** saved at Start, at each find, at
 * each pause and as the page goes. The tab with it going holds the
 * `peach-rush` lock (`lock.ts`), so another tab can tell a run in play from
 * one a crashed tab left: in play, it says so and offers nothing; left, the
 * run comes back paused at its last saved time.
 */

export type RunPhase = 'ready' | 'running' | 'paused' | 'elsewhere' | 'over';

export const READY_LINE = 'Letters show when the clock starts.';
export const ELSEWHERE_LINE = 'This run is going in another tab.';

export interface Core {
  phase: RunPhase;
  slice: Slice;
  /** While running, the `performance.now()` at which the clock reads 0:00. */
  endsAt: number | null;
  /** While not running, what's left on the clock. */
  leftMs: number;
  /** This run's length, read at Start. */
  clockMs: number;
  endedEarly: boolean;
  /** Debug pictures only: the clock stands still. */
  frozen: boolean;
}

export interface RushApi extends PlayApi {
  phase: RunPhase;
  leftMs: number;
  clockMs: number;
  slice: Slice;
  /** Today's run, once it has ended, here or in another tab. */
  record: RunRecord | null;
  /** The time's lines, for their own polite live region. */
  timeSpoken: string;
  start: () => void;
  resume: () => void;
  pause: () => void;
  end: () => void;
  /** The owed peach of a word's card has opened. */
  cardShown: () => void;
}

export function useRush({
  puzzle,
  sourceEntry,
  dayIndex,
  storage,
  audio,
  longerClock,
  onCarry,
  lock: givenLock,
  shown = true,
}: {
  puzzle: Puzzle;
  sourceEntry: SourceEntry | undefined;
  dayIndex: number;
  storage: GameStorage;
  audio: AudioEngine;
  longerClock: boolean;
  /** The run has ended: its words go into today's basket. */
  onCarry: (words: string[]) => void;
  /** The browser's locks by default; null for none, as in a browser without. */
  lock?: RushLock | null;
  /**
   * Peach rush is shown. Hidden, a debug address opens no run and writes
   * nothing; the hook still runs, as hooks must, and starts nothing itself.
   */
  shown?: boolean;
}): RushApi {
  const [lock] = useState(() =>
    givenLock === undefined ? browserLock() : givenLock,
  );
  // This page's own id, so a run in flight knows which tab wrote it.
  const [tab] = useState(() => Math.random().toString(36).slice(2, 10));

  const blank = useCallback(
    (words: readonly string[] = []) =>
      runSlice(puzzle, sourceEntry, dayIndex, words),
    [puzzle, sourceEntry, dayIndex],
  );

  const todayFlight = useCallback((): RunInFlight | null => {
    const f = storage.loadRunInFlight();
    return f && f.dayIndex === dayIndex && f.sourceWord === puzzle.sourceWord
      ? f
      : null;
  }, [storage, dayIndex, puzzle.sourceWord]);

  const fromFlight = useCallback(
    (f: RunInFlight, phase: RunPhase): Core => ({
      phase,
      slice: blank(f.words),
      endsAt: null,
      leftMs: f.leftMs,
      clockMs: f.clockMs,
      endedEarly: false,
      frozen: false,
    }),
    [blank],
  );

  const fromRecord = useCallback(
    (kept: RunRecord): Core => ({
      phase: 'over',
      slice: blank(kept.words),
      endsAt: null,
      leftMs: kept.leftMs,
      clockMs: kept.clockMs,
      endedEarly: kept.endedEarly,
      frozen: false,
    }),
    [blank],
  );

  const [core, setCore] = useState<Core>(() => {
    const seeded = shown ? debugCore(blank(), storage, dayIndex) : null;
    if (seeded) return seeded;
    const kept = storage.loadRun(dayIndex, puzzle.sourceWord);
    if (kept) return fromRecord(kept);
    // A run in flight on today's board comes back paused: a reload's own tab
    // wrote its pause as the page went. One the save calls running belongs
    // to another tab, which the lock checks after the first paint.
    const f = todayFlight();
    if (f)
      return fromFlight(
        f,
        f.phase === 'running' && lock ? 'elsewhere' : 'paused',
      );
    const ms = runLength(longerClock);
    return {
      phase: 'ready',
      slice: blank(),
      endsAt: null,
      leftMs: ms,
      clockMs: ms,
      endedEarly: false,
      frozen: false,
    };
  });
  const coreRef = useRef(core);
  const commit = (next: Core) => {
    coreRef.current = next;
    setCore(next);
  };

  // Read after the core, whose debug seed may have just kept a run.
  const [record, setRecord] = useState<RunRecord | null>(() =>
    storage.loadRun(dayIndex, puzzle.sourceWord),
  );
  const [timeSpoken, setTimeSpoken] = useState('');
  const [now, setNow] = useState(() => performance.now());

  // Before Start, the clock shows the length Start would use.
  useEffect(() => {
    const c = coreRef.current;
    if (c.phase !== 'ready' || c.frozen) return;
    const ms = runLength(longerClock);
    commit({ ...c, leftMs: ms, clockMs: ms });
  }, [longerClock]);

  const leftMs =
    core.phase === 'running' && core.endsAt !== null && !core.frozen
      ? timeLeft(core.endsAt, now)
      : core.leftMs;

  // The lock, held while this tab has the clock running.
  const releaseRef = useRef<(() => Promise<void>) | null>(null);
  const letGo = useCallback(() => {
    const release = releaseRef.current;
    releaseRef.current = null;
    void release?.();
  }, []);
  useEffect(() => letGo, [letGo]);

  const saveFlight = useCallback(
    (c: Core, left: number, phase: 'running' | 'paused') => {
      storage.saveRunInFlight({
        dayIndex,
        sourceWord: puzzle.sourceWord,
        words: [...c.slice.found],
        leftMs: Math.round(left),
        clockMs: c.clockMs,
        phase,
        tab,
      });
    },
    [storage, dayIndex, puzzle.sourceWord, tab],
  );

  const finish = useCallback(
    (early: boolean, left: number) => {
      letGo();
      const done: Core = {
        ...coreRef.current,
        phase: 'over',
        endsAt: null,
        leftMs: left,
        endedEarly: early,
        slice: { ...coreRef.current.slice, composing: [] },
      };
      commit(done);
      const kept = recordOf({
        puzzle,
        found: done.slice.found,
        endedEarly: early,
        leftMs: left,
        clockMs: done.clockMs,
      });
      if (storage.saveRun(dayIndex, kept)) {
        setRecord(kept);
        onCarry(kept.words);
      } else {
        // Another tab kept today's run first: show that one.
        setRecord(storage.loadRun(dayIndex, puzzle.sourceWord));
      }
      if (early) {
        setTimeSpoken('');
      } else {
        audio.playRushEnd();
        setTimeSpoken(timesUpLine(kept));
      }
    },
    [letGo, puzzle, storage, dayIndex, onCarry, audio],
  );

  // The clock: a reading four times a second while it runs.
  const running = core.phase === 'running' && !core.frozen;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  // The marks, each said once as the clock passes it; then the end.
  const lastLeft = useRef(leftMs);
  useEffect(() => {
    const before = lastLeft.current;
    lastLeft.current = leftMs;
    if (!running) return;
    const mark = markPassed(before, leftMs);
    if (mark) {
      setTimeSpoken(mark.said);
      if (mark.at === 10_000) audio.playRushTen();
    }
    if (leftMs <= 0) finish(false, 0);
  }, [leftMs, running, finish, audio]);

  const pause = useCallback(() => {
    const c = coreRef.current;
    if (c.phase !== 'running' || c.endsAt === null) return;
    const left = timeLeft(c.endsAt, performance.now());
    const next: Core = {
      ...c,
      phase: 'paused',
      leftMs: left,
      endsAt: null,
      slice: { ...c.slice, composing: [] },
    };
    commit(next);
    saveFlight(next, left, 'paused');
    letGo();
    setTimeSpoken(PAUSED_LINE);
  }, [saveFlight, letGo]);

  // Leaving pauses: the tab hidden, or the page going away.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
    };
  }, [pause]);

  /** The run as the save has it now, for a tab that wasn't playing it. */
  const reread = useCallback((): Core | null => {
    const kept = storage.loadRun(dayIndex, puzzle.sourceWord);
    if (kept) {
      setRecord(kept);
      return fromRecord(kept);
    }
    const f = todayFlight();
    return f ? fromFlight(f, 'paused') : null;
  }, [
    storage,
    dayIndex,
    puzzle.sourceWord,
    fromRecord,
    todayFlight,
    fromFlight,
  ]);

  // Another tab's writes: it kept today's run, or has the run in flight.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      const c = coreRef.current;
      if (c.phase === 'over' || c.frozen) return;
      const kept = storage.loadRun(dayIndex, puzzle.sourceWord);
      if (kept) {
        setRecord(kept);
        commit(fromRecord(kept));
        return;
      }
      if (c.phase === 'running') return;
      const f = todayFlight();
      if (!f || f.tab === tab) return;
      commit(fromFlight(f, f.phase === 'running' ? 'elsewhere' : 'paused'));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [
    storage,
    dayIndex,
    puzzle.sourceWord,
    tab,
    fromRecord,
    todayFlight,
    fromFlight,
  ]);

  // While another tab has the run, watch its lock. Free now, or freed later
  // by a pause, an end, a closed tab or a crash: the run comes back paused,
  // at the time it last saved.
  const elsewhere = core.phase === 'elsewhere';
  useEffect(() => {
    if (!elsewhere || !lock) return;
    const stop = new AbortController();
    let live = true;
    const takeBack = () => {
      if (!live || coreRef.current.phase !== 'elsewhere') return;
      const back = reread();
      if (back) commit(back);
    };
    void lock.held().then((held) => {
      if (!held) takeBack();
    });
    void lock.whenFree(stop.signal).then(takeBack);
    return () => {
      live = false;
      stop.abort();
    };
  }, [elsewhere, lock, reread]);

  const starting = useRef(false);
  const begin = useCallback(() => {
    const c = coreRef.current;
    if ((c.phase !== 'ready' && c.phase !== 'paused') || starting.current)
      return;
    // The save first: another tab may have kept a run, or have this one.
    const kept = storage.loadRun(dayIndex, puzzle.sourceWord);
    if (kept) {
      setRecord(kept);
      commit(fromRecord(kept));
      return;
    }
    const f = todayFlight();
    if (f && f.phase === 'running' && f.tab !== tab && !lock) {
      commit(fromFlight(f, 'elsewhere'));
      return;
    }
    const from = f ? fromFlight(f, 'paused') : c;
    const go = (release: (() => Promise<void>) | null) => {
      releaseRef.current = release;
      const t = performance.now();
      const next: Core = {
        ...from,
        phase: 'running',
        endsAt: t + from.leftMs,
        frozen: false,
      };
      commit(next);
      setNow(t);
      saveFlight(next, from.leftMs, 'running');
      setTimeSpoken(
        from.phase === 'ready'
          ? startedLine(from.leftMs)
          : resumedLine(from.leftMs),
      );
    };
    if (!lock) {
      go(null);
      return;
    }
    starting.current = true;
    void lock.take().then((release) => {
      starting.current = false;
      if (coreRef.current !== c) {
        // Something moved while the lock was asked for: a pause, another
        // tab's end. The press is spent.
        void release?.();
        return;
      }
      if (release) go(release);
      // Another tab has it going.
      else commit({ ...from, phase: 'elsewhere' });
    });
  }, [
    storage,
    dayIndex,
    puzzle.sourceWord,
    tab,
    lock,
    fromRecord,
    todayFlight,
    fromFlight,
    saveFlight,
  ]);

  const end = useCallback(() => {
    const c = coreRef.current;
    if (c.phase !== 'running' && c.phase !== 'paused') return;
    const left =
      c.phase === 'running' && c.endsAt !== null
        ? timeLeft(c.endsAt, performance.now())
        : c.leftMs;
    finish(true, left);
  }, [finish]);

  const act = useCallback((action: Action) => {
    const c = coreRef.current;
    if (c.phase !== 'running') return null;
    const next = { ...c, slice: stepRun(c.slice, action) };
    commit(next);
    return next;
  }, []);

  const composedWord = useMemo(
    () =>
      core.slice.composing
        .map((id) => core.slice.tiles[id]?.letter ?? '')
        .join(''),
    [core.slice.composing, core.slice.tiles],
  );

  const submit = useCallback(() => {
    const c = coreRef.current;
    if (c.phase !== 'running') return;
    const word = normalizeGuess(
      c.slice.composing.map((id) => c.slice.tiles[id]?.letter ?? '').join(''),
    );
    const result = validateGuess(word, c.slice.puzzle, c.slice.foundSet);
    const next = act({ type: 'SUBMIT_RESULT', result });
    if (result.kind !== 'valid') {
      audio.playInvalid();
      return;
    }
    if (result.isSourceWord) audio.playSource();
    else audio.playFound(result.word.length, result.rung);
    // Each find is saved, so a closed tab loses no word.
    if (next && next.endsAt !== null)
      saveFlight(next, timeLeft(next.endsAt, performance.now()), 'running');
  }, [act, audio, saveFlight]);

  const showLetters = core.phase === 'running' || core.phase === 'over';
  const tiles = useMemo<Tile[]>(
    () =>
      showLetters
        ? core.slice.tiles
        : core.slice.tiles.map((t) => ({ id: t.id, letter: '' })),
    [showLetters, core.slice.tiles],
  );

  const message = useMemo<Message | null>(() => {
    const plain = (text: string): Message => ({
      body: { kind: 'plain', text },
      tone: 'info',
    });
    if (core.phase === 'ready') return plain(READY_LINE);
    if (core.phase === 'paused') return plain(PAUSED_LINE);
    if (core.phase === 'elsewhere') return plain(ELSEWHERE_LINE);
    if (core.phase === 'over')
      return plain(
        core.endedEarly
          ? `Ended with ${clockText(core.leftMs)} left.`
          : `${TIMES_UP}.`,
      );
    return core.slice.message;
  }, [core]);

  const cardShown = useCallback(() => {
    setRecord((r) => {
      if (!r || !r.peachCardOwed) return r;
      const next = { ...r, peachCardOwed: false };
      storage.saveRun(dayIndex, next, true);
      return next;
    });
  }, [storage, dayIndex]);

  return {
    state: {
      tiles,
      rackOrder: core.slice.rackOrder,
      composing: core.slice.composing,
      message,
      revealOpen: false,
    },
    composedWord,
    addTile: useCallback(
      (id: number) => {
        if (act({ type: 'ADD_TILE', id })) audio.tick();
      },
      [act, audio],
    ),
    addLetter: useCallback(
      (letter: string) => {
        if (act({ type: 'ADD_LETTER', letter })) audio.tick();
      },
      [act, audio],
    ),
    removeLast: useCallback(() => void act({ type: 'REMOVE_LAST' }), [act]),
    clear: useCallback(() => void act({ type: 'CLEAR' }), [act]),
    shuffle: useCallback(() => {
      if (act({ type: 'SHUFFLE' })) audio.playShuffle();
    }, [act, audio]),
    submit,
    phase: core.phase,
    leftMs,
    clockMs: core.clockMs,
    slice: core.slice,
    record,
    timeSpoken,
    start: begin,
    resume: begin,
    pause,
    end,
    cardShown,
  };
}
