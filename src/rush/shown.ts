/**
 * Whether the game shows Peach rush: the start, the run, its button in the
 * toolbar, and Offer Peach rush and Longer clock in Settings.
 *
 * **On since "Peach Rush On The Web" PR 4,** on Antoine's go after VoiceOver
 * on his iPhone and TalkBack in the emulator, on its preview. Built off across
 * PRs 2 and 3 (#217, #219) so each could merge alone.
 *
 * `Game` reads `rushByDefault()` as the default of its `rush` prop, so a test
 * can still render the game without it, and `rushShown.flow.test.tsx` holds
 * the game as it ships.
 */
export const RUSH_SHOWN = true;

/**
 * The switch, or in a development build `?rush` in the address, which let the
 * run be looked at and pictured while the switch was off. The address does
 * nothing in a production build, where this is the switch alone.
 */
export function rushByDefault(): boolean {
  if (RUSH_SHOWN) return true;
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('rush');
}
