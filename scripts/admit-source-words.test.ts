import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceEntry } from '@/data/types.ts';
import { admissionFailures, looksInflected } from './admit-source-words.ts';
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
  it('admits exactly the six that replace the retired crowns', () => {
    expect(admissions.map((a) => a.word)).toEqual([
      'distance',
      'integral',
      'restrain',
      'festival',
      'patience',
      'sunlight',
    ]);
    for (const { reason } of admissions) {
      expect(reason.length).toBeGreaterThan(8);
    }
  });

  it('takes no word from the Phase 2 cull', () => {
    // The rule this whole file exists to enforce.
    for (const { word } of admissions) {
      expect(cull.has(word)).toBe(false);
      expect(looksInflected(word, new Set(pool.map((e) => e.word)))).toBe(
        false,
      );
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
      expect(entry?.etymology?.length).toBeGreaterThan(20);
    }
  });

  it('ships a reveal bundle for each, at the usual gloss coverage', () => {
    for (const { word } of admissions) {
      const bundle = JSON.parse(
        readFileSync(`public/data/defs/${word}.json`, 'utf8'),
      ) as Record<string, string>;
      // Existing crowns sit around 81 percent of formable words glossed; a
      // thin bundle would mean defs:acquire was never run for the new rack.
      expect(Object.keys(bundle).length).toBeGreaterThan(150);
      expect(bundle[word]).toBeTruthy();
    }
  });

  it('grows the source pool by exactly the admissions', () => {
    expect(pool).toHaveLength(713);
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
