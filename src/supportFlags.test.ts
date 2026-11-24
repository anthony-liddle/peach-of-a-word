import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the support page says about flagging, held to what the game can flag.
 *
 * While the flag is hidden (Antoine, 24 November), the page doesn't send
 * anyone to it: Get in Touch is its line from before the flag, which sends a
 * word that should or shouldn't count to the address. Antoine's line for the
 * flag (22 November, with "should or" from step 3) comes back with the flag.
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

describe('the support page while the flag is hidden', () => {
  it('sends a word that should or should not count to the address, as before the flag', () => {
    expect(text).toContain(
      'Something broken, a word you think should or should not count, or anything else: write to Anthony at anthony@anthonyliddle.dev.',
    );
  });

  // Bea reads this page, and anything Bea can see calls him Anthony
  // (Antoine, 24 November).
  it('calls him Anthony, never Antoine', () => {
    expect(text).not.toMatch(/Antoine/);
  });

  it("doesn't send anyone to a flag the game doesn't show", () => {
    expect(text).not.toMatch(/flag it in the game/i);
    expect(text).not.toMatch(/\bflag/i);
  });
});
