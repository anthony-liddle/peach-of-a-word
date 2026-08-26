import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { installMatchMedia, resetViewport } from './src/testing/viewport.ts';

// jsdom implements no matchMedia, so the board's two-column branch would never
// render under test and the layout that must not regress would be the untested
// one. Install an evaluator over a settable width, and reset to a phone between
// tests so a width set in one never leaks into the next.
installMatchMedia();
afterEach(resetViewport);

// jsdom does not implement the canvas 2d context: getContext returns null and
// logs "Not implemented" to the virtual console. The confetti overlay handles a
// null context by skipping the draw, so stub it to return null quietly and keep
// test output pristine. Production browsers return a real context.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

// jsdom does not implement scrollIntoView. Completion uses it to bring the
// persistent Share into view; stub it as a no-op so tests that drive completion
// do not throw on the missing method. Production browsers implement it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
