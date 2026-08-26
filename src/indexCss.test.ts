import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { TWO_COLUMN_QUERY } from './ui/useWideBoard.ts';

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
  // Every regex metacharacter a CSS selector can contain, so combinators and
  // functional pseudo-classes (:has(+ .foo)) match literally.
  const escaped = sel.replace(/[.[\]$()+*?^|{}\\]/g, '\\$&');
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

describe('index.css inline points: the ink follows the category', () => {
  // Discovery ink means off-page in this stylesheet: it is the one colour the
  // whole rarity ladder shares, and the rung tallies take it too. Now that every
  // chip carries a number, the default must not be that ink, or a set word would
  // print an off-page-coloured score and colour would stop meaning one thing.
  test('the default points ink is the muted one, not the discovery ink', () => {
    const b = block('.found__points');
    expect(b).toMatch(/color:\s*var\(--ink-soft\)/);
    expect(b).not.toMatch(/color:\s*var\(--discovery\)/);
  });

  test('every off-page rung keeps the discovery ink on its points', () => {
    // The off-page chip format is unchanged: the rungs restore exactly the ink
    // they had before the number reached the rest of the chips.
    for (const rung of ['uncommon', 'rare', 'mythic']) {
      expect(css).toMatch(
        new RegExp(
          `\\.found__word--${rung} \\.found__points[^{]*\\{[^}]*var\\(--discovery\\)`,
        ),
      );
    }
  });

  test('the source word carries its own crown ink through to its points', () => {
    // The chip is crown-deep, so its number is too: the one word Bea asked about
    // reads as a single amber unit rather than a word with a foreign number.
    expect(css).toMatch(
      /\.found__word--source \.found__points\s*\{[^}]*var\(--crown-deep\)/,
    );
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
    ['.summary__bestlabel', 0.9],
    ['.legend', 0.875],
    ['.legend__caption', 0.74],
    // The feedback message: player-read supporting text, and it grew its own
    // font-size when it moved inside the compose well, so it joins the floor
    // the rest of that band holds.
    ['.message', 0.875],
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

/** The value of a custom property inside the given theme's token block. */
function token(theme: 'letterpress' | 'cute', name: string): string {
  const head =
    theme === 'letterpress'
      ? ":root,\\s*\\[data-theme='letterpress'\\]"
      : "\\[data-theme='cute'\\]";
  const b = css.match(new RegExp(`${head}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!b) throw new Error(`No token block for theme: ${theme}`);
  const m = b.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!m) throw new Error(`No ${name} in the ${theme} tokens`);
  return m[1]!;
}

function relativeLuminance(hex: string): number {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('index.css glossary inks: AA on both readout surfaces', () => {
  // Chips sit on --paper; --paper-deep is pinned too so anything that ever
  // gains a fill cannot quietly fail. Both themes, since they move the deep
  // surface opposite ways (cute to white, letterpress darker).
  const surfaces = ['--paper', '--paper-deep'];
  const inks = ['--discovery', '--ink-soft', '--ink'];
  const pairs = surfaces.flatMap((s) => inks.map((i) => [s, i] as const));

  describe.each(['letterpress', 'cute'] as const)('%s', (theme) => {
    test.each(pairs)('%s carries %s at AA', (surface, ink) => {
      expect(
        contrast(token(theme, ink), token(theme, surface)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('index.css rarity rung triggers: tappable at the floor', () => {
  // The smallest controls on the board, so the floors matter most here.
  test('the rung trigger holds the 24px inline tap floor in its own box', () => {
    // WCAG 2.5.8 (AA), which excepts targets sized by the line-height around
    // them. The 44px of 2.5.5 (AAA) is for standalone controls.
    const m = block('.summary__rung').match(/min-height:\s*(\d+)px/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(24);
  });

  test('the rung trigger uses the same floor as the word chip beside it', () => {
    // Pinned to each other, not to the number twice: if one moves, so should
    // the other.
    const rung = block('.summary__rung').match(/min-height:\s*(\d+)px/)![1];
    const chip = block('.found__word').match(/min-height:\s*(\d+)px/)![1];
    expect(rung).toBe(chip);
  });

  test('the rung trigger inherits its type, never shrinking below the tally row', () => {
    expect(block('.summary__rung')).toMatch(/font:\s*inherit/);
    expect(block('.summary__rung')).not.toMatch(/font-size/);
  });

  test('the rung trigger and its panel carry no opacity veil', () => {
    expect(block('.summary__rung')).not.toContain('opacity');
    expect(block('.summary__rungpanel')).not.toContain('opacity');
  });
});

describe('index.css rung panel: a separator, not a container', () => {
  // One hairline and nothing else. A fill, a box, or a radius would put back
  // the card that made the panel the loudest thing on the page.
  const panel = block('.summary__rungpanel');

  test('the divider is the group header rule: same token, 1px, no new colour', () => {
    expect(panel).toMatch(/border-top:\s*1px solid var\(--rule\)/);
    expect(block('.found__grouphead')).toMatch(
      /border-bottom:\s*1px solid var\(--rule\)/,
    );
  });

  test('every panel draws the rule, the first one included', () => {
    // An adjacent-sibling rule would exempt the first and leave the seam under
    // the tally block unruled.
    expect(css).not.toMatch(
      /\.summary__rungpanel \+ \.summary__rungpanel\s*\{/,
    );
  });

  test('the panel draws no box: no fill, no radius, no side or bottom edge', () => {
    expect(panel).not.toMatch(/background/);
    expect(panel).not.toMatch(/border-radius/);
    expect(panel).not.toMatch(/border-(left|right|bottom)/);
  });

  // Below the rule is the panel's padding-top, less the rule's own 1px; above
  // it is the previous panel's tightened margin.
  const belowRem = Number(
    panel.match(/padding-top:\s*calc\(([\d.]+)rem - 1px\)/)![1],
  );
  const above = Number(
    block('.summary__rungpanel:has(+ .summary__rungpanel)').match(
      /margin-bottom:\s*([\d.]+)rem/,
    )![1],
  );
  const preRuleGap = Number(panel.match(/margin:\s*0 0 ([\d.]+)rem/)![1]);

  test('the rule reads as a separator: more room above it than below', () => {
    // Or the hairline starts to read as the top edge of a box.
    expect(above * 16).toBeGreaterThan(belowRem * 16 - 1);
  });

  test('a junction costs exactly the gap it replaced, at every text size', () => {
    // The padding subtracts the border, so the pixels cancel and the identity
    // is exact in rem rather than only at one root size.
    expect(above + belowRem).toBe(preRuleGap);
  });

  test('the gap under the rule stays within a pixel of the chips row rhythm', () => {
    // One row apart from the row it introduces: the same rhythm, not a second
    // spacing system. The odd pixel is the border's, per the test above.
    const rowGap = Number(
      block('.found__words').match(/gap:\s*([\d.]+)rem/)![1],
    );
    expect(Math.abs(belowRem * 16 - 1 - rowGap * 16)).toBeLessThanOrEqual(1);
  });

  test('the last panel leaves the tier meter where it was before the rule', () => {
    // Only the between-panel margin tightens; this one still clears the meter.
    const panelBottom = Number(panel.match(/margin:\s*0 0 ([\d.]+)rem/)![1]);
    expect(panelBottom).toBe(0.75);
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

  test('the single-column band raises the glyph ceiling (middle regime)', () => {
    // Between the 8-column handoff and the two-column board the tiles keep
    // growing with the viewport while the board stays one column, so the
    // glyph needs a higher ceiling there than in the two-column regime. The
    // half-open range query keeps the two desktop regimes disjoint, so their
    // source order relative to each other cannot matter.
    const m = css.match(
      /@media \(33\.75em <= width < 51\.25em\) \{([\s\S]*?)\n\}/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(
      /\.sort\s*\{[^}]*font-size:\s*clamp\(1\.75rem, 7vw, 3\.6rem\)/,
    );
    expect(m!.index!).toBeGreaterThan(css.indexOf('.sort {'));
  });

  test('the near two-column band lowers the ceiling (fourth regime)', () => {
    // Just past the two-column handoff the tiles start small (43x57 at
    // 820px) and grow back to 54x72 by 1024px, so the 44px ceiling sat at
    // 77 percent there with a tight letterpress m. A 4vw term tracks the
    // shrunken tiles at 57 to 60 percent until they regain their settled
    // size at 64em.
    const m = css.match(/@media \(51\.25em <= width < 64em\) \{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(
      /\.sort\s*\{[^}]*font-size:\s*clamp\(1\.75rem, 4vw, 2\.75rem\)/,
    );
    expect(m!.index!).toBeGreaterThan(css.indexOf('.sort {'));
  });

  test('the wide regime keeps the original desktop glyph unchanged', () => {
    const blocks = [
      ...css.matchAll(/@media \(min-width: 64em\) \{([\s\S]*?)\n\}/g),
    ];
    const sortRe =
      /\.sort\s*\{[^}]*font-size:\s*clamp\(1\.75rem, 7vw, 2\.75rem\)/;
    const withSort = blocks.find((b) => sortRe.test(b[1]!));
    // Every desktop regime must still sit after the base phone rule, or the
    // 4-column glyph would win everywhere at equal specificity (the cascade
    // trap pass 1b hit).
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

/**
 * The completion ornament. The peach gets a brief entrance so it reads as
 * arriving rather than being placed, but the celebration's loud part belongs to
 * the confetti, and reduced motion has to leave the peach visible and still.
 */
describe('index.css completion ornament: a quiet entrance that reduced motion kills', () => {
  test('the entrance is a keyframe animation, so the global switch reaches it', () => {
    // The reduced-motion block zeroes animation-duration on the universal
    // selector. An entrance built from anything else would slip past it.
    expect(block('.edition__ornament--peach')).toMatch(/animation:/);
  });

  test('the entrance carries no animation-delay', () => {
    // The global switch zeroes duration and transition-duration but NOT delay.
    // A delayed entrance would hold its from-state under reduced motion, so the
    // peach would sit invisible for the delay. Verified, not assumed.
    const b = block('.edition__ornament--peach');
    expect(b).not.toMatch(/animation-delay/);
    expect(b).not.toMatch(
      /animation:[^;]*\b\d*\.?\d+m?s\s+[^;]*\b\d*\.?\d+m?s/,
    );
  });

  test('the entrance never animates opacity, so a stuck frame still shows the peach', () => {
    // Transform only, by construction: even if a frame sticks, the peach is on
    // screen. The card's own drop animation already owns the fade.
    const name = block('.edition__ornament--peach').match(
      /animation:\s*([\w-]+)/,
    )?.[1];
    expect(name).toBeTruthy();
    const frames = css.match(
      new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
    )?.[1];
    expect(frames).toBeTruthy();
    expect(frames).not.toMatch(/opacity/);
    expect(frames).toMatch(/transform/);
  });

  test('the reduced-motion switch is still in place and universal', () => {
    const m = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/,
    );
    expect(m?.[1]).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(m?.[1]).toMatch(/\*,/);
  });

  test('the peach ornament is sized in rem, so the text-size steps scale it', () => {
    // px would pin it while the type around it grows, and the largest step at
    // 375px is exactly where that would crowd the crown title.
    const b = block('.edition__ornament--peach');
    expect(b).toMatch(/(width|height|font-size):\s*[\d.]+rem/);
    expect(b).not.toMatch(/(width|height):\s*[\d.]+px/);
  });
});

describe('index.css two-column breakpoint: the stylesheet and the meter agree', () => {
  /**
   * The tier meter is REPARENTED at this width, not repositioned: no stylesheet
   * can lift a node out of the glossary summary and into the play column, so
   * the breakpoint has to be read in JS as well as declared here. That is two
   * copies of one number, and this is the guard.
   *
   * It guards ONE direction at ONE input: it catches the stylesheet moving away
   * from `TWO_COLUMN_QUERY`. It cannot catch the constant moving, because the
   * constant is what it reads. Change the constant and this test follows it
   * happily; the stylesheet is the side that gets caught.
   */
  test('.board goes two-column at exactly the width the meter reads', () => {
    const escaped = TWO_COLUMN_QUERY.replace(/[.()]/g, '\\$&');
    expect(css).toMatch(new RegExp(`@media ${escaped} \\{\\s*\\.board \\{`));
  });

  test('no other width query moves .board, so there is one handoff', () => {
    // A second breakpoint on .board would be a second handoff the JS knows
    // nothing about, and the meter would be in the wrong column across it.
    const queries = [...css.matchAll(/@media ([^{]+)\{\s*\.board \{/g)].map(
      (m) => m[1]!.trim(),
    );
    expect(queries).toEqual([TWO_COLUMN_QUERY]);
  });
});
