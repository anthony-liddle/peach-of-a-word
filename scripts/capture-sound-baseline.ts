/**
 * Capture the sound baseline: every sound on the /sounds page, rendered offline
 * through the game's own engine, measured, and written to src/audio/baseline/
 * as sounds.json and one WAV per sound.
 *
 *   pnpm sounds:baseline
 *
 * The synth is deterministic, with fixed frequencies, fixed envelopes and no
 * randomness, so a render is a faithful record of what a player hears. It runs
 * in headless Chrome because a browser's OfflineAudioContext is the real thing
 * and jsdom has none. The page is served by Vite in dev, so the render imports
 * the same modules the page does: the inventory, and the engine itself.
 *
 * This is a record, taken once, before anything moves to Soundscape. Nothing
 * compares against it yet; that is the Soundscape pass's job. Re-running it
 * rewrites the record, so do that only on purpose.
 *
 * Every sound is rendered several times, because Chrome's offline renders are
 * not bit-identical from run to run. The first render is the one recorded; the
 * others measure how far each number moves between renders that should agree,
 * and the fixture records that as the tolerance a comparison will need.
 *
 *   --out <dir>      write somewhere else, such as a scratch directory
 *   --renders <n>    renders per sound, 5 by default
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { createServer } from 'vite';
import { launchChrome } from './lib/cdp.ts';
import {
  NO_SPREAD,
  PARTIAL_MATCH,
  spreadBetween,
  toleranceFrom,
  widest,
} from './lib/renderSpread.ts';
import {
  ENVELOPE_TIMES_S,
  ENVELOPE_WINDOW_S,
  METHOD,
  PITCH_WINDOW_S,
  SPECTRUM_TIMES_S,
  THRESHOLD_DB,
  measure,
} from './lib/soundMeasure.ts';
import { decodeWav, encodeWav } from './lib/wav.ts';

const SAMPLE_RATE = 48000;
/** Longer than the longest cue (Edition Complete stops at 1.62 s). Checked. */
const RENDER_SECONDS = 2;
/** At least this much silence must close every render, or it was cut short. */
const QUIET_TAIL_S = 0.1;
/**
 * A WAV on disk is kept when a fresh render matches it this closely. Renders
 * differ by up to 6e-8, so this is well clear of noise and far below any change
 * to a note, a level or an envelope.
 */
const KEEP_WITHIN = 1e-6;

const ROOT = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: resolve(ROOT, 'src/audio/baseline') },
    renders: { type: 'string', default: '5' },
  },
});
const OUT = resolve(args.out);
const RENDERS = Number(args.renders);
if (!(RENDERS >= 2)) throw new Error('--renders must be at least 2.');

function largestDifference(a: Float32Array, b: Float32Array): number {
  let largest = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    largest = Math.max(largest, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return largest;
}

interface Listed {
  id: string;
  cue: string;
  label: string;
  params: Record<string, unknown>;
}

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { host: 'localhost', port: 5199 },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('Vite did not report a URL.');

const chrome = await launchChrome();
const errors: string[] = [];
try {
  await chrome.send('Runtime.enable');
  await chrome.send('Page.enable');
  // Anything the page throws, including an unhandled rejection from a resume
  // on the offline context, fails the capture rather than passing silently.
  chrome.on((event) => {
    if (event.method === 'Runtime.exceptionThrown')
      errors.push(JSON.stringify(event.params));
  });

  const loaded = new Promise<void>((done) => {
    const off = chrome.on((event) => {
      if (event.method === 'Page.loadEventFired') {
        off();
        done();
      }
    });
  });
  await chrome.send('Page.navigate', { url: `${base}sounds.html` });
  await loaded;

  const { product } = await chrome.send<{ product: string }>(
    'Browser.getVersion',
  );
  const { masterGain, sounds } = await chrome.evaluate<{
    masterGain: number;
    sounds: Listed[];
  }>(`(async () => {
    const { SOUNDS } = await import('/src/sounds/inventory.ts');
    const { MASTER_GAIN } = await import('/src/audio/WebAudioEngine.ts');
    return {
      masterGain: MASTER_GAIN,
      sounds: SOUNDS.map(({ id, cue, label, params }) => ({ id, cue, label, params })),
    };
  })()`);

  mkdirSync(OUT, { recursive: true });

  /** The WAV already recorded for a sound, if there is one this script wrote. */
  const recordedWav = (id: string): Float32Array | null => {
    try {
      return decodeWav(readFileSync(resolve(OUT, `${id}.wav`)));
    } catch {
      return null;
    }
  };

  const render = async (id: string): Promise<Float32Array> => {
    const encoded = await chrome.evaluate<string>(`(async () => {
      const { SOUNDS } = await import('/src/sounds/inventory.ts');
      const { renderSound } = await import('/src/sounds/renderOffline.ts');
      const sound = SOUNDS.find((s) => s.id === ${JSON.stringify(id)});
      const samples = await renderSound(sound, ${SAMPLE_RATE}, ${RENDER_SECONDS});
      const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    })()`);
    const bytes = Buffer.from(encoded, 'base64');
    const samples = new Float32Array(bytes.length / 4);
    new Uint8Array(samples.buffer).set(bytes);
    return samples;
  };

  const measured: Record<string, unknown> = {};
  let spread = NO_SPREAD;
  let noise = { largest: 0, dbBelowPeak: -Infinity, sound: '' };
  let reused = 0;
  for (const sound of sounds) {
    const renders: Float32Array[] = [];
    for (let r = 0; r < RENDERS; r++) renders.push(await render(sound.id));
    const first = measure(renders[0]!, SAMPLE_RATE);
    if (first.stop > RENDER_SECONDS - QUIET_TAIL_S)
      throw new Error(
        `${sound.id} was still sounding at the end of the render.`,
      );
    if (first.fundamentalHz === null)
      throw new Error(`${sound.id} has no measurable fundamental.`);

    // Keep the WAV already on disk when a fresh render matches it within
    // render noise, so that re-running this rewrites the record only where the
    // sound itself changed, not wherever Chrome's last bit landed differently.
    const fresh = renders[0]!.subarray(0, Math.round(first.stop * SAMPLE_RATE));
    const onDisk = recordedWav(sound.id);
    const keep =
      onDisk !== null &&
      onDisk.length === fresh.length &&
      largestDifference(onDisk, fresh) <= KEEP_WITHIN;
    const recorded = keep ? onDisk : fresh;
    if (keep) reused += 1;

    // The record is measured from exactly the samples in its WAV, and every
    // fresh render is held against it to see how far the numbers move.
    const m = measure(recorded, SAMPLE_RATE);
    const peak = 10 ** (m.peakDbfs / 20);
    for (const again of renders) {
      const largest = largestDifference(recorded, again);
      const below = largest === 0 ? -Infinity : 20 * Math.log10(largest / peak);
      if (below > noise.dbBelowPeak)
        noise = { largest, dbBelowPeak: below, sound: sound.id };
      spread = widest(spread, spreadBetween(m, measure(again, SAMPLE_RATE)));
    }

    const wav = encodeWav(recorded, SAMPLE_RATE);
    if (!keep) writeFileSync(resolve(OUT, `${sound.id}.wav`), wav);
    measured[sound.id] = {
      label: sound.label,
      cue: sound.cue,
      params: sound.params,
      ...m,
      wav: `${sound.id}.wav`,
      samples: recorded.length,
      bytes: wav.length,
      sha256: createHash('sha256').update(wav).digest('hex'),
    };
    console.log(
      `${sound.id.padEnd(28)} ${String(m.fundamentalHz).padStart(8)} Hz  ` +
        `peak ${m.peakDbfs} dBFS  ${m.duration} s  ` +
        `${m.spectrum.reduce((n, w) => n + w.partials.length, 0)} partials  ` +
        (keep ? 'kept' : 'written'),
    );
  }

  // A WAV for a sound that is no longer on the page is stale. Only this
  // script's own files are touched: anything else here, such as the record's
  // tests, is not its to delete.
  for (const name of readdirSync(OUT))
    if (name.endsWith('.wav') && !(name.slice(0, -4) in measured))
      rmSync(resolve(OUT, name));

  if (errors.length > 0)
    throw new Error(`The page threw while rendering:\n${errors.join('\n')}`);

  const fixture = {
    about:
      'Every sound the game makes, rendered offline before any move to Soundscape. The baseline a port is measured against. A record: nothing compares against it yet.',
    captured: new Date().toISOString().slice(0, 10),
    renderer: {
      browser: product,
      context: 'OfflineAudioContext',
      sampleRate: SAMPLE_RATE,
      channels: 1,
      masterGain,
      renderSeconds: RENDER_SECONDS,
      wav: '32-bit IEEE float, mono, trimmed at stop. A WAV from an earlier capture is kept when a fresh render matches it within 1e-6, so the files change only when a sound does.',
    },
    method: {
      ...METHOD,
      thresholdDb: THRESHOLD_DB,
      pitchWindowS: PITCH_WINDOW_S,
      envelopeWindowS: ENVELOPE_WINDOW_S,
      envelopeTimes: ENVELOPE_TIMES_S,
      spectrumTimes: SPECTRUM_TIMES_S,
    },
    tolerance: {
      about: `How far a number may differ from this record before a comparison calls it a change. Every sound was rendered ${RENDERS} times; each tolerance is the widest difference seen between those renders, rounded up to the step the value is recorded to, plus one step, because two values rounded independently can land a step apart when nothing changed. This covers render-to-render noise only: a different engine or browser will need its own allowance on top.`,
      renders: RENDERS,
      largestSampleDifference: noise.largest,
      largestSampleDifferenceDbBelowPeak:
        noise.largest === 0 ? null : Math.round(noise.dbBelowPeak * 10) / 10,
      largestSampleDifferenceIn: noise.largest === 0 ? null : noise.sound,
      observed: Object.fromEntries(
        Object.entries(spread).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]),
      ),
      allow: toleranceFrom(spread),
      partials:
        `Match a partial to one within ${PARTIAL_MATCH * 100}% of its frequency. ` +
        (spread.membershipChanges + spread.strongestChanges === 0
          ? `Across these renders no partial came or went and no window changed its strongest, so a comparison should expect the same partials, and the same strongest, in every window.`
          : `Across these renders ${spread.membershipChanges} partial(s) or window(s) came or went and ${spread.strongestChanges} window(s) changed their strongest, so a comparison should not count those as changes.`),
    },
    sounds: measured,
  };
  const path = resolve(OUT, 'sounds.json');
  const options = (await resolveConfig(path)) ?? {};
  writeFileSync(
    path,
    await format(JSON.stringify(fixture), { ...options, parser: 'json' }),
  );
  console.log(
    `\n${sounds.length} sounds recorded in ${OUT}: ` +
      `${reused} WAVs kept, ${sounds.length - reused} written`,
  );
} finally {
  chrome.close();
  await server.close();
}
