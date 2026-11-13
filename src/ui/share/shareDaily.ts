/**
 * The share action: a thin wrapper around the pure builder's output.
 *
 * On a phone or a tablet the Web Share API drops the block straight into the
 * group thread in one tap. On a computer it copies to the clipboard with a
 * plain confirmation, even though most computers' browsers have a share sheet
 * too: Chrome and Safari on a Mac, and Chrome and Edge on Windows. The block is
 * made to be pasted, and on a computer the sheet is a detour on the way to
 * Copy. The block is plain text only, no links, nothing that phones home.
 */

/** Shown after a successful copy. Approved copy, used as written. */
export const COPY_CONFIRMATION = 'Copied. Paste it anywhere.';

/** How the block reached the player, so the caller can confirm a copy. */
export type ShareOutcome =
  | { readonly method: 'share' }
  | { readonly method: 'clipboard'; readonly confirmation: string };

/**
 * A computer: its primary pointer is a mouse or a trackpad. A phone's or a
 * tablet's is a finger, so they keep the share sheet, and an iPad with a
 * keyboard does too, since a keyboard isn't a pointer. Not the width, since an
 * iPad is as wide as a laptop, and not the user agent, since an iPad's Safari
 * says it's a Mac.
 */
export function isComputer(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
  );
}

/** Copy the block on a computer; elsewhere, the native sheet where there is one. */
export async function shareDaily(text: string): Promise<ShareOutcome> {
  if (
    !isComputer() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    await navigator.share({ text });
    return { method: 'share' };
  }
  await navigator.clipboard.writeText(text);
  return { method: 'clipboard', confirmation: COPY_CONFIRMATION };
}
