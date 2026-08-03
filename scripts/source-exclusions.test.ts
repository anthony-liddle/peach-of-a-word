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
  it('excludes exactly the 15 pure inflections, no more no fewer', () => {
    expect(withReason('pure-inflection')).toEqual([
      'adhering',
      'analyses',
      'archives',
      'brothers',
      'children',
      'clearest',
      'criteria',
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

  it('never gives up a word to fill a crown slot', () => {
    // Every word here violates one of the three rules by construction, so no
    // re-admission can be clean: a plural has no etymology of its own to
    // reveal, which is the whole reason the cull exists. A retired crown is
    // replaced by widening the source pool, not by striking a line here.
    for (const word of ['analyses', 'archives', 'criteria', 'stranger']) {
      expect(exclusions.has(word)).toBe(true);
    }
  });

  it('lands on 41 excluded words total', () => {
    // The 38 derived by the cull, plus the 3 hand-flagged register words.
    expect(exclusions.size).toBe(41);
  });
});
