import { afterEach, describe, expect, test, vi } from 'vitest';
import { server, userEvent } from 'vitest/browser';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import css from '@/index.css?raw';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { NullAudioEngine, type AudioEngine } from '@/audio/AudioEngine.ts';
import { SoundscapeAudioEngine } from '@/audio/SoundscapeAudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import { Game } from './Game.tsx';
import { truePeak } from '../../scripts/lib/loudness.ts';

/**
 * Shuffle's sound in the game itself, not on the sounds page: pressed with
 * the mouse and from the keyboard, and pressed fast, ten times, then a letter.
 *
 * The presses go through the real Game, its button and its handlers, into
 * SoundscapeAudioEngine on an offline context whose clock the test moves, as
 * the game's clock would move between presses. Then the context renders what
 * the game scheduled.
 */
const RATE = 48000;

function fakeData(): GameData {
  return {
    dictionary: createListDictionary(['reassure', 'sure', 'ease']),
    commonPool: createListWordSource(['reassure', 'sure', 'ease']),
    beyond70Pool: createListWordSource([]),
    beyond95Pool: createListWordSource([]),
    dailyCalendar: {
      epoch: { year: 2026, month: 1, day: 1 },
      words: ['reassure'],
    },
    sourceEntry: () => undefined,
  };
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  document.getElementById('game-css')?.remove();
});

function mountGame(audio: AudioEngine) {
  if (!document.getElementById('game-css')) {
    const style = document.createElement('style');
    style.id = 'game-css';
    style.textContent = css;
    document.head.append(style);
  }
  root?.unmount();
  host?.remove();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      createElement(Game, {
        data: fakeData(),
        audio,
        storage: new GameStorage(fakeStore()),
      }),
    ),
  );
}

const shuffleButton = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === 'Shuffle',
  )!;
const firstTile = () =>
  host!.querySelector<HTMLButtonElement>('.case button[aria-label^="Letter"]')!;

describe(`Shuffle's sound in the game, in ${server.browser}`, () => {
  test('a click plays it, and so does Space on the focused button', async () => {
    const audio = new NullAudioEngine();
    const shuffle = vi.spyOn(audio, 'playShuffle');
    mountGame(audio);
    shuffleButton().click();
    expect(shuffle).toHaveBeenCalledTimes(1);
    shuffleButton().focus();
    await userEvent.keyboard(' ');
    expect(shuffle).toHaveBeenCalledTimes(2);
  });

  test("Enter on the focused button stays the page's, which sets a word, so it plays no Shuffle", async () => {
    const audio = new NullAudioEngine();
    const shuffle = vi.spyOn(audio, 'playShuffle');
    mountGame(audio);
    shuffleButton().focus();
    await userEvent.keyboard('{Enter}');
    expect(shuffle).not.toHaveBeenCalled();
  });
});

/** Presses, each at its time on the game's clock, then the render of what it scheduled. */
async function played(
  presses: { at: number; press: 'shuffle' | 'tile' }[],
): Promise<Float32Array> {
  let now = 0;
  const context = new OfflineAudioContext(1, 2 * RATE, RATE);
  Object.defineProperty(context, 'currentTime', { get: () => now });
  mountGame(new SoundscapeAudioEngine(context));
  for (const { at, press } of presses) {
    now = at;
    flushSync(() =>
      (press === 'shuffle' ? shuffleButton() : firstTile()).click(),
    );
  }
  return Float32Array.from((await context.startRendering()).getChannelData(0));
}

const peak = (x: Float32Array, from = 0, to = x.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
};
const dbfs = (v: number) => 20 * Math.log10(v);

const START = 0.1;

/** Ten Shuffle presses `gap` apart, and the letter `after` the last. */
function tenThenALetter(gap: number, after: number) {
  const shuffles = Array.from({ length: 10 }, (_, i) => ({
    at: START + i * gap,
    press: 'shuffle' as const,
  }));
  const letter = { at: START + 9 * gap + after, press: 'tile' as const };
  return { shuffles, letter };
}

describe(`pressed fast, ten times, then a letter, in ${server.browser}`, () => {
  // Eight a second, about as fast as a thumb; thirteen, where one press's
  // first click lands on the last's third; and twenty, faster than anyone
  for (const perSecond of [8, 13, 20]) {
    const gap = 1 / perSecond;
    // The letter inside the last Shuffle's ring, 50 ms after it
    const { shuffles, letter } = tenThenALetter(gap, 0.05);

    test(`${perSecond} a second: never clips, and the letter's tick is whole`, async () => {
      const one = await played([{ at: START, press: 'shuffle' }]);
      const ten = await played(shuffles);
      const tick = await played([letter]);
      const mix = await played([...shuffles, letter]);

      const onePeak = peak(one);
      console.log(
        `${server.browser}, ${perSecond} a second: one Shuffle peaks at ${dbfs(onePeak).toFixed(2)} dBFS, ten at ${dbfs(peak(ten)).toFixed(2)}, ten and the letter at ${dbfs(peak(mix)).toFixed(2)}, ${truePeak(mix).toFixed(2)} dBTP`,
      );
      // Under Bea's mix's ceiling, at any pace, between samples too
      expect(truePeak(mix)).toBeLessThan(-1);
      // At eight a second, nothing stacks: ten peak as one, to within 0.1 dB
      if (perSecond === 8)
        expect(peak(ten)).toBeLessThanOrEqual(onePeak * 10 ** (0.1 / 20));

      // The tick is not cut, or changed: what the letter adds to the ten
      // Shuffles is the tick alone, sample for sample, across its whole length
      const from = Math.round(letter.at * RATE);
      const to = from + Math.round(0.05 * RATE);
      let largest = 0;
      for (let i = from; i < to; i++)
        largest = Math.max(largest, Math.abs(mix[i]! - ten[i]! - tick[i]!));
      expect(peak(tick, from, to)).toBeGreaterThan(0.005);
      expect(largest).toBeLessThan(1e-6);
    });
  }
});
