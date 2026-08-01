import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

// The loading branch renders Analytics, which reaches for the network. Stub it
// so the test exercises the copy and nothing else.
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

// A promise that never settles holds the app on the loading state, which is
// otherwise gone before a single assertion can run.
vi.mock('@/data/gameData.ts', () => ({
  loadGameData: () => new Promise(() => {}),
}));

import { App } from './App.tsx';
import { useTheme, type Theme } from './ui/useTheme.ts';

/**
 * The document root carries the theme before the first paint, set by the inline
 * script in index.html. jsdom starts without it, so these tests put it there the
 * same way the browser does.
 */
function paintTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

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
