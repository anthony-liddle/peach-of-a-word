import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeTier,
  createPuzzle,
  validateGuess,
  type Puzzle,
} from '@/engine/index.ts';
import { buildSlice } from '@/ui/useGame.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import {
  readPatchText,
  readShippedLists,
  withPatchUndone,
  readCommittedPatch,
} from './shippedLists.ts';

/**
 * Hate salutes, symbols and group names, denied in orchard v1.11.2 (Antoine,
 * 19 November 2026: "They'll find no representation in this game."). Asserted
 * against the bytes a player downloads, the way the slur denylist is.
 *
 * The racks here are made up, so no test names a real day's board.
 */
const merged = readShippedLists();

/** The patch's hate block, read from the note column so it can't pass empty. */
const denied = readPatchText()
  .split('\n')
  .map((line) => line.split('\t'))
  .filter(
    (cols) => cols[1]?.trim() === 'deny' && (cols[3] ?? '').startsWith('hate '),
  )
  .map((cols) => (cols[0] ?? '').trim());

/** Unrelated words that only share the letters. */
const KEPT = ['nazir', 'nazirs', 'nazirite', 'nazim', 'heild', 'klang'];

function puzzleFor(rack: string): Puzzle {
  return createPuzzle(
    rack,
    createListDictionary(merged.enable),
    createListWordSource(merged.common),
    createListWordSource(merged.beyond70),
    createListWordSource(merged.beyond95),
  );
}

describe('hate salutes, symbols and group names', () => {
  it('ships the block: heil, nazi and the Klan in every form', () => {
    for (const w of [
      'heil',
      'heiling',
      'nazi',
      'nazism',
      'denazify',
      'klan',
      'klansman',
    ]) {
      expect(denied, w).toContain(w);
    }
    expect(denied).toHaveLength(49);
  });

  it('ships the sweep that followed, in every form', () => {
    for (const w of [
      'hitler',
      'hitlerism',
      'fuhrer',
      'gestapo',
      'herrenvolk',
      'aryanize',
      'blackshirt',
      'brownshirt',
      'swastika',
      'aryan',
    ]) {
      expect(denied, w).toContain(w);
    }
  });

  it('answers hitler and swastika as if they were not words', () => {
    expect(validateGuess('hitler', puzzleFor('hitlerxy'), new Set()).kind).toBe(
      'not-a-word',
    );
    expect(
      validateGuess('swastika', puzzleFor('swastika'), new Set()).kind,
    ).toBe('not-a-word');
  });

  it('keeps fascist a word, but never in a basket', () => {
    expect(new Set(merged.common).has('fascist')).toBe(false);
    const result = validateGuess('fascist', puzzleFor('fascistz'), new Set());
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') expect(result.rung).not.toBe('set');
  });

  it('answers heil, nazi and klansman as if they were not words', () => {
    const salute = puzzleFor('heilnazi');
    expect(validateGuess('heil', salute, new Set()).kind).toBe('not-a-word');
    expect(validateGuess('nazi', salute, new Set()).kind).toBe('not-a-word');
    const group = puzzleFor('klansman');
    expect(validateGuess('klansman', group, new Set()).kind).toBe('not-a-word');
  });

  it('accepts nazir and klang, which only share the letters', () => {
    expect(validateGuess('nazir', puzzleFor('nazirhel'), new Set()).kind).toBe(
      'valid',
    );
    expect(validateGuess('klang', puzzleFor('klangzip'), new Set()).kind).toBe(
      'valid',
    );
  });

  it('leaves every one out of every list, and keeps the look-alikes', () => {
    const lists = [
      merged.enable,
      merged.common,
      merged.beyond70,
      merged.beyond95,
    ].map((l) => new Set(l));
    for (const w of denied)
      for (const l of lists) expect(l.has(w), w).toBe(false);
    const accepted = new Set(merged.enable);
    for (const w of KEPT) expect(accepted.has(w), w).toBe(true);
  });

  it('finds them with the denial undone, so the absence means something', () => {
    const undone = new Set(
      withPatchUndone(merged, readCommittedPatch()).enable,
    );
    for (const w of ['heil', 'nazi', 'klansman'])
      expect(undone.has(w), w).toBe(true);
  });

  it('ships no card for any of them, in the corpus or a rack', () => {
    const corpus = new Set(
      readFileSync('vendor/lexicon/definitions.tsv', 'utf8')
        .split('\n')
        .map((line) => line.split('\t')[0]),
    );
    const bundled = new Set(
      readdirSync('public/data/defs').flatMap((f) =>
        Object.keys(JSON.parse(readFileSync(`public/data/defs/${f}`, 'utf8'))),
      ),
    );
    for (const w of ['heil', 'heiled', 'heils', 'nazi', 'nazis']) {
      expect(corpus.has(w), w).toBe(false);
      expect(bundled.has(w), w).toBe(false);
    }
  });

  it('drops a saved find of one, and its points, when the day is restored', () => {
    const puzzle = puzzleFor('heilnazi');
    const kept = ['hail', 'nail'].filter((w) => puzzle.validationWords.has(w));
    expect(kept).toHaveLength(2);
    const slice = buildSlice({
      puzzle,
      sourceEntry: undefined,
      dayIndex: 1,
      restoreFound: ['heil', ...kept, 'nazi'],
    });
    expect(slice.found).toEqual(kept);
    expect(slice.totalScore).toBe(computeTier(new Set(kept), puzzle).score);
  });
});
