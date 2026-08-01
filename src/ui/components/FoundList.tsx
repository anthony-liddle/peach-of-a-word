import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  classifyWord,
  findScore,
  type Puzzle,
  type TierStanding,
} from '@/engine/index.ts';
import { LADDER_RUNGS, RUNG_NAMES, type LadderRung } from '../rarity.ts';
import { copy } from '../themeCopy.ts';
import type { Theme } from '../useTheme.ts';
import { TierMeter } from './TierMeter.tsx';

interface Props {
  puzzle: Puzzle;
  found: readonly string[];
  /**
   * The standing on the points ladder, the single source the bar also reads, so
   * the totals and the bar can never diverge: the score, the set-versus-off-page
   * split, the completion count, and the named tier all come from here.
   */
  tier: TierStanding;
  theme: Theme;
  /** Called when the player taps a found word to see its definition. */
  onWordTap: (word: string, trigger: HTMLElement) => void;
  /**
   * An optional control for the summary footer, the daily share among them.
   * Lives here so it sits with the score it brags about; Endless passes none.
   */
  summaryExtra?: ReactNode;
}

type Category = 'source' | 'set' | LadderRung;

interface Word {
  word: string;
  category: Category;
  score: number;
}

interface Group {
  length: number;
  /** Set words of this length (the "of Y"). */
  setTotal: number;
  /** Set words of this length that were found (the "X"). */
  setFound: number;
  /** Set and source finds of this length: the population the count describes. */
  setWords: Word[];
  /** Off-page finds of this length: shown, but never inside the set count. */
  offPageWords: Word[];
}

/**
 * Classify every find once. Everything downstream (the per-length grid, the rung
 * tallies, the rung panels, the inline points) reads this one array, so the
 * readouts cannot disagree with each other: they are views of a single pass, not
 * separate passes that happen to call the same function.
 */
function classifyFound(puzzle: Puzzle, found: readonly string[]): Word[] {
  return found.map((word) => {
    const rung = classifyWord(word, puzzle);
    return {
      word,
      // The source word is a set word that also carries its own mark, so the
      // display category splits it out while the score still reads the rung.
      category: word === puzzle.sourceWord ? 'source' : rung,
      // Score by the single rarity-aware path, so an off-page word's inline +N
      // shows the bonus Bea earned, matching the bar and the total.
      score: findScore(word, rung),
    };
  });
}

function buildGroups(puzzle: Puzzle, words: readonly Word[]): Group[] {
  // Set words per length: the honest "of Y" denominator, the same set the
  // top-level completion count totals, just sliced by length.
  const setTotalByLen = new Map<number, number>();
  for (const w of puzzle.commonWords) {
    setTotalByLen.set(w.length, (setTotalByLen.get(w.length) ?? 0) + 1);
  }

  const foundByLen = new Map<number, Word[]>();
  for (const w of words) {
    const list = foundByLen.get(w.word.length) ?? [];
    list.push(w);
    foundByLen.set(w.word.length, list);
  }

  // Every length with set words, plus any length she has off-page finds in: the
  // Spelling Bee style grid, so an uncracked set length still shows what is
  // missing. Longest first, the eight-letter word at the head of the glossary.
  const lengths = new Set<number>([
    ...setTotalByLen.keys(),
    ...foundByLen.keys(),
  ]);
  return [...lengths]
    .sort((a, b) => b - a)
    .map((length) => {
      const words = (foundByLen.get(length) ?? []).sort((a, b) =>
        a.word.localeCompare(b.word),
      );
      // The source word is a set word too, so it counts toward the set. Off-page
      // finds are split out so the "X of Y" set count never lists them.
      const setWords = words.filter((w) => !isLadder(w.category));
      const offPageWords = words.filter((w) => isLadder(w.category));
      return {
        length,
        setTotal: setTotalByLen.get(length) ?? 0,
        setFound: setWords.length,
        setWords,
        offPageWords,
      };
    });
}

/** True for an off-page ladder word: points shown inline, mark by shape. */
function isLadder(category: Category): category is LadderRung {
  return category !== 'set' && category !== 'source';
}

export function FoundList({
  puzzle,
  found,
  tier,
  theme,
  onWordTap,
  summaryExtra,
}: Props) {
  // The one classification pass. The grid below and the rung panels above are
  // both derived from it, so a word is never Rare in one readout and not the
  // other.
  const words = useMemo(() => classifyFound(puzzle, found), [puzzle, found]);
  const groups = useMemo(() => buildGroups(puzzle, words), [puzzle, words]);

  // Completion is the set, the one place an X of Y belongs. The count comes from
  // the tier, the same source the bar reads, so the two can never diverge.
  const setFound = tier.setFound;
  const setTotal = tier.setTotal;

  /**
   * The off-page finds bucketed by rung, alphabetical within each. The length of
   * a bucket is the summary tally, so the number on the trigger and the list it
   * opens are the same data: the count can never overstate the list.
   */
  const rungWords = useMemo(() => {
    const buckets: Record<LadderRung, Word[]> = {
      uncommon: [],
      rare: [],
      mythic: [],
    };
    for (const w of words) {
      if (isLadder(w.category)) buckets[w.category].push(w);
    }
    for (const r of LADDER_RUNGS) {
      buckets[r].sort((a, b) => a.word.localeCompare(b.word));
    }
    return buckets;
  }, [words]);

  /**
   * Which rung lists are open. Independent by rung: opening Rare never collapses
   * Mythic, so a list she is reading is only ever closed by her own tap.
   */
  const [openRungs, setOpenRungs] = useState<ReadonlySet<LadderRung>>(
    () => new Set(),
  );
  const toggleRung = (rung: LadderRung) =>
    setOpenRungs((open) => {
      const next = new Set(open);
      if (!next.delete(rung)) next.add(rung);
      return next;
    });

  // Stable ids so each trigger can point at the panel it controls.
  const idBase = useId();
  const panelId = (rung: LadderRung) => `${idBase}-rung-${rung}`;

  const renderChip = (w: Word) => (
    <li key={w.word} className="found__word-item" role="listitem">
      <button
        type="button"
        className={`found__word found__word--${w.category}`}
        aria-label={`${w.word}, show definition`}
        onClick={(e) => {
          e.currentTarget.focus();
          onWordTap(w.word, e.currentTarget);
        }}
      >
        <span className={`mark mark--${w.category}`} aria-hidden="true" />
        <span className="found__wordtext">{w.word}</span>
        {/* Every find shows what it is worth, set words included. The score is
            the one already classified above, so the number on a chip is the
            same number the bar and the total counted, never a local sum. */}
        <span className="found__points">+{w.score}</span>
        {isLadder(w.category) && (
          /* Hiding rung-note for now */
          <span className="found__rung-note">
            {RUNG_NAMES[w.category].toLowerCase()}
          </span>
        )}
        {/* hiding for now */}
        <span className="found__disclosure" aria-hidden="true">
          +
        </span>
      </button>
    </li>
  );

  return (
    <section className="found" aria-label="Words found">
      <h2 className="found__title">{copy(theme).glossaryTitle}</h2>

      {/* Nothing to summarise on an empty board; the summary appears with the
          first find, so the start stays an invitation, not a wall of zeros. */}
      {found.length > 0 && (
        <div className="summary">
          <ul className="summary__stats">
            <li className="summary__stat summary__stat--set">
              <span className="mark mark--set" aria-hidden="true" />
              <span className="summary__statline">
                {setFound} of {setTotal} words
              </span>
            </li>
            {LADDER_RUNGS.map((r) => {
              const count = rungWords[r].length;
              const open = openRungs.has(r);
              return (
                <li key={r} className={`summary__stat summary__stat--${r}`}>
                  <span className={`mark mark--${r}`} aria-hidden="true" />
                  {/* A rung she has nothing at is a tally, not a control: a
                      plain span, so it neither looks tappable nor appears in
                      the accessibility tree as a button that does nothing. */}
                  {count === 0 ? (
                    <span className="summary__statline">
                      {count} {RUNG_NAMES[r]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="summary__statline summary__rung"
                      aria-expanded={open}
                      aria-controls={panelId(r)}
                      onClick={() => toggleRung(r)}
                    >
                      {count} {RUNG_NAMES[r]}
                      {/* The state and the action, spoken but not printed: the
                          visible tally stays a tally. */}
                      <span className="visually-hidden">
                        {open
                          ? ', hide the words you found'
                          : ', show the words you found'}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
            <li className="summary__stat summary__stat--total">
              <span className="summary__statline">
                {found.length} {found.length === 1 ? 'word' : 'words'} found
              </span>
            </li>
          </ul>

          {/* The trophy case: her finds at a rung, and never how many exist
              there. A denominator would turn open-ended discovery into a grind.

              The count gates the panel as well as the trigger: FoundList is not
              keyed by puzzle, so a rung left open on the last rack would
              otherwise reopen empty on a rack with nothing at it. */}
          {LADDER_RUNGS.filter(
            (r) => openRungs.has(r) && rungWords[r].length > 0,
          ).map((r) => (
            <div
              key={r}
              id={panelId(r)}
              // A named group, not a landmark region: three panels toggling in
              // and out of a screen reader's landmark list is noise for lists
              // this short, and the name still announces what opened.
              role="group"
              aria-label={`${RUNG_NAMES[r]} words you found`}
              className="summary__rungpanel"
            >
              {/* The same chip and the same definition path as the grid, so a
                  word behaves identically wherever she taps it. */}
              <ul className="found__words">{rungWords[r].map(renderChip)}</ul>
            </div>
          ))}

          {/* The one progress bar, here in the glossary where the totals live.
              It carries the named tier, the bold points total, the two-color
              set-versus-off-page climb, and the explicit Set and Off-page numbers
              beneath it. There is no second bar under the input. */}
          <TierMeter tier={tier} theme={theme} />

          {summaryExtra}
        </div>
      )}

      {found.length === 0 ? (
        <p className="found__empty">{copy(theme).emptyGlossary}</p>
      ) : (
        groups.map((g) => (
          <section className="found__group" key={g.length}>
            <div className="found__grouphead">
              <h3 className="found__grouplen">{g.length} letters</h3>
              {g.setTotal > 0 && (
                <span className="found__groupcount">
                  {g.setFound} of {g.setTotal}
                </span>
              )}
            </div>
            {/* The count above describes the set list only. Off-page finds of
                the same length follow in their own list, never counted. */}
            {g.setWords.length > 0 && (
              <ul className="found__words found__words--set">
                {g.setWords.map(renderChip)}
              </ul>
            )}
            {/* Only when a row carries both: a quiet aside framing the off-page
                finds as extras, so the count above never reads as describing
                them. Set-only rows stay clean and label-free. */}
            {g.setWords.length > 0 && g.offPageWords.length > 0 && (
              <p className="found__alsofound">also found</p>
            )}
            {g.offPageWords.length > 0 && (
              <ul className="found__words found__words--offpage">
                {g.offPageWords.map(renderChip)}
              </ul>
            )}
          </section>
        ))
      )}

      <div className="legend" aria-hidden="true">
        <span className="legend__caption">Key</span>
        <span>
          <span className="mark mark--set" /> {copy(theme).keyOnPage}
        </span>
        {LADDER_RUNGS.map((r) => (
          <span key={r}>
            <span className={`mark mark--${r}`} /> {RUNG_NAMES[r]}
          </span>
        ))}
        <span>
          <span className="mark mark--source" /> source word
        </span>
      </div>
    </section>
  );
}
