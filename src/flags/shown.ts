/**
 * Whether the game shows any way into flagging: the flag on both cards, the
 * refused word's flag, Settings' row and Your flags.
 *
 * **Off, until the flag is hooked up the way Antoine wants (24 November).** No
 * flag had come in through it. Off, the website also sends nothing: a flag
 * already waiting in a browser stays there, and goes once this is back on. The
 * server is left as it is.
 *
 * **Turning it back on brings back the privacy page's text on flagging,** as
 * Antoine approved it (web #208 to #210); see "The Website's Flag, Hidden" in
 * the discovery report.
 *
 * `Game` reads this as the default of its `flagging` prop, so the tests that
 * hold the flag's behaviour turn it on there, and `flagHidden.flow.test.tsx`
 * holds the game as it ships.
 */
export const FLAGGING_SHOWN = false;
