import { useEffect, useRef } from 'react';
import type { PlayApi } from './useGame.ts';

/** Full keyboard play: type letters, Enter to set, Backspace to delete. */
export function useGlobalKeys(game: PlayApi, suppressed: boolean) {
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

      if (e.key === 'Enter') {
        e.preventDefault();
        g.submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        g.removeLast();
      } else if (e.key === 'Escape') {
        g.clear();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        g.addLetter(e.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
