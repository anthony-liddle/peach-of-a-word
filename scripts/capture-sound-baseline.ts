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
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { createServer } from 'vite';
import { launchChrome } from './lib/cdp.ts';
import {
  ENVELOPE_TIMES_S,
  ENVELOPE_WINDOW_S,
  METHOD,
  PITCH_WINDOW_S,
  THRESHOLD_DB,
  measure,
} from './lib/soundMeasure.ts';
import { encodeWav } from './lib/wav.ts';

const SAMPLE_RATE = 48000;
/** Longer than the longest cue (Edition Complete stops at 1.62 s). Checked. */
const RENDER_SECONDS = 2;
/** At least this much silence must close every render, or it was cut short. */
const QUIET_TAIL_S = 0.1;

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'src/audio/baseline');

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

  // Clear only what this script writes, its WAVs and the record, so a sound
  // that has gone leaves no stale file behind. Anything else in the directory,
  // such as the record's own test, is not this script's to delete.
  mkdirSync(OUT, { recursive: true });
  for (const name of readdirSync(OUT))
    if (name.endsWith('.wav') || name === 'sounds.json')
      rmSync(resolve(OUT, name));

  const measured: Record<string, unknown> = {};
  for (const sound of sounds) {
    const encoded = await chrome.evaluate<string>(`(async () => {
      const { SOUNDS } = await import('/src/sounds/inventory.ts');
      const { renderSound } = await import('/src/sounds/renderOffline.ts');
      const sound = SOUNDS.find((s) => s.id === ${JSON.stringify(sound.id)});
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

    const m = measure(samples, SAMPLE_RATE);
    if (m.stop > RENDER_SECONDS - QUIET_TAIL_S)
      throw new Error(
        `${sound.id} was still sounding at the end of the render.`,
      );
    if (m.fundamentalHz === null)
      throw new Error(`${sound.id} has no measurable fundamental.`);

    const kept = samples.subarray(0, Math.round(m.stop * SAMPLE_RATE));
    const wav = encodeWav(kept, SAMPLE_RATE);
    writeFileSync(resolve(OUT, `${sound.id}.wav`), wav);
    measured[sound.id] = {
      label: sound.label,
      cue: sound.cue,
      params: sound.params,
      ...m,
      wav: `${sound.id}.wav`,
      samples: kept.length,
      bytes: wav.length,
      sha256: createHash('sha256').update(wav).digest('hex'),
    };
    console.log(
      `${sound.id.padEnd(28)} ${String(m.fundamentalHz).padStart(8)} Hz  ` +
        `peak ${m.peakDbfs} dBFS  ${m.duration} s`,
    );
  }

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
      wav: '32-bit IEEE float, mono, trimmed at stop',
    },
    method: {
      ...METHOD,
      thresholdDb: THRESHOLD_DB,
      pitchWindowS: PITCH_WINDOW_S,
      envelopeWindowS: ENVELOPE_WINDOW_S,
      envelopeTimes: ENVELOPE_TIMES_S,
    },
    sounds: measured,
  };
  const path = resolve(OUT, 'sounds.json');
  const options = (await resolveConfig(path)) ?? {};
  writeFileSync(
    path,
    await format(JSON.stringify(fixture), { ...options, parser: 'json' }),
  );
  console.log(`\n${sounds.length} sounds written to ${OUT}`);
} finally {
  chrome.close();
  await server.close();
}
