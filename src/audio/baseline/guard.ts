/**
 * What the sound baseline has to be able to see, as checks on a fixture.
 *
 * The rung ladder and the cute glint are what a port is likeliest to get wrong
 * without the summary numbers saying so. The sparkle peaks 10 to 15 dB under
 * the note, so uncommon and rare differ in peak, RMS and timing by a hundredth
 * of a dB or nothing. The glint does move the duration and the envelope, but
 * nothing in the summary says what pitch it is. These read both from the
 * partials instead. The rejected guess's two notes are 21 Hz apart, too close for
 * any one window, so they are read one at a time instead.
 *
 * Pure functions of a parsed fixture, so the same checks run on the committed
 * baseline, on a capture made somewhere else, or on a port's fixture later.
 * Each returns the failures it finds, in words, and an empty list for none.
 */

export interface Partial {
  hz: number;
  db: number;
}

export interface Window {
  t: number;
  dbfs: number | null;
  partials: Partial[];
}

export interface PairNote {
  from: number;
  to: number;
  hz: number;
  db: number;
}

export interface Entry {
  onset: number;
  end: number;
  duration: number;
  stop: number;
  peakDbfs: number;
  rmsDbfs: number;
  fundamentalHz: number | null;
  envelopeDbfs: (number | null)[];
  spectrum: Window[];
  pair?: {
    notes: [PairNote, PairNote];
    intervalSemitones: number;
  };
}

export interface Fixture {
  tolerance: {
    allow: {
      seconds: number;
      db: number;
      hz: number;
      partialHz: number;
      partialDb: number;
    };
  };
  sounds: Record<string, Entry>;
}

/** The window with the rung sparkle near its peak, before either glint. */
export const SPARKLE_T = 0.065;
/** The window with the cute glint near its peak. */
export const GLINT_T = 0.155;
/** A partial is "at" a multiple of the pitch if this close to it, as a fraction. */
const AT = 0.005;
/** Neighbouring rungs must differ by at least this much in the sparkle. */
const LADDER_FLOOR_DB = 1;

const LADDER = ['uncommon', 'rare', 'mythic-letterpress'] as const;

/** The found lengths the fixture holds, from its set rows. */
export function lengths(f: Fixture): number[] {
  return Object.keys(f.sounds)
    .map((id) => /^found-(\d+)-set$/.exec(id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
}

function windowAt(e: Entry, t: number): Window | undefined {
  return e.spectrum.find((w) => w.t === t);
}

function partialAt(w: Window | undefined, hz: number): Partial | undefined {
  return w?.partials.find((p) => Math.abs(p.hz - hz) <= AT * hz);
}

/** The level of the 3x sparkle at 65 ms, relative to that window's strongest. */
export function sparkleDb(f: Fixture, id: string): number | undefined {
  const e = f.sounds[id]!;
  return partialAt(windowAt(e, SPARKLE_T), 3 * e.fundamentalHz!)?.db;
}

/**
 * Every rung sounds different: the set has no 3x sparkle, and uncommon, rare
 * and mythic each have one, each louder than the last by a clear margin. The
 * two mythic variants share theirs, since the glints have not started at 65 ms.
 */
export function ladderFailures(f: Fixture): string[] {
  const failures: string[] = [];
  const margin = Math.max(LADDER_FLOOR_DB, 10 * f.tolerance.allow.partialDb);
  for (const length of lengths(f)) {
    const id = (rung: string) => `found-${length}-${rung}`;
    if (sparkleDb(f, id('set')) !== undefined)
      failures.push(
        `${id('set')} has a 3x sparkle at 65 ms; the set gets none`,
      );
    const levels = LADDER.map((rung) => sparkleDb(f, id(rung)));
    LADDER.forEach((rung, i) => {
      if (levels[i] === undefined)
        failures.push(`${id(rung)} has no 3x sparkle at 65 ms`);
    });
    for (let i = 1; i < LADDER.length; i++) {
      const [lower, upper] = [levels[i - 1], levels[i]];
      if (lower === undefined || upper === undefined) continue;
      if (upper - lower < margin)
        failures.push(
          `${id(LADDER[i]!)} sparkle is ${upper} dB against ${id(LADDER[i - 1]!)} at ${lower} dB: ` +
            `${(upper - lower).toFixed(2)} dB apart, under the ${margin} dB a rung needs`,
        );
    }
    const cute = sparkleDb(f, id('mythic-cute'));
    if (
      levels[2] !== undefined &&
      cute !== undefined &&
      Math.abs(cute - levels[2]) > f.tolerance.allow.partialDb
    )
      failures.push(
        `${id('mythic-cute')} and ${id('mythic-letterpress')} differ at 65 ms, before either glint`,
      );
  }
  return failures;
}

/**
 * Every cute mythic sound has the glint at 5x its pitch, as the strongest
 * partial at 155 ms, and its letterpress twin has no 5x partial anywhere.
 */
export function glintFailures(f: Fixture): string[] {
  const failures: string[] = [];
  for (const length of lengths(f)) {
    const cute = `found-${length}-mythic-cute`;
    const letterpress = `found-${length}-mythic-letterpress`;
    const c = f.sounds[cute]!;
    const w = windowAt(c, GLINT_T);
    const glint = partialAt(w, 5 * c.fundamentalHz!);
    if (!glint) failures.push(`${cute} has no glint at 5x its pitch at 155 ms`);
    else if (glint !== w!.partials[0])
      failures.push(
        `${cute} has its 5x glint at ${glint.db} dB, not as the strongest partial at 155 ms`,
      );
    const l = f.sounds[letterpress]!;
    for (const lw of l.spectrum)
      if (partialAt(lw, 5 * l.fundamentalHz!))
        failures.push(`${letterpress} has a 5x partial at ${lw.t * 1000} ms`);
  }
  return failures;
}

export interface RungGap {
  length: number;
  /** Largest gap between uncommon and rare in each summary scalar, in tolerances. */
  scalarsInTolerances: number;
  /** Largest gap in any summary number in dB, the envelope included. */
  summaryDb: number;
  /** Gap between their sparkles at 65 ms, in dB. */
  sparkleDb: number;
}

/** How far apart uncommon and rare are, by the summary and by the spectrum. */
export function uncommonVersusRare(f: Fixture): RungGap[] {
  const tol = f.tolerance.allow;
  return lengths(f).map((length) => {
    const u = f.sounds[`found-${length}-uncommon`]!;
    const r = f.sounds[`found-${length}-rare`]!;
    const gap = (a: number | null, b: number | null) =>
      a === null || b === null ? 0 : Math.abs(a - b);
    const scalarsInTolerances = Math.max(
      gap(u.peakDbfs, r.peakDbfs) / tol.db,
      gap(u.rmsDbfs, r.rmsDbfs) / tol.db,
      ...(['onset', 'end', 'duration', 'stop'] as const).map(
        (k) => gap(u[k], r[k]) / tol.seconds,
      ),
      gap(u.fundamentalHz, r.fundamentalHz) / tol.hz,
    );
    const summaryDb = Math.max(
      gap(u.peakDbfs, r.peakDbfs),
      gap(u.rmsDbfs, r.rmsDbfs),
      ...u.envelopeDbfs.map((v, i) => gap(v, r.envelopeDbfs[i] ?? null)),
    );
    const sparkle = gap(
      sparkleDb(f, `found-${length}-uncommon`) ?? null,
      sparkleDb(f, `found-${length}-rare`) ?? null,
    );
    return {
      length,
      scalarsInTolerances: Math.round(scalarsInTolerances * 1000) / 1000,
      summaryDb: Math.round(summaryDb * 100) / 100,
      sparkleDb: Math.round(sparkle * 100) / 100,
    };
  });
}

/** The rejected guess steps down a whole tone: two semitones. */
const WHOLE_TONE = 2;
/**
 * How far the measured interval may sit from it, in semitones: 5 cents. The
 * render reads 2.007, and a note that decays this fast is read to about 0.05 Hz.
 */
const INTERVAL_SLACK = 0.05;
/** The two notes have one gain, so they read within this much of each other. */
const PAIR_LEVEL_DB = 1;

/**
 * The rejected guess is a descending whole tone at one level: two notes, read
 * one at a time, the first at the cue's own pitch and the second two semitones
 * under it. See METHOD.pair for why they are read in time and not in one
 * window.
 */
export function pairFailures(f: Fixture): string[] {
  const e = f.sounds['invalid'];
  if (!e?.pair) return ['invalid has no pair: its two notes were not read'];
  const failures: string[] = [];
  const [first, second] = e.pair.notes;
  const pitch = e.fundamentalHz!;
  if (Math.abs(first.hz - pitch) > AT * pitch)
    failures.push(
      `invalid's first note reads ${first.hz} Hz, not the cue's pitch of ${pitch} Hz`,
    );
  if (!(second.hz < first.hz))
    failures.push(
      `invalid's second note, ${second.hz} Hz, is not below its first, ${first.hz} Hz`,
    );
  const interval = e.pair.intervalSemitones;
  if (Math.abs(interval - WHOLE_TONE) > INTERVAL_SLACK)
    failures.push(
      `invalid's notes are ${interval} semitones apart, ${first.hz} and ${second.hz} Hz; the pair is a whole tone, ${WHOLE_TONE}`,
    );
  if (Math.abs(second.db) > PAIR_LEVEL_DB)
    failures.push(
      `invalid's second note is ${second.db} dB from its first; the pair is level`,
    );
  return failures;
}
