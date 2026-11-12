import { useSyncExternalStore } from 'react';
import { applyFavicon } from './favicon.ts';
import { appearanceStore } from './useAppearance.ts';

export type Theme = 'letterpress' | 'cute';

const STORAGE_KEY = 'e8-theme';

/**
 * The theme a visitor lands on with no saved preference. Cute is the front door:
 * the world meets the game the way Bea plays it. Letterpress stays a first-class
 * toggle option and, once chosen, persists. This default must match the value
 * baked into index.html's <html data-theme> so the pre-paint theme and the app
 * theme agree and there is no flash. Both are asserted against this constant.
 */
export const DEFAULT_THEME: Theme = 'cute';

/**
 * Resolve a theme from a data-theme attribute (or saved value). A known theme is
 * honored, so a saved preference always wins; anything else, including an absent
 * value, falls back to the default. This is the single resolver the runtime uses.
 */
export function resolveTheme(value: string | null | undefined): Theme {
  return value === 'cute' || value === 'letterpress' ? value : DEFAULT_THEME;
}

/**
 * The document root is the single source of truth for the theme: an inline head
 * script sets it before paint (no flash). This is a tiny external store over it
 * so every consumer (toolbar, colophon, ...) stays in sync when it changes.
 */
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme);
}

function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  // Only cute has a dark, so a theme change can turn the page dark or light.
  appearanceStore.refresh();
  // The tab icon follows the theme too. The pre-paint script sets the initial
  // one; this keeps it in step on every toggle.
  applyFavicon(next);
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

const serverSnapshot = (): Theme => DEFAULT_THEME;

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, serverSnapshot);
  return [theme, setTheme];
}
