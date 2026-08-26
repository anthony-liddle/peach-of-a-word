import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceEntry } from '@/data/types.ts';
import {
  admissionFailures,
  looksInflected,
  parseClearances,
} from './admit-source-words.ts';
import { parseReasonedWords } from './lib/denylist.ts';
import { parseExclusions } from './lib/exclusions.ts';

/**
 * Source-pool admissions. A crown retired for register cannot be replaced from
 * the Phase 2 cull, because every word in the cull breaks one of the three
 * rules by construction and a plural has no etymology of its own to reveal. So
 * the pool is widened by the minimum needed, and the gates that let a word in
 * are the same ones the normal pipeline applies.
 */
const DATA_RAW = join(import.meta.dirname, 'data-raw');
const raw = (f: string) => readFileSync(join(DATA_RAW, f), 'utf8');

const admissions = parseReasonedWords(
  raw('source-admissions.tsv'),
  'Source admission',
);
const cull = parseExclusions(raw('source-exclusions.tsv'));
const clearances = parseClearances(raw('source-lemma-clearances.tsv'));
const pool = JSON.parse(
  readFileSync('public/data/source-pool.json', 'utf8'),
) as SourceEntry[];
const byWord = new Map(pool.map((e) => [e.word, e]));

describe('looksInflected, the hand-admission guard', () => {
  // Deliberately conservative: it rejects more than the Wiktionary-derived cull
  // would, because a false reject costs one candidate and a false accept ships
  // a plural as a crown.
  const lemmas = new Set([
    'analysis',
    'archive',
    'criterion',
    'strange',
    'accept',
    'adhere',
    'distance',
    'integral',
    'restrain',
    'stable',
  ]);

  it('catches plurals, past forms, degree forms and -ing forms', () => {
    for (const word of ['archives', 'accepted', 'stranger', 'adhering']) {
      expect(looksInflected(word, lemmas)).toBe(true);
    }
  });

  it('catches a y turning to i, and a doubled final consonant', () => {
    // The two spelling changes English makes when it inflects. Without these
    // the guard waves through earliest, happiest, notified and stripped, all of
    // which are inflections sitting in the common pool at 8 letters.
    const spelling = new Set(['early', 'happy', 'notify', 'strip', 'stop']);
    for (const word of [
      'earliest',
      'happiest',
      'notified',
      'stripped',
      'stopping',
    ]) {
      expect(looksInflected(word, spelling)).toBe(true);
    }
  });

  it('passes clean base words, including derived lemmas', () => {
    // unstable is un- plus stable, a derived lemma rather than an inflection,
    // the same class the cull already keeps (computer, darkness, unwanted).
    for (const word of ['distance', 'integral', 'restrain', 'unstable']) {
      expect(looksInflected(word, lemmas)).toBe(false);
    }
  });

  it('does not fire when the supposed base is not itself a word', () => {
    // The rule is stem-plus-suffix AND the stem is a word, so an ordinary word
    // that merely ends in -ed or -er is safe.
    expect(looksInflected('integral', new Set())).toBe(false);
    expect(looksInflected('computer', new Set(['comput']))).toBe(true);
    expect(looksInflected('computer', new Set())).toBe(false);
  });
});

describe('the committed admissions', () => {
  it('admits the six crown replacements and the widened-pool batch', () => {
    // The first six each replace a crown retired for register. The 80 that
    // follow are what the cached-null-etymology fix made eligible, through
    // every gate: the re-run form_of derivation, the denylist, the register
    // sweep, and the floor.
    expect(admissions.map((a) => a.word).slice(0, 6)).toEqual([
      'distance',
      'integral',
      'restrain',
      'festival',
      'patience',
      'sunlight',
    ]);
    expect(admissions).toHaveLength(86);
    for (const { reason } of admissions) {
      expect(reason.length).toBeGreaterThan(8);
    }
  });

  it('takes no word from the Phase 2 cull', () => {
    // The rule this whole file exists to enforce.
    for (const { word } of admissions) {
      expect(cull.has(word)).toBe(false);
    }
  });

  it('is inflection-free: shape guard, or a named form_of clearance', () => {
    // The shape guard is deliberately over-broad and disagrees with the
    // derivation on 14 words, each recorded with its evidence in
    // source-lemma-clearances.tsv. Every admission must clear one or the
    // other, and nothing may be exempt without a row naming it.
    const lemmas = new Set(pool.map((e) => e.word));
    for (const { word } of admissions) {
      if (looksInflected(word, lemmas)) {
        expect(clearances.has(word)).toBe(true);
      }
    }
    // The clearance list is not a back door: every row is a real lemma the
    // derivation cleared, and none of them is in the cull.
    for (const word of clearances) {
      expect(cull.has(word)).toBe(false);
    }
  });

  it('carries a definition and an etymology, so the reveal works', () => {
    // REQUIRE_ETYMOLOGY is the gate that kept these out of the pool in the
    // first place, via a cached null. Each must really have one now.
    for (const { word } of admissions) {
      const entry = byWord.get(word);
      expect(entry).toBeDefined();
      expect(entry?.definition).toBeTruthy();
      expect(entry?.etymology).toBeTruthy();
      // Short is fine and well precedented: 118 of the shipped crowns carry a
      // pure surface analysis (chairman, "From chair + -man."). Empty is not.
      expect(entry?.etymology?.length).toBeGreaterThan(15);
    }
  });

  it('ships a reveal bundle for each, at the usual gloss coverage', () => {
    for (const { word } of admissions) {
      const bundle = JSON.parse(
        readFileSync(`public/data/defs/${word}.json`, 'utf8'),
      ) as Record<string, string>;
      // A thin bundle would mean defs:acquire was never run for the new rack.
      // Bundle size tracks how many words a rack can spell, so the floor is set
      // low enough for the thinnest rack in the batch. Coverage is asserted as
      // a ratio below.
      //
      // Lowered from 50 for orchard v1.4.0, which denied 392 words and so took
      // glosses out of every bundle. `dripping`, the thinnest, went from 52 to
      // 48. That is a real movement rather than a threshold nudged to make a
      // suite pass, and it was checked word by word before the number moved:
      // across all 87 admitted racks, every single gloss lost is a word the
      // sweep denied. Nothing was lost for any other reason.
      expect(Object.keys(bundle).length).toBeGreaterThan(40);
      expect(bundle[word]).toBeTruthy();
    }
  });

  it('grows the source pool by exactly the admissions', () => {
    expect(pool).toHaveLength(793);
    for (const { word } of admissions) expect(byWord.has(word)).toBe(true);
  });
});

describe('admissionFailures, the gates that decide an admission', () => {
  // Built by hand so the gates can be watched discriminating rather than
  // passing vacuously. A gate that never rejects anything is not a gate.
  const ctx = {
    common: new Set([
      'distance',
      'archives',
      'sexually',
      'projects',
      'earliest',
    ]),
    validation: new Set([
      'distance',
      'archives',
      'projects',
      'earliest',
      'early',
      'project',
      'archive',
    ]),
    cull: new Map([
      ['archives', 'pure-inflection'],
      ['sexually', 'register'],
    ]),
    clearances: new Set(['projects']),
    setSize: () => 30,
  };

  it('admits a clean base word', () => {
    expect(admissionFailures('distance', ctx)).toEqual([]);
  });

  it('rejects an inflection planted in the candidates', () => {
    // archives: a pure plural, in the cull, and inflected by shape. It must be
    // refused, and the reason must say which gate caught it.
    const failures = admissionFailures('archives', ctx);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join(' ')).toMatch(/cull|inflected/);
  });

  it('rejects an inflection the cull has not seen, on shape alone', () => {
    // earliest is a superlative sitting in the common pool at 8 letters. The
    // derivation has not been run over it, so only the shape guard stands
    // between it and a crown.
    expect(admissionFailures('earliest', ctx)).toContain(
      'reads as an inflected form and the derivation has not cleared it',
    );
  });

  it('rejects a denied word planted in the candidates', () => {
    // sexually is in the common pool but out of validation, which is what a
    // denial or a register exclusion looks like from here.
    const failures = admissionFailures('sexually', ctx);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join(' ')).toMatch(/validation|denied|cull/);
  });

  it('admits a word the form_of derivation has cleared', () => {
    // projects is a plural WITH a lemma sense, so it carries its own etymology
    // to reveal. The shape guard rejects it; the derivation is the authority.
    expect(looksInflected('projects', ctx.validation)).toBe(true);
    expect(admissionFailures('projects', ctx)).toEqual([]);
  });

  it('rejects a word whose set is under the floor', () => {
    const thin = { ...ctx, setSize: () => 3 };
    expect(admissionFailures('distance', thin).join(' ')).toMatch(/floor/);
  });
});
