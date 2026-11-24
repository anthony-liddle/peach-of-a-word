import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the privacy page says about a flag, held to what the flag is.
 *
 * The server keeps the fields in `src/flags/wire.ts` for 60 days; the
 * device keeps them under `e8-flags`. If either changes, this page has to
 * change with it, so these are pinned here. The wording is Antoine's (the
 * wording pass, 22 November; his lines on 23 November, and his rewording of
 * the step 2 lines the same day).
 */

const html = readFileSync(
  resolve(process.cwd(), 'public/privacy.html'),
  'utf8',
);
/**
 * The page's words, without its markup or its line breaks, and with no space
 * left before a full stop or comma that follows a link or a key.
 */
const text = html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&rsquo;/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/ ([.,])/g, '$1');

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
      'whether it came from the app or the website, which version sent it,',
      'a random ID made for that flag alone',
      'The server adds the day it arrived',
      'The flag itself carries nothing about you',
    ]) {
      expect(s, part).toContain(part);
    }
  });

  it('says a flag beside a refused word suggests it, right after what the card flag is for', () => {
    // Step 3 builds that flag (Antoine's comma version, 23 November).
    expect(section('Flagging a Word')).toContain(
      "Each word's card has a flag. Use it to say a word isn't real, is offensive, has a wrong or missing definition, or is rarer or more common than the game says. When the game refuses a word, a flag beside the refusal suggests it for the dictionary. A flag sends the word,",
    );
  });

  it('keeps them 60 days, and says how to take one back', () => {
    const s = section('Flagging a Word');
    expect(s).toContain(
      'Flags are kept for 60 days and read by hand, and for those 60 days you can take one back from Your flags, in Settings.',
    );
  });

  it('names who stores flags, and where', () => {
    const s = section('Flagging a Word');
    expect(s).toContain(
      'Upstash, a database service, stores flags for the game',
    );
    expect(s).toContain('United States');
  });

  it('says Vercel sees the IP address of every request, and never suggests it acts only for the game', () => {
    expect(text).toContain(
      'Vercel hosts the site. Like any web host, it sees the IP address of every request, flags included, and keeps request logs that it uses for its own purposes under its own privacy notice. Peach of a Word itself never stores your address.',
    );
    expect(html).toMatch(
      /<a\s+href="https:\/\/vercel\.com\/legal\/privacy-notice"\s*>privacy notice<\/a\s*>/,
    );
    // One name for the address across the page.
    expect(text).not.toMatch(/network address/);
    expect(text).not.toMatch(/processes the requests needed to serve pages/);
    expect(text).not.toMatch(/processor|on our behalf/i);
  });

  it('says the flags you send are the one copy of what the browser keeps', () => {
    expect(text).toContain(
      'Clearing your browser storage clears them. There is no account, and apart from the flags you send, no copy of them anywhere else.',
    );
  });

  it('says in its description that it collects the words you flag', () => {
    expect(html).toContain(
      'content="What Peach of a Word collects: the words you flag, with nothing about you, and aggregate page views on the website."',
    );
  });
});
