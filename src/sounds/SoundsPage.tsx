import { useCallback, useEffect, useRef, useState } from 'react';
import { Decorations } from '@/ui/components/Decorations.tsx';
import { FOUND_ROWS, SECTIONS, SOUNDS, type Sound } from './inventory.ts';
import { lengthOf, type Pair } from './pair.ts';
import { DEPARTURES } from '@/audio/departures.ts';
import { BALANCE_S, type MixPlayer } from './balance.ts';
import { MIXES, type Mix, type MixId } from './mixes.ts';
import { LEVELS, type MixRow } from './mixLevels.ts';

/**
 * One button per sound the game makes, each playing that sound twice from the
 * same tap: as the game played it before Soundscape, then as a Soundscape cue,
 * for comparing the two by ear. Unlisted: linked from nowhere and not indexed.
 *
 * Blind mode plays the two in an order the page keeps to itself, called A and
 * B, until the reveal. Nothing on the page says which is which before then: not
 * a label, an attribute or a title.
 *
 * Hear the balance plays a short game in each of three mixes, for choosing
 * how loud the everyday sounds should be beside the two big ones. A press stops
 * whatever is still sounding, so two mixes never overlap.
 *
 * Nothing plays on load. Every engine shares one audio context, which the first
 * tap makes, the same moment the game makes its own.
 */
type Side = keyof Pair;
const SAID: Record<Side, string> = {
  before: 'the game before Soundscape',
  soundscape: 'Soundscape',
};
/** A day as the page says it: 5 November 2026. */
const ON = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
/** The pause between the two, after the first has finished. */
const GAP_S = 0.4;

interface Played {
  sound: Sound;
  order: [Side, Side];
  blind: boolean;
  revealed: boolean;
}

/** How long after the last beat the status still says it is playing: the basket's ring. */
const BALANCE_TAIL_S = 1.7;

export function SoundsPage({
  pair,
  mixes = () => null,
  random = Math.random,
}: {
  /** The two engines, made on the first call; null where there is no Web Audio. */
  pair: () => Pair | null;
  /** The balance's player, made on the first call; null where there is no Web Audio. */
  mixes?: () => MixPlayer | null;
  /** Which comes first in blind mode. */
  random?: () => number;
}) {
  const engines = useRef<Pair | null>(null);
  const mixPlayer = useRef<MixPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [blind, setBlind] = useState(false);
  const [played, setPlayed] = useState<Played | null>(null);
  const [playing, setPlaying] = useState<Mix | null>(null);

  // The status says a mix is playing until its last sound has rung out
  useEffect(() => {
    if (!playing) return;
    const done = setTimeout(
      () => setPlaying(null),
      (BALANCE_S + BALANCE_TAIL_S) * 1000,
    );
    return () => clearTimeout(done);
  }, [playing]);

  const stopMix = useCallback(() => {
    mixPlayer.current?.stop();
    setPlaying(null);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    engines.current?.before.setMuted(next);
    engines.current?.soundscape.setMuted(next);
    // Muting cuts the balance off too, where it is mid-game
    if (next) stopMix();
    setMuted(next);
  }, [muted, stopMix]);

  const playMix = useCallback(
    (mix: Mix) => {
      if (muted) return;
      mixPlayer.current ??= mixes();
      if (!mixPlayer.current) return;
      mixPlayer.current.play(mix.id);
      setPlaying(mix);
    },
    [muted, mixes],
  );

  const play = useCallback(
    (sound: Sound) => {
      // Muted, a tap makes nothing at all, as each engine on its own would
      if (muted) return;
      // One thing at a time: a sound to compare stops the balance
      stopMix();
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
    [muted, blind, pair, random, stopMix],
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
          {SOUNDS.length} sounds, as the game played them before Soundscape,
          then as it plays them now
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

      <section className="found sounds__section" aria-labelledby="balance">
        <h2 className="found__title" id="balance">
          Hear the balance
        </h2>
        <p className="sounds__note">
          A short game, played the way the game plays it: a few letters ticking
          and the word they set, a Shuffle, finds of three more lengths, a miss,
          the peach of a word, then the full basket. About{' '}
          {Math.round(BALANCE_S + BALANCE_TAIL_S)} seconds. Each button plays it
          in one mix, and stops anything still playing.
        </p>
        <p className="sounds__note">
          On an iPhone, turn silent mode off first. This page is silent in it,
          as every web page is.
        </p>
        {MIXES.map((mix) => (
          <MixView
            key={mix.id}
            mix={mix}
            play={() => playMix(mix)}
            levels={LEVELS[mix.id].rows}
            finds={LEVELS[mix.id].finds}
            worst={LEVELS[mix.id].worst}
          />
        ))}
        <div className="sounds__row">
          <button type="button" className="btn sounds__btn" onClick={stopMix}>
            Stop
          </button>
        </div>
        <p className="sounds__note" role="status">
          {muted
            ? 'Muted. The mixes play nothing.'
            : playing
              ? `Playing ${playing.title}.`
              : 'Nothing playing.'}
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
          {section.sounds
            .filter((sound) => DEPARTURES[sound.id])
            .map((sound) => {
              const { is, was } = DEPARTURES[sound.id]!;
              const chosen = ON.format(new Date(DEPARTURES[sound.id]!.chosen));
              return (
                <p key={sound.id} className="sounds__note sounds__departure">
                  {was === null
                    ? `New with Soundscape, chosen on ${chosen}. ${is} The game made no sound for it before, so a tap here plays silence, then the cue.`
                    : `Changed on ${chosen}. ${is} Before, it was ${was} So a tap here plays two different sounds, on purpose.`}
                </p>
              );
            })}
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

/** A number as the table shows it: one place, and a plain minus. */
const one = (n: number): string => n.toFixed(1);

/** A gap from the peach of a word, in both measures. */
function against(row: MixRow): string {
  if (row.underDb === 0) return 'Itself';
  const way = row.underDb > 0 ? 'under' : 'over';
  return `${one(Math.abs(row.underDb))} dB ${way} (${one(Math.abs(row.underPhon))} phon)`;
}

function MixView({
  mix,
  play,
  levels,
  finds,
  worst,
}: {
  mix: Mix;
  play: () => void;
  levels: MixRow[];
  finds: { lufs: [number, number]; dbtp: [number, number] };
  worst: number;
}) {
  return (
    <div className="sounds__group">
      <div className="sounds__row">
        <button
          type="button"
          className="btn sounds__btn"
          data-mix={mix.id satisfies MixId}
          onClick={play}
        >
          {mix.title}
        </button>
      </div>
      <p className="sounds__note">{mix.line}</p>
      <details className="sounds__numbers">
        <summary>{mix.title}, in numbers</summary>
        <table className="sounds__table">
          <thead>
            <tr>
              <th scope="col">Sound</th>
              <th scope="col">Peak</th>
              <th scope="col">Loudness</th>
              <th scope="col">Against the peach of a word</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((row) => (
              <tr key={row.cue}>
                <th scope="row">{row.label}</th>
                <td>{one(row.dbtp)} dBTP</td>
                <td>{one(row.lufs)} LUFS</td>
                <td>{against(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sounds__note">
          All 30 finds: {one(finds.lufs[0])} to {one(finds.lufs[1])} LUFS,
          peaking at {one(finds.dbtp[0])} to {one(finds.dbtp[1])} dBTP. The most
          any pile-up of sounds in the game reaches: {one(worst)} dBTP.
        </p>
      </details>
    </div>
  );
}
