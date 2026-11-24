import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the support page says about flagging, held to what the game can flag.
 * A word that should count is the refused word's flag (step 3), and one that
 * shouldn't is the card's. The wording is Antoine's (22 November), shipped in
 * step 2 without "should or" until the refused word's flag existed.
 */

const html = readFileSync(
  resolve(process.cwd(), 'public/support.html'),
  'utf8',
);
/** The page's words, without its markup or its line breaks. */
const text = html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&rsquo;/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/ ([.,])/g, '$1');

describe('the support page on flagging a word', () => {
  it('says a word that should or shouldn’t count can be flagged in the game', () => {
    expect(text).toContain(
      "A word that should or shouldn't count, or a definition that's wrong: flag it in the game, and it reaches Antoine with nothing about you. Something broken, or anything else: write to Antoine at anthony@anthonyliddle.dev.",
    );
  });
});
