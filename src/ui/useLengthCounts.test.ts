import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLengthCounts } from './useLengthCounts.ts';

/**
 * Word counts by length, as it's kept: on unless "off" is saved, under its
 * own key, which the privacy page names.
 */
describe('useLengthCounts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('e8-length-counts');
  });

  test('is on for a browser that has never set it', () => {
    const { result } = renderHook(() => useLengthCounts());
    expect(result.current[0]).toBe(true);
  });

  test('is off at the first render when off was saved', () => {
    localStorage.setItem('e8-length-counts', 'off');
    const { result } = renderHook(() => useLengthCounts());
    expect(result.current[0]).toBe(false);
  });

  test('keeps each choice under its own key', () => {
    const { result } = renderHook(() => useLengthCounts());
    act(() => result.current[1](false));
    expect(localStorage.getItem('e8-length-counts')).toBe('off');
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(localStorage.getItem('e8-length-counts')).toBe('on');
    expect(result.current[0]).toBe(true);
  });

  test('anything but off reads as on', () => {
    localStorage.setItem('e8-length-counts', 'nonsense');
    const { result } = renderHook(() => useLengthCounts());
    expect(result.current[0]).toBe(true);
  });

  test('still switches for the visit when storage refuses to keep it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useLengthCounts());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
