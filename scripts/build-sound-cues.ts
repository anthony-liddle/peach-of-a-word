/**
 * Writes src/audio/peach.cues.json: the game's 34 sounds as one Soundscape cue
 * document, every value taken from the reference engine: how the game sounded
 * before Soundscape.
 *
 * Each sound on the /sounds page is played through a real ReferenceAudioEngine
 * with its private note() replaced by a recorder, so every call's arguments
 * arrive exactly as the engine computes them: the frequency, the start offset
 * (3 * 0.1, not 0.3), the duration, the waveform and the peak. The three
 * literals inside note() itself, the floor, the attack and the tail, are copied
 * below, and src/audio/peachCues.test.ts holds the document to what the engine
 * actually schedules, so a change to note() fails there instead of being copied
 * wrongly.
 *
 * One instrument per waveform: each fades over its own note, its decay lasting
 * until the note's release, which is where the game's ramp to the floor ends.
 *
 * The script stops rather than approximate: an unknown waveform, a pitch that
 * misses the engine's frequency in float32, or an attack that does not map
 * back to the engine's 12 ms.
 *
 * Run once. From then on the document is the source, which the cue editor will
 * edit; nothing in it is computed when it loads.
 *
 *   pnpm sounds:cues
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CUE_FORMAT,
  CUE_VERSION,
  midiToFrequency,
  normalizedToADSR,
  serializeCueDocument,
  validateCueDocument,
} from 'soundscape-engine';
import type { CueDocument, CueInstrument, CueNote } from 'soundscape-engine';

// The inventory sets the theme on the document root for a mythic row, and the
// engine reads it back. A root with a dataset is all either of them touches.
(globalThis as unknown as { document: unknown }).document = {
  documentElement: { dataset: {} },
};

const { MASTER_GAIN, ReferenceAudioEngine } =
  await import('../src/reference/ReferenceAudioEngine.ts');
const { SOUNDS } = await import('../src/sounds/inventory.ts');

// note() in src/reference/ReferenceAudioEngine.ts, transcribed:
//   gain.setValueAtTime(0.0001, t0)                       the floor
//   gain.exponentialRampToValueAtTime(peak, t0 + 0.012)   the attack
//   gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
//   osc.stop(t0 + duration + 0.02)                        the tail
const FLOOR = 0.0001;
const ATTACK = 0.012;
const TAIL = 0.02;

// Soundscape releases a note for normalizedToADSR(0, 'release') = 0.01 s and
// stops its oscillator 0.01 s after that: the game's 20 ms tail.
if (normalizedToADSR(0, 'release') + 0.01 !== TAIL) {
  throw new Error('a release of 0 plus the stop margin is not the 20 ms tail');
}

/**
 * One instrument per waveform the engine plays, named for it. The decay lasts
 * until each note's release, so a note of any length fades over its own, as
 * the game's ramp to the floor ends at the note's duration.
 */
const WAVEFORMS = new Set(['sine', 'square', 'triangle']);

function instrument(waveform: string): CueInstrument {
  const attack = Math.sqrt((ATTACK - 0.001) / 1.999);
  if (Math.abs(normalizedToADSR(attack, 'attack') - ATTACK) > 1e-15) {
    throw new Error(`${waveform}: the attack does not map back to 12 ms`);
  }
  return {
    waveform: waveform as CueInstrument['waveform'],
    pitchOffset: 0,
    attack,
    decayUntilRelease: true,
    sustain: 0,
    release: 0,
    envelopeCurve: 'exponential',
    envelopeFloor: FLOOR * MASTER_GAIN,
    filterType: 'none',
    filterCutoff: 1,
    filterResonance: 0,
    delayTime: 0,
    delayFeedback: 0,
    delayMix: 0,
    distortion: 0,
    reverbMix: 0,
    lfoRate: 0,
    lfoDepth: 0,
    lfoTarget: 'pitch',
    unisonDetune: 0,
    velocityResponse: 0,
  };
}

/** The MIDI pitch whose frequency is the engine's, to the float32 the oscillator holds. */
function pitchOf(hz: number): number {
  const pitch = 69 + 12 * Math.log2(hz / 440);
  if (Math.fround(midiToFrequency(pitch)) !== Math.fround(hz)) {
    throw new Error(`no pitch lands on ${hz} Hz in float32`);
  }
  return pitch;
}

interface Call {
  freq: number;
  startOffset: number;
  duration: number;
  type: string;
  peak: number;
}

// Enough of a context for the engine to build its master; the notes go to the
// recorder, not here.
const context = {
  currentTime: 0,
  state: 'running',
  destination: {},
  createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
};

const instruments: Record<string, CueInstrument> = {};
const cues: Record<string, { notes: CueNote[] }> = {};
for (const sound of SOUNDS) {
  const calls: Call[] = [];
  const engine = new ReferenceAudioEngine(context as unknown as AudioContext);
  (engine as unknown as { note: (...a: unknown[]) => void }).note = (
    freq,
    startOffset,
    duration,
    type,
    peak,
  ) => {
    calls.push({ freq, startOffset, duration, type, peak } as Call);
  };
  sound.play(engine);
  if (!calls.length) throw new Error(`${sound.id} played nothing`);
  cues[sound.id] = {
    notes: calls.map((c, i) => {
      if (!WAVEFORMS.has(c.type))
        throw new Error(`${sound.id}: no instrument for ${c.type}`);
      instruments[c.type] ??= instrument(c.type);
      return {
        id: `${sound.id}-${i + 1}`,
        instrument: c.type,
        start: c.startOffset,
        duration: c.duration,
        pitch: pitchOf(c.freq),
        level: c.peak * MASTER_GAIN,
      };
    }),
  };
}

const document: CueDocument = {
  format: CUE_FORMAT,
  version: CUE_VERSION,
  instruments,
  cues,
};
const validation = validateCueDocument(document);
if (!validation.ok) {
  throw new Error(
    validation.problems.map((p) => `${p.path}: ${p.message}`).join('\n'),
  );
}
const out = resolve(import.meta.dirname, '../src/audio/peach.cues.json');
writeFileSync(out, serializeCueDocument(validation.document));
console.log(
  `wrote ${Object.keys(cues).length} cues, ${Object.keys(instruments).length} instruments, ` +
    `${Object.values(cues).reduce((n, c) => n + c.notes.length, 0)} notes to ${out}`,
);
