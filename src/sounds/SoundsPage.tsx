import { useCallback, useRef, useState } from 'react';
import { Decorations } from '@/ui/components/Decorations.tsx';
import { FOUND_ROWS, SECTIONS, SOUNDS, type Sound } from './inventory.ts';
import { lengthOf, type Pair } from './pair.ts';

/**
 * One button per sound the game makes, each playing that sound twice from the
 * same tap: as the game played it before Soundscape, then as a Soundscape cue,
 * for comparing the two by ear. Unlisted: linked from nowhere and not indexed.
 *
 * Blind mode plays the two in an order the page keeps to itself, called A and
 * B, until the reveal. Nothing on the page says which is which before then: not
 * a label, an attribute or a title.
 *
 * Nothing plays on load. Both engines share one audio context, which the first
 * tap makes, the same moment the game makes its own.
 */
type Side = keyof Pair;
const SAID: Record<Side, string> = {
  before: 'the game before Soundscape',
  soundscape: 'Soundscape',
};
/** The pause between the two, after the first has finished. */
const GAP_S = 0.4;

interface Played {
  sound: Sound;
  order: [Side, Side];
  blind: boolean;
  revealed: boolean;
}

export function SoundsPage({
  pair,
  random = Math.random,
}: {
  /** The two engines, made on the first call; null where there is no Web Audio. */
  pair: () => Pair | null;
  /** Which comes first in blind mode. */
  random?: () => number;
}) {
  const engines = useRef<Pair | null>(null);
  const [muted, setMuted] = useState(false);
  const [blind, setBlind] = useState(false);
  const [played, setPlayed] = useState<Played | null>(null);

  const toggleMute = useCallback(() => {
    const next = !muted;
    engines.current?.before.setMuted(next);
    engines.current?.soundscape.setMuted(next);
    setMuted(next);
  }, [muted]);

  const play = useCallback(
    (sound: Sound) => {
      // Muted, a tap makes nothing at all, as each engine on its own would
      if (muted) return;
      engines.current ??= pair();
      const both = engines.current;
      if (!both) return;
      const first: Side = blind && random() < 0.5 ? 'soundscape' : 'before';
      const order: [Side, Side] =
        first === 'before'
          ? ['before', 'soundscape']
          : ['soundscape', 'before'];
      sound.play(both[order[0]]);
      setTimeout(
        () => sound.play(both[order[1]]),
        (lengthOf(sound.id) + GAP_S) * 1000,
      );
      setPlayed({ sound, order, blind, revealed: false });
    },
    [muted, blind, pair, random],
  );

  const reveal = useCallback(
    () => setPlayed((p) => p && { ...p, revealed: true }),
    [],
  );

  return (
    <div className="app sounds">
      <Decorations />
      <header className="masthead">
        <p className="masthead__kicker">Peach of a Word</p>
        <h1 className="masthead__title">
          Every <em>sound</em>
        </h1>
        <p className="masthead__rule">
          {SOUNDS.length} sounds, each as it was, then on Soundscape
        </p>
      </header>

      <section className="found sounds__section" aria-labelledby="listening">
        <h2 className="found__title" id="listening">
          Listening
        </h2>
        <p className="sounds__note">
          Each button plays its sound twice: as the game played it before
          Soundscape, then as a Soundscape cue. In blind mode it plays them as A
          and B, in an order it does not show, until you reveal it.
        </p>
        <div className="sounds__row sounds__controls">
          {/* Pressed wears the game's primary fill, so on and off differ by
              more than a word. */}
          <button
            type="button"
            className={'btn sounds__btn' + (blind ? ' btn--primary' : '')}
            aria-pressed={blind}
            onClick={() => setBlind((b) => !b)}
          >
            Blind
          </button>
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
            : blind
              ? 'Blind. Each button plays A, then B.'
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
                Mythic adds a glint, and one more in the cute theme. The call
                does not carry the theme: the engine is given it with{' '}
                <code>setTheme</code>, so each mythic button gives it its own
                theme first.
              </p>
              {FOUND_ROWS.map((row) => (
                <div key={row.length} className="sounds__group">
                  <h3 className="legend__caption sounds__caption">
                    Length {row.length}, {row.hz} Hz
                  </h3>
                  <SoundRow
                    sounds={row.sounds}
                    play={play}
                    played={played}
                    reveal={reveal}
                  />
                </div>
              ))}
            </>
          ) : (
            <SoundRow
              sounds={section.sounds}
              play={play}
              played={played}
              reveal={reveal}
            />
          )}
        </section>
      ))}
    </div>
  );
}

function SoundRow({
  sounds,
  play,
  played,
  reveal,
}: {
  sounds: Sound[];
  play: (sound: Sound) => void;
  played: Played | null;
  reveal: () => void;
}) {
  const here = played && sounds.includes(played.sound) ? played : null;
  return (
    <>
      <div className="sounds__row">
        {sounds.map((sound) => (
          <button
            key={sound.id}
            type="button"
            className="btn sounds__btn"
            data-sound={sound.id}
            onClick={() => play(sound)}
          >
            {sound.label}
          </button>
        ))}
      </div>
      {here && (
        <div className="sounds__played">
          <p className="sounds__note" role="status">
            {here.blind && !here.revealed
              ? `Played ${here.sound.label}: A, then B.`
              : here.blind
                ? `Played ${here.sound.label}: A was ${SAID[here.order[0]]}, B was ${SAID[here.order[1]]}.`
                : `Played ${here.sound.label}: ${SAID[here.order[0]]}, then ${SAID[here.order[1]]}.`}
          </p>
          {here.blind && !here.revealed && (
            <button type="button" className="btn sounds__btn" onClick={reveal}>
              Reveal which was which
            </button>
          )}
        </div>
      )}
    </>
  );
}
