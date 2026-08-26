/**
 * A matchMedia jsdom does not have.
 *
 * jsdom implements `window.matchMedia` as `undefined` and evaluates no media
 * queries at all, so without this every test renders the narrow branch and the
 * two-column layout — the one that must not regress — would have no coverage
 * whatsoever. That is not a gap you notice: the suite stays green while half the
 * app goes untested.
 *
 * This is deliberately a real evaluator over a settable width rather than a
 * hardcoded boolean, so a test says "a phone" or "a desktop" and every query on
 * the page answers consistently, including ones added later.
 */
export const PHONE_WIDTH = 390;
export const DESKTOP_WIDTH = 1024;

/** The suite's default. Most tests are about behaviour, and Bea plays on a phone. */
let widthPx = PHONE_WIDTH;

const lists = new Set<{ query: string; notify: () => void }>();

/**
 * Evaluate the query forms this app actually uses: min-width in em or px.
 * Anything else (prefers-reduced-motion, hover) reports false, which is the
 * same answer jsdom's absence effectively gave and keeps motion suppressed.
 *
 * em resolves against 16px, the jsdom root size. The app's own text-size steps
 * scale the root in a browser, but a media query in em always resolves against
 * the *initial* font size, never the scaled root, so 16 is correct here rather
 * than merely convenient.
 */
function evaluate(query: string): boolean {
  const m = /\(min-width:\s*([\d.]+)(em|px)\)/.exec(query);
  if (!m) return false;
  const px = m[2] === 'em' ? Number(m[1]) * 16 : Number(m[1]);
  return widthPx >= px;
}

/** Set the viewport width, notifying anything already listening. */
export function setViewportWidth(px: number): void {
  widthPx = px;
  for (const list of lists) list.notify();
}

export function installMatchMedia(): void {
  window.matchMedia = (query: string) => {
    const listeners = new Set<() => void>();
    const entry = {
      query,
      notify: () => listeners.forEach((fn) => fn()),
    };
    lists.add(entry);
    return {
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) =>
        void listeners.delete(fn),
      addListener: (fn: () => void) => void listeners.add(fn),
      removeListener: (fn: () => void) => void listeners.delete(fn),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
}

/**
 * Back to a phone, dropping stale subscriptions from the finished test, and
 * reinstall.
 *
 * Reinstalling is not belt-and-braces. A test that stubs or deletes
 * `window.matchMedia` itself used to be harmless, because jsdom had none to
 * damage; now it would silently take the global away from every test that runs
 * after it, in file order, and the symptom lands somewhere else entirely. This
 * makes the setup file the last word on the matter.
 */
export function resetViewport(): void {
  widthPx = PHONE_WIDTH;
  lists.clear();
  installMatchMedia();
}
