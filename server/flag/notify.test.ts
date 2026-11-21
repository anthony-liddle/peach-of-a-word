// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { notifierFromEnv } from './notify.ts';

describe('the offensive notification, to Discord', () => {
  it("posts the text as a webhook message's content", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }));
    const notify = notifierFromEnv(
      { FLAG_DISCORD_WEBHOOK_URL: 'https://discord.test/hook' },
      fn as unknown as typeof fetch,
    );
    await notify!('A word was flagged as offensive.');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://discord.test/hook');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      content: 'A word was flagged as offensive.',
    });
  });

  it('throws when Discord refuses, so the caller can let it go', async () => {
    const fn = vi.fn(async () => new Response(null, { status: 500 }));
    const notify = notifierFromEnv(
      { FLAG_DISCORD_WEBHOOK_URL: 'https://discord.test/hook' },
      fn as unknown as typeof fetch,
    );
    await expect(notify!('x')).rejects.toThrow();
  });

  it('is missing when no webhook is set, as on a preview', () => {
    expect(notifierFromEnv({})).toBeNull();
  });
});
