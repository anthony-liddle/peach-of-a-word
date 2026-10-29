/**
 * Saves the App Store's header and search results art in motion, from
 * storeart.html's `?motion=`, one capture per frame, stepped by the time the
 * page is given, never a screen recording; and the header's sound, rendered
 * offline through the game's own audio engine from the game's own cue file.
 *
 *     pnpm exec tsx scripts/capture-store-motion.ts --out <dir>
 *     pnpm exec tsx scripts/capture-store-motion.ts --out <dir> --sound-from <header.mp4>
 *     pnpm exec tsx scripts/capture-store-motion.ts --out <dir> --preview
 *
 * At full size, the files for App Store Connect, into `<dir>`, named as the
 * stills are, with `SHA256SUMS.txt`: each the loop twice, turned to start and
 * end on the settled crown, its poster frame; H.264 High, 8-bit 4:2:0,
 * BT.709, 30 fps, at a constant quantiser; the header's with its sound as
 * AAC.
 * And into `<dir>/check`, what they're checked by:
 * - each file's banding before and after the dither, as a picture, with the
 *   numbers in `numbers.txt`, and its ffprobe as JSON;
 * - each poster frame with Apple's safe area drawn;
 * - the way back to the soil at a quarter of its speed, the arrivals sheets,
 *   and the header's sound as WAVs.
 *
 * With `--sound-from`, the header's sound is that file's AAC, as it is,
 * rather than a fresh encode, so a picture can be encoded again without
 * touching a sound already handed off. Chrome's offline render of the same
 * sound differs from run to run by up to 6e-8, which changes the AAC.
 *
 * With `--preview`, what the timing and the mix are judged by, at half of
 * Apple's size, into `<dir>`:
 * - each video as its file will be, at its real speed: the loop twice,
 *   turned to start and end on the settled crown, its poster frame; the
 *   header's with its sound and the search results' silent;
 * - the frames where each stage arrives, for each placement;
 * - the way back to the soil at a quarter of its speed, from just before
 *   the file joins until the next sprout has settled;
 * - the header's sound alone, as it goes into the video, a 32-bit float WAV;
 * - `numbers.txt`: when each stage arrives and what it plays, and the
 *   sound's loudness, peak and edges, as rendered and as mixed.
 *
 * **Each frame is the page's own drawing, captured on transparency, laid
 * over the background worked out at 16 bits a channel** (see
 * `lib/storeArtComposite.ts` for why), and streamed to ffmpeg raw. One frame
 * mid-arrival is checked against the page's own render of it. The frames go
 * to ffmpeg as 8-bit 4:2:0, converted and dithered here (see
 * `lib/storeArtYuv.ts`), so ffmpeg converts nothing.
 *
 * **Guards:** every frame's focal element sits in Apple's safe area; the
 * loop's last frame is its first, and so is each file's; one frame captured
 * twice is the same twice; the sound doesn't clip, and each file's first and
 * last moments are silent, as rendered and as encoded, so its join can't
 * click. At full size, too: the conversion matches ffmpeg's colour, the
 * encoded file matches what went in, the dithered file doesn't band, the AAC
 * stays under the -1 dBTP ceiling, and ffprobe reads every file as meant.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { launchChrome, type Chrome } from './lib/cdp.ts';
import { decodeRgbaPng, type Rgba } from './lib/png.ts';
import { backdropRows, overBackdrop } from './lib/storeArtComposite.ts';
import {
  banding,
  planeOf,
  yuvBackdrop,
  yuvFrame,
  type Yuv,
} from './lib/storeArtYuv.ts';
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
  FACE_S,
  LOOP_S,
  RETURN_AT,
  SAMPLE_RATE,
  SETTLED_S,
  SINK_S,
  START_AT,
} from '../src/storeArt/motion.ts';
import { PLACEMENTS, type PlacementId } from '../src/storeArt/storeArtSpec.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    preview: { type: 'boolean', default: false },
    'sound-from': { type: 'string' },
  },
});
if (!values.out) throw new Error('Pass --out <dir>.');
const PREVIEW = values.preview;
const SOUND_FROM = values['sound-from'] && resolve(values['sound-from']);
if (PREVIEW && SOUND_FROM)
  throw new Error('--sound-from is for the full size, not --preview.');
const OUT = resolve(values.out);
/** Where everything that isn't an upload goes. */
const SIDE = PREVIEW ? OUT : join(OUT, 'check');
mkdirSync(PREVIEW ? SIDE : join(SIDE, 'ffprobe'), { recursive: true });

const FPS = 30;
/**
 * Half: the smallest scale that keeps every placement whole pixels, since
 * the header is 1646 high. At a quarter, its last row is half art and half
 * page.
 */
const PREVIEW_SCALE = 0.5;
const SCALE = PREVIEW ? PREVIEW_SCALE : 1;
/**
 * Each file plays the loop this many times: clear of every minimum length
 * anyone reports, and under Apple's 30 s.
 */
const FILE_LOOPS = 2;
/** The way back to the soil at a quarter of its speed. */
const SLOWED = 4;
/**
 * From just before each file joins, on the crown, through its sinking and
 * the soil's return, until the next sprout has settled.
 */
const SEAM_FROM = START_AT - 0.2;
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
const START_FRAME = Math.round(START_AT * FPS);
const START_SAMPLE = Math.round(START_AT * SAMPLE_RATE);

/** One loop, turned to start at `at`, where a file starts. */
function turned<T extends Buffer[] | Float32Array>(loop: T, at: number): T {
  if (loop instanceof Float32Array) {
    const out = new Float32Array(loop.length);
    out.set(loop.subarray(at));
    out.set(loop.subarray(0, at), loop.length - at);
    return out as T;
  }
  return [...loop.slice(at), ...loop.slice(0, at)] as T;
}

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
 * Raw 8-bit 4:2:0 frames of `width` by `height`, at `FPS`, tagged as what
 * they are, so ffmpeg has nothing to convert.
 */
const yuvInput = (width: number, height: number) => [
  '-f',
  'rawvideo',
  '-pix_fmt',
  'yuv420p',
  '-s',
  `${width}x${height}`,
  '-r',
  FPS,
  '-color_range',
  'tv',
  ...BT709,
];

/**
 * The frames' own colour, which the encoder writes into the file. The output
 * options alone tagged only the matrix.
 */
const TAGGED =
  'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';

/**
 * An ffmpeg reading raw frames on its input, as `input` describes them, with
 * `args` for the rest.
 */
function encoder(input: (string | number)[], args: (string | number)[]) {
  const proc = spawn(
    'ffmpeg',
    ['-hide_banner', '-y', ...input, '-i', '-', ...args].map(String),
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

/** The first channel of a file's sound, decoded, at the sample rate. */
function decoded(path: string): Float32Array {
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path,
      '-map',
      '0:a',
      '-af',
      'pan=mono|c0=c0',
      '-ar',
      String(SAMPLE_RATE),
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  if (run.status !== 0) throw new Error(`Couldn't decode ${path}`);
  const bytes = run.stdout;
  const samples = new Float32Array(bytes.length / 4);
  new Uint8Array(samples.buffer).set(bytes);
  return samples;
}

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
 * The page's own render of `frames`, against the same frames laid over the
 * background here, each colour channel in levels:
 * - solid art within half a level, so the colours are the page's;
 * - the art's anti-aliased edges within 2.5, since the page draws them over
 *   its own 8-bit, dithered gradient, which shows through by up to 1.5, and
 *   Chrome keeps an edge's colour premultiplied at 8 bits, worth up to 0.5
 *   more once laid over, and rounding the last 0.5;
 * - each row of background within half a level on average, since only the
 *   browser dithers it.
 */
async function sameAsThePage(
  chrome: Chrome,
  placement: PlacementId,
  scale: number,
  shots: Buffer[],
  frames: number[],
): Promise<string[]> {
  const { width, height } = PLACEMENTS[placement];
  const lines: string[] = [];
  for (const frame of frames) {
    await transparent(chrome, false);
    await open(chrome, `?motion=${placement}&t=${frame / FPS}`);
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
      {
        input: await screenshot(chrome, width, height, scale),
        maxBuffer: 1 << 30,
      },
    );
    const page = run.stdout;
    const art = decodeRgbaPng(shots[frame]!);
    const ours = overBackdrop(art, backdropRows(art.height));
    let solid = 0;
    let edge = 0;
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
          const off = Math.abs(mine - page[p * 3 + c]!);
          if (alpha === 255) solid = Math.max(solid, off);
          else if (alpha > 0) edge = Math.max(edge, off);
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
    const found =
      `solid art within ${solid.toFixed(2)} levels, its edges within ${edge.toFixed(2)}, ` +
      `the background's rows within ${worstRow.toFixed(2)} on average`;
    if (solid > 0.5 || edge > 2.5 || worstRow > 0.5)
      throw new Error(
        `${placement}, frame ${frame}: laid over the background, it differs from the page's: ${found} (worst row ${worstAt} of ${art.height}).`,
      );
    lines.push(
      `${placement}, frame ${frame}, against the page's own render: ${found}.`,
    );
  }
  return lines;
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
  // 4:2:0 needs an even height, so the half-size header's last row goes.
  const [width, height] = [first.width, first.height & ~1];
  if (width % 2) throw new Error(`${path}: an odd width, ${width}.`);
  const rows = backdropRows(first.height).subarray(0, height * 3);
  const backdrop = yuvBackdrop(width, height, rows, true);
  const even = (art: Rgba): Rgba => ({
    width,
    height,
    data: art.data.subarray(0, width * height * 4),
  });
  const enc = encoder(yuvInput(width, height), [
    ...(sound
      ? [
          '-i',
          sound,
          '-af',
          `aloop=loop=${loops - 1}:size=${LOOP_SAMPLES},${DUAL_MONO}`,
        ]
      : []),
    '-vf',
    TAGGED,
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
      await enc.write(
        yuvFrame(even(decodeRgbaPng(shot)), rows, backdrop, true),
      );
  await enc.done();
  console.log(`wrote ${path.slice(OUT.length + 1)}`);
}

// ---- At full size ------------------------------------------------------------

/** The placements that take a video. The universal 16:9 asset is a still only. */
type Moving = 'header' | 'search';

/** Each file, named as its still is. */
const fileName = (placement: Moving) => {
  const { width, height } = PLACEMENTS[placement];
  return `${placement === 'search' ? 'search-results' : placement}-${width}x${height}.mp4`;
};

/**
 * The files' quality: x264's constant quantiser 4, so every key frame is
 * made alike. Two passes at Apple's template's 10 Mbps came out at 5.8, and
 * gave later key frames fewer bits, and with them more banding: up to 0.19
 * of a level off the ramp, against 0.06 at the first.
 */
const QUANTISER = 4;
/**
 * How often each file has a key frame, never placed by a scene cut, since
 * there are none. Search's every 2 s. The header's every 32 frames, 10 a
 * loop, so both loops are encoded alike: that brings its average to about
 * 10 Mbps, as search's is, inside the 7.5 to 45.5 Mbps Headloop saw App Store
 * Connect process. Every 60 frames it was 6.6, and a lower quantiser barely
 * moved it: 7.3 at quantiser 2.
 */
const GOPS = { header: 32, search: 60 } as const;
/**
 * H.264 levels. The header's frame fits 5.1. Search's 3840 x 2560 is 38,400
 * macroblocks, past the 36,864 that 5.1 and 5.2 allow, so 6.0, as Apple's
 * template renders it.
 */
const LEVELS = { header: '5.1', search: '6.0' } as const;
/**
 * The banding check's pass marks, set from the dither's arithmetic before
 * anything was measured. An 8 by 8 ordered dither keeps every 8 rows' mean
 * on the ramp; one level wide it leaves a row all one level only where the
 * ramp passes within 1/128 of a level, a few rows at a time, and two levels
 * wide, never.
 */
const MOST_FLAT_ROWS = 16;
const MOST_OFF = 0.1;
/**
 * The frames measured: every key frame, the poster first; one midway between
 * two; and the second loop's first.
 */
const measured = (placement: Moving) => {
  const gop = GOPS[placement];
  const keys = Array.from(
    { length: Math.ceil((FILE_LOOPS * LOOP_FRAMES) / gop) },
    (_, k) => k * gop,
  );
  return [...new Set([...keys, gop / 2, LOOP_FRAMES])].sort((a, b) => a - b);
};
const PLANES = ['y', 'cb', 'cr'] as const;

const meanOf = (data: Uint8Array) => {
  let sum = 0;
  for (const v of data) sum += v;
  return sum / data.length;
};
const planeMeans = (frame: Yuv) =>
  PLANES.map((p) => meanOf(planeOf(frame, p).data));

/**
 * One loop of `shots` as raw 4:2:0 frames in `path`, over `backdrop` made
 * with `rows` and `dither`; and which columns any frame draws in.
 */
function writeLoop(
  shots: Buffer[],
  path: string,
  rows: Uint16Array,
  backdrop: Yuv,
  dither: boolean,
): Uint8Array {
  const drawn = new Uint8Array(backdrop.width);
  const fd = openSync(path, 'w');
  try {
    for (const shot of shots) {
      const art = decodeRgbaPng(shot);
      for (let i = 3; i < art.data.length; i += 4)
        if (art.data[i]) drawn[((i - 3) >> 2) % art.width] = 1;
      writeSync(fd, yuvFrame(art, rows, backdrop, dither));
    }
  } finally {
    closeSync(fd);
  }
  return drawn;
}

/**
 * The loop in `yuv`, played `FILE_LOOPS` times, as H.264 High into `path`;
 * with `aac` as its sound, as it is.
 */
function encodeFile(
  yuv: string,
  placement: Moving,
  path: string,
  aac?: string,
) {
  const { width, height } = PLACEMENTS[placement];
  const input = [
    '-stream_loop',
    FILE_LOOPS - 1,
    ...yuvInput(width, height),
    '-i',
    yuv,
  ];
  const video = [
    '-vf',
    TAGGED,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-profile:v',
    'high',
    '-level:v',
    LEVELS[placement],
    '-qp',
    QUANTISER,
    '-x264-params',
    `keyint=${GOPS[placement]}:min-keyint=${GOPS[placement]}:scenecut=0`,
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    ...BT709,
  ];
  ffmpeg([
    '-loglevel',
    'error',
    ...input,
    ...(aac ? ['-i', aac] : []),
    ...video,
    ...(aac ? ['-map', '0:v', '-map', '1:a', '-c:a', 'copy'] : ['-an']),
    '-movflags',
    '+faststart',
    path,
  ]);
}

/** Frames `wanted` of a video, decoded, in 4:2:0 exactly as stored. */
function decodedFrames(
  path: string,
  width: number,
  height: number,
  wanted: number[],
): Yuv[] {
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path,
      '-vf',
      `select=${wanted.map((n) => `eq(n\\,${n})`).join('+')}`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'yuv420p',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  const size = (width * height * 3) / 2;
  if (run.status !== 0 || run.stdout.length !== size * wanted.length)
    throw new Error(`Couldn't decode frames ${wanted.join(', ')} of ${path}.`);
  return wanted.map((_, k) => ({
    width,
    height,
    data: run.stdout.subarray(k * size, (k + 1) * size),
  }));
}

/**
 * 256 columns no frame ever draws in, from the middle of the widest such run,
 * on a 16-column grid, so the chroma's half lines up with the dither's 8.
 */
function artFreeStrip(drawn: Uint8Array): [number, number] {
  let best = [0, 0];
  let start = -1;
  for (let x = 0; x <= drawn.length; x++) {
    const free = x < drawn.length && !drawn[x];
    if (free && start < 0) start = x;
    if (!free && start >= 0) {
      if (x - start > best[1]! - best[0]!) best = [start, x];
      start = -1;
    }
  }
  const x0 = Math.ceil(((best[0]! + best[1]!) / 2 - 128) / 16) * 16;
  if (x0 < best[0]! || x0 + 256 > best[1]!)
    throw new Error(
      `No 256 clear columns: the widest run is ${best[0]} to ${best[1]}.`,
    );
  return [x0, x0 + 256];
}

type Bands = Record<(typeof PLANES)[number], ReturnType<typeof banding>>;

/** The worst banding over `frames`, plane by plane, in columns `x0` to `x1`. */
function measureBanding(frames: Yuv[], x0: number, x1: number): Bands {
  return Object.fromEntries(
    PLANES.map((p) => {
      const k = p === 'y' ? 1 : 2;
      const each = frames.map((f) => banding(planeOf(f, p), x0 / k, x1 / k));
      return [
        p,
        {
          flatRows: Math.max(...each.map((b) => b.flatRows)),
          off: Math.max(...each.map((b) => b.off)),
          from: each[0]!.from,
          to: each[0]!.to,
        },
      ];
    }),
  ) as Bands;
}

/**
 * The strip's luma and red-difference, rounded then dithered, each pixel's
 * distance from a straight ramp multiplied 32 times about mid-grey: a band
 * shows as a stripe, a dither as a fine grain. Chroma is drawn at twice its
 * size, so all four strips are as tall as the frame.
 */
function bandingImage(
  rounded: Yuv,
  dithered: Yuv,
  x0: number,
  x1: number,
  path: string,
) {
  const strips = [
    [rounded, 'y'],
    [dithered, 'y'],
    [rounded, 'cr'],
    [dithered, 'cr'],
  ] as const;
  const [w, gap, height] = [x1 - x0, 32, rounded.height];
  const width = strips.length * w + (strips.length - 1) * gap;
  const image = Buffer.alloc(width * height, 255);
  strips.forEach(([frame, p], s) => {
    const k = p === 'y' ? 1 : 2;
    const plane = planeOf(frame, p);
    const [a0, a1] = [x0 / k, x1 / k];
    const means = Array.from({ length: plane.height }, (_, y) => {
      let sum = 0;
      for (let x = a0; x < a1; x++) sum += plane.data[y * plane.width + x]!;
      return sum / (a1 - a0);
    });
    const n = means.length;
    const [sx, sy, sxx, sxy] = means.reduce(
      ([a, b, c, d], m, y) => [a + y, b + m, c + y * y, d + y * m],
      [0, 0, 0, 0],
    );
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const at = (sy - slope * sx) / n;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < w; x++) {
        const [py, px] = [Math.floor(y / k), a0 + Math.floor(x / k)];
        const off = plane.data[py * plane.width + px]! - (at + slope * py);
        image[y * width + s * (w + gap) + x] = Math.min(
          255,
          Math.max(0, Math.round(128 + 32 * off)),
        );
      }
  });
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-s',
      `${width}x${height}`,
      '-i',
      '-',
      path,
    ],
    { input: image },
  );
  if (run.status !== 0) throw new Error(`Couldn't write ${path}`);
}

/**
 * Our conversion, rounded, against ffmpeg's own, from the same pixels: each
 * plane's mean within a tenth of a level, so the matrix and the range are
 * BT.709's limited range as ffmpeg means them.
 *
 * **From 8 bits, not 16:** ffmpeg's 8-bit RGB path gives BT.709's own
 * numbers (white 235, black 16), but its 16-bit path runs luma high (white
 * at 235.84, grey 128 at 126.36 for 125.93). So the poster is rounded to 8
 * bits, made opaque, and converted both ways from that.
 */
function sameColoursAsFfmpeg(
  placement: Moving,
  art: Rgba,
  rows: Uint16Array,
): string {
  const { width, height } = art;
  const deep = overBackdrop(art, rows);
  const sixteen = new Uint16Array(
    deep.buffer,
    deep.byteOffset,
    deep.length / 2,
  );
  const rgb = Buffer.alloc(width * height * 3);
  const opaque = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++)
    for (let c = 0; c < 3; c++) {
      const v = Math.round(sixteen[i * 3 + c]! / 257);
      rgb[i * 3 + c] = v;
      opaque[i * 4 + c] = v;
    }
  const ours: Yuv = {
    width,
    height,
    data: yuvFrame(
      { width, height, data: opaque },
      rows,
      yuvBackdrop(width, height, rows, false),
      false,
    ),
  };
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      `${width}x${height}`,
      '-i',
      '-',
      '-vf',
      'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-f',
      'rawvideo',
      '-',
    ],
    { input: rgb, maxBuffer: 1 << 30 },
  );
  if (run.status !== 0)
    throw new Error(`ffmpeg couldn't convert ${placement}'s poster.`);
  const theirs = planeMeans({ width, height, data: run.stdout });
  const off = planeMeans(ours).map((m, i) => m - theirs[i]!);
  const worst = Math.max(...off.map(Math.abs));
  if (worst > 0.1)
    throw new Error(
      `${placement}: our conversion's plane means differ from ffmpeg's by ${off.map((d) => d.toFixed(3)).join(', ')}.`,
    );
  return `${placement}, the poster converted here and by ffmpeg: each plane's mean within ${worst.toFixed(3)} of a level (Y, Cb, Cr ${off.map((d) => d.toFixed(3)).join(', ')}).`;
}

/**
 * What went into the encoder against what came out, as plane means over the
 * whole poster frame: within a tenth of a level, so nothing was converted on
 * the way.
 */
function sameAsEncoded(placement: Moving, ours: Yuv, decoded: Yuv): string {
  const theirs = planeMeans(decoded);
  const off = planeMeans(ours).map((m, i) => m - theirs[i]!);
  const worst = Math.max(...off.map(Math.abs));
  if (worst > 0.1)
    throw new Error(
      `${placement}: the encoded poster's plane means differ from what went in by ${off.map((d) => d.toFixed(3)).join(', ')}.`,
    );
  return `${placement}, the poster as encoded against as it went in: each plane's mean within ${worst.toFixed(3)} of a level.`;
}

/** The highest peak of a file's sound, 4 times oversampled, in dBTP. */
function truePeak(path: string): number {
  const run = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path,
      '-map',
      '0:a',
      '-af',
      `aresample=${SAMPLE_RATE * 4}`,
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  if (run.status !== 0) throw new Error(`Couldn't decode ${path}'s sound.`);
  const samples = new Float32Array(run.stdout.length / 4);
  new Uint8Array(samples.buffer).set(run.stdout);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return dbfs(peak);
}

type Probe = {
  streams: Record<string, unknown>[];
  format: Record<string, unknown>;
};

/** A file's ffprobe, read from its own folder, so it records only its name. */
function probeFile(path: string): Probe {
  const run = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      basename(path),
    ],
    { encoding: 'utf8', cwd: dirname(path) },
  );
  if (run.status !== 0) throw new Error(`ffprobe couldn't read ${path}`);
  return JSON.parse(run.stdout) as Probe;
}

/** Every field the file is meant to have, as ffprobe reads it; and a summary. */
function checkProbe(placement: Moving, info: Probe): string {
  const video = info.streams.find((s) => s.codec_type === 'video')!;
  const audio = info.streams.filter((s) => s.codec_type === 'audio');
  const { width, height } = PLACEMENTS[placement];
  const want: Record<string, unknown> = {
    codec_name: 'h264',
    profile: 'High',
    level: Number(LEVELS[placement]) * 10,
    width,
    height,
    pix_fmt: 'yuv420p',
    color_range: 'tv',
    color_space: 'bt709',
    color_transfer: 'bt709',
    color_primaries: 'bt709',
    r_frame_rate: `${FPS}/1`,
    avg_frame_rate: `${FPS}/1`,
    nb_frames: String(FILE_LOOPS * LOOP_FRAMES),
  };
  const wrong = Object.entries(want)
    .filter(([k, v]) => video[k] !== v)
    .map(([k, v]) => `${k} ${String(video[k])}, not ${String(v)}`);
  const duration = Number(info.format.duration);
  if (Math.abs(duration - FILE_LOOPS * LOOP_S) > 0.05)
    wrong.push(`${duration} s long, not ${(FILE_LOOPS * LOOP_S).toFixed(3)}`);
  const sound = audio[0];
  if (placement === 'header') {
    if (
      audio.length !== 1 ||
      sound!.codec_name !== 'aac' ||
      sound!.profile !== 'LC' ||
      sound!.sample_rate !== String(SAMPLE_RATE) ||
      sound!.channels !== 2
    )
      wrong.push(
        `its sound isn't one stereo AAC-LC track at ${SAMPLE_RATE} Hz`,
      );
  } else if (audio.length) wrong.push('it has a sound track');
  if (wrong.length)
    throw new Error(`${fileName(placement)}: ${wrong.join('; ')}.`);
  const mbps = (n: unknown) => (Number(n) / 1e6).toFixed(2);
  return (
    `${fileName(placement)}: H.264 High at Level ${LEVELS[placement]}, ${width} x ${height}, yuv420p, ` +
    `BT.709 matrix, primaries and transfer, limited range, ${FPS} fps constant, ${String(video.nb_frames)} frames, ` +
    `${duration.toFixed(3)} s; video ${mbps(video.bit_rate)} Mbps; ` +
    (sound
      ? `AAC-LC ${SAMPLE_RATE / 1000} kHz stereo, ${(Number(sound.bit_rate) / 1000).toFixed(0)} kbps; `
      : 'no sound track; ') +
    `${(Number(info.format.size) / 1e6).toFixed(2)} MB.`
  );
}

const sha256 = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * One placement's file at full size, from one loop of its frames. It's
 * encoded twice, rounded to 8 bits and dithered, the same way, to show what
 * the dither takes away; the dithered one is kept. Returns what was measured.
 */
function fullSize(
  placement: Moving,
  shots: Buffer[],
  work: string,
  aac?: string,
): string[] {
  const { width, height } = PLACEMENTS[placement];
  const rows = backdropRows(height);
  const poster = decodeRgbaPng(shots[START_FRAME]!);
  const lines = [sameColoursAsFfmpeg(placement, poster, rows)];
  const name = fileName(placement);
  const paths = {
    rounded: join(work, `rounded-${name}`),
    dithered: join(OUT, name),
  };
  let drawn: Uint8Array = new Uint8Array(width);
  for (const dither of [false, true]) {
    const yuv = join(work, 'loop.yuv');
    const backdrop = yuvBackdrop(width, height, rows, dither);
    drawn = writeLoop(turned(shots, START_FRAME), yuv, rows, backdrop, dither);
    encodeFile(
      yuv,
      placement,
      dither ? paths.dithered : paths.rounded,
      dither ? aac : undefined,
    );
    rmSync(yuv);
    console.log(`${placement}: encoded, ${dither ? 'dithered' : 'rounded'}`);
  }
  const [x0, x1] = artFreeStrip(drawn);
  const frames = measured(placement);
  const rounded = decodedFrames(paths.rounded, width, height, frames);
  const dithered = decodedFrames(paths.dithered, width, height, frames);
  const before = measureBanding(rounded, x0, x1);
  const after = measureBanding(dithered, x0, x1);
  const describe = (b: Bands) =>
    PLANES.map(
      (p) =>
        `${p === 'y' ? 'Y' : p === 'cb' ? 'Cb' : 'Cr'} ${b[p].from.toFixed(2)} to ${b[p].to.toFixed(2)}, ` +
        `flat for ${b[p].flatRows} rows at most, 8-row means within ${b[p].off.toFixed(3)} of the ramp`,
    ).join('; ');
  lines.push(
    `${placement}, banding in columns ${x0} to ${x1}, decoded frames ${frames.join(', ')}, the worst of each:`,
    `  rounded: ${describe(before)}`,
    `  dithered: ${describe(after)}`,
  );
  const banded = PLANES.filter(
    (p) => after[p].flatRows > MOST_FLAT_ROWS || after[p].off > MOST_OFF,
  );
  if (banded.length)
    throw new Error(
      `${placement}: the dithered file still bands in ${banded.join(', ')}.\n${lines.join('\n')}`,
    );
  bandingImage(
    rounded[0]!,
    dithered[0]!,
    x0,
    x1,
    join(SIDE, `banding-${placement}.png`),
  );
  const ours: Yuv = {
    width,
    height,
    data: yuvFrame(poster, rows, yuvBackdrop(width, height, rows, true), true),
  };
  lines.push(sameAsEncoded(placement, ours, dithered[0]!));
  const info = probeFile(paths.dithered);
  writeFileSync(
    join(SIDE, 'ffprobe', `${name}.json`),
    `${JSON.stringify(info, null, 2)}\n`,
  );
  lines.push(checkProbe(placement, info));
  return lines;
}

/** `shots` over the dithered background, once through, to look at, not to upload. */
async function encodeCheck(shots: Buffer[], path: string) {
  const first = decodeRgbaPng(shots[0]!);
  const rows = backdropRows(first.height);
  const backdrop = yuvBackdrop(first.width, first.height, rows, true);
  const enc = encoder(yuvInput(first.width, first.height), [
    '-vf',
    TAGGED,
    '-c:v',
    'libx264',
    // The files' own quality, so the slowed clip shows what they carry.
    '-qp',
    QUANTISER,
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    ...BT709,
    '-movflags',
    '+faststart',
    path,
  ]);
  for (const shot of shots)
    await enc.write(yuvFrame(decodeRgbaPng(shot), rows, backdrop, true));
  await enc.done();
  console.log(`wrote ${path.slice(OUT.length + 1)}`);
}

const notes: string[] = [];
const work = mkdtempSync(join(tmpdir(), 'store-motion-'));
const chrome = await launchChrome();
try {
  await chrome.send('Page.enable');
  await chrome.send('Runtime.enable');

  // ---- The sound -------------------------------------------------------------
  await size(chrome, 1280, 800);
  await open(chrome, '?motion=header');
  const raw = turned(await soundtrack(chrome), START_SAMPLE);
  const rawPath = join(SIDE, 'header-sound-as-rendered.wav');
  writeFileSync(rawPath, encodeWav(raw, SAMPLE_RATE));
  const before = loudness(rawPath);
  // The peak to the hundredth: ebur128 prints one decimal, and -10.26 read
  // as -10.3 once set a gain that put the mix at -0.96 dBTP.
  const rawPeak = truePeak(rawPath);
  const gainDb = Math.min(TARGET_LUFS - before.lufs, CEILING_DBTP - rawPeak);
  const gain = 10 ** (gainDb / 20);
  const mixed = raw.map((s) => s * gain);
  const soundPath = join(SIDE, 'header-sound.wav');
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
      `The file's ends aren't silent: ${first.toFixed(1)} and ${last.toFixed(1)} dBFS.`,
    );
  notes.push(
    `Sound, ${SAMPLE_RATE} Hz mono, one ${LOOP_S.toFixed(2)} s loop, turned to start at ${START_AT.toFixed(2)} s.`,
    `  As rendered, the game's own level: ${before.lufs} LUFS integrated, true peak ${rawPeak.toFixed(2)} dBTP at 4 times oversampled.`,
    `  Mixed, one gain of ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB: ` +
      `${after.lufs} LUFS, true peak ${truePeak(soundPath).toFixed(2)} dBTP, sample peak ${dbfs(peak).toFixed(2)} dBFS.`,
    `  The first and last ${EDGE_S * 1000} ms: RMS ${first.toFixed(1)} and ${last.toFixed(1)} dBFS.`,
  );

  // At full size the sound is encoded once, or taken as it is from a file
  // already handed off, held to the ceiling as encoded, and put in the file
  // as it is.
  let aac: string | undefined;
  if (SOUND_FROM) {
    aac = join(work, 'header-sound.m4a');
    ffmpeg([
      '-loglevel',
      'error',
      '-i',
      SOUND_FROM,
      '-map',
      '0:a',
      '-c:a',
      'copy',
      aac,
    ]);
    notes.push(
      `The header's AAC is ${basename(SOUND_FROM)}'s, as it is, not a fresh encode of the sound above.`,
    );
  } else if (!PREVIEW) {
    aac = join(work, 'header-sound.m4a');
    ffmpeg([
      '-loglevel',
      'error',
      '-i',
      soundPath,
      '-af',
      `aloop=loop=${FILE_LOOPS - 1}:size=${LOOP_SAMPLES},${DUAL_MONO}`,
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-ar',
      SAMPLE_RATE,
      aac,
    ]);
  }
  if (aac) {
    const encodedPeak = truePeak(aac);
    if (encodedPeak > CEILING_DBTP)
      throw new Error(
        `As AAC, the header's sound peaks at ${encodedPeak.toFixed(2)} dBTP, over the ${CEILING_DBTP} dBTP ceiling, at the gain kept.`,
      );
  }

  // ---- The frames and the videos -------------------------------------------
  const sums: string[] = [];
  for (const placement of ['header', 'search'] as const) {
    const shots = await loopFrames(chrome, placement, SCALE);
    if (!shots[START_FRAME - 1]!.equals(shots[START_FRAME]!))
      throw new Error(`${placement}: the file's last frame isn't its first.`);
    notes.push(
      ...(await sameAsThePage(chrome, placement, SCALE, shots, [
        MID_FRAME,
        START_FRAME,
      ])),
    );
    if (PREVIEW)
      await encodePreview(
        turned(shots, START_FRAME),
        join(OUT, `${placement}-preview.mp4`),
        FILE_LOOPS,
        placement === 'header' ? soundPath : undefined,
      );
    else {
      notes.push(
        ...fullSize(
          placement,
          shots,
          work,
          placement === 'header' ? aac : undefined,
        ),
      );
      sums.push(
        `${sha256(join(OUT, fileName(placement)))}  ${fileName(placement)}`,
      );
      const { width, height } = PLACEMENTS[placement];
      await transparent(chrome, false);
      await size(chrome, width, height);
      await open(chrome, `?motion=${placement}&t=${START_AT}&guides=1`);
      const poster = join(SIDE, `poster-${placement}-safe-area.png`);
      writeFileSync(poster, await screenshot(chrome, width, height, 1));
      console.log(`wrote ${poster.slice(OUT.length + 1)}`);
    }
    await transparent(chrome, false);
    await size(chrome, 2400, 1600);
    await open(chrome, `?sheet=arrivals&placement=${placement}`);
    const box = await mainBox(chrome);
    const sheet = join(SIDE, `arrivals-${placement}.png`);
    writeFileSync(sheet, await screenshot(chrome, box.width, box.height, 2));
    console.log(`wrote ${sheet.slice(OUT.length + 1)}`);
  }
  const headerPath = join(
    OUT,
    PREVIEW ? 'header-preview.mp4' : fileName('header'),
  );
  const header = loudness(headerPath);
  // As encoded: the file's first and last moments, and where its two loops
  // join, all on the crown after the sound has rung out.
  const heard = decoded(headerPath);
  if (heard.length !== FILE_LOOPS * LOOP_SAMPLES)
    throw new Error(
      `The header's sound decodes to ${heard.length} samples, not ${FILE_LOOPS * LOOP_SAMPLES}.`,
    );
  const quiet = [
    ['its start', rms(heard.subarray(0, edge))],
    ['its end', rms(heard.subarray(-edge))],
    [
      'its loops joining',
      rms(heard.subarray(LOOP_SAMPLES - edge, LOOP_SAMPLES + edge)),
    ],
  ] as const;
  const loud = quiet.filter(([, db]) => db > SILENT_DBFS);
  if (loud.length)
    throw new Error(
      `The header's AAC isn't silent at ${loud.map(([at, db]) => `${at}, ${db.toFixed(1)} dBFS`).join('; ')}.`,
    );
  const heardPeak = truePeak(headerPath);
  if (heardPeak > CEILING_DBTP)
    throw new Error(
      `The header's AAC peaks at ${heardPeak.toFixed(2)} dBTP, over the ${CEILING_DBTP} dBTP ceiling.`,
    );
  notes.push(
    `The header's AAC, ${FILE_LOOPS} loops: ${header.lufs} LUFS, true peak ${header.truePeak} dBTP by ebur128, ` +
      `${heardPeak.toFixed(2)} dBTP at 4 times oversampled.`,
    `  Decoded, RMS at ${quiet.map(([at, db]) => `${at} ${db.toFixed(1)}`).join(', ')} dBFS.`,
  );

  // ---- The way back to the soil, slowed --------------------------------------
  const steps = Math.round((SEAM_TO - SEAM_FROM) * FPS * SLOWED);
  const times = Array.from(
    { length: steps + 1 },
    (_, k) => SEAM_FROM + k / (FPS * SLOWED),
  );
  const seam = await bareFrames(chrome, 'header', SCALE, times);
  if (PREVIEW)
    await encodePreview(seam, join(OUT, 'loop-point-quarter-speed.mp4'), 1);
  else {
    const clip = join(SIDE, 'way-back-quarter-speed.mp4');
    await encodeCheck(seam, clip);
    writeFileSync(
      join(SIDE, 'ffprobe', `${basename(clip)}.json`),
      `${JSON.stringify(probeFile(clip), null, 2)}\n`,
    );
  }
  const into = (t: number) => `${((t - SEAM_FROM) * SLOWED).toFixed(2)} s`;
  notes.push(
    `The way back to the soil at a quarter speed: ${SEAM_FROM.toFixed(2)} s to the next loop's ` +
      `${(SEAM_TO - LOOP_S).toFixed(2)} s, ${steps + 1} frames. Into the clip: ` +
      `the file joins at ${into(START_AT)}; the crown sinks from ${into(RETURN_AT)}; ` +
      `the crown has gone into the mound and the soil's face fades in from ${into(RETURN_AT + SINK_S)}, whole at ${into(RETURN_AT + SINK_S + FACE_S)}; ` +
      `the loop's own join, on the soil, at ${into(LOOP_S)}; the sprout at ${into(LOOP_S + ARRIVALS[0]!)}.`,
  );

  // ---- The numbers -----------------------------------------------------------
  if (!PREVIEW) {
    writeFileSync(join(OUT, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
    notes.push('SHA-256:', ...sums.map((s) => `  ${s}`));
  }
  notes.unshift(
    `A ${LOOP_S.toFixed(2)} s loop at ${FPS} fps, ${LOOP_FRAMES} frames.`,
    `Each file starts on the crown at ${START_AT.toFixed(2)} s, frame ${START_FRAME}, its poster frame, ` +
      `and plays the loop ${FILE_LOOPS} times: ${FILE_LOOPS * LOOP_FRAMES} frames, ${(FILE_LOOPS * LOOP_S).toFixed(2)} s.`,
    ...BEATS.map(
      (b) =>
        `${b.at.toFixed(2)} s, frame ${Math.round(b.at * FPS)}: ` +
        `${GROWTH_STAGES.find((s) => s.id === b.stage)!.spoken}, ` +
        (b.call === 'edition' ? 'edition' : `found-${b.length}-set`),
    ),
    `${RETURN_AT.toFixed(2)} s, frame ${Math.round(RETURN_AT * FPS)}: the crown sinks into the soil as its mound comes back under it, silent`,
    `${(RETURN_AT + SINK_S).toFixed(2)} s, frame ${Math.round((RETURN_AT + SINK_S) * FPS)}: the crown has gone; the soil's face fades in`,
    `${(RETURN_AT + SINK_S + FACE_S).toFixed(2)} s, frame ${Math.round((RETURN_AT + SINK_S + FACE_S) * FPS)}: the soil, whole`,
  );
  writeFileSync(join(SIDE, 'numbers.txt'), `${notes.join('\n')}\n`);
  console.log(notes.join('\n'));
} finally {
  chrome.close();
  await server.close();
  rmSync(work, { recursive: true, force: true });
}
