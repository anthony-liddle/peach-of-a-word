import { useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { loadGameData, type GameData } from '@/data/gameData.ts';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import { Game } from '@/ui/Game.tsx';
import { useTheme } from '@/ui/useTheme.ts';
import { copy } from '@/ui/themeCopy.ts';

/**
 * The error arm carries no detail, deliberately. An internal error string is
 * not player-facing copy: it can hold anything the thrower interpolated,
 * including a word from the lists, and the lists contain words a player is
 * being protected from. Detail goes to the console for debugging. The screen
 * gets fixed copy. Because the arm has no field to hold a message, there is
 * nothing for a later edit to render by accident.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: GameData }
  | { status: 'error' };

/** Marks that this tab has already tried reloading, so it can only happen once. */
const RELOAD_KEY = 'peach:reloaded-for-stale-data';

/**
 * Reload once when the data will not load, because the likeliest cause is a
 * stale bundle.
 *
 * The data directory is versioned by its contents, so a bundle that survives a
 * data change asks for a directory the deploy no longer serves and the fetch
 * fails. The fix for that is simply to fetch the current page again, which is
 * something the app can do for the player rather than asking them to.
 *
 * Guarded by a sessionStorage flag so it cannot loop: if the reload does not
 * help, which is what a genuinely broken deploy looks like, the second attempt
 * falls through to the error screen and stays there. Returns whether a reload
 * was started, so the caller can skip painting an error over a page that is
 * about to be replaced.
 */
function reloadForStaleBundle(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
    location.reload();
    return true;
  } catch {
    // Private mode, a blocked storage partition, or no location to speak of.
    // The error screen is the correct fallback.
    return false;
  }
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  // The loading screen paints before Game exists, so the theme is read here
  // too. The inline script in index.html puts it on the document root before
  // the first paint, so it resolves correctly this early.
  const [theme] = useTheme();
  const audio = useMemo(() => new WebAudioEngine(), []);
  const storage = useMemo(() => new GameStorage(), []);

  useEffect(() => {
    let active = true;
    loadGameData()
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch((err: unknown) => {
        console.error('Game data failed to load.', err);
        if (reloadForStaleBundle()) return;
        if (active) setLoad({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  if (load.status === 'loading') {
    return (
      <div className="app">
        <div className="loading">
          <p>{copy(theme).loadingLine}</p>
        </div>
        <Analytics />
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="app">
        <div className="error">
          <p>The word lists did not load. Reload to try again.</p>
          <p className="found__empty">
            If it keeps happening, come back in a little while.
          </p>
        </div>
        <Analytics />
      </div>
    );
  }

  return (
    <>
      <Game data={load.data} audio={audio} storage={storage} />
      <Analytics />
    </>
  );
}
