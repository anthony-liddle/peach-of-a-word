import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the privacy page says about a flag, held to what the flag is.
 *
 * The server keeps the fields in `server/flag/handler.ts` for 60 days; the
 * device keeps them under `e8-flags`. If either changes, this page has to
 * change with it, so these are pinned here. The wording is Antoine's (the
 * wording pass, 22 November; his lines on 23 November).
 */

const html = readFileSync(
  resolve(process.cwd(), 'public/privacy.html'),
  'utf8',
);
/** The page's words, without its markup or its line breaks. */
const text = html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&rsquo;/g, "'")
  .replace(/\s+/g, ' ');

const section = (heading: string) => {
  const at = text.indexOf(heading);
  expect(at, `no section "${heading}"`).toBeGreaterThan(-1);
  return text.slice(at, at + 2000);
};

describe('the privacy page on flagging a word', () => {
  it('has a section for it, after the website and before what neither collects', () => {
    const flag = text.indexOf('Flagging a Word');
    expect(flag).toBeGreaterThan(text.indexOf('The Website Counts Visits'));
    expect(flag).toBeLessThan(text.indexOf('What Neither One Collects'));
  });

  it('names every field a flag carries, and that nothing about the player goes', () => {
    const s = section('Flagging a Word');
    for (const part of [
      'the word',
      "its board's day",
      "from the website's Endless, the board's long word",
      'your reason',
      'whether it came from the app or the website and its version',
      'a random ID made for that flag alone',
      'The server adds the day it arrived',
      'Nothing about you goes with it',
    ]) {
      expect(s, part).toContain(part);
    }
  });

  it('keeps them 60 days, and says how to take one back', () => {
    const s = section('Flagging a Word');
    expect(s).toContain('Flags are kept for 60 days');
    expect(s).toContain(
      'You can take one back from Your flags, in Settings, for those 60 days',
    );
  });

  it('names who stores flags, and where', () => {
    const s = section('Flagging a Word');
    expect(s).toContain(
      'Upstash, a database service, stores flags for the game',
    );
    expect(s).toContain('United States');
  });

  it('says Vercel sees the network address of every request, and never suggests it acts only for the game', () => {
    expect(text).toContain(
      'it sees the network address of every request, a flag included',
    );
    expect(text).toContain("The game's own code never stores your address");
    expect(text).not.toMatch(/processes the requests needed to serve pages/);
    expect(text).not.toMatch(/processor|on our behalf/i);
  });

  it('says in its description that it collects the words you flag', () => {
    expect(html).toContain(
      'content="What Peach of a Word collects: the words you flag, with nothing about you, and aggregate page views on the website."',
    );
  });
});
