import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

// The loading branch renders Analytics, which reaches for the network. Stub it
// so the test exercises the copy and nothing else.
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

// The load is driven per test. A promise that never settles holds the app on
// the loading state, which is otherwise gone before a single assertion can run;
// a rejection exercises the error screen.
const load = vi.hoisted(() => ({
  next: () => new Promise<never>(() => {}),
}));

vi.mock('@/data/gameData.ts', async (importOriginal) => ({
  // Only the loader is faked. AssetHttpError and isStaleBundleError are the
  // real ones, so these tests exercise the same staleness check the app uses.
  ...(await importOriginal<typeof import('@/data/gameData.ts')>()),
  loadGameData: () => load.next(),
}));

import { App } from './App.tsx';
import { AssetHttpError } from './data/gameData.ts';
import { useTheme, type Theme } from './ui/useTheme.ts';

/**
 * The document root carries the theme before the first paint, set by the inline
 * script in index.html. jsdom starts without it, so these tests put it there the
 * same way the browser does.
 */
function paintTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

const RELOAD_KEY = 'peach:reloaded-for-stale-data';

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  sessionStorage.clear();
  load.next = () => new Promise<never>(() => {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Render with a failing load and let it settle.
 *
 * A first failure reloads the page once, on the theory that the bundle is stale,
 * so tests that want the error screen pass alreadyReloaded to stand in for the
 * second attempt. Returns the reload spy either way.
 */
async function renderFailedLoad(
  err: unknown,
  { alreadyReloaded = true }: { alreadyReloaded?: boolean } = {},
): Promise<ReturnType<typeof vi.fn>> {
  if (alreadyReloaded) sessionStorage.setItem(RELOAD_KEY, '1');
  const reload = vi.fn();
  vi.stubGlobal('location', { reload });
  load.next = () => Promise.reject(err) as Promise<never>;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => {
    render(<App />);
  });
  return reload;
}

describe('the loading screen', () => {
  it('sets the type under letterpress', () => {
    paintTheme('letterpress');
    render(<App />);
    expect(screen.getByText('Setting the type.')).toBeInTheDocument();
  });

  it('picks the peaches under cute', () => {
    paintTheme('cute');
    render(<App />);
    expect(screen.getByText('Picking the peaches.')).toBeInTheDocument();
  });

  it('resolves the theme before Game mounts', () => {
    // This renders earlier than anything else in the app, so the theme has to
    // resolve from the pre-paint attribute alone, with no Game on screen to
    // have established it. Letterpress is the telling case: cute is the default
    // a failed resolution would fall back to, so a letterpress line here proves
    // the attribute was read rather than defaulted.
    paintTheme('letterpress');
    render(<App />);
    expect(screen.getByText('Setting the type.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shuffle/i })).toBeNull();
  });

  it('re-skins live on a theme switch', () => {
    paintTheme('letterpress');
    render(<App />);
    const { result } = renderHook(() => useTheme());

    act(() => result.current[1]('cute'));

    expect(screen.getByText('Picking the peaches.')).toBeInTheDocument();
    expect(screen.queryByText('Setting the type.')).toBeNull();
  });
});

/**
 * The incident these guard: a parse error interpolating a word from the lists
 * was rendered full screen, which put a slur in front of the player the demote
 * mechanism existed to protect. No internal error string may reach the DOM, for
 * any error and any word. The sentinels below stand in for the real message,
 * which is not worth writing down.
 */
describe('the error screen', () => {
  const INTERNAL = 'INTERNAL_DETAIL_SENTINEL';
  const WORD = 'WORD_FROM_THE_LISTS_SENTINEL';

  it('shows fixed copy rather than the thrown message', async () => {
    await renderFailedLoad(new Error(`Unknown action "${INTERNAL}"`));

    expect(
      screen.getByText('The word lists did not load. Reload to try again.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(INTERNAL);
  });

  it('keeps an interpolated word out of the DOM', async () => {
    await renderFailedLoad(new Error(`Unknown action "demote" for "${WORD}"`));

    expect(document.body.textContent).not.toContain(WORD);
  });

  it('holds its copy when the rejection is not an Error at all', async () => {
    await renderFailedLoad(WORD);

    expect(
      screen.getByText('The word lists did not load. Reload to try again.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(WORD);
  });

  it('logs the detail to the console so debugging keeps it', async () => {
    const err = new Error(INTERNAL);
    await renderFailedLoad(err);

    expect(console.error).toHaveBeenCalledWith(
      'Game data failed to load.',
      err,
    );
  });
});

/**
 * The data directory is versioned by its contents, so a bundle that outlived a
 * data change requests a directory the deploy no longer serves. That is a stale
 * bundle, and fetching the page again fixes it, so the app does that once rather
 * than asking the player to.
 */
describe('the stale-bundle reload', () => {
  const missing = () => new AssetHttpError('common-pool.txt', 404);

  it('reloads once on a 404 instead of showing an error', async () => {
    const reload = await renderFailedLoad(missing(), {
      alreadyReloaded: false,
    });

    expect(reload).toHaveBeenCalledTimes(1);
    // No error painted over a page that is about to be replaced.
    expect(document.body.textContent).not.toContain('did not load');
  });

  it('shows the error rather than reloading again, so it cannot loop', async () => {
    const reload = await renderFailedLoad(missing());

    expect(reload).not.toHaveBeenCalled();
    expect(
      screen.getByText('The word lists did not load. Reload to try again.'),
    ).toBeInTheDocument();
  });

  it.each([
    ['a server error', new AssetHttpError('common-pool.txt', 500)],
    ['a dropped connection', new TypeError('Failed to fetch')],
    [
      'an asset served as HTML',
      new Error('Asset x came back as HTML, not data.'),
    ],
  ])(
    'does not reload for %s, which reloading would not fix',
    async (_case, err) => {
      // Narrow on purpose. Only a 404 says this bundle is stale. Reloading on
      // every failure would turn one broken deploy into a reload for every
      // visitor against an origin that is already failing.
      const reload = await renderFailedLoad(err, { alreadyReloaded: false });

      expect(reload).not.toHaveBeenCalled();
      expect(
        screen.getByText('The word lists did not load. Reload to try again.'),
      ).toBeInTheDocument();
    },
  );

  it('falls through to the error screen when sessionStorage is unavailable', async () => {
    // Private mode and blocked storage partitions both throw here. Without a
    // way to record the attempt there is no way to stop a loop, so it must not
    // start one.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const reload = await renderFailedLoad(missing(), {
      alreadyReloaded: false,
    });

    expect(reload).not.toHaveBeenCalled();
    expect(
      screen.getByText('The word lists did not load. Reload to try again.'),
    ).toBeInTheDocument();
  });
});
