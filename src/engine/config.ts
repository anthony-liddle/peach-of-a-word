/**
 * Game rules. Numbers the GDD flags as tunable after playtest live here as named
 * constants, not scattered literals: the scoring curve, the tier ladder, the
 * daily epoch. Change them in one place.
 */
import type { Rung } from './types.ts';

/** Minimum playable word length, honoring the original game. */
export const MIN_WORD_LENGTH = 3;

/** The source word is always exactly 8 letters. */
export const SOURCE_WORD_LENGTH = 8;

/**
 * Minimum set size for a source word to headline a puzzle. Crown-inclusive: the
 * same "X of Y" count the completion counter shows, which includes the source
 * word itself when the crown is a set word (it always is for an eligible crown).
 * A daily under this floor felt thin, so sub-floor words stay real words found
 * inside other racks but never headline a day. See scripts/build-calendar.ts and
 * src/engine/eligibility.ts, both of which compute the count via createPuzzle.
 */
export const MIN_SET_SIZE = 15;

/**
 * Points by word length. Index by length; lengths below the minimum score 0.
 * 3=1, 4=3, 5=5, 6=7, 7=11, 8=15.
 */
const SCORE_BY_LENGTH: Readonly<Record<number, number>> = {
  3: 1,
  4: 3,
  5: 5,
  6: 7,
  7: 11,
  8: 15,
};

/** Score for a word of the given length. 0 below the minimum length. */
export function scoreForLength(length: number): number {
  return SCORE_BY_LENGTH[length] ?? (length > SOURCE_WORD_LENGTH ? 15 : 0);
}

/**
 * DRAFT, TUNABLE. The rarity bonus added on top of the length score for an
 * off-page find, by rung. A set word is the on-page baseline and carries no
 * bonus. These pay for the discovery Bea loves, but stay modest because the
 * ladder denominator is the set points (a small, stable scale): measured on real
 * racks, a bonus of 3/6/12 let four off-page hits top the ladder while the common
 * words sat untouched, so these are tuned down to keep the guardrail honest
 * (topping needs roughly 7 to 21 off-page finds, breadth still matters). Tune
 * after Bea plays; this is the one place to change them.
 */
export const RARITY_BONUS: Readonly<Record<Rung, number>> = {
  set: 0,
  uncommon: 1,
  rare: 2,
  mythic: 4,
};

/** A rung on the named points ladder. Names are theme-skinned in the UI. */
export interface TierDef {
  /** Theme-neutral id; the displayed name is a per-theme skin over the index. */
  readonly id: string;
  /** Fraction of the rack's reachable score needed to reach this rank (0 to 1). */
  readonly threshold: number;
}

/**
 * The named ladder: six ranks by score as a fraction of the rack's reachable
 * score, low to high. DRAFT, TUNABLE thresholds. The top named rank sits at 0.80,
 * not 1.00: finding everything is the completion peak (Stage 2), which sits above
 * this whole ladder. There is no source-word gate on the named ranks; the crown
 * is its own separate moment. The per-theme names live in ui/themeCopy.ts, keyed
 * to these six rungs by index, so the ladder structure and the names are separate.
 */
export const TIERS: readonly TierDef[] = [
  { id: 'tier-0', threshold: 0 },
  { id: 'tier-1', threshold: 0.08 },
  { id: 'tier-2', threshold: 0.22 },
  { id: 'tier-3', threshold: 0.4 },
  { id: 'tier-4', threshold: 0.6 },
  { id: 'tier-5', threshold: 0.8 },
];

/**
 * Day one of the daily sequence (local calendar date). The day index is the
 * number of whole calendar days from this date. Tunable.
 */
export const DAILY_EPOCH = { year: 2026, month: 6, day: 23 } as const;

/**
 * Fixed origin for the per-day storage and streak key. This NEVER moves, even
 * when DAILY_EPOCH is re-anchored by a calendar regeneration. The crown for a
 * date is selected from the movable DAILY_EPOCH, but progress and streak are
 * keyed by days since this fixed origin, so re-anchoring the calendar cannot
 * shift the day keys and a streak survives a regeneration with no migration.
 * Persisted records are already days since this date, so it must stay 2026-01-01.
 */
export const STORAGE_EPOCH = { year: 2026, month: 1, day: 1 } as const;

/**
 * Named-ladder rank a daily must reach to count toward the streak. Index 3 is
 * the 0.40 rung of the six-rank points ladder (the old "In the Flow" bar), a
 * sensible "this day counts" mark. Tied to the ladder, so revisit if TIERS change.
 */
export const STREAK_TIER_INDEX = 3;
