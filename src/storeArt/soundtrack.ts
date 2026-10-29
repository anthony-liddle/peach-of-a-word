import { SoundscapeAudioEngine } from '@/audio/SoundscapeAudioEngine.ts';
import { BEATS, LOOP_S, SAMPLE_RATE } from './motion.ts';

/**
 * The header's sound, one loop of it, mono, at the video's sample rate:
 * `BEATS` played through the game's own audio engine, Soundscape, from the
 * game's own cue file, into an OfflineAudioContext. Nothing is recorded from
 * a speaker.
 *
 * The engine schedules from the context's clock, as the game does, so the
 * clock is moved to each beat while it's played, as `cues.browser.test.ts`
 * does. Three loops are played and the middle one kept, so anything still
 * ringing as one loop ends is heard at the start of the next, as it is when
 * the video loops.
 *
 * Runs in a browser, since Node has no Web Audio: the capture script calls it
 * in headless Chrome.
 */
export async function renderSoundtrack(): Promise<Float32Array> {
  const loop = Math.round(LOOP_S * SAMPLE_RATE);
  const context = new OfflineAudioContext(1, loop * 3, SAMPLE_RATE);
  let now = 0;
  Object.defineProperty(context, 'currentTime', { get: () => now });
  const engine = new SoundscapeAudioEngine(context);
  engine.setTheme('cute');
  for (let k = 0; k < 3; k++)
    for (const beat of BEATS) {
      now = k * LOOP_S + beat.at;
      if (beat.call === 'edition') engine.playEdition();
      else engine.playFound(beat.length);
    }
  const rendered = await context.startRendering();
  return Float32Array.from(rendered.getChannelData(0).subarray(loop, loop * 2));
}
