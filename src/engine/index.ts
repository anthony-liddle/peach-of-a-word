/** Public surface of the pure engine. Framework-free, fully unit-tested. */
export * from './types.ts';
export * from './config.ts';
export { scoreWord, findScore } from './scoring.ts';
export { canForm, formableFrom, letterCounts } from './formability.ts';
export { createPuzzle } from './puzzle.ts';
export {
  sourceSetSize,
  isEligibleSource,
  eligibleSourceWords,
} from './eligibility.ts';
export { generateCalendar, CALENDAR_SEED } from './calendar.ts';
export { seededPermutation } from './shuffle.ts';
export { validateGuess, normalizeGuess } from './validate.ts';
export { classifyWord } from './classify.ts';
export { computeTier } from './tiers.ts';
export {
  dayIndex,
  dailySourceWord,
  createEndlessSource,
  type EndlessSourceOptions,
} from './daily.ts';
