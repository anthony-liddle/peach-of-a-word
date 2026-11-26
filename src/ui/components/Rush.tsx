import { useEffect, useId, useRef, useState } from 'react';
import { classifyWord, findScore } from '@/engine/index.ts';
import { APP_DISPLAY_NAME } from '@/displayName.ts';
import type { RunRecord } from '@/persistence/storage.ts';
import type { RushApi } from '@/rush/useRush.ts';
import type { RushStanding } from '@/rush/offer.ts';
import { clockSpoken, clockText } from '@/rush/clock.ts';
import { runTally, TIMES_UP } from '@/rush/record.ts';
import { runShareText } from '@/rush/share.ts';
import { useAnnouncedText, type Slice } from '../useGame.ts';
import { useGlobalKeys } from '../useGlobalKeys.ts';
import { useTheme } from '../useTheme.ts';
import { copy } from '../themeCopy.ts';
import { shareDaily } from '../share/shareDaily.ts';
import { ComposingStick } from './ComposingStick.tsx';
import { TypeCase } from './TypeCase.tsx';
import { Controls } from './Controls.tsx';
import { Mark } from './Mark.tsx';

/**
 * Peach rush's run. It takes the page: the masthead, the toolbar and the
 * footer step aside (`Game`), so the clock, the well, the rack and the
 * controls fit the SE's Safari at the largest text. Its header is one row:
 * the way back before Start and while paused, the name, the clock, and End
 * once it has started. Then the bar, then the tally.
 */
export function RunView({
  run,
  keysOff,
  onBack,
  onAskEnd,
}: {
  run: RushApi;
  /** A card or a question is up, so the run's keys stand down. */
  keysOff: boolean;
  /** Back to the board, the run kept: before Start, or paused. */
  onBack: () => void;
  onAskEnd: () => void;
}) {
  const [theme] = useTheme();
  const name = copy(theme).rushName;
  const tilesRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // Nothing reaches the run before Start or while paused: its keys are on
  // only while the clock runs.
  useGlobalKeys(run, keysOff || run.phase !== 'running', tilesRef);
  const spokenFind = useAnnouncedText(run.slice.announcement, 'run', theme);
  const { slice, phase, leftMs, clockMs } = run;
  const last = phase === 'running' && leftMs <= 10_000;
  const words = [...slice.found].reverse();
  const covered =
    phase === 'ready' || phase === 'paused' || phase === 'elsewhere';

  // Start or Resume has the focus while the letters are hidden, so Enter
  // starts; then the tiles, where typing goes.
  useEffect(() => {
    if (covered) startRef.current?.focus({ preventScroll: true });
    else if (phase === 'running')
      tilesRef.current?.focus({ preventScroll: true });
  }, [covered, phase]);

  return (
    <>
      {/* Behind the result, a card or End's question, the run is out of reach,
        for a screen reader as for a pointer. Its two live regions sit
        outside it, so Time's up and a mark under End's question are said. */}
      <div className="board board--run" inert={keysOff}>
        <div className="play">
          <section className="runhead" aria-label={name}>
            <div className="runhead__row">
              {phase === 'ready' || phase === 'paused' ? (
                <button
                  type="button"
                  className="runhead__back"
                  aria-label="Back to the board"
                  title="Back to the board"
                  onClick={onBack}
                >
                  <span aria-hidden="true">‹</span>
                </button>
              ) : null}
              <p className="runhead__name">{name}</p>
              <div
                role="timer"
                aria-label={`Time left, ${clockSpoken(leftMs)}`}
                className={
                  last
                    ? 'runhead__clock runhead__clock--last'
                    : 'runhead__clock'
                }
              >
                {clockText(leftMs)}
              </div>
              {phase === 'running' || phase === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--header runhead__end"
                  onClick={onAskEnd}
                >
                  End
                </button>
              ) : null}
            </div>
            <div className="runhead__track" aria-hidden="true">
              <span
                className={
                  last ? 'runhead__fill runhead__fill--last' : 'runhead__fill'
                }
                style={{ width: `${(leftMs / clockMs) * 100}%` }}
              />
            </div>
            <p className="runhead__tally">
              <strong>{slice.totalScore}</strong>{' '}
              {slice.totalScore === 1 ? 'point' : 'points'} ·{' '}
              {slice.found.length} {slice.found.length === 1 ? 'word' : 'words'}
            </p>
          </section>
          <ComposingStick game={run} />
          {/* While the letters are hidden the tiles are blank and inert: no
            letter is in the page, for the eye, find-in-page or a screen
            reader. */}
          <div className="runrack">
            <div inert={covered}>
              <TypeCase game={run} ref={tilesRef} />
            </div>
            {covered && (
              <div className="runrack__cover">
                {phase !== 'elsewhere' && (
                  <button
                    ref={startRef}
                    type="button"
                    className="btn btn--primary runrack__start"
                    onClick={phase === 'ready' ? run.start : run.resume}
                  >
                    {phase === 'ready' ? 'Start' : 'Resume'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div inert={phase !== 'running'}>
            <Controls game={run} />
          </div>
        </div>

        <section
          className="found runfound"
          aria-label="Words found in this run"
        >
          <h2 className="found__title">This run</h2>
          {words.length === 0 ? (
            <p className="found__empty">No words yet.</p>
          ) : (
            <ul className="found__words">
              {words.map((w) => (
                <li key={w} className="found__word-item">
                  <RunWord word={w} slice={slice} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Finds, as the basket says them; and the time, at its marks, in a
        region of its own so neither speaks over the other's text. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {spokenFind}
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {run.timeSpoken}
      </div>
    </>
  );
}

/** A run's word as the found list draws it: a word mid-run, a button after. */
function RunWord({
  word,
  slice,
  onOpen,
}: {
  word: string;
  slice: Pick<Slice, 'puzzle'>;
  onOpen?: (word: string, trigger: HTMLElement) => void;
}) {
  const category =
    word === slice.puzzle.sourceWord
      ? 'source'
      : classifyWord(word, slice.puzzle);
  const score = findScore(word, classifyWord(word, slice.puzzle));
  const inner = (
    <>
      <Mark category={category} costume={null} />
      <span className="found__wordtext">{word}</span>
      <span className="found__points">+{score}</span>
    </>
  );
  return onOpen ? (
    <button
      type="button"
      className={`found__word found__word--${category}`}
      data-opens-card=""
      onClick={(e) => onOpen(word, e.currentTarget)}
    >
      {inner}
    </button>
  ) : (
    <span className={`found__word found__word--${category}`}>{inner}</span>
  );
}

/**
 * The run's result: what it found, each word opening its card, the run's own
 * Share, and the way to the basket. The web has no title, so it has no Done
 * (Antoine, 25 November): On to the basket is its way out, and Escape is too.
 */
export function RunEndCard({
  record,
  slice,
  date,
  onBasket,
  onOpenWord,
}: {
  record: RunRecord;
  slice: Pick<Slice, 'puzzle'>;
  date: Date;
  onBasket: () => void;
  onOpenWord: (word: string, trigger: HTMLElement) => void;
}) {
  const [theme] = useTheme();
  const t = copy(theme);
  const headingId = useId();
  const descId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onBasket();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBasket]);

  const heading = record.endedEarly
    ? `Ended with ${clockText(record.leftMs)} left`
    : TIMES_UP;
  const words = [...record.words].reverse();

  async function share() {
    const text = runShareText(
      record,
      APP_DISPLAY_NAME,
      t.rushName,
      date,
      clockText(record.clockMs),
    );
    try {
      const out = await shareDaily(text);
      setConfirm(out.method === 'clipboard' ? out.confirmation : null);
    } catch {
      // Dismissed: nothing to say.
    }
  }

  return (
    <div className="reveal-backdrop">
      {/* Described by the tally, so moving focus here says it even when the
          live region's "Time's up" was cut off. */}
      <div
        className="reveal runend"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descId}
      >
        <div className="reveal__scroll">
          <p className="reveal__kicker">{t.rushName}</p>
          <h2 className="runend__title" id={headingId}>
            {heading}
          </h2>
          <div className="reveal__sep" />
          <p className="runend__stats" id={descId}>
            <span className="runend__stat">
              <strong>{record.words.length}</strong>{' '}
              {record.words.length === 1 ? 'word' : 'words'}
            </span>
            <span className="runend__stat">
              <strong>{record.points}</strong>{' '}
              {record.points === 1 ? 'point' : 'points'}
            </span>
          </p>
          {record.peach ? (
            <div className="runend__peach">
              <p className="runend__line">You found the peach of a word</p>
              <RunWord
                word={record.sourceWord}
                slice={slice}
                onOpen={onOpenWord}
              />
            </div>
          ) : (
            <p className="runend__line">The peach of a word stayed hidden.</p>
          )}
          {record.best && (
            <p className="runend__best">
              Best word: {record.best.word}, {record.best.points}{' '}
              {record.best.points === 1 ? 'point' : 'points'}
            </p>
          )}
          <ul className="found__words runend__words">
            {words
              .filter((w) => w !== record.sourceWord)
              .map((w) => (
                <li key={w} className="found__word-item">
                  <RunWord word={w} slice={slice} onOpen={onOpenWord} />
                </li>
              ))}
          </ul>
        </div>
        <div className="reveal__way-out runend__way-out">
          <button
            ref={firstRef}
            type="button"
            className="reveal__close"
            onClick={onBasket}
          >
            {t.runToBasket}
          </button>
          <div className="share share--quiet">
            <button type="button" className="share__btn" onClick={share}>
              Share
            </button>
            <p className="share__confirm" aria-live="polite" aria-atomic="true">
              {confirm ?? ''}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * End's question. The clock keeps running under it, as in the app. Keep
 * playing has the focus and Escape is Keep playing, so a stray key never ends
 * the day's one run.
 */
export function EndAsk({
  onEnd,
  onKeep,
}: {
  onEnd: () => void;
  onKeep: () => void;
}) {
  const headingId = useId();
  const msgId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onKeep();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeep]);
  return (
    <div className="reveal-backdrop endask-backdrop">
      <div
        className="endask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={msgId}
      >
        <h2 className="endask__title" id={headingId}>
          End the run?
        </h2>
        <p className="endask__msg" id={msgId}>
          It&rsquo;s your one today.
        </p>
        <div className="endask__buttons">
          <button type="button" className="btn btn--utility" onClick={onEnd}>
            End
          </button>
          <button
            ref={keepRef}
            type="button"
            className="btn btn--primary"
            onClick={onKeep}
          >
            Keep playing
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where today starts while Peach rush is offered: in the board, where the
 * meter goes, with the tiles blank (Antoine, 25 November). Play shows the
 * letters; Peach rush opens the run. With a run waiting, it says the time
 * left, or that another tab has it. In the page, not over it, so it leaves
 * the focus where the page has it.
 */
export function StartChoice({
  phase,
  leftMs,
  clockMs,
  onPlay,
  onRush,
}: {
  phase: RushApi['phase'];
  leftMs: number;
  clockMs: number;
  onPlay: () => void;
  onRush: () => void;
}) {
  const [theme] = useTheme();
  const t = copy(theme);
  const away = phase === 'elsewhere';
  const waiting = phase === 'paused' || phase === 'running';
  const detail = away
    ? 'In another tab'
    : waiting
      ? `${clockText(leftMs)} left`
      : clockText(clockMs);
  const spoken = away
    ? `${t.rushName}, going in another tab`
    : waiting
      ? `${t.rushName}, paused, ${clockSpoken(leftMs)} left`
      : `${t.rushName}, ${clockSpoken(clockMs)} on the clock`;
  return (
    <section className="start" aria-label="Today">
      <div className="start__buttons">
        <button
          type="button"
          className="btn btn--primary start__play"
          onClick={onPlay}
        >
          Play
        </button>
        <button
          type="button"
          className="start__rush"
          aria-label={spoken}
          onClick={onRush}
        >
          <RushGlyph />
          <span className="start__rushname">{t.rushName}</span>
          <span className="start__rushdetail">{detail}</span>
        </button>
      </div>
      <p className="start__line">{t.startLine}</p>
    </section>
  );
}

function RushGlyph() {
  return (
    <svg
      className="rush-glyph"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="13.5"
        r="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 13.5V9.5M9.5 3h5M12 3v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The run in the toolbar, on the daily only, while there's a run to reach:
 * offered (1:30), waiting (0:48 left), going in another tab, or played (57
 * points), which opens its result again. Gone once the basket has started
 * with no run, and on Endless.
 *
 * Going in another tab it shows no time: the time saved there is running
 * down in that tab, and the run isn't paused (Antoine, 26 November).
 */
export function RunChip({
  standing,
  elsewhere,
  record,
  leftMs,
  clockMs,
  onOpen,
}: {
  standing: RushStanding;
  /** Another tab has the run going. */
  elsewhere: boolean;
  record: RunRecord | null;
  leftMs: number;
  clockMs: number;
  onOpen: () => void;
}) {
  const [theme] = useTheme();
  const name = copy(theme).rushName;
  const played = standing === 'played' && record;
  const away = standing === 'waiting' && elsewhere;
  const detail = played
    ? `${record.points} ${record.points === 1 ? 'point' : 'points'}`
    : away
      ? 'In another tab'
      : standing === 'waiting'
        ? `${clockText(leftMs)} left`
        : clockText(clockMs);
  const spoken = played
    ? `${name}, ${runTally(record).replace(' · ', ', ')}`
    : away
      ? `${name}, going in another tab`
      : standing === 'waiting'
        ? `${name}, paused, ${clockSpoken(leftMs)} left`
        : `${name}, ${clockSpoken(clockMs)} on the clock`;
  return (
    <button
      type="button"
      className={away ? 'runchip runchip--away' : 'runchip'}
      aria-label={spoken}
      title={spoken}
      onClick={onOpen}
    >
      <RushGlyph />
      <span className="runchip__name">{name}</span>
      <span className="runchip__detail">{detail}</span>
    </button>
  );
}
