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
import {
  MASTER_GAIN,
  ReferenceAudioEngine,
} from '@/reference/ReferenceAudioEngine.ts';
import { FakeAudioContext } from '@/testing/fakeAudioContext.ts';
import { SOUNDS } from '@/sounds/inventory.ts';
import { DEPARTURES, departed } from './departures.ts';
import { MIX, gainOf } from './mix.ts';

/**
 * peach.cues.json, the game's 35 sounds as Soundscape cues, held to what the
 * game's old engine schedules. scripts/build-sound-cues.ts wrote it from the
 * engine's note() calls; this reads the engine back independently, through the
 * recording context, so a change on either side fails here.
 *
 * All but the departures (departures.ts): sounds chosen by ear since, which
 * leave the old engine on purpose and are held to their own numbers. And every
 * cue plays in Bea's mix (mix.ts): its level and its instrument's floor are
 * the old ones times its instrument's gain, to the last bit.
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

/** What the reference engine schedules for a sound, oscillator by oscillator. */
function schedule(play: (engine: ReferenceAudioEngine) => void): Scheduled[] {
  const ctx = new FakeAudioContext();
  play(new ReferenceAudioEngine(ctx as unknown as AudioContext));
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

  test("has one instrument per waveform the old engine's sounds use, and the click the departures share", () => {
    // Notes of every length share an instrument: its decay lasts until each
    // note's release, so none carries a decay of fixed length
    expect(Object.keys(document.instruments).sort()).toEqual([
      'click',
      'sine',
      'triangle',
    ]);
    for (const [name, instrument] of Object.entries(document.instruments)) {
      if (name !== 'click') expect(instrument.waveform).toBe(name);
      expect(instrument.decayUntilRelease).toBe(true);
      expect(instrument).not.toHaveProperty('decay');
    }
    // The click is a sine at the fastest attack, about 1 ms, where the old
    // engine's notes all rise in 12
    expect(document.instruments.click).toMatchObject({
      waveform: 'sine',
      attack: 0,
      sustain: 0,
      release: 0,
    });
  });

  test('has one cue per sound the game makes, named as the page names it', () => {
    expect(Object.keys(document.cues).sort()).toEqual(
      SOUNDS.map((s) => s.id).sort(),
    );
    expect(SOUNDS).toHaveLength(35);
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

describe('each departure', () => {
  test.each(Object.keys(DEPARTURES))(
    '%s is a cue of clicks, every partial a quarter tone between two semitones',
    (id) => {
      const notes = document.cues[id]!.notes;
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.instrument).toBe('click');
        expect(note.pitch % 1).toBe(0.5);
      }
    },
  );

  test.each(Object.keys(DEPARTURES))(
    '%s really has left the old engine, which plays what the table says it did',
    (id) => {
      const sound = SOUNDS.find((s) => s.id === id)!;
      const old = schedule(sound.play);
      if (DEPARTURES[id]!.was === null) {
        expect(old).toEqual([]);
        return;
      }
      // Something else: not the cue's notes, by waveform and frequency
      const cue = document.cues[id]!.notes.map((n) => [
        document.instruments[n.instrument]!.waveform,
        Math.fround(midiToFrequency(n.pitch)),
      ]);
      expect(old.length).toBeGreaterThan(0);
      expect(old.map((o) => [o.type, Math.fround(o.hz)])).not.toEqual(cue);
    },
  );

  test('only the departures play the click', () => {
    const clicking = Object.entries(document.cues)
      .filter(([, cue]) => cue.notes.some((n) => n.instrument === 'click'))
      .map(([name]) => name);
    expect(clicking.sort()).toEqual(Object.keys(DEPARTURES).sort());
  });
});

describe("Bea's mix", () => {
  test('gives every instrument a gain, and nothing else', () => {
    expect(Object.keys(MIX.gains).sort()).toEqual(
      Object.keys(document.instruments).sort(),
    );
    expect(Object.keys(MIX.factors).sort()).toEqual(
      Object.keys(document.instruments).sort(),
    );
  });

  test('keeps each factor the double its gain in dB gives, here', () => {
    // Written down, so the file holds on any platform; a platform's own
    // 10 ** may round the last bit the other way, so this allows two
    for (const [name, db] of Object.entries(MIX.gains)) {
      const factor = (MIX.factors as Record<string, number>)[name]!;
      expect(Math.abs(factor - 10 ** (db / 20)) / factor, name).toBeLessThan(
        5e-16,
      );
    }
  });

  test('moves whole cues: every note of a cue is one instrument', () => {
    for (const [name, cue] of Object.entries(document.cues))
      expect(new Set(cue.notes.map((n) => n.instrument)), name).toHaveLength(1);
  });

  test("raises every instrument's floor with its notes, the click's too, so each cue is its old sound times the gain", () => {
    // The floor every note of the old engine ramps from, through the master
    const [first] = schedule(SOUNDS.find((s) => s.id === 'found-3-set')!.play);
    const floor = first!.events[0]!.value * MASTER_GAIN;
    for (const [name, instrument] of Object.entries(document.instruments))
      expect(instrument.envelopeFloor, name).toBe(floor * gainOf(name));
  });
});

describe.each(
  SOUNDS.filter((s) => !departed(s.id)).map((s) => [s.id, s] as const),
)('%s', (id, sound) => {
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
      // Starts at the same double, peaks at the same level through the
      // master, times Bea's mix, multiplied in the order the file was
      const k = gainOf(note.instrument);
      expect(note.start).toBe(g.start);
      expect(floor!.time).toBe(g.start);
      expect(note.level).toBe(peak!.value * MASTER_GAIN * k);
      expect(instrument.envelopeFloor).toBe(floor!.value * MASTER_GAIN * k);
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
