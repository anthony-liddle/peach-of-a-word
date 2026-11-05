import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isProse, literals } from './testing/prose.ts';

/**
 * No player reads an em dash or one of the words `Voice/AI Tells.md` bans.
 *
 * Antoine's rewrite of every string, The Game's Own Words, took the machine
 * tells out by hand. This keeps them out, in every theme and on every page:
 * every string in src, `themeCopy.ts` included, the pages under public/ and
 * index.html, and the manifest a phone shows when the game is installed.
 *
 * The words are the vault's hard bans: "quiet", outright, and the tell-words
 * list. Matched from the start of a word, so "quiet" catches "quietly" too.
 * `AI Tells.md` excuses a few when they're literal ("unlock", say, of a real
 * lock). Nothing in a word game is, so here they are all banned, and a literal
 * one that turns up is a sentence to rewrite rather than an exception.
 *
 * The iOS app holds its strings to the same list, in `PlayerWordsTests`.
 */
const BANNED = [
  'quiet',
  'delve',
  'foster',
  'elevate',
  'unlock',
  'tapestry',
  'multifaceted',
  'nuanced',
  'game-changer',
  'game changer',
  'revolutioni',
  'unprecedented',
  'empower',
  'landscape',
  'navigat',
  'crucial',
  'realm',
  'pivotal',
  'robust',
  'seamless',
  'cutting-edge',
  'cutting edge',
];

const EM_DASH = '—';

/** What's wrong with one string, or nothing. */
function problems(text: string): string[] {
  const found: string[] = [];
  if (text.includes(EM_DASH)) found.push('an em dash');
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}`, 'i').test(text)) found.push(`"${word}"`);
  }
  return found;
}

type Found = { where: string; text: string };

function offenders(strings: Found[]): string[] {
  return strings.flatMap(({ where, text }) =>
    problems(text).map((p) => `${where}: ${p} in "${text}"`),
  );
}

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * Every literal in src that a player could be shown. An em dash is never part
 * of an identifier, so every literal is held to that; the banned words only to
 * the strings that are prose, for the reason `isProse` gives.
 */
const sourceStrings: Found[] = readdirSync(resolve(root, 'src'), {
  recursive: true,
  encoding: 'utf8',
})
  .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
  .filter((f) => !f.startsWith('testing/'))
  .flatMap((f) =>
    literals(read(`src/${f}`), f).map((text) => ({ where: `src/${f}`, text })),
  );

/**
 * What a page shows: its title, its text, and the words in its attributes a
 * browser or a screen reader reads out. Scripts and styles are code.
 */
function pageStrings(path: string): Found[] {
  const doc = new DOMParser().parseFromString(read(path), 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  const attributes = [
    ...doc.querySelectorAll('[content], [alt], [aria-label], [title]'),
  ].flatMap((el) =>
    ['content', 'alt', 'aria-label', 'title']
      .map((name) => el.getAttribute(name))
      .filter((v): v is string => !!v),
  );
  return [doc.title, doc.body.textContent ?? '', ...attributes].map((text) => ({
    where: path,
    text: text.replace(/\s+/g, ' ').trim(),
  }));
}

const PAGES = [
  'index.html',
  ...readdirSync(resolve(root, 'public'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => `public/${name}`),
];

const manifestStrings: Found[] = Object.values(
  JSON.parse(read('public/site.webmanifest')) as Record<string, unknown>,
)
  .filter((v): v is string => typeof v === 'string')
  .map((text) => ({ where: 'public/site.webmanifest', text }));

describe("the player's words", () => {
  test('no string in src has an em dash, and no prose a banned word', () => {
    const held = sourceStrings.filter(
      ({ text }) => text.includes(EM_DASH) || isProse(text),
    );
    expect(offenders(held)).toEqual([]);
  });

  test.each(PAGES)('%s has no em dash or banned word', (path) => {
    expect(offenders(pageStrings(path))).toEqual([]);
  });

  test('the manifest has no em dash or banned word', () => {
    expect(offenders(manifestStrings)).toEqual([]);
  });

  /**
   * Guards the tests above against passing on nothing, which is how a
   * source-scanning test fails without anyone noticing.
   */
  test('read the real strings, so an empty result means something', () => {
    const files = new Set(sourceStrings.map((s) => s.where));
    expect(files).toContain('src/ui/themeCopy.ts');
    expect(files).toContain('src/App.tsx');
    expect(sourceStrings.length).toBeGreaterThan(500);
    expect(PAGES).toEqual(
      expect.arrayContaining([
        'index.html',
        'public/privacy.html',
        'public/support.html',
        'public/404.html',
      ]),
    );
    // Text a player reads on the privacy page, so the page scan reaches one.
    expect(
      pageStrings('public/privacy.html').some(({ text }) =>
        text.includes('Peach of a Word has no accounts'),
      ),
    ).toBe(true);
    expect(manifestStrings.length).toBeGreaterThan(3);
  });

  test('the check catches each kind of tell', () => {
    expect(problems(`A daily word game ${EM_DASH} for Bea`)).toEqual([
      'an em dash',
    ]);
    expect(problems('Quietly, the peach grows.')).toEqual(['"quiet"']);
    expect(problems('Navigating the basket')).toEqual(['"navigat"']);
    // From the start of a word only, so a word that merely contains one passes.
    expect(problems('Ripening, then Sweet')).toEqual([]);
  });
});
