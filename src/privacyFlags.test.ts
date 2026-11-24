import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What the privacy page says about flagging, held to what the game does.
 *
 * WHILE THE FLAG IS HIDDEN (Antoine, 24 November) the website neither shows a
 * flag nor sends one, so the page says nothing about flagging. The one trace
 * is the key `e8-flags` in What It Keeps, since a browser may still hold a
 * flag made before. The Hosting sentence stays, without "flags included".
 *
 * Turning flagging back on brings back the text Antoine approved for it (22
 * and 23 November; web #208 to #210), and these tests with it.
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

describe('the privacy page while flagging is off', () => {
  it('has no Flagging a Word section, and says nothing about flagging but the key a browser may still hold', () => {
    expect(text).not.toContain('Flagging a Word');
    expect(text).not.toContain('Upstash');
    const rest = text
      .replace("the words you've flagged", '')
      .replace('e8-flags', '');
    expect(rest).not.toMatch(/flag/i);
    expect(html).not.toMatch(/content="[^"]*flag/i);
  });

  it('names e8-flags among the keys a browser keeps, with no copy anywhere else', () => {
    expect(text).toContain(
      "and your progress, theme, text size, appearance, word counts setting and the words you've flagged live in your browser's local storage under the keys eight-letters/v1, e8-theme, e8-text-size, e8-appearance, e8-length-counts and e8-flags. Clearing your browser storage clears them. There is no account and no copy of them anywhere else.",
    );
  });

  it('says Vercel sees the IP address of every request, and never suggests it acts only for the game', () => {
    expect(text).toContain(
      'Vercel hosts the site. Like any web host, it sees the IP address of every request, and keeps request logs that it uses for its own purposes under its own privacy notice. Peach of a Word itself never stores your address.',
    );
    expect(html).toMatch(
      /<a\s+href="https:\/\/vercel\.com\/legal\/privacy-notice"\s*>privacy notice<\/a\s*>/,
    );
    // One name for the address across the page.
    expect(text).not.toMatch(/network address/);
    expect(text).not.toMatch(/processes the requests needed to serve pages/);
    expect(text).not.toMatch(/processor|on our behalf/i);
  });

  it('says in its description and its opening that no server holds anything about you', () => {
    expect(html).toContain(
      'content="What Peach of a Word collects: nothing in the iOS app, and aggregate page views on the website."',
    );
    expect(text).toContain(
      'No server anywhere holds anything about you. There are two versions,',
    );
  });

  it('says nothing that identifies anyone is collected from children', () => {
    expect(text).toContain(
      'Nothing that identifies anyone is collected, children included, so there is nothing held about a child to ask about or to have deleted.',
    );
  });
});
