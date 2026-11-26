/**
 * Whether the game shows Peach rush: the run, its button in the toolbar, and
 * Longer clock in Settings.
 *
 * **Off until it's built and checked on phones (Antoine, 25 November).** The
 * run is built across PRs 2 and 3 of "Peach Rush On The Web", and PR 4 turns
 * this on, on his go after VoiceOver and TalkBack. Off, the website shows none
 * of it and writes nothing under the run's keys.
 *
 * `Game` reads `rushByDefault()` as the default of its `rush` prop, so the
 * run's tests turn it on there, and `rushHidden.flow.test.tsx` holds the game
 * as it ships.
 */
export const RUSH_SHOWN = false;

/**
 * The switch, or in a development build `?rush` in the address, so the run
 * can be looked at and pictured before it's shown. The address does nothing in
 * a production build, where this is the switch alone.
 */
export function rushByDefault(): boolean {
  if (RUSH_SHOWN) return true;
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('rush');
}
