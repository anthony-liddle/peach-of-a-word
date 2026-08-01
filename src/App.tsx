import { useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { loadGameData, type GameData } from '@/data/gameData.ts';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import { Game } from '@/ui/Game.tsx';
import { useTheme } from '@/ui/useTheme.ts';
import { copy } from '@/ui/themeCopy.ts';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: GameData }
  | { status: 'error'; message: string };

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
      .catch(
        (err: unknown) =>
          active &&
          setLoad({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load.',
          }),
      );
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
          <p className="found__empty">{load.message}</p>
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
