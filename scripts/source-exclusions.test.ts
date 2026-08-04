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
  it('excludes exactly the 16 pure inflections, no more no fewer', () => {
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
      'subjects',
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

  it('excludes the six hand-flagged register words', () => {
    // Not derived: a judgment call that these would be odd to type into a
    // cute-themed game. Each is substituted in place in the calendar so no
    // date is re-dated, and each stays a valid, scorable find. All six are
    // also demoted out of the common pool, since a retired crown that is still
    // required for completion is the worse half of the problem.
    expect(withReason('register')).toEqual([
      'abortion',
      'atrocity',
      'genocide',
      'oriental',
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

  it('covers the candidates the cache fix newly made eligible', () => {
    // The Phase 2 cull was derived against a 707-word pool, and said so: it
    // "covers today's pool, not words not yet in it". Fixing the cached null
    // etymology made 113 more candidates eligible, so the form_of derivation
    // was re-run over them and these seven came back inflected. Excluding them
    // before anything is admitted is what stops the widened pool from carrying
    // an inflection into a crown.
    for (const word of [
      'defeated',
      'defended',
      'enhanced',
      'filtered',
      'mistaken',
      'modified',
    ]) {
      expect(exclusions.get(word)).toBe('past-tense-dual');
    }
    expect(exclusions.get('subjects')).toBe('pure-inflection');
  });

  it('lands on 51 excluded words total', () => {
    // The 45 derived by the cull, plus the 6 hand-flagged register words.
    expect(exclusions.size).toBe(51);
  });
});
