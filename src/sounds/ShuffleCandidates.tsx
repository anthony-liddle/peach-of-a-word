import { useState } from 'react';
import {
  CANDIDATES,
  TILE_TAP_CUE,
  cueName,
  tenInTurn,
  tenOfOne,
  type Candidate,
} from './shuffleCandidates.ts';
import { HEARD, type Heard } from './shuffleNumbers.ts';

/**
 * The candidates, for choosing between by ear, on a preview only: nothing
 * here is in the game. Shuffle's, then one for the tile tap. Each plays once,
 * ten times in turn as the game would play its three takes, or its first take
 * ten times, for hearing what the turns change. The game's own sounds play
 * beside them, on Soundscape alone, to set them against.
 */
export type Reference = 'tick' | 'find';

const PRESSES: { kind: string; cues: (c: Candidate) => string[] }[] = [
  { kind: 'once', cues: (c) => [cueName(c, 0)] },
  { kind: 'ten in turn', cues: tenInTurn },
  { kind: 'ten of one', cues: tenOfOne },
];

/** A count as the page says it in a sentence. */
const COUNTED: Record<number, string> = { 4: 'four', 5: 'five', 6: 'six' };

/** A dB figure as the page prints it, to a tenth. */
const db = (n: number) => n.toFixed(1);
/** How far one level is from another, and which way. */
const from = (n: number, than: number) =>
  `${Math.abs(than - n).toFixed(1)} dB ${n <= than ? 'under' : 'over'}`;

function numbers(heard: Heard): string {
  const { tick, find } = HEARD;
  return (
    `${Math.round(heard.durationMs)} ms long. ` +
    `Peak ${db(heard.peakDbfs)} dBFS, ${from(heard.peakDbfs, tick!.peakDbfs)} the tick's. ` +
    `Loudness ${db(heard.lufs)} LUFS, ${from(heard.lufs, tick!.lufs)} the tick's and ${from(heard.lufs, find!.lufs)} a find's.`
  );
}

function reference(name: string, heard: Heard): string {
  return `${name}: ${Math.round(heard.durationMs)} ms, peak ${db(heard.peakDbfs)} dBFS, ${db(heard.lufs)} LUFS.`;
}

function CandidateGroup({
  candidate,
  press,
}: {
  candidate: Candidate;
  press: (name: string, cues: string[]) => void;
}) {
  return (
    <div className="sounds__group">
      <h3 className="legend__caption sounds__caption">{candidate.label}</h3>
      <p className="sounds__note">{candidate.about}</p>
      <p className="sounds__note">{numbers(HEARD[candidate.id]!)}</p>
      <div className="sounds__row sounds__controls">
        {PRESSES.map(({ kind, cues }) => {
          const name = `${candidate.short}, ${kind}`;
          return (
            <button
              key={kind}
              type="button"
              className="btn sounds__btn"
              data-candidate={candidate.id}
              onClick={() => press(name, cues(candidate))}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const [played, setPlayed] = useState<{
    where: 'shuffle' | 'tap';
    what: string;
  } | null>(null);
  const said = (where: 'shuffle' | 'tap', what: string, played: boolean) =>
    setPlayed(played ? { where, what } : null);
  const status = (where: 'shuffle' | 'tap') => (
    <p className="sounds__note" role="status">
      {played?.where === where ? `Played ${played.what}.` : ''}
    </p>
  );
  const shuffle = CANDIDATES.filter((c) => c.role === 'shuffle');
  const taps = CANDIDATES.filter((c) => c.role === 'tap');

  return (
    <>
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
          Soundscape alone: there was no Shuffle sound before it. All{' '}
          {COUNTED[shuffle.length] ?? shuffle.length} are matched in loudness,
          about 6 dB under the tile tap, which puts the duller two's peaks just
          under the tap's. Each has three takes for the game to play in turn, so
          Shuffle pressed again and again is not one sound repeated. Ten in turn
          plays them at eight presses a second; ten of one plays the first take
          ten times, to hear what the turns change. Each number is the most of
          the three takes.
        </p>

        <div className="sounds__group">
          <h3 className="legend__caption sounds__caption">To compare</h3>
          <div className="sounds__row">
            <button
              type="button"
              className="btn sounds__btn"
              onClick={() =>
                said('shuffle', 'the tile tap', playReference('tick'))
              }
            >
              Tile tap, on Soundscape
            </button>
            <button
              type="button"
              className="btn sounds__btn"
              onClick={() => said('shuffle', 'a find', playReference('find'))}
            >
              Length 5 find, on Soundscape
            </button>
          </div>
          <p className="sounds__note">
            {reference('The tile tap', HEARD.tick!)}{' '}
            {reference('A length 5 find', HEARD.find!)}
          </p>
        </div>

        {shuffle.map((candidate) => (
          <CandidateGroup
            key={candidate.id}
            candidate={candidate}
            press={(name, cues) => said('shuffle', name, play(cues))}
          />
        ))}

        {status('shuffle')}
      </section>

      <section
        className="found sounds__section"
        aria-labelledby="tap-candidates"
      >
        <h2 className="found__title" id="tap-candidates">
          Tile tap candidate
        </h2>
        <p className="sounds__call">
          Not in the game. A possible replacement for <code>tick()</code>, on
          this preview only.
        </p>
        <p className="sounds__note">
          A single click, matched in loudness to the tile tap it would replace.
          A click spends its energy in a few milliseconds, so matching the tap's
          loudness takes a higher peak than the tap's. It has three takes for
          the game to play in turn, a little apart in tile and force, so a word
          typed is not one sound repeated. Ten in turn plays them at eight
          letters a second, beside the tile tap ten times at the same pace.
        </p>

        <div className="sounds__group">
          <h3 className="legend__caption sounds__caption">To compare</h3>
          <div className="sounds__row">
            {(
              [
                ['once', 1],
                ['ten in a row', 10],
              ] as const
            ).map(([kind, times]) => {
              const name = `The tile tap, ${kind}`;
              return (
                <button
                  key={kind}
                  type="button"
                  className="btn sounds__btn"
                  onClick={() =>
                    said(
                      'tap',
                      name,
                      play(Array.from({ length: times }, () => TILE_TAP_CUE)),
                    )
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
          <p className="sounds__note">
            {reference('The tile tap', HEARD.tick!)}
          </p>
        </div>

        {taps.map((candidate) => (
          <CandidateGroup
            key={candidate.id}
            candidate={candidate}
            press={(name, cues) => said('tap', name, play(cues))}
          />
        ))}

        {status('tap')}
      </section>
    </>
  );
}
