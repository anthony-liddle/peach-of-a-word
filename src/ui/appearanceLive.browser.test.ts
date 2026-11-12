import { afterEach, describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { appearanceStore } from './useAppearance.ts';

/**
 * The page follows the computer or phone live: on System, a switch to dark
 * while the tab is open turns it dark without a reload, and back. A chosen
 * Light or Dark stays put whatever the system does.
 */
const root = document.documentElement;

afterEach(async () => {
  appearanceStore.set('system');
  localStorage.removeItem('e8-appearance');
  await commands.emulateColorScheme('light');
  delete root.dataset.theme;
});

/** A frame or two for the browser to tell the page of the change. */
const settle = () => new Promise((r) => setTimeout(r, 100));

describe('the appearance, live', () => {
  test('on System, it follows the system both ways, with no reload', async () => {
    root.dataset.theme = 'cute';
    appearanceStore.set('system');
    await commands.emulateColorScheme('dark');
    await settle();
    expect(root.dataset.appearance).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    await commands.emulateColorScheme('light');
    await settle();
    expect(root.dataset.appearance).toBe('light');
  });

  test('a chosen Dark stays dark when the system turns light', async () => {
    root.dataset.theme = 'cute';
    await commands.emulateColorScheme('dark');
    appearanceStore.set('dark');
    await commands.emulateColorScheme('light');
    await settle();
    expect(root.dataset.appearance).toBe('dark');
    expect(localStorage.getItem('e8-appearance')).toBe('dark');
  });

  test('letterpress stays light, and comes back dark when cute does', async () => {
    root.dataset.theme = 'letterpress';
    appearanceStore.set('dark');
    expect(root.dataset.appearance).toBe('light');
    root.dataset.theme = 'cute';
    appearanceStore.refresh();
    expect(root.dataset.appearance).toBe('dark');
  });

  test('the address bar follows: theme-color is the page colour in each', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    root.dataset.theme = 'cute';
    appearanceStore.set('dark');
    expect(meta.content).toBe('#2b1a14');
    appearanceStore.set('light');
    expect(meta.content).toBe('#fff4ee');
    meta.remove();
  });
});
