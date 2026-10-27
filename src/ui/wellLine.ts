import type { Rung } from '@/engine/index.ts';
import { RUNG_NAMES, isLadderRung, type LadderRung } from './rarity.ts';

/**
 * A find's line in the well: the mark that leads it, what it shows, and what a
 * screen reader hears.
 *
 * **One value for the eye and the ear,** so the two cannot drift. The shown
 * form leads an Uncommon, Rare or Mythic find with that rarity's mark, the one
 * the found list draws: `❖ tel, 5 points`. A mark read aloud says nothing
 * useful, so the spoken form names the rarity in words: "Mythic find: tel, 5
 * points." A word in the basket has no mark, in either form.
 *
 * The app builds the same lines in `Sources/PeachEngine/WellLine.swift`, and
 * both repos hold them to one fixture (`wellLine.test.ts`).
 */
export interface WellLine {
  /** The rarity whose mark leads the shown line. Null for a basket word. */
  readonly mark: LadderRung | null;
  /** What the line shows after its mark, with no closing period. */
  readonly shown: string;
  /** What the live region says, before any rank or completion cue. */
  readonly spoken: string;
  /**
   * What the line is called as a button: the spoken form without its closing
   * period, since a control's name is not a sentence.
   */
  readonly name: string;
}

/** A find's line, for any find but the source word. */
export function findLine(word: string, points: number, rung: Rung): WellLine {
  const line = `${word}, ${points} ${points === 1 ? 'point' : 'points'}`;
  const name = isLadderRung(rung) ? `${RUNG_NAMES[rung]} find: ${line}` : line;
  return {
    mark: isLadderRung(rung) ? rung : null,
    shown: line,
    spoken: `${name}.`,
    name,
  };
}
