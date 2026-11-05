import { useState } from 'react';
import {
  CANDIDATES,
  cueName,
  tenInTurn,
  tenOfOne,
  type Candidate,
} from './shuffleCandidates.ts';
import { HEARD, type Heard } from './shuffleNumbers.ts';

/**
 * The Shuffle candidates, for choosing between by ear, on a preview only:
 * nothing here is in the game. Each plays once, ten times in turn as the game
 * would play its three takes, or its first take ten times, for hearing what
 * the turns change. The tile tap and a find play beside them, on Soundscape
 * alone, to set them against.
 */
export type Reference = 'tick' | 'find';

const PRESSES: { kind: string; cues: (c: Candidate) => string[] }[] = [
  { kind: 'once', cues: (c) => [cueName(c, 0)] },
  { kind: 'ten in turn', cues: tenInTurn },
  { kind: 'ten of one', cues: tenOfOne },
];

/** A dB figure as the page prints it, to a tenth. */
const db = (n: number) => n.toFixed(1);
const under = (n: number, than: number) => (than - n).toFixed(1);

function numbers(heard: Heard): string {
  const { tick, find } = HEARD;
  return (
    `${Math.round(heard.durationMs)} ms long. ` +
    `Peak ${db(heard.peakDbfs)} dBFS, ${under(heard.peakDbfs, tick!.peakDbfs)} dB under the tick's. ` +
    `Loudness ${db(heard.lufs)} LUFS, ${under(heard.lufs, tick!.lufs)} dB under the tick's and ${under(heard.lufs, find!.lufs)} under a find's.`
  );
}

function reference(name: string, heard: Heard): string {
  return `${name}: ${Math.round(heard.durationMs)} ms, peak ${db(heard.peakDbfs)} dBFS, ${db(heard.lufs)} LUFS.`;
}

export function ShuffleCandidates({
  play,
  playReference,
}: {
  /** Play these cues, one press every TEN_GAP_S, the first now. */
  play: (cues: string[]) => boolean;
  /** Play the tile tap or a find on Soundscape, once. */
  playReference: (which: Reference) => boolean;
}) {
  const [played, setPlayed] = useState<string | null>(null);
  const press = (what: string, played: boolean) =>
    setPlayed(played ? `Played ${what}.` : null);

  return (
    <section
      className="found sounds__section"
      aria-labelledby="shuffle-candidates"
    >
      <h2 className="found__title" id="shuffle-candidates">
        Shuffle candidates
      </h2>
      <p className="sounds__call">
        Not in the game. For choosing, on this preview only.
      </p>
      <p className="sounds__note">
        A few tiles knocking together, for the Shuffle button. Each plays on
        Soundscape alone: there was no Shuffle sound before it. All four are
        matched in loudness, about 6 dB under the tile tap, which puts the
        duller two's peaks just under the tap's. Each has three takes for the
        game to play in turn, so Shuffle pressed again and again is not one
        sound repeated. Ten in turn plays them at eight presses a second; ten of
        one plays the first take ten times, to hear what the turns change. Each
        number is the most of the three takes.
      </p>

      <div className="sounds__group">
        <h3 className="legend__caption sounds__caption">To compare</h3>
        <div className="sounds__row">
          <button
            type="button"
            className="btn sounds__btn"
            onClick={() => press('the tile tap', playReference('tick'))}
          >
            Tile tap, on Soundscape
          </button>
          <button
            type="button"
            className="btn sounds__btn"
            onClick={() => press('a find', playReference('find'))}
          >
            Length 5 find, on Soundscape
          </button>
        </div>
        <p className="sounds__note">
          {reference('The tile tap', HEARD.tick!)}{' '}
          {reference('A length 5 find', HEARD.find!)}
        </p>
      </div>

      {CANDIDATES.map((candidate) => (
        <div key={candidate.id} className="sounds__group">
          <h3 className="legend__caption sounds__caption">{candidate.label}</h3>
          <p className="sounds__note">{candidate.about}</p>
          <p className="sounds__note">{numbers(HEARD[candidate.id]!)}</p>
          <div className="sounds__row sounds__controls">
            {PRESSES.map(({ kind, cues }) => {
              const name = `${candidate.id.toUpperCase()}, ${kind}`;
              return (
                <button
                  key={kind}
                  type="button"
                  className="btn sounds__btn"
                  data-candidate={candidate.id}
                  onClick={() => press(name, play(cues(candidate)))}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="sounds__note" role="status">
        {played ?? ''}
      </p>
    </section>
  );
}
