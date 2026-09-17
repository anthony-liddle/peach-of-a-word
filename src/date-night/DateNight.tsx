import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classifyWord } from '@/engine/index.ts';
import { createDefinitionLookup } from '@/data/definitions.ts';
import { useAnnouncedText } from '@/ui/useGame.ts';
import { useGlobalKeys } from '@/ui/useGlobalKeys.ts';
import { useTheme } from '@/ui/useTheme.ts';
import { useWideBoard } from '@/ui/useWideBoard.ts';
import { ComposingStick } from '@/ui/components/ComposingStick.tsx';
import { TypeCase } from '@/ui/components/TypeCase.tsx';
import { Controls } from '@/ui/components/Controls.tsx';
import { FoundList } from '@/ui/components/FoundList.tsx';
import { Decorations } from '@/ui/components/Decorations.tsx';
import { Reveal, type QuietCategory } from '@/ui/components/Reveal.tsx';
import { useDateNight } from './useDateNight.ts';
import { TOTAL_WORDS } from './puzzle.ts';

interface QuietState {
  word: string;
  category: QuietCategory;
  status: 'loading' | 'ready';
  definition: string | null;
  trigger: HTMLElement | null;
}

export function DateNight() {
  const game = useDateNight();
  const { state } = game;
  const [theme] = useTheme();
  const wide = useWideBoard();

  // Nothing suppresses the keys on this page: there is no explainer popup, and
  // the handler already stands down on its own while the reveal is up.
  useGlobalKeys(game, false);

  const spoken = useAnnouncedText(state.announcement, 'date-night', theme);

  /**
   * The definition seam the daily uses, called directly rather than through
   * `useDefinitions`.
   *
   * `useDefinitions` warms the bundle on mount, which would put a request
   * naming the crown in the network log before she has typed a letter. The
   * crown is the puzzle, so nothing asks for it until she has found a word and
   * tapped it. A failed fetch already resolves to null here, so the offline
   * case is the card's existing "no definition on hand" state.
   */
  const lookup = useMemo(
    () => createDefinitionLookup(state.puzzle.sourceWord),
    [state.puzzle.sourceWord],
  );

  const [quiet, setQuiet] = useState<QuietState | null>(null);
  const closeQuiet = useCallback(() => setQuiet(null), []);

  const onWordTap = useCallback(
    (word: string, trigger: HTMLElement) => {
      if (word === state.puzzle.sourceWord) {
        game.openReveal();
        return;
      }
      setQuiet({
        word,
        category: classifyWord(word, state.puzzle) as QuietCategory,
        status: 'loading',
        definition: null,
        trigger,
      });
      void lookup.getDefinition(word).then((definition) => {
        setQuiet((q) =>
          q && q.word === word ? { ...q, status: 'ready', definition } : q,
        );
      });
    },
    [game, state.puzzle, lookup],
  );

  // The note opens once the basket is full and then stays open, including on a
  // later visit. The crown card is one of the twenty, so the last word can open
  // both: the card takes the moment and the note waits for it to close.
  const complete = state.found.length === TOTAL_WORDS;
  const noteOpen = complete && !state.revealOpen;
  const noteRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (!noteOpen || shown.current) return;
    shown.current = true;
    noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    noteRef.current?.focus({ preventScroll: true });
  }, [noteOpen]);

  return (
    <div className="app">
      <Decorations celebrate={complete} />

      <header className="masthead">
        <h1 className="masthead__title">
          A puzzle for <em>you</em>
        </h1>
      </header>

      {!game.persistent && (
        <p className="storage-note">
          This browser is not saving progress. Your words will be lost when you
          leave or reload.
        </p>
      )}

      <div className="board">
        <div className="play">
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
          ladder={false}
          onWordTap={onWordTap}
        />
      </div>

      <section className="note" aria-labelledby="note-title" hidden={!noteOpen}>
        <h2 className="note__title" id="note-title" ref={noteRef} tabIndex={-1}>
          The basket is full
        </h2>

        {/* ANTOINE: your note goes here, then the poem, then the credit line. */}
        <p className="placeholder">
          PLACEHOLDER. The note, the poem and the credit line are not written
          yet. Replace this paragraph with them, and delete the dashed box.
        </p>
      </section>

      {/*
        A footer, for two reasons that happen to agree.

        The card's gloss is Wiktionary-derived, and ATTRIBUTION.md asks for a
        short line wherever that text is shown. And the decorations are pinned
        to the bottom of `.app` (`.deco--peach2` sits at `bottom: 5rem`), tuned
        against a page that ends in a colophon; with no footer at all a peach
        lands in the middle of the basket.

        The game's own class, so it is the game's footer, minus the parts that
        belong to the game rather than to this page: no dedication, because
        "for Bea" is already said where it means the most, and no navigation,
        because there is nowhere here to go.
      */}
      <footer className="colophon">
        Definitions and etymologies from Wiktionary, CC BY-SA 4.0.
      </footer>

      <div className="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </div>

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
          register="quiet"
          theme={theme}
          word={quiet.word}
          category={quiet.category}
          status={quiet.status}
          definition={quiet.definition}
          returnFocusTo={quiet.trigger}
          onClose={closeQuiet}
        />
      ) : null}
    </div>
  );
}
