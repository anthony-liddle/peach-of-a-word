/**
 * Whether the game shows any way into flagging: the flag on both cards, the
 * refused word's flag, Settings' row and Your flags.
 *
 * **Off, until the flag is hooked up the way Antoine wants (24 November).** No
 * flag had come in through it. Only the ways in are hidden: the server and the
 * sender stay as they are, so a flag already waiting in a browser still goes,
 * on load, when the network comes back and when the tab is seen again.
 *
 * `Game` reads this as the default of its `flagging` prop, so the tests that
 * hold the flag's behaviour turn it on there, and `flagHidden.flow.test.tsx`
 * holds the game as it ships.
 */
export const FLAGGING_SHOWN = false;
