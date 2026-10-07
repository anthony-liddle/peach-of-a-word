import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  midiToFrequency,
  normalizedToADSR,
  parseCueDocument,
  serializeCueDocument,
} from 'soundscape-engine';
import type { CueDocument } from 'soundscape-engine';
import { MASTER_GAIN, WebAudioEngine } from './WebAudioEngine.ts';
import { FakeAudioContext } from '@/testing/fakeAudioContext.ts';
import { SOUNDS } from '@/sounds/inventory.ts';

/**
 * peach.cues.json, the game's 34 sounds as Soundscape cues, held to what the
 * game's own engine schedules. scripts/build-sound-cues.ts wrote it from the
 * engine's note() calls; this reads the engine back independently, through the
 * recording context, so a change on either side fails here.
 */
const TEXT = readFileSync(resolve(__dirname, 'peach.cues.json'), 'utf8');
const parsed = parseCueDocument(TEXT);
const document = (parsed.ok ? parsed.document : null) as CueDocument;

/** The game's note(): set the floor at t0, ramp to the peak, ramp back to the floor. */
const ENVELOPE =
  /^set ([\d.e-]+) at ([\d.e-]+)$|^ramp ([\d.e-]+) at ([\d.e-]+)$/;

interface Scheduled {
  type: string;
  hz: number;
  start: number;
  stop: number;
  events: { value: number; time: number }[];
}

/** What the game's engine schedules for a sound, oscillator by oscillator. */
function schedule(play: (engine: WebAudioEngine) => void): Scheduled[] {
  const ctx = new FakeAudioContext();
  play(new WebAudioEngine(ctx as unknown as AudioContext));
  return ctx.oscillators.map((osc) => {
    const gain = osc.outputs[0] as unknown as { gain: { events: string[] } };
    return {
      type: osc.type,
      hz: osc.frequency.value,
      start: osc.starts[0]!,
      stop: osc.stops[0]!,
      events: gain.gain.events.map((e) => {
        const m = ENVELOPE.exec(e)!;
        return { value: Number(m[1] ?? m[3]), time: Number(m[2] ?? m[4]) };
      }),
    };
  });
}

describe('the cue document', () => {
  test('is valid, and saved in its canonical form', () => {
    expect(parsed.ok).toBe(true);
    expect(serializeCueDocument(document)).toBe(TEXT);
  });

  test('has one instrument per waveform, each fading over its own note', () => {
    // Notes of every length share an instrument: its decay lasts until each
    // note's release, so none carries a decay of fixed length
    expect(Object.keys(document.instruments).sort()).toEqual([
      'sine',
      'square',
      'triangle',
    ]);
    for (const [name, instrument] of Object.entries(document.instruments)) {
      expect(instrument.waveform).toBe(name);
      expect(instrument.decayUntilRelease).toBe(true);
      expect(instrument).not.toHaveProperty('decay');
    }
  });

  test('has one cue per sound the game makes, named as the page names it', () => {
    expect(Object.keys(document.cues).sort()).toEqual(
      SOUNDS.map((s) => s.id).sort(),
    );
    expect(SOUNDS).toHaveLength(34);
  });

  test('names each cute mythic cue with its theme, beside a letterpress twin', () => {
    const cute = Object.keys(document.cues).filter((n) =>
      n.endsWith('-mythic-cute'),
    );
    expect(cute.sort()).toEqual(
      [3, 4, 5, 6, 7, 8].map((l) => `found-${l}-mythic-cute`),
    );
    for (const name of cute) {
      expect(
        document.cues[name.replace('-cute', '-letterpress')],
      ).toBeDefined();
    }
  });
});

describe.each(SOUNDS.map((s) => [s.id, s] as const))('%s', (id, sound) => {
  test("is the game's own sound, note for note", () => {
    const game = schedule(sound.play);
    const notes = document.cues[id]!.notes;
    expect(notes).toHaveLength(game.length);
    notes.forEach((note, i) => {
      const g = game[i]!;
      const instrument = document.instruments[note.instrument]!;
      const [floor, peak, end] = g.events;
      // Waveform, and the frequency the oscillator holds, which is a float32
      expect(instrument.waveform).toBe(g.type);
      expect(Math.fround(midiToFrequency(note.pitch))).toBe(Math.fround(g.hz));
      // Starts at the same double, peaks at the same level through the master
      expect(note.start).toBe(g.start);
      expect(floor!.time).toBe(g.start);
      expect(note.level).toBe(peak!.value * MASTER_GAIN);
      expect(instrument.envelopeFloor).toBe(floor!.value * MASTER_GAIN);
      expect(end!.value).toBe(floor!.value);
      // The attack reaches the peak when the game's does, to the last bit or
      // two, and the decay lasts until the note's release, at its duration,
      // which is where the game's ramp reaches the floor
      const attack = normalizedToADSR(instrument.attack, 'attack');
      expect(Math.abs(g.start + attack - peak!.time)).toBeLessThan(1e-15);
      expect(instrument.decayUntilRelease).toBe(true);
      expect(g.start + note.duration).toBe(end!.time);
      // The release and the voice's 10 ms margin are the game's tail
      expect(
        normalizedToADSR(instrument.release, 'release') + 0.01,
      ).toBeCloseTo(g.stop - end!.time, 12);
      // Everything else in the instrument stays out of the way
      expect(instrument).toMatchObject({
        envelopeCurve: 'exponential',
        filterType: 'none',
        sustain: 0,
        distortion: 0,
        delayMix: 0,
        reverbMix: 0,
        lfoDepth: 0,
        unisonDetune: 0,
        velocityResponse: 0,
        pitchOffset: 0,
      });
    });
  });
});
