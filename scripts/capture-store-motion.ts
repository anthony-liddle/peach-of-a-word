/**
 * Saves the App Store's header and search results art in motion, from
 * storeart.html's `?motion=`, one capture per frame, stepped by the time the
 * page is given, never a screen recording; and the header's sound, rendered
 * offline through the game's own audio engine from the game's own cue file.
 *
 *     pnpm exec tsx scripts/capture-store-motion.ts --out <dir> --preview
 *
 * With `--preview`, what the timing and the mix are judged by, at half of
 * Apple's size, into `<dir>`:
 * - each video three loops long at its real speed, the header's with its
 *   sound and the search results' silent, so the loop is seen and heard
 *   joining twice;
 * - the frames where each stage arrives, for each placement;
 * - the loop point at a quarter of its speed;
 * - the header's sound alone, as it goes into the video, a 32-bit float WAV;
 * - `numbers.txt`: when each stage arrives and what it plays, and the
 *   sound's loudness, peak and edges, as rendered and as mixed.
 *
 * **Each frame is the page's own drawing, captured on transparency, laid
 * over the background worked out at 16 bits a channel** (see
 * `lib/storeArtComposite.ts` for why), and streamed to ffmpeg raw. One frame
 * mid-arrival is checked against the page's own render of it.
 *
 * **Guards:** every frame's focal element sits in Apple's safe area; the
 * loop's last frame is its first; one frame captured twice is the same twice;
 * the sound doesn't clip, and its first and last moments are silent, so the
 * loop's join can't click.
 */
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { launchChrome, type Chrome } from './lib/cdp.ts';
import { decodeRgbaPng } from './lib/png.ts';
import { backdropRows, overBackdrop } from './lib/storeArtComposite.ts';
import {
  mainBox,
  openStoreArt,
  screenshot,
  serveStoreArt,
  strays,
} from './lib/storeArtCapture.ts';
import { encodeWav } from './lib/wav.ts';
import { GROWTH_STAGES } from '../src/storeArt/growthStages.ts';
import {
  ARRIVALS,
  BEATS,
  FADE_AT,
  LOOP_S,
  SAMPLE_RATE,
  SETTLED_S,
} from '../src/storeArt/motion.ts';
import { PLACEMENTS, type PlacementId } from '../src/storeArt/storeArtSpec.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    preview: { type: 'boolean', default: false },
  },
});
if (!values.out) throw new Error('Pass --out <dir>.');
if (!values.preview)
  throw new Error(
    'Only --preview so far: the full size waits on the timing and the mix.',
  );
const OUT = resolve(values.out);
mkdirSync(OUT, { recursive: true });

const FPS = 30;
/**
 * Half: the smallest scale that keeps every placement whole pixels, since
 * the header is 1646 high. At a quarter, its last row is half art and half
 * page.
 */
const PREVIEW_SCALE = 0.5;
/** The previews play the loop this many times, so it joins twice. */
const PREVIEW_LOOPS = 3;
/** The loop point at a quarter of its speed. */
const SLOWED = 4;
/** From just before the crown fades until the next sprout has settled. */
const SEAM_FROM = FADE_AT - 0.2;
const SEAM_TO = LOOP_S + ARRIVALS[0]! + SETTLED_S;
/**
 * The sound is brought to this loudness with one gain for the whole mix, so
 * the cues keep the game's balance, unless that would take its true peak
 * over the ceiling, in which case the ceiling sets the gain.
 */
const TARGET_LUFS = -16;
const CEILING_DBTP = -1;
/** The ends of the loop must be this quiet, so its join can't click. */
const EDGE_S = 0.05;
const SILENT_DBFS = -90;
/** A frame mid-arrival, for the checks that need something moving. */
const MID_FRAME = Math.round((ARRIVALS[3]! + 0.12) * FPS);

/**
 * The mono mix in both channels, each at its full level. ffmpeg's own `-ac 2`
 * would put it 3 dB down in each.
 */
const DUAL_MONO = 'pan=stereo|c0=c0|c1=c0';

const LOOP_FRAMES = Math.round(LOOP_S * FPS);
const LOOP_SAMPLES = Math.round(LOOP_S * SAMPLE_RATE);

const BT709 = [
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
];

function ffmpeg(args: (string | number)[]): string {
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostdin', '-y', ...args.map(String)],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0)
    throw new Error(`ffmpeg ${args.join(' ')}\n${run.stderr.slice(-2000)}`);
  return run.stderr;
}

/**
 * An ffmpeg reading raw 16-bit RGB frames of `width` by `height` on its
 * input, at `FPS`, with `args` for the rest. Even sizes only: 4:2:0 halves
 * each.
 */
function encoder(width: number, height: number, args: (string | number)[]) {
  const proc = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb48le',
      '-s',
      `${width}x${height}`,
      '-r',
      FPS,
      '-i',
      '-',
      ...args,
    ].map(String),
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let log = '';
  proc.stderr.on('data', (d: Buffer) => (log += d));
  const exited = once(proc, 'exit');
  return {
    async write(frame: Buffer) {
      if (!proc.stdin.write(frame)) await once(proc.stdin, 'drain');
    },
    async done() {
      proc.stdin.end();
      const [code] = await exited;
      if (code !== 0) throw new Error(`ffmpeg failed:\n${log.slice(-2000)}`);
    },
  };
}

/** EBU R128 integrated loudness, LUFS, and true peak, dBTP, of a file. */
function loudness(path: string): { lufs: number; truePeak: number } {
  const log = ffmpeg([
    '-i',
    path,
    '-af',
    'ebur128=peak=true',
    '-f',
    'null',
    '-',
  ]);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1]);
  if (Number.isNaN(lufs) || Number.isNaN(truePeak))
    throw new Error(`No loudness read from ${path}`);
  return { lufs, truePeak };
}

const dbfs = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** The RMS of `samples`, in dBFS. */
function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return dbfs(Math.sqrt(sum / samples.length));
}

const server = await serveStoreArt(5199);
const open = (chrome: Chrome, query: string) =>
  openStoreArt(chrome, server.base, query);

/** The header's sound, one loop, as `renderSoundtrack` makes it in the page. */
async function soundtrack(chrome: Chrome): Promise<Float32Array> {
  const encoded = await chrome.evaluate<string>(`(async () => {
    const { renderSoundtrack } = await import('/src/storeArt/soundtrack.ts');
    const samples = await renderSoundtrack();
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  })()`);
  const bytes = Buffer.from(encoded, 'base64');
  const samples = new Float32Array(bytes.length / 4);
  new Uint8Array(samples.buffer).set(bytes);
  if (samples.length !== LOOP_SAMPLES)
    throw new Error(
      `The sound is ${samples.length} samples, not ${LOOP_SAMPLES}.`,
    );
  return samples;
}

const seek = (chrome: Chrome, t: number) =>
  chrome.evaluate(`window.storeArtSeek(${t})`);

const size = (chrome: Chrome, width: number, height: number) =>
  chrome.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

/** Pages draw on transparency until `transparent(chrome, false)`. */
const transparent = (chrome: Chrome, on: boolean) =>
  chrome.send(
    'Emulation.setDefaultBackgroundColorOverride',
    on ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {},
  );

/**
 * `placement` at each of `times`, drawn bare on transparency at `scale`, as
 * PNGs, each checked against the safe area.
 */
async function bareFrames(
  chrome: Chrome,
  placement: PlacementId,
  scale: number,
  times: number[],
): Promise<Buffer[]> {
  const { width, height } = PLACEMENTS[placement];
  if (!Number.isInteger(width * scale) || !Number.isInteger(height * scale))
    throw new Error(`${placement} at ${scale} isn't whole pixels.`);
  await size(chrome, width, height);
  await transparent(chrome, true);
  await open(chrome, `?motion=${placement}&bare=1`);
  const failures: string[] = [];
  const shots: Buffer[] = [];
  for (const [f, t] of times.entries()) {
    await seek(chrome, t);
    const out = await strays(chrome);
    if (out.length) failures.push(...out.map((o) => `${t.toFixed(3)} s: ${o}`));
    shots.push(await screenshot(chrome, width, height, scale));
    if (f === 0) {
      // On transparency, or the background would be the browser's again.
      const { data } = decodeRgbaPng(shots[0]!);
      if (data[3] !== 0)
        throw new Error(`${placement}: the bare frame's corner isn't clear.`);
    }
  }
  if (failures.length)
    throw new Error(
      `${placement} outside the safe area:\n${failures.join('\n')}`,
    );
  return shots;
}

/**
 * Every frame of one loop of `placement`, at `scale`. The loop's last frame
 * must be its first, and a frame mid-arrival captured again must come out
 * the same.
 */
async function loopFrames(
  chrome: Chrome,
  placement: PlacementId,
  scale: number,
): Promise<Buffer[]> {
  const times = Array.from({ length: LOOP_FRAMES }, (_, f) => f / FPS);
  const shots = await bareFrames(chrome, placement, scale, times);
  if (!shots.at(-1)!.equals(shots[0]!))
    throw new Error(`${placement}: the loop's last frame isn't its first.`);
  await seek(chrome, MID_FRAME / FPS);
  const { width, height } = PLACEMENTS[placement];
  if (
    !(await screenshot(chrome, width, height, scale)).equals(shots[MID_FRAME]!)
  )
    throw new Error(
      `${placement}: frame ${MID_FRAME} came out different twice.`,
    );
  console.log(
    `${placement}: ${LOOP_FRAMES} frames, every one in the safe area`,
  );
  return shots;
}

/**
 * The page's own render of a frame mid-arrival, against the same frame laid
 * over the background here: the peach and florettes within 2 levels, and
 * each row of background within half a level on average, since only the
 * browser dithers it.
 */
async function sameAsThePage(
  chrome: Chrome,
  placement: PlacementId,
  scale: number,
  bare: Buffer,
): Promise<string> {
  const { width, height } = PLACEMENTS[placement];
  await transparent(chrome, false);
  await open(chrome, `?motion=${placement}&t=${MID_FRAME / FPS}`);
  const ffmpegRgb = (png: Buffer) => {
    const run = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        '-',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
      ],
      { input: png, maxBuffer: 1 << 30 },
    );
    return run.stdout;
  };
  const page = ffmpegRgb(await screenshot(chrome, width, height, scale));
  const art = decodeRgbaPng(bare);
  const ours = overBackdrop(art, backdropRows(art.height));
  let worst = 0;
  let worstRow = 0;
  let worstAt = 0;
  for (let y = 0; y < art.height; y++) {
    let sumPage = 0;
    let sumOurs = 0;
    let n = 0;
    for (let x = 0; x < art.width; x++) {
      const p = y * art.width + x;
      const alpha = art.data[p * 4 + 3]!;
      for (let c = 0; c < 3; c++) {
        const mine = ours.readUInt16LE(p * 6 + c * 2) / 257;
        if (alpha > 0)
          worst = Math.max(worst, Math.abs(mine - page[p * 3 + c]!));
        else {
          sumPage += page[p * 3 + c]!;
          sumOurs += mine;
          n++;
        }
      }
    }
    const off = n ? Math.abs(sumPage - sumOurs) / n : 0;
    if (off > worstRow) [worstRow, worstAt] = [off, y];
  }
  if (worst > 2 || worstRow > 0.5)
    throw new Error(
      `${placement}: laid over the background, the frame differs from the page's: ` +
        `${worst.toFixed(2)} levels on the art, ${worstRow.toFixed(2)} on row ${worstAt} of ${art.height}'s background.`,
    );
  return (
    `${placement}, frame ${MID_FRAME}, against the page's own render: the art within ` +
    `${worst.toFixed(2)} levels, the background's rows within ${worstRow.toFixed(2)} on average.`
  );
}

/**
 * `shots`, laid over the background, `loops` times over, into `path`: H.264
 * in BT.709, for looking at, not for upload; with `sound`, looped as often.
 */
async function encodePreview(
  shots: Buffer[],
  path: string,
  loops: number,
  sound?: string,
): Promise<void> {
  const first = decodeRgbaPng(shots[0]!);
  const rows = backdropRows(first.height);
  const enc = encoder(first.width, first.height, [
    ...(sound
      ? [
          '-i',
          sound,
          '-af',
          `aloop=loop=${loops - 1}:size=${LOOP_SAMPLES},${DUAL_MONO}`,
        ]
      : []),
    '-vf',
    [
      'crop=trunc(iw/2)*2:trunc(ih/2)*2',
      'scale=out_color_matrix=bt709:out_range=tv',
      'format=yuv420p',
      // The frames' own colour, which the encoder writes into the file. The
      // output options alone tagged only the matrix.
      'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
    ].join(','),
    '-c:v',
    'libx264',
    '-crf',
    16,
    ...BT709,
    ...(sound ? ['-c:a', 'aac', '-b:a', '256k', '-ar', SAMPLE_RATE] : ['-an']),
    '-movflags',
    '+faststart',
    path,
  ]);
  for (let k = 0; k < loops; k++)
    for (const shot of shots)
      await enc.write(overBackdrop(decodeRgbaPng(shot), rows));
  await enc.done();
  console.log(`wrote ${path.slice(OUT.length + 1)}`);
}

const notes: string[] = [];
const chrome = await launchChrome();
try {
  await chrome.send('Page.enable');
  await chrome.send('Runtime.enable');

  // ---- The sound -------------------------------------------------------------
  await size(chrome, 1280, 800);
  await open(chrome, '?motion=header');
  const raw = await soundtrack(chrome);
  const rawPath = join(OUT, 'header-sound-as-rendered.wav');
  writeFileSync(rawPath, encodeWav(raw, SAMPLE_RATE));
  const before = loudness(rawPath);
  const gainDb = Math.min(
    TARGET_LUFS - before.lufs,
    CEILING_DBTP - before.truePeak,
  );
  const gain = 10 ** (gainDb / 20);
  const mixed = raw.map((s) => s * gain);
  const soundPath = join(OUT, 'header-sound.wav');
  writeFileSync(soundPath, encodeWav(mixed, SAMPLE_RATE));
  const after = loudness(soundPath);
  const edge = Math.round(EDGE_S * SAMPLE_RATE);
  const [first, last] = [
    rms(mixed.subarray(0, edge)),
    rms(mixed.subarray(-edge)),
  ];
  let peak = 0;
  for (const s of mixed) peak = Math.max(peak, Math.abs(s));
  if (peak >= 1) throw new Error(`The sound clips: its peak is ${peak}.`);
  if (first > SILENT_DBFS || last > SILENT_DBFS)
    throw new Error(
      `The loop's ends aren't silent: ${first.toFixed(1)} and ${last.toFixed(1)} dBFS.`,
    );
  notes.push(
    `Sound, ${SAMPLE_RATE} Hz mono, one ${LOOP_S} s loop.`,
    `  As rendered, the game's own level: ${before.lufs} LUFS integrated, true peak ${before.truePeak} dBTP.`,
    `  Mixed, one gain of ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB: ` +
      `${after.lufs} LUFS, true peak ${after.truePeak} dBTP, sample peak ${dbfs(peak).toFixed(2)} dBFS.`,
    `  The first and last ${EDGE_S * 1000} ms: RMS ${first.toFixed(1)} and ${last.toFixed(1)} dBFS.`,
  );

  // ---- The frames and the previews -----------------------------------------
  for (const placement of ['header', 'search'] as const) {
    const shots = await loopFrames(chrome, placement, PREVIEW_SCALE);
    notes.push(
      await sameAsThePage(chrome, placement, PREVIEW_SCALE, shots[MID_FRAME]!),
    );
    await encodePreview(
      shots,
      join(OUT, `${placement}-preview.mp4`),
      PREVIEW_LOOPS,
      placement === 'header' ? soundPath : undefined,
    );
    await transparent(chrome, false);
    await size(chrome, 2400, 1600);
    await open(chrome, `?sheet=arrivals&placement=${placement}`);
    const box = await mainBox(chrome);
    const sheet = join(OUT, `arrivals-${placement}.png`);
    writeFileSync(sheet, await screenshot(chrome, box.width, box.height, 2));
    console.log(`wrote ${sheet.slice(OUT.length + 1)}`);
  }
  const header = loudness(join(OUT, 'header-preview.mp4'));
  notes.push(
    `The header preview's AAC, ${PREVIEW_LOOPS} loops: ${header.lufs} LUFS, true peak ${header.truePeak} dBTP.`,
  );

  // ---- The loop point, slowed ------------------------------------------------
  const steps = Math.round((SEAM_TO - SEAM_FROM) * FPS * SLOWED);
  const times = Array.from(
    { length: steps + 1 },
    (_, k) => SEAM_FROM + k / (FPS * SLOWED),
  );
  const seam = await bareFrames(chrome, 'header', PREVIEW_SCALE, times);
  await encodePreview(seam, join(OUT, 'loop-point-quarter-speed.mp4'), 1);
  notes.push(
    `The loop point at a quarter speed: ${SEAM_FROM.toFixed(2)} s to the next loop's ` +
      `${(SEAM_TO - LOOP_S).toFixed(2)} s, ${steps + 1} frames; the loop joins ` +
      `${((LOOP_S - SEAM_FROM) * SLOWED).toFixed(2)} s into the clip.`,
  );

  // ---- The numbers -----------------------------------------------------------
  notes.unshift(
    `A ${LOOP_S} s loop at ${FPS} fps, ${LOOP_FRAMES} frames.`,
    ...BEATS.map(
      (b) =>
        `${b.at.toFixed(2)} s, frame ${Math.round(b.at * FPS)}: ` +
        `${GROWTH_STAGES.find((s) => s.id === b.stage)!.spoken}, ` +
        (b.call === 'edition' ? 'edition' : `found-${b.length}-set`),
    ),
    `${FADE_AT.toFixed(2)} s, frame ${Math.round(FADE_AT * FPS)}: back to the soil, silent`,
  );
  writeFileSync(join(OUT, 'numbers.txt'), `${notes.join('\n')}\n`);
  console.log(notes.join('\n'));
} finally {
  chrome.close();
  await server.close();
}
