import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Legibility pins for the stylesheet. The audit found two WCAG AA contrast
 * failures, both caused by opacity veils multiplying against text colors that
 * pass on their own, and a band of supporting text rendering at 10 to 13px.
 * These assertions pin the fixes: no opacity veil on those two text rules, and
 * a rem floor under the raised supporting text. Floors, not exact values, so
 * future tuning upward never breaks them.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** The declaration block of the first rule whose selector list ends with `sel {`. */
function block(sel: string): string {
  const escaped = sel.replace(/[.[\]$]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No rule found for selector: ${sel}`);
  return match[1]!;
}

function fontSizeRem(sel: string): number {
  const b = block(sel);
  const m = b.match(/font-size:\s*([\d.]+)rem/);
  if (!m) throw new Error(`No rem font-size in rule: ${sel}`);
  return Number(m[1]);
}

describe('index.css contrast: no opacity veils on text', () => {
  // The tokens pass AA on their own (ink-soft 6.5:1, discovery 5.6:1); the
  // veils dropped them to 3.3:1 and 4.1:1. Muting must come from color or
  // weight, never from opacity, so a veil never silently reappears.
  test('the also-found label carries no opacity veil', () => {
    expect(block('.found__alsofound')).not.toContain('opacity');
  });

  test('the inline points suffix carries no opacity veil', () => {
    expect(block('.found__points')).not.toContain('opacity');
  });
});

describe('index.css sizes: the supporting-text floor', () => {
  // The audit's fix raised the glossary and supporting text so nothing a
  // player reads during play renders below 14px (0.875rem at the default
  // 16px root). Each entry asserts a floor for one raised rule.
  const floors: [selector: string, minRem: number][] = [
    ['.found__alsofound', 0.875],
    ['.found__groupcount', 0.875],
    ['.found__word', 1.1],
    ['.summary__stats', 0.9],
    ['.legend', 0.875],
    ['.legend__caption', 0.74],
    ['.tier__key', 0.875],
    ['.tier__ticks', 0.875],
    ['.tier__next', 0.875],
    ['footer.colophon', 0.875],
    ['.btn', 0.875],
    ['.modes button', 0.875],
    ['.chip', 0.875],
    ['.theme-swap', 0.875],
    ['.reveal__close', 0.875],
    ['.edition__close', 0.875],
    ['.reveal__h', 0.78],
    ['.reveal__kicker', 0.78],
  ];

  test.each(floors)('%s renders at or above %srem', (selector, minRem) => {
    expect(fontSizeRem(selector)).toBeGreaterThanOrEqual(minRem);
  });

  test('the points suffix keeps at least 0.9em of its chip', () => {
    const m = block('.found__points').match(/font-size:\s*([\d.]+)em/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0.9);
  });
});

describe('index.css rack glyphs: proportional at phone width', () => {
  // Phone tiles are larger than desktop tiles (the 4-column grid), so the
  // glyph must be larger there too. A single vw clamp cannot express that:
  // its cap is viewport-independent, so the base rule carries a strong vw
  // term for the 4-column regime and the 540px query restores the desktop
  // clamp when the grid goes to 8 columns.
  function vwTerm(b: string): number {
    const m = b.match(/font-size:\s*clamp\([^)]*?([\d.]+)vw/);
    if (!m) throw new Error('No vw clamp term found');
    return Number(m[1]);
  }

  test('the base rack glyph tracks the viewport strongly (4-column regime)', () => {
    expect(vwTerm(block('.sort'))).toBeGreaterThanOrEqual(15);
  });

  test('the 8-column breakpoint restores the desktop glyph unchanged', () => {
    // Capture each 33.75em (540px at default) media block up to its
    // unindented closing brace, so the assertion cannot leak past a block
    // into the base rules below it. The desktop glyph must live in one of
    // them, and that block must come after the base .sort rule or the phone
    // size would win on desktop too.
    const blocks = [
      ...css.matchAll(/@media \(min-width: 33\.75em\) \{([\s\S]*?)\n\}/g),
    ];
    const sortRe =
      /\.sort\s*\{[^}]*font-size:\s*clamp\(1\.75rem, 7vw, 2\.75rem\)/;
    const withSort = blocks.find((b) => sortRe.test(b[1]!));
    expect(withSort).toBeDefined();
    expect(withSort!.index!).toBeGreaterThan(css.indexOf('.sort {'));
  });

  test('the composing slot reaches its cap by phone width', () => {
    expect(vwTerm(block('.stick__slot'))).toBeGreaterThanOrEqual(10);
  });
});

describe('index.css narrow screens: em breakpoints and reachable overflow', () => {
  test('no px width media queries remain', () => {
    // px queries respond to page zoom but not text-only scaling; em queries
    // resolve against the browser default font size and respond to both.
    expect(css).not.toMatch(/@media[^{]*\((?:min|max)-width:\s*[\d.]+px/);
  });

  test('the em breakpoints are the exact px equivalents at a 16px root', () => {
    expect(css).toMatch(/@media \(max-width: 30em\)/); // 480px
    expect(css).toMatch(/@media \(min-width: 33\.75em\)/); // 540px
    expect(css).toMatch(/@media \(min-width: 51\.25em\)/); // 820px
  });

  test('the toolbar clusters wrap instead of overflowing', () => {
    expect(block('.modes')).toContain('flex-wrap: wrap');
    expect(block('.toolbar__right')).toContain('flex-wrap: wrap');
  });

  test('the text-size steps are percentages, never px', () => {
    // A px root size would REPLACE the browser's default font size and undo
    // the text-scaling support; a percentage multiplies with it, so a 24px
    // browser default at the largest step lands on 30px. Non-negotiable.
    const overrides = [
      ...css.matchAll(/:root\[data-text-size='[^']+'\]\s*\{([^}]*)\}/g),
    ];
    expect(overrides.length).toBeGreaterThanOrEqual(2);
    for (const m of overrides) {
      expect(m[1]).toMatch(/font-size:\s*[\d.]+%/);
      expect(m[1]).not.toMatch(/font-size:[^;]*px/);
    }
  });

  test('no px font-size ever targets the document root', () => {
    for (const m of css.matchAll(/(?:^|\n)(?:html|:root)[^{]*\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/font-size:\s*[\d.]+px/);
    }
  });

  test('the overflow clip is scoped to the decorations, not the body', () => {
    // A body-level clip turns real content overflow into invisible loss;
    // scoping it to the decorations keeps the motif bleed from spawning a
    // scrollbar while oversized content stays reachable by scrolling.
    expect(css).not.toContain('overflow-x: hidden');
    expect(block('.decorations')).toContain('overflow: hidden');
  });
});
