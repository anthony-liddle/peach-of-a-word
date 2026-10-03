import { useCallback, useState } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { Decorations } from '@/ui/components/Decorations.tsx';
import { FOUND_ROWS, SECTIONS, SOUNDS, type Sound } from './inventory.ts';

/**
 * One button per sound the game makes, for comparing a future engine against
 * this one by ear. Unlisted: linked from nowhere and not indexed.
 *
 * It plays through the AudioEngine interface it is handed, never around it, so
 * the same page can later be pointed at the Soundscape engine. Nothing plays on
 * load: the engine makes its audio context on the first cue, which is the first
 * tap, the same as in the game.
 */
export function SoundsPage({ engine }: { engine: AudioEngine }) {
  const [muted, setMuted] = useState(engine.muted);
  const toggleMute = useCallback(() => {
    const next = !engine.muted;
    engine.setMuted(next);
    setMuted(next);
  }, [engine]);

  return (
    <div className="app sounds">
      <Decorations />
      <header className="masthead">
        <p className="masthead__kicker">Peach of a Word</p>
        <h1 className="masthead__title">
          Every <em>sound</em>
        </h1>
        <p className="masthead__rule">
          {SOUNDS.length} sounds, as the game plays them today
        </p>
      </header>

      <section className="found sounds__section" aria-labelledby="cue-mute">
        <h2 className="found__title" id="cue-mute">
          Mute
        </h2>
        <p className="sounds__call">
          <code>setMuted(muted)</code>
        </p>
        <div className="sounds__row">
          {/* Pressed wears the game's primary fill, so on and off differ by
              more than a word. */}
          <button
            type="button"
            className={'btn sounds__btn' + (muted ? ' btn--primary' : '')}
            aria-pressed={muted}
            onClick={toggleMute}
          >
            Mute every cue
          </button>
        </div>
        <p className="sounds__note" role="status">
          {muted
            ? 'Muted. Every button below now plays nothing.'
            : 'Sound on. Mute, then try any button below.'}
        </p>
      </section>

      {SECTIONS.map((section) => (
        <section
          key={section.cue}
          className="found sounds__section"
          aria-labelledby={`cue-${section.cue}`}
        >
          <h2 className="found__title" id={`cue-${section.cue}`}>
            {section.title}
          </h2>
          <p className="sounds__call">
            <code>{section.call}</code>
          </p>
          {section.cue === 'playFound' ? (
            <>
              <p className="sounds__note">
                Mythic adds a glint, and one more in the cute theme. Nothing in
                the call says so: the engine reads the theme from the page. Each
                mythic button sets its own theme while it plays.
              </p>
              {FOUND_ROWS.map((row) => (
                <div key={row.length} className="sounds__group">
                  <h3 className="legend__caption sounds__caption">
                    Length {row.length}, {row.hz} Hz
                  </h3>
                  <SoundRow sounds={row.sounds} engine={engine} />
                </div>
              ))}
            </>
          ) : (
            <SoundRow sounds={section.sounds} engine={engine} />
          )}
        </section>
      ))}
    </div>
  );
}

function SoundRow({
  sounds,
  engine,
}: {
  sounds: Sound[];
  engine: AudioEngine;
}) {
  return (
    <div className="sounds__row">
      {sounds.map((sound) => (
        <button
          key={sound.id}
          type="button"
          className="btn sounds__btn"
          data-sound={sound.id}
          onClick={() => sound.play(engine)}
        >
          {sound.label}
        </button>
      ))}
    </div>
  );
}
