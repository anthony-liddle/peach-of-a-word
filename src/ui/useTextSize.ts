import { useSyncExternalStore } from 'react';

export type TextSize = 'regular' | 'large' | 'largest';

const STORAGE_KEY = 'e8-text-size';

/** The cycle order the toolbar control walks through. */
const ORDER: readonly TextSize[] = ['regular', 'large', 'largest'];

/**
 * The step a visitor lands on with no saved preference. Regular applies no
 * root override at all, so the browser's own default font size rules alone;
 * the larger steps multiply it (the CSS values are percentages, never px, so
 * a raised browser default and a raised step compound instead of fighting).
 */
export const DEFAULT_TEXT_SIZE: TextSize = 'regular';

/**
 * Resolve a step from a data-text-size attribute (or saved value). A known
 * step is honored; anything else, including an absent value, falls back to
 * the default. Mirrors resolveTheme: one resolver for script and runtime.
 */
export function resolveTextSize(value: string | null | undefined): TextSize {
  return value === 'large' || value === 'largest' || value === 'regular'
    ? value
    : DEFAULT_TEXT_SIZE;
}

/** The step after the given one, wrapping back to regular past the largest. */
export function nextTextSize(size: TextSize): TextSize {
  return ORDER[(ORDER.indexOf(size) + 1) % ORDER.length]!;
}

/**
 * The document root is the single source of truth, exactly like the theme: an
 * inline head script applies a saved step before paint (no flash), and this
 * store watches the attribute so every consumer stays in sync.
 */
const listeners = new Set<() => void>();

function readTextSize(): TextSize {
  return resolveTextSize(document.documentElement.dataset.textSize);
}

function setTextSize(next: TextSize): void {
  if (next === 'regular') {
    // No attribute means no override: identical to a visitor who never
    // touched the control, so the browser default alone decides.
    delete document.documentElement.dataset.textSize;
  } else {
    document.documentElement.dataset.textSize = next;
  }
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked; the choice simply will not persist this session.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const serverSnapshot = (): TextSize => DEFAULT_TEXT_SIZE;

export function useTextSize(): [TextSize, (size: TextSize) => void] {
  const size = useSyncExternalStore(subscribe, readTextSize, serverSnapshot);
  return [size, setTextSize];
}
