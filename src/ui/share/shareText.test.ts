import { describe, expect, test } from 'vitest';
import {
  buildShareText,
  type DailyShareResult,
  type EndlessShareResult,
} from './shareText.ts';

/**
 * A representative daily result, the worked example from the spec. Jun 18 is
 * month index 5; the date is built from local components so the short form is
 * stable.
 */
function exampleResult(
  overrides: Partial<DailyShareResult> = {},
): DailyShareResult {
  return {
    mode: 'daily',
    title: 'Peach of a Word',
    date: new Date(2026, 5, 18),
    tierLabel: 'Peachy Keen Supreme',
    setFound: 37,
    setTotal: 37,
    uncommon: 29,
    rare: 4,
    mythic: 2,
    setPoints: 113,
    offPagePoints: 113,
    totalPoints: 226,
    sourceWord: 'PEACHING',
    foundWords: ['PEACHING', 'PEACH', 'CHEAP', 'PINCH'],
    ...overrides,
  };
}

/**
 * A representative endless result. No date (it labels itself Endless), and it
 * may carry the found source word as the headline flex.
 */
function endlessExample(
  overrides: Partial<EndlessShareResult> = {},
): EndlessShareResult {
  return {
    mode: 'endless',
    title: 'Peach of a Word',
    tierLabel: 'Peachy Keen Supreme',
    showSourceWord: true,
    setFound: 37,
    setTotal: 37,
    uncommon: 29,
    rare: 4,
    mythic: 2,
    setPoints: 113,
    offPagePoints: 113,
    totalPoints: 226,
    sourceWord: 'PEACHING',
    foundWords: ['PEACHING', 'PEACH', 'CHEAP', 'PINCH'],
    ...overrides,
  };
}

/**
 * The share body, with the chrome removed. The name (line 1) and the tier
 * headline (line 2) are chrome: they can legitimately share letters with a found
 * word (the tier "The Complete Works" contains "Works") without that being a
 * leak. Stripping them by value leaves only the lines that must never carry a
 * word, so the spoiler assertion scopes to the real risk.
 */
function shareBody(out: string, result: DailyShareResult): string {
  return out
    .toUpperCase()
    .replace(result.title.toUpperCase(), '')
    .replace(result.tierLabel.toUpperCase(), '');
}

describe('buildShareText', () => {
  test('produces the exact block for the worked example', () => {
    const expected = [
      '🍑 Peach of a Word · Jun 18',
      'Peachy Keen Supreme · 37 of 37 words',
      '🟥🟥🟥🟥🟥🟪🟪🟪🟪🟪',
      '✦ 29 Uncommon · 4 Rare · 2 Mythic',
      '226 pts',
    ].join('\n');

    expect(buildShareText(exampleResult())).toBe(expected);
  });

  test('reads the title from the result, never a hardcoded name', () => {
    const out = buildShareText(exampleResult({ title: 'Renamed Game' }));
    expect(out.startsWith('🍑 Renamed Game · ')).toBe(true);
    expect(out).not.toContain('Peach of a Word');
  });

  test('leads the title line with the peach mark', () => {
    // The peach is the name's mark and the share signature; it rides the title
    // line for every board, never the tier headline or the body.
    const out = buildShareText(exampleResult({ title: 'Anything' }));
    expect(out.split('\n')[0]).toBe('🍑 Anything · Jun 18');
  });

  describe('the tier headline', () => {
    test('leads with the earned tier on the second line, not the set', () => {
      const out = buildShareText(
        exampleResult({ tierLabel: 'The Complete Works' }),
      );
      expect(out.split('\n')[1]).toBe('The Complete Works · 37 of 37 words');
    });

    test('never prints the retired Set X/Y line', () => {
      expect(buildShareText(exampleResult())).not.toMatch(/Set \d+\/\d+/);
    });

    test('carries the completion count, so the points have something to measure against', () => {
      const out = buildShareText(exampleResult());
      expect(out.split('\n')[1]).toBe('Peachy Keen Supreme · 37 of 37 words');
    });

    test('reads correctly mid-climb, where the count is arguably more use', () => {
      const out = buildShareText(
        exampleResult({ tierLabel: 'Blossom', setFound: 12, setTotal: 21 }),
      );
      expect(out.split('\n')[1]).toBe('Blossom · 12 of 21 words');
    });

    test('carries the count on an untouched board too', () => {
      const out = buildShareText(
        exampleResult({ tierLabel: 'First Sprout', setFound: 0, setTotal: 21 }),
      );
      expect(out.split('\n')[1]).toBe('First Sprout · 0 of 21 words');
    });

    test('keeps the tier line short enough for a text message', () => {
      // The longest crown either theme can print, against the largest set a rack
      // carries. A tier line that wraps in a message undoes the point of adding
      // the count, so this is a real bound, not a decorative one.
      const out = buildShareText(
        exampleResult({
          tierLabel: 'Peachy Keen Supreme',
          setFound: 100,
          setTotal: 100,
        }),
      );
      const tierLine = out.split('\n')[1]!;
      expect(tierLine).toBe('Peachy Keen Supreme · 100 of 100 words');
      expect(tierLine.length).toBeLessThanOrEqual(40);
    });
  });

  describe('the rarity ladder keeps its open end', () => {
    test('counts the rungs with no denominator, even beside a counted set', () => {
      const out = buildShareText(exampleResult());
      const rarity = out.split('\n').find((l) => l.startsWith('✦'))!;

      // The set count is the one honest denominator; the ladder gets none, so
      // the share never advertises how many obscure words a rack holds.
      expect(rarity).toBe('✦ 29 Uncommon · 4 Rare · 2 Mythic');
      expect(rarity).not.toMatch(/\bof\b/);
      expect(rarity).not.toMatch(/\//);
    });
  });

  describe('spoiler safety', () => {
    test('never leaks the source word or any found word', () => {
      const sourceWord = 'PEACHING';
      const foundWords = [
        'PEACHING',
        'PEACH',
        'CHEAP',
        'PINCH',
        'NICHE',
        'CHAIN',
      ];
      const result = exampleResult({ sourceWord, foundWords });
      const body = shareBody(buildShareText(result), result);

      expect(body).not.toContain(sourceWord);
      for (const word of foundWords) {
        expect(body).not.toContain(word);
      }
    });

    test('treats the title and tier line as chrome, not leaked words', () => {
      // A found word that also spells part of the chrome: the crown "The
      // Complete Works" carries "Works", and the name carries "Peach". Neither
      // is a leak, and the body still holds no word.
      const result = exampleResult({
        title: 'Peach of a Word',
        tierLabel: 'The Complete Works',
        sourceWord: 'WORKS',
        foundWords: ['WORKS', 'PEACH'],
      });
      const out = buildShareText(result).toUpperCase();
      // The chrome legitimately contains the words...
      expect(out).toContain('WORKS');
      expect(out).toContain('PEACH');
      // ...but the body, with the chrome stripped, leaks nothing.
      const body = shareBody(out, result);
      expect(body).not.toContain('WORKS');
      expect(body).not.toContain('PEACH');
    });

    test('the daily identifier line never carries the source word', () => {
      // The daily is reproducible, so the answer must stay hidden. The identifier
      // line is the name and the date, never the source word, whatever the found
      // list holds. This is the protection endless is allowed to relax and daily
      // is not.
      const out = buildShareText(
        exampleResult({ sourceWord: 'PEACHING', foundWords: ['PEACHING'] }),
      ).toUpperCase();
      expect(out.split('\n')[0]).toBe('🍑 PEACH OF A WORD · JUN 18');
      expect(out.split('\n')[0]).not.toContain('PEACHING');
    });
  });

  describe('the endless share', () => {
    /**
     * The endless body: everything after the identifier line, stripped by
     * position, not by value. Endless deliberately allows the source word in the
     * identifier, so a value strip of the source word would blind this check to
     * the very leak it must catch (the source word slipping into the bar or the
     * counts). Dropping line 1 whole, then the tier line by value, leaves the
     * lines that must stay abstract.
     */
    function endlessBody(out: string, result: EndlessShareResult): string {
      const withoutIdentifier = out.split('\n').slice(1).join('\n');
      return withoutIdentifier
        .toUpperCase()
        .replace(result.tierLabel.toUpperCase(), '');
    }

    test('labels itself Endless on the identifier line, never a date', () => {
      const out = buildShareText(endlessExample({ showSourceWord: false }));
      const first = out.split('\n')[0];
      expect(first).toContain('Endless');
      expect(first).not.toMatch(/Jun|Jul|\d{1,2}/);
    });

    test('leads with the name and Endless', () => {
      const out = buildShareText(
        endlessExample({ title: 'Peach of a Word', showSourceWord: false }),
      );
      expect(out.split('\n')[0]).toBe('🍑 Peach of a Word · Endless');
    });

    test('includes the found source word as the headline flex', () => {
      const out = buildShareText(
        endlessExample({ sourceWord: 'spaniel', showSourceWord: true }),
      );
      // The source word rides the identifier line, uppercase as a flex.
      expect(out.split('\n')[0]).toBe('🍑 Peach of a Word · Endless · SPANIEL');
    });

    test('omits the source word until the player has found it', () => {
      const out = buildShareText(
        endlessExample({ sourceWord: 'spaniel', showSourceWord: false }),
      );
      expect(out.split('\n')[0]).toBe('🍑 Peach of a Word · Endless');
      expect(out.toUpperCase()).not.toContain('SPANIEL');
    });

    test('leaks no found word into the body beyond the source in the identifier', () => {
      const sourceWord = 'peaching';
      const foundWords = ['peaching', 'peach', 'cheap', 'pinch', 'niche'];
      const result = endlessExample({
        sourceWord,
        foundWords,
        showSourceWord: true,
      });
      const body = endlessBody(buildShareText(result), result);
      // The source word is allowed in the identifier, never in the body.
      expect(body).not.toContain(sourceWord.toUpperCase());
      for (const word of foundWords) {
        expect(body).not.toContain(word.toUpperCase());
      }
    });

    test('carries the completion count on the same tier line the daily uses', () => {
      // Endless has its own identifier line, but the tier line is shared, so the
      // count reaches both without a second format to keep in step.
      const out = buildShareText(
        endlessExample({ tierLabel: 'Ripening', setFound: 9, setTotal: 18 }),
      );
      expect(out.split('\n')[1]).toBe('Ripening · 9 of 18 words');
    });
  });

  describe('the score row', () => {
    function scoreRow(result: DailyShareResult): string {
      return buildShareText(result).split('\n')[2]!;
    }

    test('is always exactly 10 squares', () => {
      const row = scoreRow(
        exampleResult({ setPoints: 200, offPagePoints: 26 }),
      );
      expect([...row]).toHaveLength(10);
    });

    test('splits the squares by the point ratio', () => {
      // 70 set, 30 off-page rounds to 7 red and 3 purple.
      const row = scoreRow(
        exampleResult({ setPoints: 70, offPagePoints: 30, totalPoints: 100 }),
      );
      expect(row).toBe('🟥🟥🟥🟥🟥🟥🟥🟪🟪🟪');
    });

    test('a single off-page point still shows at least one purple square', () => {
      // 225 set, 1 off-page would round to zero purple; the haul must show.
      const row = scoreRow(
        exampleResult({ setPoints: 225, offPagePoints: 1, totalPoints: 226 }),
      );
      expect([...row]).toHaveLength(10);
      expect(row).toContain('🟪');
      expect((row.match(/🟪/gu) ?? []).length).toBe(1);
    });

    test('a single set point still shows at least one red square', () => {
      const row = scoreRow(
        exampleResult({ setPoints: 1, offPagePoints: 225, totalPoints: 226 }),
      );
      expect([...row]).toHaveLength(10);
      expect(row).toContain('🟥');
      expect((row.match(/🟥/gu) ?? []).length).toBe(1);
    });

    test('a puzzle with no off-page finds is all red', () => {
      const row = scoreRow(
        exampleResult({
          uncommon: 0,
          rare: 0,
          mythic: 0,
          setPoints: 80,
          offPagePoints: 0,
          totalPoints: 80,
        }),
      );
      expect(row).toBe('🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥');
    });
  });

  describe('the rarity line', () => {
    test('omits any rung that is zero', () => {
      const out = buildShareText(
        exampleResult({ uncommon: 5, rare: 0, mythic: 1 }),
      );
      expect(out).toContain('✦ 5 Uncommon · 1 Mythic');
      expect(out).not.toContain('Rare');
    });

    test('disappears entirely when there are no off-page finds', () => {
      const out = buildShareText(
        exampleResult({
          uncommon: 0,
          rare: 0,
          mythic: 0,
          setPoints: 80,
          offPagePoints: 0,
          totalPoints: 80,
        }),
      );
      expect(out).not.toContain('✦');
      expect(out).not.toContain('Uncommon');
      // Four lines, not five: title, set, score row, points.
      expect(out.split('\n')).toHaveLength(4);
    });
  });

  test('reports the total points', () => {
    expect(buildShareText(exampleResult({ totalPoints: 226 }))).toContain(
      '226 pts',
    );
  });
});
