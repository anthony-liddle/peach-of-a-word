import { afterEach, describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import css from '@/index.css?raw';
import {
  createListDictionary,
  createListWordSource,
} from '@/data/listSource.ts';
import type { GameData } from '@/data/gameData.ts';
import { SoundscapeAudioEngine } from '@/audio/SoundscapeAudioEngine.ts';
import { GameStorage, type KeyValueStore } from '@/persistence/storage.ts';
import type { Theme } from './useTheme.ts';
import { Game } from './Game.tsx';
import { truePeak } from '../../scripts/lib/loudness.ts';

/**
 * The game never clips in Bea's mix (src/audio/mix.ts), played as fast as
 * anyone can, in the game itself: the real Game, its keys, its Shuffle button
 * and its handlers, into SoundscapeAudioEngine on an offline context whose
 * clock the test moves, as shuffleSound.browser.test.ts does.
 *
 * Every press is put on a render quantum, 128 frames, which is where a real
 * AudioContext's clock reads. A roll is two keys pressed in one quantum: the
 * clock reads the same for both, so their ticks start on the same frame and
 * add exactly. Each scene is held to the -1 dBTP the mix was set to, as a true
 * peak, between the samples too.
 *
 * The worst pile-up is the last scene: the full basket, a long rare find typed
 * under its card half a second later, and a roll on that find. On the web's
 * quanta it reaches about -2.5 dBTP. The iPhone starts a cue for now at its
 * next render cycle instead, so a roll can land between quanta, and 623
 * frames after the find it reaches about -1.1: the stack the mix was set by,
 * which the last test plays to the frame.
 */
const RATE = 48000;
const QUANTUM = 128;
const CEILING_DBTP = -1;

/** A time on the clock, in render quanta. */
const quanta = (n: number) => (n * QUANTUM) / RATE;
/** Seconds, to the nearest quantum. */
const onQuantum = (seconds: number) =>
  quanta(Math.round((seconds * RATE) / QUANTUM));
/** A letter every 50 ms, twenty a second, faster than anyone types on a phone. */
const LETTER_S = onQuantum(0.05);

/**
 * A puzzle with a set word at every length from 3 to 8, the 8 its source, and
 * a mythic word of 8, so every find cue the game plays for a length can land.
 */
const SET = ['ear', 'sure', 'erase', 'eraser', 'erasers', 'reassure'];
const MYTHIC = 'saeurers';

function fakeData(): GameData {
  return {
    dictionary: createListDictionary([...SET, MYTHIC]),
    commonPool: createListWordSource(SET),
    beyond70Pool: createListWordSource([MYTHIC]),
    beyond95Pool: createListWordSource([MYTHIC]),
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

function mountGame(audio: SoundscapeAudioEngine) {
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

/**
 * A key the game listens for, its Shuffle button, or the crown's card's close
 * button, which makes no sound.
 */
type Key = string | 'Enter' | 'Escape' | 'Shuffle' | 'Close the card';

interface Press {
  at: number;
  key: Key;
}

const press = (key: Key) => {
  if (key === 'Shuffle') {
    [...host!.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Shuffle')!
      .click();
  } else if (key === 'Close the card') {
    document.querySelector<HTMLButtonElement>('.reveal__close')!.click();
  } else window.dispatchEvent(new KeyboardEvent('keydown', { key }));
};

/** A word typed a letter at a time from `from`, then set: its presses, and when it is set. */
function typed(word: string, from: number): { presses: Press[]; set: number } {
  const presses = [...word].map((key, i) => ({ at: from + i * LETTER_S, key }));
  const set = from + word.length * LETTER_S;
  return { presses: [...presses, { at: set, key: 'Enter' }], set };
}

const SOUNDING = [
  'tick',
  'playShuffle',
  'playFound',
  'playSource',
  'playEdition',
  'playInvalid',
] as const;

/**
 * The presses through the game, each when the clock reads its time: what the
 * context renders, and which cues the game asked for, in order.
 */
async function played(presses: Press[], theme: Theme = 'cute') {
  let now = 0;
  const end = Math.max(...presses.map((p) => p.at)) + 2;
  const context = new OfflineAudioContext(1, Math.ceil(end * RATE), RATE);
  Object.defineProperty(context, 'currentTime', { get: () => now });
  const audio = new SoundscapeAudioEngine(context);
  audio.setTheme(theme);
  const calls: string[] = [];
  for (const name of SOUNDING) {
    const play = audio[name].bind(audio) as (...args: unknown[]) => void;
    (audio as unknown as Record<string, unknown>)[name] = (
      ...args: unknown[]
    ) => {
      calls.push(name);
      play(...args);
    };
  }
  mountGame(audio);
  for (const { at, key } of [...presses].sort((a, b) => a.at - b.at)) {
    now = at;
    flushSync(() => press(key));
  }
  const samples = Float32Array.from(
    (await context.startRendering()).getChannelData(0),
  );
  return { samples, calls, dbtp: truePeak(samples) };
}

const count = (calls: string[], name: string) =>
  calls.filter((c) => c === name).length;

describe(`the game never clips in Bea's mix, in ${server.browser}`, () => {
  test('typing twenty letters a second, with two and three keys in one quantum', async () => {
    const presses: Press[] = [];
    let at = quanta(40);
    for (let word = 0; word < 6; word++) {
      for (let i = 0; i < 8; i++) {
        presses.push({ at, key: 'reassure'[i]! });
        // Every word ends in a roll of two, and the last in three
        if (i === 7) presses.push({ at, key: 'e' });
        if (i === 7 && word === 5) presses.push({ at, key: 'r' });
        at += LETTER_S;
      }
      presses.push({ at, key: 'Escape' });
      at += LETTER_S;
    }
    const { calls, dbtp } = await played(presses);
    console.log(`${server.browser}, typing: ${dbtp.toFixed(2)} dBTP`);
    expect(count(calls, 'tick')).toBe(6 * 9 + 1);
    expect(dbtp).toBeLessThan(CEILING_DBTP);
  });

  test('ten Shuffles twenty a second, a roll of two letters on each', async () => {
    const presses = Array.from({ length: 10 }, (_, i) => {
      const at = quanta(40) + i * LETTER_S;
      return [
        { at, key: 'Shuffle' },
        { at, key: 'r' },
        { at, key: 'e' },
      ];
    }).flat();
    const { calls, dbtp } = await played(presses);
    console.log(`${server.browser}, ten Shuffles: ${dbtp.toFixed(2)} dBTP`);
    expect(count(calls, 'playShuffle')).toBe(10);
    expect(count(calls, 'tick')).toBe(20);
    expect(dbtp).toBeLessThan(CEILING_DBTP);
  });

  // A find at every length the game plays one for, each with a roll of the
  // next word's letters landing on it: on the same quantum, and on each one
  // after through the find's attack and its loudest moment
  for (const word of SET.filter((w) => w !== 'reassure')) {
    test(`a find of ${word.length} landing on a roll, anywhere in its first 27 ms`, async () => {
      let worst = -Infinity;
      for (let after = 0; after <= 10; after++) {
        const { presses, set } = typed(word, quanta(40));
        const roll = set + quanta(after);
        const { calls, dbtp } = await played([
          ...presses,
          { at: roll, key: 'e' },
          { at: roll, key: 'r' },
        ]);
        expect(count(calls, 'playFound')).toBe(1);
        expect(calls.slice(-2)).toEqual(['tick', 'tick']);
        worst = Math.max(worst, dbtp);
      }
      console.log(
        `${server.browser}, a find of ${word.length} on a roll: ${worst.toFixed(2)} dBTP`,
      );
      expect(worst).toBeLessThan(CEILING_DBTP);
    });
  }

  test("the peach of a word opens the crown's card, which takes the keys, so no letter lands on it", async () => {
    const { presses, set } = typed('reassure', quanta(40));
    const { calls, dbtp } = await played([
      ...presses,
      { at: set, key: 'e' },
      { at: set, key: 'r' },
    ]);
    console.log(
      `${server.browser}, the peach of a word: ${dbtp.toFixed(2)} dBTP`,
    );
    expect(calls.at(-1)).toBe('playSource');
    expect(count(calls, 'tick')).toBe(8);
    expect(dbtp).toBeLessThan(CEILING_DBTP);
  });

  /** The basket's scene, the roll `after` seconds after the mythic find is set. */
  function basketScene(after: (find: number) => number): Press[] {
    // The peach of a word first, and its card closed, since the card takes
    // the keys; then the rest of the set, the last filling the basket
    const presses: Press[] = [];
    let at = quanta(40);
    for (const word of ['reassure', 'ear', 'sure', 'erase', 'eraser']) {
      const t = typed(word, at);
      presses.push(...t.presses);
      if (word === 'reassure')
        presses.push({ at: t.set + onQuantum(0.3), key: 'Close the card' });
      at = t.set + onQuantum(0.6);
    }
    const basket = typed('erasers', at);
    presses.push(...basket.presses);
    // The mythic find, set 24064 frames, 188 quanta, after the basket
    const find = basket.set + quanta(188);
    const mythic = typed(MYTHIC, find - MYTHIC.length * LETTER_S);
    const roll = after(find);
    presses.push(
      ...mythic.presses,
      { at: roll, key: 'e' },
      { at: roll, key: 'r' },
    );
    return presses;
  }

  const sceneCalls = (calls: string[]) => {
    expect(count(calls, 'playEdition')).toBe(1);
    expect(calls.at(-3)).toBe('playFound');
    expect(calls.slice(-2)).toEqual(['tick', 'tick']);
  };

  // The full basket, then a mythic 8 typed under its card and set 24064
  // frames, 188 quanta, after it, then a roll on that find. The headroom
  // search found this stack the loudest the game can make, and set the mix by
  // it. In both themes: the mythic find's glint is the theme's own.
  for (const theme of ['cute', 'letterpress'] as const) {
    test(`the full basket, a mythic find under its card, and a roll on it, in ${theme}`, async () => {
      let worst = { dbtp: -Infinity, after: 0 };
      for (let after = 0; after <= 10; after++) {
        const { calls, dbtp } = await played(
          basketScene((find) => find + quanta(after)),
          theme,
        );
        sceneCalls(calls);
        if (dbtp > worst.dbtp) worst = { dbtp, after };
      }
      console.log(
        `${server.browser}, ${theme}: the basket, a find under its card and a roll ${worst.after} quanta after it, ${worst.dbtp.toFixed(2)} dBTP`,
      );
      expect(worst.dbtp).toBeLessThan(CEILING_DBTP);
    });
  }

  test('the same, with the roll 623 frames after the find, as an iPhone can start it: the stack the mix was set by', async () => {
    const at623 = (find: number) => find + 623 / RATE;
    const cute = await played(basketScene(at623), 'cute');
    const letterpress = await played(basketScene(at623), 'letterpress');
    sceneCalls(cute.calls);
    sceneCalls(letterpress.calls);
    console.log(
      `${server.browser}, the basket, a mythic find and a roll 623 frames after it: ${cute.dbtp.toFixed(2)} dBTP in cute, ${letterpress.dbtp.toFixed(2)} in letterpress`,
    );
    expect(cute.dbtp).toBeLessThan(CEILING_DBTP);
    expect(letterpress.dbtp).toBeLessThan(CEILING_DBTP);
    // Within 0.3 dB of the ceiling: a louder mix would pass it, and if this
    // ever reads far under, it is no longer the stack that sets the mix
    expect(cute.dbtp).toBeGreaterThan(CEILING_DBTP - 0.3);
  });
});
