import { useState, type Ref } from 'react';
import type { Puzzle } from '@/engine/index.ts';
import { APP_DISPLAY_NAME } from '@/displayName.ts';
import { useTheme } from '../useTheme.ts';
import type { Mode } from '../useGame.ts';
import { buildShareText } from '../share/shareText.ts';
import { dailyShareResult, endlessShareResult } from '../share/shareResult.ts';
import { shareDaily } from '../share/shareDaily.ts';

interface Props {
  puzzle: Puzzle;
  found: readonly string[];
  /**
   * Which game this share is for. Daily hides the answer; endless may flex the
   * found source word. The gate is on this flag, so daily stays strict by
   * default and only the explicit endless path can show the source word.
   */
  mode: Mode;
  /** The puzzle's date, shown short in the daily block. Ignored for endless. */
  date: Date;
  /**
   * A handle on the Share button itself, so completion can land the player on
   * the durable Share once the celebration card is dismissed.
   */
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * The share control, for both modes. Builds the spoiler-safe block from the
 * result and hands it to the share action: the native sheet on mobile, the
 * clipboard on desktop. The daily block hides the answer; the endless block
 * labels itself Endless and may carry the found source word. The title is read
 * from the display-name constant, never hardcoded, so the pending rename flows
 * through.
 */
export function ShareButton({ puzzle, found, mode, date, buttonRef }: Props) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [theme] = useTheme();

  async function onShare() {
    const result =
      mode === 'endless'
        ? endlessShareResult(puzzle, found, APP_DISPLAY_NAME, theme)
        : dailyShareResult(puzzle, found, date, APP_DISPLAY_NAME, theme);
    const text = buildShareText(result);
    try {
      const outcome = await shareDaily(text);
      // Only the clipboard path needs a confirmation; the native sheet is its
      // own acknowledgement.
      setConfirmation(
        outcome.method === 'clipboard' ? outcome.confirmation : null,
      );
    } catch {
      // The player dismissed the share sheet. Nothing to confirm, nothing broke.
    }
  }

  return (
    <div className="share">
      <button
        type="button"
        className="btn share__btn"
        onClick={onShare}
        ref={buttonRef}
      >
        Share
      </button>
      {/* A polite live region for the copy confirmation. Announced via aria-live
          rather than role="status" so it does not collide with the board's own
          status region. */}
      <p className="share__confirm" aria-live="polite" aria-atomic="true">
        {confirmation ?? ''}
      </p>
    </div>
  );
}
