import { useSyncExternalStore } from 'react';

/**
 * The width at which `.board` goes two-column, named once.
 *
 * This value also lives in the stylesheet, which is unavoidable: the tier meter
 * has to be *reparented* across the breakpoint, not merely repositioned, and no
 * stylesheet can move a node from inside `.summary` up into `.play`. So the
 * breakpoint is read in JS, and `indexCss.test.ts` asserts the stylesheet's
 * `.board` query still uses this exact string, so CSS cannot drift away from it
 * unnoticed. That test guards one direction at one input: it catches the CSS
 * changing, not this constant changing.
 */
export const TWO_COLUMN_QUERY = '(min-width: 51.25em)';

/**
 * Why not two nodes and `display: none`?
 *
 * Because a CSS-hidden node is fully present to `getByRole`. jsdom implements
 * neither `matchMedia` nor media-query evaluation over a stylesheet the tests
 * never load, so the twin would be live in every test: `Game.test.tsx` asserts
 * there is exactly ONE progressbar on the screen, and that assertion is the
 * thing keeping a second bar from creeping back. Any responsive pattern that
 * relies on CSS to make one of two nodes not exist is invisible to the layer
 * that guards it. One node, and JS picks where it goes.
 */
function subscribe(notify: () => void): () => void {
  // Older Safari only has the deprecated addListener; both are absent under
  // jsdom, where matchMedia itself is undefined.
  const mql = window.matchMedia?.(TWO_COLUMN_QUERY);
  if (!mql?.addEventListener) return () => {};
  mql.addEventListener('change', notify);
  return () => mql.removeEventListener('change', notify);
}

/**
 * False where matchMedia is absent, which is both the honest answer for a
 * browser that cannot tell us and the deterministic one for jsdom: tests get
 * the narrow layout unless they stub matchMedia, and `vitest.setup.ts` provides
 * a stub so both branches can be covered explicitly rather than by accident.
 */
function readWide(): boolean {
  return window.matchMedia?.(TWO_COLUMN_QUERY).matches ?? false;
}

const serverSnapshot = (): boolean => false;

/** True when the board is two-column: the glossary has a column of its own. */
export function useWideBoard(): boolean {
  return useSyncExternalStore(subscribe, readWide, serverSnapshot);
}
