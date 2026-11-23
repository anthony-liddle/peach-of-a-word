import type { EpochDate } from '@/data/gameData.ts';
import type { Rung } from '@/engine/types.ts';
import { copy } from '@/ui/themeCopy.ts';
import type { Theme } from '@/ui/useTheme.ts';
import type { Reason } from './wire.ts';

/**
 * A flag on a word: what a player can say about a card, and how it reads.
 *
 * Every string here is from the wording pass in "Flagging Words From The
 * Cards", with Antoine's lines (22 and 23 November). The server takes the
 * reasons as written in `FlagReason`; see `src/flags/wire.ts`.
 */

/** What the server takes: its own list, from the shape check both share. */
export type FlagReason = Reason;

/**
 * Which card a flag is made on. The peach card is the board's own long word;
 * a found word's card has a definition or doesn't.
 */
export type CardKind = 'peach' | 'definition' | 'no-definition';

/** A found word's grade: the set (a basket word in the cute theme) or a rarity rung. */
export type Grade = Rung;

export interface FlagGroup {
  heading: string;
  reasons: FlagReason[];
}

const GRADE_REASONS: readonly FlagReason[] = ['rarer', 'more-common'];

/**
 * The picker's groups, choices first, without the reasons this device has
 * already flagged on the word.
 *
 * "Its grade" is on a found word's card only: the peach has no grade. A
 * basket word can only be rarer and a Mythic word only more common. Once
 * either grade reason is flagged, the whole group goes, so a word gets one
 * grade flag from each device; taking it back brings the group back.
 */
export function groupsFor(
  card: CardKind,
  grade: Grade | null,
  flagged: ReadonlySet<FlagReason>,
): FlagGroup[] {
  const groups: FlagGroup[] = [
    {
      heading: 'Take it out',
      reasons: card === 'peach' ? ['offensive'] : ['not-a-word', 'offensive'],
    },
    { heading: 'Fix its card', reasons: ['definition'] },
  ];
  const gradeFlagged = GRADE_REASONS.some((r) => flagged.has(r));
  if (card !== 'peach' && grade !== null && !gradeFlagged) {
    groups.push({
      heading: 'Its grade',
      reasons:
        grade === 'set'
          ? ['rarer']
          : grade === 'mythic'
            ? ['more-common']
            : ['rarer', 'more-common'],
    });
  }
  return groups
    .map((g) => ({ ...g, reasons: g.reasons.filter((r) => !flagged.has(r)) }))
    .filter((g) => g.reasons.length > 0);
}

/** The rarity rungs by the names the game shows, in both themes. */
const RUNG_NAME: Record<Exclude<Grade, 'set'>, string> = {
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic',
};

/** A choice in the picker. The grade's words follow the theme: a basket word, or a set word. */
export function choiceText(
  reason: FlagReason,
  card: CardKind,
  grade: Grade | null,
  theme: Theme,
): string {
  switch (reason) {
    case 'not-a-word':
      return "It's not a real word";
    case 'offensive':
      return "It's offensive";
    case 'should-count':
      return 'It should count';
    case 'definition':
      return card === 'peach'
        ? 'The definition or origin is wrong'
        : card === 'no-definition'
          ? 'It needs a definition'
          : 'The definition is wrong';
    case 'rarer':
      return grade === 'set' || grade === null
        ? `It's rarer than a ${copy(theme).container} word`
        : `It's rarer than ${RUNG_NAME[grade]}`;
    case 'more-common':
      return `It's more common than ${RUNG_NAME[grade === 'set' || grade === null ? 'uncommon' : grade]}`;
  }
}

/** The same reason, in a line about a flag already made. */
export function shortForm(reason: FlagReason): string {
  switch (reason) {
    case 'not-a-word':
      return 'not a real word';
    case 'offensive':
      return 'offensive';
    case 'definition':
      return 'its definition';
    case 'should-count':
      return 'suggested';
    case 'rarer':
      return 'rarer';
    case 'more-common':
      return 'more common';
  }
}

/** The picker's title. */
export function pickerTitle(word: string): string {
  return `Flag “${word}”`;
}

/**
 * The picker's short line. It's a summary: the platform, the version and the
 * flag's random ID go too, and the privacy page lists everything.
 */
export function pickerNote(mode: 'daily' | 'endless'): string {
  return mode === 'endless'
    ? 'Sends the word, its board and your reason. Nothing about you.'
    : 'Sends the word, its day and your reason. Nothing about you.';
}

/**
 * The date of a daily board, as the server reads it back: the day whose
 * `dayIndex` is `index`, from the calendar's Y/M/D components, never from
 * milliseconds, so a clock change can't move it.
 */
export function dayOfIndex(index: number, epoch: EpochDate): string {
  const d = new Date(Date.UTC(epoch.year, epoch.month - 1, epoch.day + index));
  return d.toISOString().slice(0, 10);
}
