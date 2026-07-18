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
