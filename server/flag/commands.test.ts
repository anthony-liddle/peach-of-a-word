// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleFlagRequest, type FlagDeps } from './handler.ts';
import { upstashStore } from './store.ts';
import { aFlag, del, post, testData } from './testing.ts';

/*
 * What a request costs in Upstash commands, measured, not estimated.
 *
 * Upstash bills by command, and the $2 budget is a million of them, so these
 * tests run the handler through the real `upstashStore` against a small fake
 * Redis behind Upstash's REST API. Each POST to it is one command, and each
 * is counted. Counting the store's methods instead would miss the EXPIRE
 * that `increment` sends when a day's count starts.
 *
 * Made-up board and words only, from testing.ts.
 */

/** A small Redis over Upstash's REST API that counts every command it gets. */
function fakeRedis() {
  const data = new Map<string, string>();
  const sent: string[] = [];
  const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
    const [cmd, key, ...rest] = JSON.parse(String(init?.body)) as string[];
    sent.push(cmd!);
    const k = key!;
    switch (cmd) {
      case 'SET': {
        if (rest.includes('NX') && data.has(k)) {
          return Response.json({ result: null });
        }
        data.set(k, rest[0]!);
        return Response.json({ result: 'OK' });
      }
      case 'INCR':
      case 'INCRBY': {
        const by = cmd === 'INCR' ? 1 : Number(rest[0]);
        const n = Number(data.get(k) ?? '0') + by;
        data.set(k, String(n));
        return Response.json({ result: n });
      }
      case 'EXPIRE':
        return Response.json({ result: data.has(k) ? 1 : 0 });
      case 'DEL': {
        let n = 0;
        for (const each of [k, ...rest]) if (data.delete(each)) n++;
        return Response.json({ result: n });
      }
      default:
        return Response.json({ error: `unknown command ${cmd}` });
    }
  };
  return {
    data,
    sent,
    store: upstashStore('https://db.test', 'secret', fetchFn as typeof fetch),
  };
}

const DAY = '2026-06-23';

/** `n` well-shaped flags that fit the made-up board, each with its own ID. */
function flags(n: number, from = 0, reason = 'definition') {
  return Array.from({ length: n }, (_, i) =>
    aFlag({
      id: `00000000-0000-4000-8000-${String(from + i).padStart(12, '0')}`,
      reason,
    }),
  );
}

function setup(over: Partial<FlagDeps> = {}) {
  const redis = fakeRedis();
  const notify = vi.fn(async (_text: string) => {});
  const deps: FlagDeps = {
    data: testData,
    store: redis.store,
    notify,
    now: () => new Date(`${DAY}T12:00:00Z`),
    ...over,
  };
  let next = 0;
  /** Sends one request and gives back what it cost, and its answer. */
  async function send(request: Request) {
    const before = redis.sent.length;
    const res = await handleFlagRequest(request, deps);
    return { status: res.status, commands: redis.sent.slice(before) };
  }
  /** A POST of `n` fresh flags. */
  const postFlags = (n: number, reason?: string) => {
    const body = { flags: flags(n, next, reason) };
    next += n;
    return send(post(body));
  };
  return { redis, notify, send, postFlags };
}

describe('what one request costs in store commands, below the daily cap', () => {
  it("costs 3 for the day's first request of 1 flag: the count, its expiry, the flag", async () => {
    const { postFlags } = setup();
    expect((await postFlags(1)).commands).toEqual(['INCRBY', 'EXPIRE', 'SET']);
  });

  it('costs 2 for a later request of 1 flag', async () => {
    const { postFlags } = setup();
    await postFlags(1);
    expect((await postFlags(1)).commands).toHaveLength(2);
  });

  it('costs 21 for a later request of 20 flags: one count for all, then each flag', async () => {
    const { postFlags } = setup();
    await postFlags(1);
    const { commands } = await postFlags(20);
    expect(commands).toHaveLength(21);
    expect(commands.filter((c) => c === 'INCRBY')).toHaveLength(1);
  });
});

describe('what one request costs in store commands, above the daily cap', () => {
  // The count is pushed past the cap by earlier requests first, so the
  // day's one EXPIRE is spent before anything here is measured.
  async function pastTheCap() {
    const t = setup({ cap: 25 });
    await t.postFlags(20);
    await t.postFlags(20);
    return t;
  }

  it('costs 1 for a request of 1 flag', async () => {
    const { postFlags } = await pastTheCap();
    expect((await postFlags(1)).commands).toEqual(['INCRBY']);
  });

  it('costs 1 for a request of 20 flags', async () => {
    const { postFlags } = await pastTheCap();
    expect((await postFlags(20)).commands).toEqual(['INCRBY']);
  });

  it.each([1, 2, 7, 20])(
    'costs at most one command for a request of %i, and stores none of it',
    async (n) => {
      const t = await pastTheCap();
      const stored = t.redis.data.size;
      const { status, commands } = await t.postFlags(n);
      expect(status).toBe(202);
      expect(commands.length).toBeLessThanOrEqual(1);
      expect(t.redis.data.size).toBe(stored);
    },
  );

  it('stores only the room left when one request crosses the cap', async () => {
    const t = setup({ cap: 25 });
    await t.postFlags(20);
    const { commands } = await t.postFlags(20);
    expect(commands.filter((c) => c === 'SET')).toHaveLength(5);
    expect(
      [...t.redis.data.keys()].filter((k) => k.startsWith('flag:')),
    ).toHaveLength(25);
  });
});

describe('what the other requests cost, for the budget', () => {
  it('costs an offensive flag what any flag costs, since it posts nothing', async () => {
    // It tried an hourly gate for "A word was flagged as offensive." until
    // that message went (Antoine, 24 November).
    const { postFlags } = setup();
    await postFlags(1);
    expect((await postFlags(1, 'offensive')).commands).toEqual([
      'INCRBY',
      'SET',
    ]);
  });

  it('costs 1 to take flags back, however many', async () => {
    const { send } = setup();
    const ids = flags(20).map((f) => f.id as string);
    expect((await send(del({ ids }))).commands).toEqual(['DEL']);
  });

  it('costs nothing for a flag off its board, a bad body or another method', async () => {
    const { send } = setup();
    const offBoard = await send(post({ flags: [aFlag({ word: 'sport' })] }));
    const bad = await send(post('not json'));
    const get = await send(
      new Request('https://example.test/api/flag', { method: 'GET' }),
    );
    expect([offBoard.status, bad.status, get.status]).toEqual([202, 400, 405]);
    expect([offBoard, bad, get].map((r) => r.commands.length)).toEqual([
      0, 0, 0,
    ]);
  });
});

describe('"Unusual number of flags today.", once, at the 200th', () => {
  const UNUSUAL = 'Unusual number of flags today.';

  it("posts it once, when the day's count reaches 200, and never again that day", async () => {
    const { postFlags, notify } = setup();
    for (let i = 0; i < 9; i++) await postFlags(20);
    expect(notify).not.toHaveBeenCalled();
    await postFlags(20);
    expect(notify.mock.calls).toEqual([[UNUSUAL]]);
    await postFlags(20);
    await postFlags(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('posts it when one request carries the count past 200', async () => {
    const { redis, postFlags, notify } = setup();
    redis.data.set(`count:${DAY}`, '190');
    await postFlags(20);
    expect(notify.mock.calls).toEqual([[UNUSUAL]]);
  });

  it('costs no command of its own: the request that crosses costs what any other does', async () => {
    const { redis, postFlags } = setup();
    redis.data.set(`count:${DAY}`, '190');
    const crossing = await postFlags(20);
    const after = await postFlags(20);
    expect(crossing.commands).toEqual(after.commands);
  });

  it('keeps the flags when the message fails', async () => {
    const { redis, postFlags } = setup({
      notify: async () => {
        throw new Error('webhook down');
      },
    });
    redis.data.set(`count:${DAY}`, '199');
    const { status } = await postFlags(1);
    expect(status).toBe(202);
    expect(
      [...redis.data.keys()].filter((k) => k.startsWith('flag:')),
    ).toHaveLength(1);
  });
});
