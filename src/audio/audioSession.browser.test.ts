import { describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';
import { SoundscapeAudioEngine } from './SoundscapeAudioEngine.ts';

/**
 * The game's first cue asks for the playback session where the browser offers
 * the Audio Session API, so the game sounds in silent mode on an iPhone, and
 * plays as before where it doesn't. WebKit offers it, which is every browser
 * on an iPhone; Chromium and Firefox don't yet.
 */
type WithSession = Navigator & { audioSession?: { type: string } };

describe(`the audio session, in ${server.browser}`, () => {
  test('the first cue asks for playback where the session is offered, and plays as before where not', () => {
    const { audioSession } = navigator as WithSession;
    console.log(
      `${server.browser}: navigator.audioSession ${audioSession ? `offered, type ${audioSession.type}` : 'not offered'}`,
    );
    const engine = new SoundscapeAudioEngine();
    expect(() => engine.tick()).not.toThrow();
    if (server.browser === 'webkit') expect(audioSession).toBeDefined();
    if (audioSession) expect(audioSession.type).toBe('playback');
  });
});
