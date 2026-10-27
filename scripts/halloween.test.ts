import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPuzzle, type Puzzle } from '@/engine/index.ts';
import { loadPatchedPools } from './lib/pools.ts';

/**
 * 31 October 2026 stays exactly as it is: skeleton's board, its basket, its
 * reveal and every found-word card on its board. A dictionary release must not
 * touch Halloween, so these hold it to what shipped for the ghost sheet. The
 * Swift app pins the same board in its own terms.
 */
const DATA = join(import.meta.dirname, '..', 'public', 'data');
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

let puzzle: Puzzle;

beforeAll(async () => {
  const { dictionary, commonPool, beyond70Pool, beyond95Pool } =
    await loadPatchedPools();
  puzzle = createPuzzle(
    'skeleton',
    dictionary,
    commonPool,
    beyond70Pool,
    beyond95Pool,
  );
}, 300_000);

describe('31 October 2026, skeleton', () => {
  it('keeps its board of 155 words and its basket of 47', () => {
    const board = [...puzzle.validationWords].sort();
    const basket = [...puzzle.commonWords].sort();
    expect(board).toHaveLength(155);
    expect(sha256(board.join('\n'))).toBe(
      'f4f92b3794e4c70762c60d1b7a832a1cdd4a940b5e19538ff0cf21e76e434085',
    );
    expect(basket).toHaveLength(47);
    expect(sha256(basket.join('\n'))).toBe(
      '53a525cb65b7a093778f12c7d2dd19c07aa805ce527e8adf9f5173ba366d1d15',
    );
  });

  it('keeps its reveal, and every found-word card on its board', () => {
    const entry = (
      JSON.parse(readFileSync(join(DATA, 'source-pool.json'), 'utf8')) as {
        word: string;
      }[]
    ).find((e) => e.word === 'skeleton');
    expect(sha256(JSON.stringify(entry))).toBe(
      'd766a05a5ce24290a13ee2bd086ca6e06afe51449c09f7fbfba9952a33506de4',
    );
    expect(
      sha256(readFileSync(join(DATA, 'defs', 'skeleton.json'), 'utf8')),
    ).toBe('67046a05c42231e136696503e375551122822ac230a613c3866586d51b383eac');
  });
});
