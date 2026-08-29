import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameData } from '@/data/gameData.ts';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import {
  messageText,
  useAnnouncedText,
  useGame,
  type GameApi,
} from './useGame.ts';
import { useTheme, type Theme } from './useTheme.ts';
import { copy } from './themeCopy.ts';
import { nextTextSize, useTextSize, type TextSize } from './useTextSize.ts';
import { useWideBoard } from './useWideBoard.ts';
import { FoundList } from './components/FoundList.tsx';
import { TierMeter } from './components/TierMeter.tsx';
import { ShareButton } from './components/ShareButton.tsx';
import { Reveal, type QuietCategory } from './components/Reveal.tsx';
import { HowItWorks } from './components/HowItWorks.tsx';
import { EditionCard } from './components/EditionCard.tsx';
import { Confetti } from './components/Confetti.tsx';
import { Decorations } from './components/Decorations.tsx';
import { useDefinitions } from './useDefinitions.ts';
import { classifyWord } from '@/engine/index.ts';

interface QuietState {
  word: string;
  category: QuietCategory;
  status: 'loading' | 'ready';
  definition: string | null;
  trigger: HTMLElement | null;
}

/** Honour the OS reduced-motion setting. Confetti is pure motion, so suppress it. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface Props {
  data: GameData;
  audio: AudioEngine;
  storage: GameStorage;
}

export function Game({ data, audio, storage }: Props) {
  const game = useGame(data, audio, storage);

  // The "How the words work" explainer. Its open flag is lifted here so the
  // global key handler can stand down while it is up (the same precedent as the
  // reveal), and so focus can return to the trigger on close.
  const [howOpen, setHowOpen] = useState(false);
  const howTriggerRef = useRef<HTMLButtonElement>(null);
  const closeHow = useCallback(() => {
    setHowOpen(false);
    howTriggerRef.current?.focus();
  }, []);
  useGlobalKeys(game, howOpen);

  const { state } = game;
  const [theme] = useTheme();
  // Which column the board is in, and so where the tier meter goes. One node,
  // one place, decided here rather than by a stylesheet that cannot reparent.
  const wide = useWideBoard();
  // Frozen at the moment of the find, so re-skinning never re-speaks it.
  const spokenAnnouncement = useAnnouncedText(
    state.announcement,
    state.mode,
    theme,
  );

  const { getDefinition } = useDefinitions(state.puzzle.sourceWord);

  const [quiet, setQuiet] = useState<QuietState | null>(null);

  const onWordTap = useCallback(
    (word: string, trigger: HTMLElement) => {
      if (word === state.puzzle.sourceWord) {
        game.openReveal();
        return;
      }
      const category = classifyWord(word, state.puzzle) as QuietCategory;
      setQuiet({
        word,
        category,
        status: 'loading',
        definition: null,
        trigger,
      });
      void getDefinition(word).then((definition) => {
        setQuiet((q) =>
          q && q.word === word ? { ...q, status: 'ready', definition } : q,
        );
      });
    },
    [game, state.puzzle, getDefinition],
  );

  const closeQuiet = useCallback(() => setQuiet(null), []);

  // Dismissing the completion card hands the player to the durable Share: the
  // celebration is the in-the-moment offer, the glossary Share is the path that
  // persists. Landing on it means the result never feels gone with the popup.
  // The card is a fixed overlay, so the Share is already in place to scroll to.
  const shareRef = useRef<HTMLButtonElement>(null);
  const dismissEdition = useCallback(() => {
    game.closeEdition();
    const share = shareRef.current;
    if (share) {
      share.focus({ preventScroll: true });
      share.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [game]);

  // Fire the cute confetti once, on the completion beat. The pulse increments
  // only on the completing submit, so a mode switch or a reload of an already
  // complete puzzle never re-fires. Cute only; suppressed under reduced motion.
  const [confettiOn, setConfettiOn] = useState(false);
  const lastPulse = useRef(game.editionPulse);
  useEffect(() => {
    if (game.editionPulse === lastPulse.current) return;
    lastPulse.current = game.editionPulse;
    if (theme === 'cute' && !prefersReducedMotion()) setConfettiOn(true);
  }, [game.editionPulse, theme]);
  const endConfetti = useCallback(() => setConfettiOn(false), []);

  return (
    <div className="app">
      <Decorations celebrate={state.editionOpen} />
      <Masthead />
      {!storage.persistent && (
        <p className="storage-note">
          This browser is not saving progress. Your words will be lost when you
          leave or reload.
        </p>
      )}
      <Toolbar game={game} />

      <div className="board">
        <div className="play">
          {/* Narrow widths only: the meter sits above the well, the way the app
              has it. At two-column widths it stays in the glossary in the right
              column, in exactly the place it has always been.

              Ungated, unlike its glossary twin. `.summary` appears with the
              first find, and a meter that appears is a meter whose height
              arrives later: it would shove the well and the rack down mid-play,
              on the first word of the day. Zeros on an empty board are honest;
              furniture that materialises under a thumb is not. */}
          {!wide && (
            <TierMeter tier={state.tier} theme={theme} streak={game.streak} />
          )}
          <ComposingStick game={game} />
          <TypeCase game={game} />
          <Controls game={game} />
        </div>

        <FoundList
          puzzle={state.puzzle}
          found={state.found}
          tier={state.tier}
          theme={theme}
          showTier={wide}
          onWordTap={onWordTap}
          summaryExtra={
            <ShareButton
              puzzle={state.puzzle}
              found={state.found}
              mode={state.mode}
              date={new Date()}
              buttonRef={shareRef}
            />
          }
        />
      </div>

      <Colophon triggerRef={howTriggerRef} onOpenHow={() => setHowOpen(true)} />

      {/* Screen-reader announcements: found words, tier changes, the crown.
          Settled when the find happens, never re-resolved under it. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {spokenAnnouncement}
      </div>

      {state.editionOpen && (
        <EditionCard theme={theme} onClose={dismissEdition} />
      )}

      {confettiOn && <Confetti onDone={endConfetti} />}

      {state.revealOpen ? (
        <Reveal
          register="crown"
          theme={theme}
          word={state.puzzle.sourceWord}
          entry={state.sourceEntry}
          onClose={game.closeReveal}
        />
      ) : quiet ? (
        <Reveal
          theme={theme}
          register="quiet"
          word={quiet.word}
          category={quiet.category}
          status={quiet.status}
          definition={quiet.definition}
          returnFocusTo={quiet.trigger}
          onClose={closeQuiet}
        />
      ) : null}

      {howOpen && <HowItWorks onClose={closeHow} />}
    </div>
  );
}

function Masthead() {
  const [theme] = useTheme();
  return (
    <header className="masthead">
      {/* Keep this line in sync with the OG card kicker baked by
          scripts/build-icons.ts (rendered there in small caps). */}
      <p className="masthead__kicker">A game about finding words in words</p>
      <h1 className="masthead__title">
        <em>Peach</em> of a Word
      </h1>
      <p className="masthead__rule">{copy(theme).mastheadSubline}</p>
    </header>
  );
}

function Toolbar({ game }: { game: GameApi }) {
  const { state } = game;
  const [theme, setTheme] = useTheme();
  // The streak has one home at any given width, never two at the same one. At
  // narrow widths it is the flame in the tier meter, above the well; here it is
  // the pill. The pill survives at two-column widths because the meter there
  // lives in the glossary, which only appears with the first find — a returning
  // player opening a fresh board would otherwise see no streak at all until
  // they found a word, and the streak is not the stat to make someone earn
  // twice.
  const wide = useWideBoard();
  return (
    <div className="toolbar">
      <div className="modes" role="group" aria-label="Mode">
        <button
          aria-pressed={state.mode === 'daily'}
          onClick={() => game.setMode('daily')}
        >
          Daily
        </button>
        <button
          aria-pressed={state.mode === 'endless'}
          onClick={() => game.setMode('endless')}
        >
          Endless
        </button>
      </div>

      <div className="toolbar__right">
        {/* Wide screens: the segmented pair. Narrow screens: a single swap
            button (CSS swaps which one shows), so the labels never clip. */}
        <div className="modes theme-seg" role="group" aria-label="Theme">
          <button
            aria-pressed={theme === 'letterpress'}
            onClick={() => setTheme('letterpress')}
          >
            Letterpress
          </button>
          <button
            aria-pressed={theme === 'cute'}
            onClick={() => setTheme('cute')}
          >
            Cute
          </button>
        </div>
        <ThemeSwap theme={theme} setTheme={setTheme} />
        {state.mode === 'daily' ? (
          wide && (
            <span className="chip" title="Days cleared in a row">
              Streak <strong>{game.streak}</strong>
            </span>
          )
        ) : (
          <button className="btn btn--header" onClick={game.newEndless}>
            New puzzle
          </button>
        )}
        {state.sourceRevealed && (
          <button
            className="iconbtn iconbtn--crown"
            onClick={game.openReveal}
            aria-label="Show the source word reveal"
            title="The source word"
          >
            ✦
          </button>
        )}
        <TextSizeButton />
        <button
          className="iconbtn iconbtn--accent"
          aria-pressed={game.muted}
          onClick={game.toggleMute}
          aria-label={game.muted ? 'Unmute sound' : 'Mute sound'}
          title={game.muted ? 'Sound off' : 'Sound on'}
        >
          {game.muted ? '◌' : '♪'}
        </button>
      </div>
    </div>
  );
}

/**
 * The three-step text-size cycler, for players who have not found (or do not
 * know about) their browser's own text setting. Cycles regular, large,
 * largest; the accessible name states the current step and the action, like
 * ThemeSwap, and a local polite live region announces each change the way the
 * share confirmation does. The growing page itself is the sighted feedback.
 */
function TextSizeButton() {
  const [size, setSize] = useTextSize();
  const [announced, setAnnounced] = useState('');
  const labels: Record<TextSize, string> = {
    regular: 'Regular',
    large: 'Large',
    largest: 'Largest',
  };
  const next = nextTextSize(size);
  const cycle = () => {
    setSize(next);
    setAnnounced(`Text size: ${labels[next]}`);
  };
  return (
    <>
      <button
        type="button"
        className="iconbtn textsize"
        onClick={cycle}
        aria-label={`Text size: ${labels[size]}. Activate to switch to ${labels[next].toLowerCase()}.`}
        title={`Text size: ${labels[size]}`}
      >
        <span aria-hidden="true">Aa</span>
      </button>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announced}
      </span>
    </>
  );
}

/**
 * The compact theme control for narrow screens. It shows the current theme (to
 * match the Daily/Endless pair above it) with a swap glyph that signals it is
 * tap-to-change, and toggles to the other theme. The accessible name states the
 * action since the visible label only shows the current state.
 */
function ThemeSwap({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const isCute = theme === 'cute';
  // Display labels only. The stored value stays 'letterpress', so renaming the
  // label migrates nothing and saved preferences are untouched.
  const currentName = isCute ? 'Cute' : 'Letterpress';
  const nextName = isCute ? 'Letterpress' : 'Cute';
  return (
    <button
      type="button"
      className="theme-swap"
      onClick={() => setTheme(isCute ? 'letterpress' : 'cute')}
      aria-label={`Theme: ${currentName}. Activate to switch to ${nextName}.`}
    >
      <span className="theme-swap__glyph" aria-hidden="true">
        ◐
      </span>
      <span className="theme-swap__name">{currentName}</span>
      <span className="theme-swap__cycle" aria-hidden="true">
        ⇄
      </span>
    </button>
  );
}

/**
 * The stick: the letters placed so far, in order, **and the feedback message**.
 *
 * **Three states, one slot, and the composed word wins.** Letters if there are
 * letters, otherwise the message, otherwise the placeholder. The well is the
 * composing surface and a slot holds one thing, so the only question is which
 * thing, and the answer is what the player is doing now rather than what they
 * did last. This is the app's arrangement, brought across on request.
 *
 * That is why the reducer clears `message` when a tile lands. Leaving the value
 * set and merely hiding it here looks equivalent and is not: deleting back to an
 * empty stick would bring a stale rejection back. See `ADD_TILE`.
 *
 * **What this costs.** The message used to have a row of its own below the
 * controls, and it survived there while composing, so a rejection could still be
 * read while retyping. It cannot now. That affordance is the price of the app's
 * placement, and it is the reason the app's own notes declined to port this
 * behaviour to the web in the first place.
 *
 * `aria-hidden` carries over from that row unchanged. The message is already
 * spoken by the live region at the moment it lands, and hearing every rejection
 * twice — once when it happens, again on the next swipe — is exactly what the
 * old row's `aria-hidden` was avoiding.
 *
 * The height is fixed at every state, so the rack cannot shift when the first
 * letter lands. That was already true of this element and it stays true: the
 * message is clamped rather than allowed to grow the well, because a well that
 * grows breaks the one promise the whole arrangement rests on.
 */
function ComposingStick({ game }: { game: GameApi }) {
  const { state, composedWord } = game;
  const [theme] = useTheme();
  const empty = composedWord.length === 0;
  return (
    <div className="stick" data-tone={state.message?.tone ?? 'info'}>
      {!empty ? (
        [...composedWord].map((letter, i) => (
          <span className="stick__slot" key={i}>
            {letter}
          </span>
        ))
      ) : state.message ? (
        <p className="message" aria-hidden="true">
          {messageText(state.message, theme)}
        </p>
      ) : (
        <span className="stick__empty">{copy(theme).inputPlaceholder}</span>
      )}
    </div>
  );
}

function TypeCase({ game }: { game: GameApi }) {
  const { state } = game;
  return (
    <div className="case" role="group" aria-label="Letter tiles">
      {state.rackOrder.map((id) => {
        const tile = state.tiles[id]!;
        const used = state.composing.includes(id);
        return (
          <button
            key={id}
            className="sort"
            disabled={used}
            onClick={() => game.addTile(id)}
            aria-label={`Letter ${tile.letter}${used ? ', already set' : ''}`}
          >
            {tile.letter}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Two clusters, grouped by what each action does:
 *
 *   Shuffle   Submit
 *   Clear     Delete
 *
 * **This replaced a grouping by frequency, and both groupings are Bea's.** The
 * clusters used to be the utility pair (Shuffle, Clear), quiet and set apart,
 * and the primary pair (Delete, then Submit), prominent and in thumb reach.
 * Delete came before Submit because she said delete was one of the most-used
 * buttons and was in the wrong place.
 *
 * She then asked for this arrangement, on 2026-08-27: Delete and Clear are both
 * undo, so they belong together. Delete sits on the right of that pair, being
 * the more used of the two, and the undo pair sits after the pair carrying
 * Submit, because Submit is the most obvious action on the screen. The axis
 * changed rather than the taste, from how often you press a thing to what
 * pressing it does.
 *
 * A consequence worth having: the DOM order is now the visual order. The old
 * arrangement put the utility pair first in the DOM and used `order: -1` in the
 * narrow layout to lift the primary pair above it, so a keyboard tabbed
 * Shuffle, Clear, Delete, Submit through a screen that read Delete, Submit,
 * Shuffle, Clear. That hack is gone with the regrouping rather than by being
 * fixed separately.
 *
 * One shared structure drives both themes: the skin changes with the theme, the
 * layout never does, so the two rows break at exactly the same widths.
 */
function Controls({ game }: { game: GameApi }) {
  const [theme] = useTheme();
  const { composedWord } = game;
  const empty = composedWord.length === 0;
  return (
    <div className="controls">
      <div className="controls__group controls__group--primary">
        <button className="btn btn--utility" onClick={game.shuffle}>
          Shuffle
        </button>
        <button
          className="btn btn--primary"
          onClick={game.submit}
          disabled={composedWord.length < 3}
        >
          {copy(theme).submitWord}
        </button>
      </div>
      <div className="controls__group controls__group--undo">
        <button
          className="btn btn--utility"
          onClick={game.clear}
          disabled={empty}
        >
          Clear
        </button>
        <button
          className="btn btn--delete"
          onClick={game.removeLast}
          disabled={empty}
          aria-label="Delete last letter"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

function Colophon({
  triggerRef,
  onOpenHow,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onOpenHow: () => void;
}) {
  const [theme] = useTheme();
  return (
    <footer className="colophon">
      Validation by ENABLE and SCOWL, public domain, with a curated patch layer.
      Common words from SCOWL. Definitions and etymologies from Wiktionary, CC
      BY-SA 4.0.
      <br />
      {copy(theme).typeCredit}
      <br />
      {/* The quiet expansion of the colophon: where a curious person already
          looks. Kept out of the play surface on purpose. */}
      <button
        ref={triggerRef}
        type="button"
        className="colophon__how"
        onClick={onOpenHow}
      >
        How the words work
      </button>
      {/* Beside the other quiet expansion rather than in a chrome bar of its
          own. Someone looking for what a game does with their data looks at
          the bottom of it, and the App Store record points here too, so this
          link is the one route both audiences already take. */}
      <a className="colophon__privacy" href="/privacy">
        Privacy
      </a>
      {/* The title says what the game is to everyone; this says who it is for
          to the one person meant to notice it. Unornamented on purpose. */}
      <p className="colophon__dedication">for Bea</p>
    </footer>
  );
}

/** Full keyboard play: type letters, Enter to set, Backspace to delete. */
function useGlobalKeys(game: GameApi, suppressed: boolean) {
  const ref = useRef(game);
  ref.current = game;
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = ref.current;
      // The reveal or the explainer popup owns the keyboard while it is open.
      if (g.state.revealOpen || suppressedRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        g.submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        g.removeLast();
      } else if (e.key === 'Escape') {
        g.clear();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        g.addLetter(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
