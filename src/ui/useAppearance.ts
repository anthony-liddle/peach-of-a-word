import { useSyncExternalStore } from 'react';

/**
 * The player's appearance: System, which follows the computer or phone, Light
 * or Dark. Kept per device in `localStorage`, as the theme and the text size
 * are (Antoine, 11 November 2026).
 *
 * **The root carries the result,** `data-appearance="light" | "dark"`, with
 * the matching `color-scheme`, so the stylesheet's
 * `[data-theme='cute'][data-appearance='dark']` block is the only thing that
 * draws dark. The script in `index.html` that runs before the first paint
 * sets it first, by the same rule as `resolve` below, so the first frame is
 * already right; this store keeps it right after that.
 *
 * **Only cute has a dark.** Letterpress stays light in every appearance until
 * its own pass, so in letterpress the result is always light, and a theme
 * change calls `refresh`.
 *
 * **System follows live.** The `prefers-color-scheme` query's change event
 * turns an open tab dark when the computer does at sunset, with no reload.
 */
export type Appearance = 'system' | 'light' | 'dark';

const KEY = 'e8-appearance';

/** The address bar's colour, the page's own: Cocoa and the cute peach-cream. */
const BAR = { dark: '#2b1a14', light: '#fff4ee' } as const;

function read(): Appearance {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

let current: Appearance = read();
const listeners = new Set<() => void>();

/** Whether the page draws dark: cute, and Dark, or System on a dark system. */
export function resolveDark(
  appearance: Appearance,
  theme: string | undefined,
  systemDark: boolean,
): boolean {
  if (theme !== 'cute') return false;
  return appearance === 'dark' || (appearance === 'system' && systemDark);
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = resolveDark(
    current,
    root.dataset.theme,
    media?.matches ?? false,
  );
  root.dataset.appearance = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  // One colour for the bar, the page's: the two `media` variants in the
  // head are only the fallback for a browser that never runs the script.
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.removeAttribute('media');
    meta.content = dark ? BAR.dark : BAR.light;
  }
  listeners.forEach((notify) => notify());
}

media?.addEventListener('change', () => {
  if (current === 'system') apply();
});

export const appearanceStore = {
  get(): Appearance {
    return current;
  },
  set(next: Appearance): void {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice simply won't be kept past this tab.
    }
    apply();
  },
  /** After a theme change, which can turn dark on or off. */
  refresh(): void {
    apply();
  },
  subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => listeners.delete(notify);
  },
};

export function useAppearance(): [Appearance, (next: Appearance) => void] {
  const value = useSyncExternalStore(
    appearanceStore.subscribe,
    appearanceStore.get,
    () => 'system' as Appearance,
  );
  return [value, appearanceStore.set];
}
