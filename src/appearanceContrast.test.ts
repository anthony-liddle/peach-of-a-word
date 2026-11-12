import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Every pair of colours a player reads in the cute theme, in light and in
 * dark (Cocoa), held to WCAG 2.2: text at 4.5:1 or more, a control's colour
 * against what it sits on at 3:1 or more. The pairs are the dark mode
 * discovery pass's (vault, `reports/2026-11-11 Dark Mode.md`), by token, read
 * from the stylesheet's two cute blocks.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

const HEADS = {
  light: "\\[data-theme='cute'\\]",
  dark: "\\[data-theme='cute'\\]\\[data-appearance='dark'\\]",
} as const;
type Appearance = keyof typeof HEADS;

/** A cute block's declarations: the first block headed exactly so. */
function tokens(appearance: Appearance): Map<string, string> {
  const b = css.match(
    new RegExp(`\\n${HEADS[appearance]}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!b) throw new Error(`No cute ${appearance} block in index.css`);
  const out = new Map<string, string>();
  for (const m of b.matchAll(/(--[\w-]+):\s*([^;]+);/g))
    out.set(m[1]!, m[2]!.trim());
  return out;
}

/** A token's hex in an appearance, following var() to another token. */
function hex(appearance: Appearance, name: string): string {
  const own = tokens(appearance);
  const light = tokens('light');
  let value =
    own.get(name) ?? (appearance === 'dark' ? undefined : light.get(name));
  if (value === undefined)
    throw new Error(`No ${name} in the cute ${appearance} block`);
  for (let i = 0; i < 4 && value.startsWith('var('); i++) {
    const ref = value.slice(4, -1).trim();
    value = own.get(ref) ?? light.get(ref) ?? '';
  }
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} isn't a hex in ${appearance}: ${value}`);
  return value.toLowerCase();
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` at `opacity` over `under`, per channel on the encoded values. */
function over(top: string, opacity: number, under: string): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(opacity * ch(top, i) + (1 - opacity) * ch(under, i)),
      )
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

type Pair = [fg: string, bg: string, what: string, opacity?: number];

const TEXT: Pair[] = [
  ['--ink', '--paper', 'text on the page'],
  ['--ink', '--page-foot', "text on the page's foot"],
  ['--ink', '--paper-deep', 'text on tiles and the well'],
  ['--ink-soft', '--paper', 'soft text on the page'],
  ['--ink-soft', '--page-foot', "soft text on the page's foot"],
  ['--ink-soft', '--paper-deep', 'soft text on a surface'],
  ['--ink-faint', '--paper', 'faint text on the page'],
  ['--ink-faint', '--page-foot', "faint text on the page's foot"],
  ['--ink-faint', '--paper-deep', "the well's placeholder, disabled labels"],
  ['--accent', '--paper', 'pink text on the page: the name, links'],
  ['--accent', '--page-foot', "pink text on the page's foot"],
  ['--accent', '--paper-deep', 'pink text on a surface'],
  ['--accent-deep', '--paper', "the masthead's line"],
  ['--accent-deep', '--page-foot', "deep pink on the page's foot"],
  ['--paper', '--button', 'a big pink button: Pick word, Keep playing'],
  ['--paper', '--accent-deep', 'a big pink button, hovered'],
  ['--on-accent', '--button', "Daily or Endless, pressed; a card's close"],
  ['--crown-deep', '--paper', 'the peach of a word, the streak'],
  ['--crown-deep', '--page-foot', "the peach of a word on the page's foot"],
  ['--crown-deep', '--paper-deep', 'the crown button'],
  ['--discovery', '--paper', 'rarity on the page'],
  ['--discovery', '--page-foot', "rarity on the page's foot"],
  ['--discovery', '--paper-deep', 'rarity on a surface'],
  ['--good', '--paper-deep', "the well's message after a find"],
  ['--error-deep', '--paper-deep', "the well's message after a miss"],
  ['--ink', '--paper', 'No definition on hand', 0.85],
];

const CONTROLS: Pair[] = [
  ['--good', '--paper-deep', "the meter's pink fill"],
  ['--discovery', '--paper-deep', "the meter's purple fill"],
  ['--ink', '--paper', "the meter's outline"],
  ['--accent', '--page-foot', 'the focus ring'],
];

function ratio(a: Appearance, [fg, bg, , opacity]: Pair): number {
  const b = hex(a, bg);
  const f = opacity ? over(hex(a, fg), opacity, b) : hex(a, fg);
  return contrast(f, b);
}

describe.each(['light', 'dark'] as const)('the cute theme in %s', (a) => {
  test.each(TEXT)('%s on %s, %s, reads at 4.5:1', (...pair) => {
    expect(ratio(a, pair as Pair)).toBeGreaterThanOrEqual(4.5);
  });
  test.each(CONTROLS)('%s against %s, %s, at 3:1', (...pair) => {
    expect(ratio(a, pair as Pair)).toBeGreaterThanOrEqual(3);
  });
});

describe('the dark block redeclares every colour the light one sets', () => {
  test('no colour token falls back to light in dark', () => {
    const light = tokens('light');
    const dark = tokens('dark');
    const colours = [...light].filter(([, v]) =>
      /#[0-9a-f]{3,6}\b|rgba?\(/i.test(v),
    );
    const missing = colours.map(([k]) => k).filter((k) => !dark.has(k));
    expect(missing).toEqual([]);
  });
  test('the dark block says it is dark, for scrollbars and form controls', () => {
    expect(
      tokens('dark').has('color-scheme') ||
        /\[data-appearance='dark'\]\s*\{[^}]*color-scheme:\s*dark/.test(css),
    ).toBe(true);
  });
  test("the page's gradient runs between its two tokens", () => {
    expect(tokens('light').get('--page-bg')).toMatch(
      /var\(--paper\),\s*var\(--page-foot\)/,
    );
  });
});

describe('the four spots that were hard-coded for light', () => {
  const rule = (sel: string) => {
    const esc = sel.replace(/[.[\]$()+*?^|{}\\]/g, '\\$&');
    return css.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  };
  test("a pressed mode's label and a card's close are --on-accent, not white", () => {
    expect(
      rule("[data-theme='cute'] .modes button[aria-pressed='true']"),
    ).toMatch(/color:\s*var\(--on-accent\)/);
    expect(rule("[data-theme='cute'] .edition__close")).toMatch(
      /color:\s*var\(--on-accent\)/,
    );
  });
  test("the cards' scrim and glow are tokens", () => {
    expect(rule('.reveal-backdrop')).toMatch(/background:\s*var\(--scrim\)/);
    expect(rule("[data-theme='cute'] .edition")).toMatch(/var\(--card-glow\)/);
  });
  test('every big pink button fills from --button, one token', () => {
    expect(rule('.btn--primary')).toMatch(/background:\s*var\(--button\)/);
    expect(rule("[data-theme='cute'] .edition__close")).toMatch(
      /background:\s*var\(--button\)/,
    );
    expect(
      rule("[data-theme='cute'] .modes button[aria-pressed='true']"),
    ).toMatch(/background:\s*var\(--button\)/);
  });
});
