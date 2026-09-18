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

        <p>Together doesn&apos;t mean much on its own. It needs someone.</p>
        <p>
          Every day I spend with you is a life worth living. Hard days, easy
          days, they&apos;re all better with you in them.
        </p>
        <p>
          Even now, on a blanket in a cemetery, eating with our hands,
          there&apos;s nobody I&apos;d rather be with.
        </p>
        <p>This poem is us.</p>

        {/*
          The poem is quoted, so its own typography is kept: the curly
          apostrophes are the ones the published text carries, where the note
          above uses the straight ones the rest of the app writes with.

          Verse, marked up as verse. Each stanza is its own paragraph and the
          line breaks inside it are line breaks, rather than one paragraph with
          doubled <br /> standing in for the gaps. A screen reader pauses at a
          stanza that way, and the spacing comes from the stylesheet instead of
          from empty elements.
        */}
        <figure className="poem">
          <figcaption className="poem__head">
            <span className="poem__title">Together</span>
            <a
              className="poem__poet"
              href="https://poets.org/poet/carrie-williams-clifford"
            >
              Carrie Williams Clifford
            </a>
          </figcaption>

          <div className="poem__body">
            <p className="poem__stanza">
              O, come, Love, let us take a walk,
              <br />
              Down the Way-of-Life together;
              <br />
              Storms may come, but what care we,
              <br />
              If be fair or foul the weather.
            </p>
            <p className="poem__stanza">
              When the sky overhead is blue,
              <br />
              Balmy, scented winds will after
              <br />
              Us, adown the valley blow
              <br />
              Haunting echoes of our laughter.
            </p>
            <p className="poem__stanza">
              When Life’s storms upon us beat
              <br />
              Crushing us with fury, after
              <br />
              All is done, there’ll ringing come
              <br />
              Mocking echoes of our laughter.
            </p>
            <p className="poem__stanza">
              So we’ll walk the Way-of-Life,
              <br />
              You and I, Love, both together,
              <br />
              Storm or sunshine, happy we
              <br />
              If be foul or fair the weather.
            </p>
          </div>
        </figure>

        <p className="poem__about">
          Carrie Williams Clifford was born in September 1862 in Chillicothe,
          Ohio. A poet and activist, she is the author of{' '}
          <cite>The Widening Light</cite> (Walter Reid, 1922) and{' '}
          <cite>Race Rhymes</cite> (R. L. Pendleton, 1911).
        </p>
        <p className="poem__about">
          A cofounder and the first president of the Ohio State Federation of
          Colored Women, Clifford hired Black women for the Niagara Movement, a
          predecessor of the NAACP. She taught in Parkersburg, West Virginia,
          and worked as an editor for the Cleveland Journal. She died in 1934.
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
