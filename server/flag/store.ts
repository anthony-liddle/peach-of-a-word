/**
 * Where flags are kept: Upstash Redis, from the Vercel Marketplace.
 *
 * Three operations are all the server needs, so this talks to Upstash's REST
 * API with fetch rather than taking on a client library: each call is one
 * Redis command sent as a JSON array. Tests use an in-memory store with the
 * same three methods.
 */
export interface FlagStore {
  /** SET key value NX EX ttl: true when the key was new and is now set. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** INCR, with the expiry set when the count starts. Returns the count. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** DEL every key named. Keys that aren't there are fine. */
  remove(keys: readonly string[]): Promise<void>;
}

export function upstashStore(
  url: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): FlagStore {
  async function command(args: (string | number)[]): Promise<unknown> {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args.map(String)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`store answered ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error !== undefined) throw new Error('store refused a command');
    return body.result;
  }

  return {
    async setIfAbsent(key, value, ttl) {
      return (await command(['SET', key, value, 'NX', 'EX', ttl])) === 'OK';
    },
    async increment(key, ttl) {
      const count = Number(await command(['INCR', key]));
      if (count === 1) await command(['EXPIRE', key, ttl]);
      return count;
    },
    async remove(keys) {
      if (keys.length > 0) await command(['DEL', ...keys]);
    },
  };
}

/**
 * The store, if this deployment has one. The Marketplace integration names its
 * variables KV_REST_API_*; Upstash's own are UPSTASH_REDIS_REST_*. Either
 * works. They are set for Production only, so a preview has none and answers
 * 503: no preview ever writes to the real store.
 */
export function storeFromEnv(
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
): FlagStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return upstashStore(url, token, fetchFn);
}
