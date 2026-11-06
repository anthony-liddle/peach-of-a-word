import { useEffect, useRef } from 'react';
import { copy } from '../themeCopy.ts';
import { useTheme } from '../useTheme.ts';

interface Props {
  onClose: () => void;
}

const ENABLE_URL =
  'https://www.bananagrammer.com/2013/12/the-amazing-enable-word-list-project.html';
// Classic SCOWL (v1), not its renamed successor ESDB (formerly SCOWLv2). The
// homepage now leads with ESDB, but this game uses v1: the Mythic band is
// defined as "valid in ENABLE but beyond SCOWL size 95," and ESDB dropped the
// size 95 level. If the band data is ever regenerated, regenerate from classic
// SCOWL v1, not ESDB, or the Mythic boundary moves.
const SCOWL_URL = 'https://wordlist.aspell.net/scowl_v1-readme/';

/**
 * The quiet explainer reachable from the colophon: how a puzzle is built, the
 * two word lists doing different jobs, and an honest note on why a word can feel
 * common and still land outside the set. It reuses the reveal overlay skin (so
 * each theme styles it for free) and adds a real focus trap, which the reveal
 * does not have. Closing and focus restoration are owned by the caller in Game;
 * this only moves focus in on open, traps Tab, and asks to close on Escape or an
 * outside click.
 */
export function HowItWorks({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The theme's own noun, as everything else says it: the basket, or the set.
  const [theme] = useTheme();
  const { container } = copy(theme);

  useEffect(() => {
    // Focus the dialog itself, not the close button: the card scrolls, and
    // focusing the button at its foot would scroll the title out of view. This
    // also lands a screen reader at the top, on the title.
    dialogRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Its Escape is its own. Closing can re-render before the page's key
      // handler runs on the window, which would then read nothing open and
      // clear the word in the well; Chromium and WebKit do.
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    // Trap Tab at the two ends so focus cannot leave the dialog.
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button');
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="reveal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="reveal reveal--how"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 className="reveal__word reveal__word--how" id="how-title">
          How the words work
        </h2>
        <div className="reveal__sep" />

        <div className="how__body">
          <p>Every puzzle is built from two word lists doing different jobs.</p>
          <p>
            <a href={ENABLE_URL} target="_blank" rel="noopener noreferrer">
              ENABLE
            </a>{' '}
            and{' '}
            <a href={SCOWL_URL} target="_blank" rel="noopener noreferrer">
              SCOWL
            </a>
            , with a patch list kept by hand, decide what counts as a word:
            about 427,000 of them. Almost any real word you spell counts.
          </p>
          <p>
            SCOWL also sorts those words into bands by how common they are, from
            everyday to obscure. The common band makes up the {container}, and
            the bands past it decide how rare everything else is.
          </p>
          <p>
            Each board's eight letters come from a common eight-letter word,
            chosen and checked ahead of time. A daily board is the same for
            everyone.
          </p>
          <p>
            The goal is a ladder of named ranks, climbed by points. Every word
            moves you up, and rarer words move you further. Above the ladder is
            a full {container}: every common word the letters can spell. Filling
            the {container} is rare, and never required.
          </p>
          <p>
            Words you find beyond the {container} are graded by how far past
            common they sit: Uncommon, then Rare, then Mythic, the deeper into
            the dictionary you go. They all score.
          </p>
          <p>
            A word you use every week can still land outside the {container}.
            Common here is a line drawn through a word list, and a word list
            doesn't always match one's vocabulary. You still found a real word.
            It just missed the cut.
          </p>
        </div>

        <button className="reveal__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
