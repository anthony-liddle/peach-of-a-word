// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { storeFromEnv, upstashStore } from './store.ts';

/** A fetch that answers each command in turn, and records what was sent. */
function fakeFetch(results: unknown[]) {
  const sent: { url: string; auth: string | null; body: unknown }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      auth: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json(results.shift());
  });
  return { fn: fn as unknown as typeof fetch, sent };
}

describe("the Upstash store, over Upstash's REST API", () => {
  it('sets a key only if absent, with its expiry, and reads the answer', async () => {
    const f = fakeFetch([{ result: 'OK' }, { result: null }]);
    const store = upstashStore('https://db.test', 'secret', f.fn);
    expect(await store.setIfAbsent('flag:x', '{}', 60)).toBe(true);
    expect(await store.setIfAbsent('flag:x', '{}', 60)).toBe(false);
    expect(f.sent[0]).toEqual({
      url: 'https://db.test',
      auth: 'Bearer secret',
      body: ['SET', 'flag:x', '{}', 'NX', 'EX', '60'],
    });
  });

  it('counts, and sets the expiry when the count starts', async () => {
    const f = fakeFetch([{ result: 1 }, { result: 1 }, { result: 2 }]);
    const store = upstashStore('https://db.test', 'secret', f.fn);
    expect(await store.increment('count:d', 172800)).toBe(1);
    expect(await store.increment('count:d', 172800)).toBe(2);
    expect(f.sent.map((s) => s.body)).toEqual([
      ['INCR', 'count:d'],
      ['EXPIRE', 'count:d', '172800'],
      ['INCR', 'count:d'],
    ]);
  });

  it('deletes keys in one command', async () => {
    const f = fakeFetch([{ result: 2 }]);
    const store = upstashStore('https://db.test', 'secret', f.fn);
    await store.remove(['flag:a', 'flag:b']);
    expect(f.sent[0]!.body).toEqual(['DEL', 'flag:a', 'flag:b']);
  });

  it('throws on an error answer, so the request can say try again', async () => {
    const f = fakeFetch([{ error: 'WRONGPASS' }]);
    const store = upstashStore('https://db.test', 'secret', f.fn);
    await expect(store.setIfAbsent('k', 'v', 1)).rejects.toThrow();
  });

  it('throws on an HTTP failure', async () => {
    const fn = vi.fn(async () => new Response('', { status: 500 }));
    const store = upstashStore(
      'https://db.test',
      'secret',
      fn as unknown as typeof fetch,
    );
    await expect(store.remove(['k'])).rejects.toThrow();
  });
});

describe('the store from the environment', () => {
  it("reads the Marketplace integration's names", () => {
    expect(
      storeFromEnv({
        KV_REST_API_URL: 'https://a.test',
        KV_REST_API_TOKEN: 't',
      }),
    ).not.toBeNull();
  });

  it("reads Upstash's own names too", () => {
    expect(
      storeFromEnv({
        UPSTASH_REDIS_REST_URL: 'https://a.test',
        UPSTASH_REDIS_REST_TOKEN: 't',
      }),
    ).not.toBeNull();
  });

  it('is missing when either half is missing, as on a preview', () => {
    expect(storeFromEnv({})).toBeNull();
    expect(storeFromEnv({ KV_REST_API_URL: 'https://a.test' })).toBeNull();
  });
});
