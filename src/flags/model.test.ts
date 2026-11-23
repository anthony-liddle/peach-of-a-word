import { describe, expect, it } from 'vitest';
import { dayIndex } from '@/engine/daily.ts';
import {
  choiceText,
  dayOfIndex,
  groupsFor,
  pickerNote,
  pickerTitle,
  shortForm,
  type FlagReason,
} from './model.ts';

const none = new Set<FlagReason>();
const reasons = (gs: ReturnType<typeof groupsFor>) =>
  gs.map((g) => [g.heading, g.reasons]);

describe("the picker's groups", () => {
  it('offers three groups on a found word: take it out, fix its card, its grade', () => {
    expect(reasons(groupsFor('definition', 'uncommon', none))).toEqual([
      ['Take it out', ['not-a-word', 'offensive']],
      ['Fix its card', ['definition']],
      ['Its grade', ['rarer', 'more-common']],
    ]);
  });

  it('lets a basket word be only rarer, and a Mythic word only more common', () => {
    expect(groupsFor('definition', 'set', none)[2]!.reasons).toEqual(['rarer']);
    expect(groupsFor('definition', 'mythic', none)[2]!.reasons).toEqual([
      'more-common',
    ]);
    expect(groupsFor('no-definition', 'rare', none)[2]!.reasons).toEqual([
      'rarer',
      'more-common',
    ]);
  });

  it('gives the peach no grade, and never calls it not a word', () => {
    expect(reasons(groupsFor('peach', null, none))).toEqual([
      ['Take it out', ['offensive']],
      ['Fix its card', ['definition']],
    ]);
  });

  it('takes out a reason already flagged, and a group left empty', () => {
    const flagged = new Set<FlagReason>(['offensive', 'definition']);
    expect(reasons(groupsFor('definition', 'set', flagged))).toEqual([
      ['Take it out', ['not-a-word']],
      ['Its grade', ['rarer']],
    ]);
  });

  it('takes the whole grade group out once either grade reason is flagged', () => {
    for (const grade of ['rarer', 'more-common'] as const) {
      const headings = groupsFor('definition', 'rare', new Set([grade])).map(
        (g) => g.heading,
      );
      expect(headings).toEqual(['Take it out', 'Fix its card']);
    }
    // Taken back, the group comes back.
    expect(groupsFor('definition', 'rare', none)).toHaveLength(3);
  });
});

describe("the picker's words", () => {
  it('names the grade in the theme its words come from', () => {
    expect(choiceText('rarer', 'definition', 'set', 'cute')).toBe(
      "It's rarer than a basket word",
    );
    expect(choiceText('rarer', 'definition', 'set', 'letterpress')).toBe(
      "It's rarer than a set word",
    );
    expect(choiceText('rarer', 'definition', 'uncommon', 'cute')).toBe(
      "It's rarer than Uncommon",
    );
    expect(choiceText('more-common', 'definition', 'rare', 'cute')).toBe(
      "It's more common than Rare",
    );
    expect(choiceText('more-common', 'definition', 'mythic', 'cute')).toBe(
      "It's more common than Mythic",
    );
  });

  it('says each other choice as the wording pass has it', () => {
    expect(choiceText('not-a-word', 'definition', 'set', 'cute')).toBe(
      "It's not a real word",
    );
    expect(choiceText('offensive', 'peach', null, 'cute')).toBe(
      "It's offensive",
    );
    expect(choiceText('definition', 'definition', 'set', 'cute')).toBe(
      'The definition is wrong',
    );
    expect(choiceText('definition', 'no-definition', 'set', 'cute')).toBe(
      'It needs a definition',
    );
    expect(choiceText('definition', 'peach', null, 'cute')).toBe(
      'The definition or origin is wrong',
    );
  });

  it('has a short form for each reason, for a flag already made', () => {
    const forms = (
      [
        'not-a-word',
        'offensive',
        'definition',
        'should-count',
        'rarer',
        'more-common',
      ] as const
    ).map(shortForm);
    expect(forms).toEqual([
      'not a real word',
      'offensive',
      'its definition',
      'suggested',
      'rarer',
      'more common',
    ]);
  });

  it("titles the picker with the word, and says what goes in the picker's short line", () => {
    expect(pickerTitle('board')).toBe('Flag “board”');
    expect(pickerNote('daily')).toBe(
      'Sends the word, its day and your reason. Nothing about you.',
    );
    expect(pickerNote('endless')).toBe(
      'Sends the word, its board and your reason. Nothing about you.',
    );
  });
});

describe("a board's day, as the server reads it", () => {
  const epoch = { year: 2026, month: 6, day: 23 };

  it('gives back the date whose index it is, across the year', () => {
    // A thousand days crosses two clock changes each way.
    for (let i = 0; i < 1000; i++) {
      const [y, m, d] = dayOfIndex(i, epoch).split('-').map(Number) as [
        number,
        number,
        number,
      ];
      expect(dayIndex(new Date(y, m - 1, d), epoch)).toBe(i);
    }
  });

  it('writes it as the server takes it, YYYY-MM-DD', () => {
    expect(dayOfIndex(0, epoch)).toBe('2026-06-23');
    expect(dayOfIndex(9, epoch)).toBe('2026-07-02');
  });
});
