/**
 * This page's own key, and nothing else.
 *
 * `eight-letters/v1` is one JSON blob holding her streak, and the game's write
 * path rewrites the whole thing from its own read. A stray write from here
 * would take the streak with it, so nothing in this module knows that key
 * exists and nothing here imports `GameStorage`.
 *
 * Every access is wrapped: localStorage throws outright in some privacy modes,
 * and a page that cannot remember is still a page that plays.
 */
const KEY = 'peach-date-night/v1';

interface Saved {
  readonly v: 1;
  readonly found: readonly string[];
}

/** The words found so far, or none if there is nothing to restore. */
export function loadFound(): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (!Array.isArray(parsed.found)) return [];
    // The caller filters these against the puzzle before they reach play, the
    // same guard `buildSlice` already applies to a restored daily, so a
    // hand-edited blob cannot put a word in the basket that the basket does
    // not hold.
    return parsed.found.filter((w): w is string => typeof w === 'string');
  } catch {
    return [];
  }
}

export function saveFound(found: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, found } satisfies Saved));
  } catch {
    // Storage blocked: play on without it.
  }
}

/**
 * Whether this browser will actually keep anything, tested by round-tripping a
 * value rather than by feature-detecting the object. Safari in private mode
 * hands back a localStorage that throws only on write.
 */
export function storagePersists(): boolean {
  try {
    const probe = `${KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
