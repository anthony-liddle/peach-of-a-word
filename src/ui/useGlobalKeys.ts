import { useEffect, useRef, type RefObject } from 'react';
import type { PlayApi } from './useGame.ts';

/**
 * Full keyboard play: type letters, Enter to set, Backspace to delete.
 *
 * A chip or the well's line, marked `data-opens-card`, keeps its own Enter, as
 * any native button does, so Enter on one opens that word's card. A letter
 * typed on one hands focus back to the letter tiles, so the next Enter sets
 * the word. Every other button leaves Enter to the page.
 */
export function useGlobalKeys(
  game: PlayApi,
  suppressed: boolean,
  tiles: RefObject<HTMLElement | null>,
) {
  const ref = useRef(game);
  ref.current = game;
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = ref.current;
      // The reveal or the explainer popup owns the keyboard while it is open.
      if (g.state.revealOpen || suppressedRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onOpener =
        e.target instanceof Element &&
        e.target.closest('[data-opens-card]') !== null;

      if (e.key === 'Enter') {
        if (onOpener) return;
        e.preventDefault();
        g.submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        g.removeLast();
      } else if (e.key === 'Escape') {
        g.clear();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        // The page stays put, as it did before focus moved: a plain focus()
        // scrolls the tiles' top edge into view in Chromium and WebKit,
        // leaving the well above the screen at a phone's width, and Firefox
        // doesn't scroll at all.
        if (onOpener) tiles.current?.focus({ preventScroll: true });
        g.addLetter(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles]);
}
