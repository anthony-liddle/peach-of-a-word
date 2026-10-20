import type { CostumeId } from './costumes.ts';
import { peachSvg } from './peachArt.ts';
import type { Theme } from './useTheme.ts';

/**
 * The tab icon follows the theme: the peach mark on cute (the same peach the OG
 * card and the share signature use), the source-word crown on classic. Keyed by
 * theme so the mapping is one thing. The pre-paint inline script in index.html
 * holds its own copy of this mapping (it runs before any module loads), and the
 * index.html default is asserted against DEFAULT_THEME so the two cannot drift.
 */
export const FAVICON_HREF: Record<Theme, string> = {
  cute: '/favicon-cute.svg',
  letterpress: '/favicon-classic.svg',
};

/** The tab-icon path for a theme. */
export function faviconHref(theme: Theme): string {
  return FAVICON_HREF[theme];
}

/**
 * Point the tab icon at the mark for the given theme. Removes any existing icon
 * link and appends a fresh node rather than mutating href: browsers do not
 * reliably repaint the tab when an existing rel="icon" href changes, but they do
 * when the link node is replaced. Called on every theme toggle so the tab
 * follows. The pre-paint script sets the initial icon before this ever runs.
 *
 * `costume` dresses the cute peach, for a board on one of COSTUME_DAYS.
 */
export function applyFavicon(
  theme: Theme,
  costume: CostumeId | null = null,
): void {
  const head = document.head;
  if (!head) return;
  head.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
  const link = document.createElement('link');
  link.id = 'favicon';
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  // A costumed peach on its day, drawn from the peach's own parts. The
  // pre-paint script cannot know the board's date, so the plain mark shows
  // first and this replaces it once the board is known.
  link.href =
    theme === 'cute' && costume
      ? `data:image/svg+xml,${encodeURIComponent(peachSvg({ costume, face: true }))}`
      : faviconHref(theme);
  head.appendChild(link);
}
