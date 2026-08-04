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

  it('excludes the three register words found in the widened pool', () => {
    // Flagged from the 113 the cache fix made eligible, and never crowns, so
    // unlike the six below they are not demoted from the common pool: they
    // stay ordinary findable, scorable words that simply never headline.
    //
    // shooting is the one the automated screen got wrong. Wiktionary's first
    // sense is the adjective "moving or growing quickly", but nobody reads
    // SHOOTING that way first. The crown test is not "is this word
    // acceptable", it is "should the game throw a party for it", which is a
    // lower bar to fail.
    for (const word of ['punching', 'shooting', 'suicidal']) {
      expect(exclusions.get(word)).toBe('register');
    }
  });

  it('keeps ordinary vocabulary from law, medicine and plain description', () => {
    // The line stops here. These read as sensitive to a keyword screen and are
    // not: excluding them would start sanding off English for no gain. feminist
    // sits on a political axis rather than an offensive one, and excluding it
    // would itself be a statement.
    for (const keep of [
      'imprison',
      'sufferer',
      'distress',
      'paranoia',
      'suppress',
      'feminist',
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
      'punching',
      'sexually',
      'shooting',
      'suicidal',
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

  it('lands on 54 excluded words total', () => {
    // The 45 derived by the cull, plus 9 hand-flagged register words: the
    // original 6 retired crowns and 3 found in the widened candidate set.
    expect(exclusions.size).toBe(54);
  });
});
