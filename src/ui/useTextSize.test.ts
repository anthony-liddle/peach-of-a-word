import { afterEach, describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_TEXT_SIZE,
  nextTextSize,
  resolveTextSize,
  useTextSize,
} from './useTextSize.ts';

/**
 * The step a visitor lands on with no saved preference. Regular means no root
 * override at all, so the browser's own default font size rules alone. The
 * pre-paint script in index.html only sets the attribute for the larger steps,
 * and both sides must agree so a fresh load never flashes a size.
 */
describe('DEFAULT_TEXT_SIZE', () => {
  test('is regular', () => {
    expect(DEFAULT_TEXT_SIZE).toBe('regular');
  });
});

describe('resolveTextSize', () => {
  test('saved steps resolve to themselves', () => {
    expect(resolveTextSize('regular')).toBe('regular');
    expect(resolveTextSize('large')).toBe('large');
    expect(resolveTextSize('largest')).toBe('largest');
  });

  test('no preference resolves to the default', () => {
    expect(resolveTextSize(undefined)).toBe('regular');
    expect(resolveTextSize(null)).toBe('regular');
  });

  test('an unknown value resolves to the default, never a broken size', () => {
    expect(resolveTextSize('')).toBe('regular');
    expect(resolveTextSize('42px')).toBe('regular');
  });
});

describe('nextTextSize', () => {
  test('cycles regular to large to largest and back around', () => {
    expect(nextTextSize('regular')).toBe('large');
    expect(nextTextSize('large')).toBe('largest');
    expect(nextTextSize('largest')).toBe('regular');
  });
});

describe('useTextSize', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-text-size');
    localStorage.removeItem('e8-text-size');
  });

  test('setting a step applies the root attribute and persists', () => {
    const { result } = renderHook(() => useTextSize());

    act(() => result.current[1]('large'));
    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(localStorage.getItem('e8-text-size')).toBe('large');
    expect(result.current[0]).toBe('large');

    act(() => result.current[1]('largest'));
    expect(document.documentElement.dataset.textSize).toBe('largest');
    expect(localStorage.getItem('e8-text-size')).toBe('largest');
  });

  test('returning to regular removes the override entirely', () => {
    const { result } = renderHook(() => useTextSize());

    act(() => result.current[1]('large'));
    act(() => result.current[1]('regular'));
    // No attribute at all: the browser default rules alone, exactly like a
    // visitor who never touched the control.
    expect(document.documentElement.dataset.textSize).toBeUndefined();
    expect(localStorage.getItem('e8-text-size')).toBe('regular');
    expect(result.current[0]).toBe('regular');
  });
});
