import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setPointer } from '@/testing/viewport.ts';
import { COPY_CONFIRMATION, shareDaily } from './shareDaily.ts';

const BLOCK = '🍑 Peach of a Word · Jun 18\nPeachy Keen Supreme\n226 pts';

describe('shareDaily', () => {
  let originalShare: unknown;
  let originalClipboard: unknown;

  beforeEach(() => {
    originalShare = (navigator as { share?: unknown }).share;
    originalClipboard = (navigator as { clipboard?: unknown }).clipboard;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function setShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
    Object.defineProperty(navigator, 'share', {
      value: fn,
      configurable: true,
    });
  }

  function setClipboard(write: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    });
  }

  test('copies on a computer, even when the browser offers a share sheet', async () => {
    // Chrome and Safari on a Mac, and Chrome and Edge on Windows, all have
    // navigator.share. On a computer the game copies anyway.
    setPointer('fine');
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const result = await shareDaily(BLOCK);

    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(BLOCK);
    expect(result).toEqual({
      method: 'clipboard',
      confirmation: COPY_CONFIRMATION,
    });
  });

  test('keeps the share sheet on a phone or a tablet', async () => {
    setPointer('coarse');
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const result = await shareDaily(BLOCK);

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(result.method).toBe('share');
  });

  test('calls the Web Share API when present', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const result = await shareDaily(BLOCK);

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(result.method).toBe('share');
  });

  test('shares plain text only, with no link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    await shareDaily(BLOCK);

    const payload = share.mock.calls[0]![0] as ShareData;
    expect(payload.text).toBe(BLOCK);
    expect(payload.url).toBeUndefined();
    expect(payload.title).toBeUndefined();
  });

  test('falls back to clipboard when the share sheet is unavailable', async () => {
    setShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    const result = await shareDaily(BLOCK);

    expect(writeText).toHaveBeenCalledWith(BLOCK);
    expect(result.method).toBe('clipboard');
    if (result.method !== 'clipboard') throw new Error('expected clipboard');
    expect(result.confirmation).toBe(COPY_CONFIRMATION);
  });

  test('the copy confirmation is the exact, approved copy', () => {
    expect(COPY_CONFIRMATION).toBe('Copied. Paste it anywhere.');
  });
});
