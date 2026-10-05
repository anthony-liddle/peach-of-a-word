import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import type { Sound } from './inventory.ts';

/**
 * Render one sound offline and return its samples, mono, from the moment the
 * cue is called.
 *
 * It goes through the game's own engine, master gain included, and through the
 * same `play` the page's button calls, so a mythic row is rendered in the theme
 * its button names. Only the context differs: an OfflineAudioContext handed to
 * the engine instead of the one it would make for itself.
 *
 * Runs in a browser, since jsdom has no Web Audio. The baseline capture script
 * calls it in headless Chrome.
 */
export async function renderSound(
  sound: Sound,
  sampleRate: number,
  seconds: number,
): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    Math.ceil(sampleRate * seconds),
    sampleRate,
  );
  sound.play(new WebAudioEngine(context));
  const rendered = await context.startRendering();
  return rendered.getChannelData(0);
}
