import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseExclusions } from './lib/exclusions.ts';

const exclusions = parseExclusions(
  readFileSync(
    join(import.meta.dirname, 'data-raw', 'source-exclusions.tsv'),
    'utf8',
  ),
);

function withReason(reason: string): string[] {
  return [...exclusions.entries()]
    .filter(([, r]) => r === reason)
    .map(([w]) => w)
    .sort();
}

describe('source-word exclusion list (the cull rule)', () => {
  it('excludes exactly the 12 pure inflections, no more no fewer', () => {
    // analyses, archives and criteria were struck from the cull to substitute
    // for the three register exclusions. All three are irregular plurals that
    // read as their own word, which is what the cull was there to catch.
    expect(withReason('pure-inflection')).toEqual([
      'adhering',
      'brothers',
      'children',
      'clearest',
      'forgiven',
      'imagines',
      'matrices',
      'portions',
      'reserves',
      'students',
      'troubles',
      'variants',
    ]);
  });

  it('excludes every degree form, dropped regardless of a lemma sense', () => {
    // clearest is labeled pure-inflection (no lemma sense); the rest are degree.
    expect(withReason('degree-form')).toEqual([
      'narrower',
      'slighter',
      'stranger',
      'stronger',
    ]);
    expect(exclusions.has('narrower')).toBe(true);
  });

  it('excludes past-tense dual cases but keeps the rest of the dual set', () => {
    // Bea's rule: drop the past tense and past participle, keep everything else.
    expect(exclusions.get('accepted')).toBe('past-tense-dual');
    expect(exclusions.get('confused')).toBe('past-tense-dual');
    // -ing dual lemmas and inflection-feel -ing forms stay.
    for (const keep of [
      'building',
      'meeting',
      'blessing',
      'dropping',
      'drinking',
    ]) {
      expect(exclusions.has(keep)).toBe(false);
    }
  });

  it('keeps derived lemmas, derived -ed adjectives, and cardinal numbers', () => {
    for (const keep of [
      'computer',
      'employer',
      'darkness',
      'snobbery',
      'teacher', // derived lemmas
      'talented',
      'unwanted', // derived -ed adjectives, not past forms
      'eighteen',
      'fourteen',
      'thousand', // cardinal numbers
    ]) {
      expect(exclusions.has(keep)).toBe(false);
    }
  });

  it('excludes the three hand-flagged register words', () => {
    // Not derived: a judgment call that these would be odd to type into a
    // cute-themed game. Each is substituted in place in the calendar so no
    // date is re-dated, and each stays a valid, scorable find.
    expect(withReason('register')).toEqual([
      'abortion',
      'sexually',
      'violence',
    ]);
  });

  it('lands on 38 excluded words total', () => {
    // 35 derived by the cull, plus the 3 register words, minus nothing: the
    // three re-admissions are balanced by the three register exclusions.
    expect(exclusions.size).toBe(38);
  });
});
