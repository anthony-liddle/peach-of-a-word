/**
 * The daily share block. A pure function: it takes the day's result and returns
 * the exact text, with no DOM and no share APIs, so the format (and above all
 * its spoiler safety) can be proven by unit tests alone. The share action is a
 * thin wrapper around this.
 */

/** Fields every share block carries, whatever the mode. */
interface ShareResultBase {
  /**
   * The app display name. Read from the single-source constant by the caller,
   * never hardcoded here, so the pending rename flows through for free.
   */
  readonly title: string;
  /**
   * The earned tier headline, theme-skinned: the completion crown once every
   * common word is found, otherwise the current named rank. Read from the
   * tier-name source (crownName/tierName), never a copy, so it matches what the
   * player saw and cannot go stale. This is the share's lead, replacing the
   * retired set-completion headline.
   */
  readonly tierLabel: string;
  /** Common words found. Still tallied for the crown, no longer a headline. */
  readonly setFound: number;
  /** Total common words in the rack. Drives the completion crown. */
  readonly setTotal: number;
  /** Off-page finds on each rung; a rung at zero is omitted from the block. */
  readonly uncommon: number;
  readonly rare: number;
  readonly mythic: number;
  /** Points from the set, and points from off-page finds. The score's split. */
  readonly setPoints: number;
  readonly offPagePoints: number;
  /**
   * What the two halves of the score are called on the points line. Theme
   * vocabulary, read from the copy module by the caller for the same reason
   * tierLabel is: letterpress sets type from a case and cute picks peaches into
   * a basket, so a label spelled out here would put one theme's noun in the
   * other theme's share. Lowercase, because they sit inside a sentence.
   */
  readonly setLabel: string;
  readonly offPageLabel: string;
  /** The single summary number. */
  readonly totalPoints: number;
  /**
   * The source word and every found word. In daily the builder never reads
   * these: they ride on the input so the spoiler-safety test can prove the
   * output leaks neither. In endless the builder reads sourceWord, but only when
   * showSourceWord is set, and only into the identifier line.
   */
  readonly sourceWord: string;
  readonly foundWords: readonly string[];
}

/**
 * The daily block. The daily is reproducible: a recipient can go play the same
 * rack, so the answer must stay hidden. The source word never appears, and the
 * identifier line is the name and the date. Gated by mode, so this protection
 * cannot be relaxed by accident: a daily result has no source-word affordance to
 * turn on.
 */
export interface DailyShareResult extends ShareResultBase {
  readonly mode: 'daily';
  /** The puzzle's date, shown short so the group compares the same rack. */
  readonly date: Date;
}

/**
 * The endless block. Endless is dealt on demand and is not reproducible, so
 * there is no shared puzzle to spoil: the found source word may headline as a
 * flex, and the identifier says Endless, not a date. showSourceWord stays false
 * until the player has found the source word, so an unearned word is never
 * shown.
 */
export interface EndlessShareResult extends ShareResultBase {
  readonly mode: 'endless';
  readonly showSourceWord: boolean;
}

/** A share block for either mode. buildShareText branches on the mode tag. */
export type ShareResult = DailyShareResult | EndlessShareResult;

const SET_SQUARE = '🟥';
const OFF_PAGE_SQUARE = '🟪';
/** Fixed width, the way Wordle's grid is fixed. The whole row reads at a glance. */
const SCORE_ROW_WIDTH = 10;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Short calendar date, "Jun 18", from the date's local components. */
function shortDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * The score-composition row, the purple bar rendered into squares. Always the
 * fixed width, split by points: red for the set's share, purple for off-page.
 * Round to nearest, but a real haul must never round away to nothing, so a
 * non-zero off-page total guarantees at least one purple square, and likewise a
 * non-zero set total at least one red.
 */
function scoreRow(setPoints: number, offPagePoints: number): string {
  const total = setPoints + offPagePoints;
  let purple =
    total === 0 ? 0 : Math.round((offPagePoints / total) * SCORE_ROW_WIDTH);
  if (offPagePoints > 0 && purple === 0) purple = 1;
  if (setPoints > 0 && purple === SCORE_ROW_WIDTH) purple = SCORE_ROW_WIDTH - 1;
  const red = SCORE_ROW_WIDTH - purple;
  return SET_SQUARE.repeat(red) + OFF_PAGE_SQUARE.repeat(purple);
}

/**
 * The rarity line, naming the off-page rungs with at least one find. Returns
 * null when there are no off-page finds at all, so the caller drops the line.
 */
function rarityLine(
  uncommon: number,
  rare: number,
  mythic: number,
): string | null {
  const parts: string[] = [];
  if (uncommon > 0) parts.push(`${uncommon} Uncommon`);
  if (rare > 0) parts.push(`${rare} Rare`);
  if (mythic > 0) parts.push(`${mythic} Mythic`);
  if (parts.length === 0) return null;
  return `✦ ${parts.join(' · ')}`;
}

/**
 * The identifier line, which leads the block. The peach is the name's mark and
 * the share's signature, the same in both themes and modes; it rides this line,
 * never the body, so the spoiler guard (which treats the identifier and tier as
 * chrome) is untouched.
 *
 * Daily shows the date, and never the source word: the daily is reproducible, so
 * the answer stays hidden. Endless says Endless instead of a date and, once the
 * player has found it, adds the source word as the headline flex, uppercase.
 * This is the one place the mode changes the block, and the source word can
 * reach the output only through the endless branch.
 */
function identifierLine(result: ShareResult): string {
  if (result.mode === 'daily') {
    return `🍑 ${result.title} · ${shortDate(result.date)}`;
  }
  const base = `🍑 ${result.title} · Endless`;
  return result.showSourceWord
    ? `${base} · ${result.sourceWord.toUpperCase()}`
    : base;
}

/**
 * The tier line: the earned headline, how much of the set was completed, and how
 * many finds came from beyond it.
 * Without the count the block prints a point total with nothing to measure it
 * against, which is what a recipient (and the player) actually wants to read.
 *
 * This is not the denominator the rarity ladder is protected from. That rule
 * keeps the share from advertising how many obscure words a rack holds, so the
 * discovery stays open-ended. The completion count is the game's one honest
 * denominator: the app shows it from the first second of play, so a recipient
 * learns nothing a player would not see immediately. It reads just as well
 * mid-climb ("Blossom · 12 of 21 words"), where it is arguably more use.
 *
 * The off-page count on the end follows the ladder's rule, not the set's: it is
 * a count of finds and never a denominator, so it is added rather than divided
 * and it is dropped entirely at zero. It is derived from the rungs rather than
 * passed alongside them, so it cannot disagree with the rarity line below:
 * `39 Uncommon · 26 Rare · 2 Mythic` is the same 67.
 *
 * Shared by both modes. Endless has its own identifier line above, but the tier
 * line is the same one, so there is no second format to keep in step.
 */
function tierLine(result: ShareResult): string {
  const base = `${result.tierLabel} · ${result.setFound} of ${result.setTotal} words`;
  const offPageFound = result.uncommon + result.rare + result.mythic;
  return offPageFound > 0 ? `${base} + ${offPageFound}` : base;
}

/**
 * The points line: the score row's split written out, then the total.
 *
 * **The labels are what make the slash safe.** A bare `99/388` reads as a
 * fraction, and the line above it contains a real one; naming the halves means
 * the slash can only be read as a divider. That was Bea's fix, and it is why the
 * labels are not decoration that can be dropped.
 *
 * The split reaches the text because the squares alone could not carry it: the
 * row is quantised to ten, so a 99/388 board and a 100/387 board draw the same
 * picture. With no off-page points there is nothing to split, so the line
 * degrades to the single total it carried before rather than spending two labels
 * to say zero, on exactly the boards where the rarity line and the off-page
 * count drop too. Shared by both modes, like the tier line.
 */
function pointsLine(result: ShareResult): string {
  if (result.offPagePoints === 0) return `${result.totalPoints} pts`;
  return (
    `${result.setPoints} ${result.setLabel}/` +
    `${result.offPagePoints} ${result.offPageLabel} · ` +
    `${result.totalPoints} total points`
  );
}

/** Build the exact, spoiler-safe share block for a daily or endless result. */
export function buildShareText(result: ShareResult): string {
  // Lead with the identifier, then the earned tier. The tier is the hook and the
  // honest new model; the retired "Set X/Y" gate is gone. Points support, they
  // do not lead. The tier label carries the completion signal on a finished
  // board. Everything below the identifier is identical across modes.
  const lines = [
    identifierLine(result),
    tierLine(result),
    scoreRow(result.setPoints, result.offPagePoints),
  ];
  const rarity = rarityLine(result.uncommon, result.rare, result.mythic);
  if (rarity !== null) lines.push(rarity);
  lines.push(pointsLine(result));
  return lines.join('\n');
}
