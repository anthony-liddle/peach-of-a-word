/**
 * The share action: a thin wrapper around the pure builder's output. On mobile
 * the Web Share API drops the block straight into the group thread in one tap;
 * on desktop, where no share sheet exists, it copies to the clipboard with a
 * plain confirmation. The block is plain text only, no links, nothing that
 * phones home.
 */

/** Shown after a successful copy. Approved copy, used as written. */
export const COPY_CONFIRMATION = 'Copied. Paste it anywhere.';

/** How the block reached the player, so the caller can confirm a copy. */
export type ShareOutcome =
  | { readonly method: 'share' }
  | { readonly method: 'clipboard'; readonly confirmation: string };

/** Share the block via the native sheet, or copy it to the clipboard. */
export async function shareDaily(text: string): Promise<ShareOutcome> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    await navigator.share({ text });
    return { method: 'share' };
  }
  await navigator.clipboard.writeText(text);
  return { method: 'clipboard', confirmation: COPY_CONFIRMATION };
}
