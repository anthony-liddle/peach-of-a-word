import { describe, expect, it, vi } from 'vitest';
import {
  FLAGS_KEY,
  MAX_WAITING,
  createFlags,
  type FlagsDeps,
  type NewFlag,
} from './flags.ts';

/*
 * The device's flags: the waiting list under `e8-flags`, and the sender.
 *
 * Every test hands in its own fetch, so nothing here reaches a network, and
 * the made-up words and racks are nobody's board.
 */

const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 6, 1, 12);

/** A localStorage stand-in. */
function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

type Answer = number | 'offline';

/** A fetch that answers with the statuses given, in turn, and records each call. */
function server(...answers: Answer[]) {
  // The body is whatever JSON the sender wrote; each test reads the fields it checks.
  type Body = {
    flags: Record<string, unknown>[];
    ids: string[];
  };
  const calls: {
    url: string;
    method: string;
    body: Body;
    keepalive: boolean;
  }[] = [];
  const next = [...answers];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: JSON.parse(String(init?.body)),
      keepalive: init?.keepalive === true,
    });
    const a = next.length > 1 ? next.shift()! : next[0]!;
    if (a === 'offline') throw new TypeError('Failed to fetch');
    return new Response(null, { status: a });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function setup(answers: Answer[] = [202], over: Partial<FlagsDeps> = {}) {
  const store = memory();
  const net = server(...answers);
  let now = T0;
  let n = 0;
  const flags = createFlags({
    storage: store,
    fetch: net.fn,
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    version: 'abc1234',
    ...over,
  });
  return {
    flags,
    store,
    net,
    later: (ms: number) => {
      now += ms;
    },
  };
}

const daily = (
  word: string,
  reason: NewFlag['reason'] = 'definition',
): NewFlag => ({
  word,
  reason,
  board: { day: '2026-07-01' },
});

describe('making a flag', () => {
  it('keeps one flag per word and reason', async () => {
    const { flags } = setup(['offline']);
    expect(await flags.flag(daily('zorp'))).toBe('made');
    expect(await flags.flag(daily('zorp'))).toBe('already');
    expect(await flags.flag(daily('zorp', 'offensive'))).toBe('made');
    expect(flags.list().map((f) => [f.word, f.reason])).toEqual([
      ['zorp', 'definition'],
      ['zorp', 'offensive'],
    ]);
  });

  it(`keeps at most ${MAX_WAITING} waiting, and says so`, async () => {
    const { flags } = setup(['offline']);
    for (let i = 0; i < MAX_WAITING; i++) {
      expect(
        await flags.flag(daily(`w${String.fromCharCode(97 + (i % 26))}${i}`)),
      ).toBe('made');
    }
    expect(flags.full()).toBe(true);
    expect(await flags.flag(daily('blick'))).toBe('full');
    expect(flags.list()).toHaveLength(MAX_WAITING);
  });

  it('saves the list under e8-flags, and reads it back after a reload', async () => {
    const { flags, store, net } = setup(['offline']);
    await flags.flag(daily('zorp'));
    expect(store.map.has(FLAGS_KEY)).toBe(true);
    const again = createFlags({
      storage: store,
      fetch: net.fn,
      now: () => T0,
      newId: () => 'x',
      version: 'abc1234',
    });
    expect(again.list().map((f) => f.word)).toEqual(['zorp']);
  });

  it('reads a damaged list as empty rather than failing', () => {
    const store = memory({ [FLAGS_KEY]: '{not json' });
    const flags = createFlags({
      storage: store,
      fetch: server(202).fn,
      now: () => T0,
      newId: () => 'x',
      version: 'abc1234',
    });
    expect(flags.list()).toEqual([]);
  });
});

describe('sending', () => {
  it('sends a flag the moment it is made, to this site only, with only the fields the server takes', async () => {
    const { flags, net } = setup([202]);
    await flags.flag(daily('zorp', 'rarer'));
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]).toMatchObject({
      url: '/api/flag',
      method: 'POST',
      keepalive: true,
    });
    expect(net.calls[0]!.body).toEqual({
      flags: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          word: 'zorp',
          day: '2026-07-01',
          reason: 'rarer',
          platform: 'web',
          version: 'abc1234',
        },
      ],
    });
    expect(flags.list()[0]!.state).toBe('sent');
  });

  it("sends Endless's rack and never a day", async () => {
    const { flags, net } = setup([202]);
    await flags.flag({
      word: 'zorp',
      reason: 'offensive',
      board: { rack: 'quazzorp' },
    });
    const sent = net.calls[0]!.body.flags[0]!;
    expect(sent.rack).toBe('quazzorp');
    expect('day' in sent).toBe(false);
  });

  it('sends what is waiting in batches of 20', async () => {
    // Each flag made offline tries once and stops at the first failure.
    const { flags, net, later } = setup([...Array(45).fill('offline'), 202]);
    for (let i = 0; i < 45; i++)
      await flags.flag(daily(`zo${String.fromCharCode(97 + (i % 26))}${i}`));
    later(11 * 60_000);
    net.calls.length = 0;
    await flags.send('online');
    expect(net.calls.map((c) => c.body.flags.length)).toEqual([20, 20, 5]);
    expect(flags.list().every((f) => f.state === 'sent')).toBe(true);
  });

  it.each([
    [403, 'the kill switch'],
    [429, 'the rate limit'],
    [500, 'a server error'],
    [503, 'no store'],
    ['offline' as const, 'no connection'],
  ])('keeps a flag waiting on %s (%s)', async (answer, _why) => {
    const { flags } = setup([answer]);
    await flags.flag(daily('zorp'));
    expect(flags.list()).toHaveLength(1);
    expect(flags.list()[0]!.state).toBe('waiting');
  });

  it.each([400, 413])(
    'drops a flag the server refuses with %i, quietly',
    async (status) => {
      const { flags } = setup([status]);
      await flags.flag(daily('zorp'));
      expect(flags.list()).toEqual([]);
    },
  );

  it('retries at most once every 10 minutes, but never holds back a flag just made', async () => {
    const { flags, net, later } = setup(['offline']);
    await flags.flag(daily('zorp'));
    expect(net.calls).toHaveLength(1);
    later(60_000);
    await flags.send('visible');
    await flags.send('online');
    expect(net.calls).toHaveLength(1);
    await flags.flag(daily('blick'));
    expect(net.calls).toHaveLength(2);
    later(10 * 60_000);
    await flags.send('load');
    expect(net.calls).toHaveLength(3);
  });
});

describe('sixty days', () => {
  it('drops a flag still waiting at 60 days, quietly', async () => {
    const { flags, later } = setup(['offline']);
    await flags.flag(daily('zorp'));
    later(59 * DAY_MS);
    await flags.send('load');
    expect(flags.list()).toHaveLength(1);
    later(1 * DAY_MS + 1);
    await flags.send('load');
    expect(flags.list()).toEqual([]);
  });

  it('keeps every flag under 60 days old in the list, sent or waiting', async () => {
    const { flags, later } = setup([202]);
    for (let i = 0; i < 60; i++) {
      await flags.flag(daily(`zo${String.fromCharCode(97 + (i % 26))}${i}`));
      later(DAY_MS / 2);
    }
    expect(flags.list()).toHaveLength(60);
  });
});

describe('taking a flag back', () => {
  it('takes back a flag that never went without telling the server', async () => {
    // Never tried: the browser said it was offline, so nothing went.
    const offlineFirst = setup(['offline'], { online: () => false });
    await offlineFirst.flags.flag(daily('zorp'));
    expect(offlineFirst.net.calls).toEqual([]);
    await offlineFirst.flags.takeBack(offlineFirst.flags.list()[0]!.id);
    expect(offlineFirst.flags.list()).toEqual([]);
    expect(offlineFirst.net.calls).toEqual([]);
  });

  it('takes back a sent flag from the server too', async () => {
    const { flags, net } = setup([202, 204]);
    await flags.flag(daily('zorp'));
    const id = flags.list()[0]!.id;
    await flags.takeBack(id);
    expect(flags.list()).toEqual([]);
    expect(net.calls[1]).toMatchObject({
      url: '/api/flag',
      method: 'DELETE',
      body: { ids: [id] },
    });
  });

  it('asks the server to forget a flag whose sending got no answer, since it may have arrived', async () => {
    const { flags, net, later } = setup(['offline', 'offline', 204]);
    await flags.flag(daily('zorp'));
    const id = flags.list()[0]!.id;
    await flags.takeBack(id);
    expect(flags.list()).toEqual([]);
    later(11 * 60_000);
    await flags.send('online');
    expect(net.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      body: { ids: [id] },
    });
  });

  it('keeps a take-back made offline, and sends it with the flags once back', async () => {
    const { flags, net, later } = setup([202, 'offline', 202, 204]);
    await flags.flag(daily('zorp'));
    const id = flags.list()[0]!.id;
    await flags.takeBack(id);
    expect(net.calls.at(-1)!.method).toBe('DELETE');
    later(11 * 60_000);
    await flags.flag(daily('blick'));
    const methods = net.calls.slice(2).map((c) => c.method);
    expect(methods).toEqual(['POST', 'DELETE']);
    expect(net.calls.at(-1)!.body).toEqual({ ids: [id] });
  });
});

describe('sixty days from when the server took it', () => {
  it('keeps a flag that waited before it went, and lets it be taken back, 60 days from its sending', async () => {
    const { flags, net, later } = setup(['offline', 202, 204]);
    await flags.flag(daily('zorp'));
    later(10 * DAY_MS);
    await flags.send('load');
    expect(flags.list()[0]!.state).toBe('sent');
    later(55 * DAY_MS);
    await flags.send('load');
    expect(flags.list()).toHaveLength(1);
    await flags.takeBack(flags.list()[0]!.id);
    expect(net.calls.at(-1)).toMatchObject({ method: 'DELETE' });
  });

  it('still asks the server to forget a flag last tried on day 59, on day 61', async () => {
    const { flags, net, later } = setup(['offline', 'offline', 'offline', 204]);
    await flags.flag(daily('zorp'));
    later(59 * DAY_MS);
    await flags.send('load');
    const id = flags.list()[0]!.id;
    await flags.takeBack(id);
    later(2 * DAY_MS);
    const before = net.calls.length;
    await flags.send('load');
    expect(net.calls.slice(before)).toMatchObject([
      { method: 'DELETE', body: { ids: [id] } },
    ]);
  });
});

describe('two tabs, one list', () => {
  it("keeps both tabs' flags, and either tab can take back the other's", async () => {
    const store = memory();
    const net = server(202, 204);
    let n = 0;
    const tab = () =>
      createFlags({
        storage: store,
        fetch: net.fn,
        now: () => T0,
        newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
        version: 'abc1234',
      });
    const a = tab();
    const b = tab();
    await a.flag(daily('zorp'));
    await b.flag(daily('grelt'));
    expect(b.list().map((f) => f.word)).toEqual(['zorp', 'grelt']);
    expect(JSON.parse(store.map.get(FLAGS_KEY)!).flags).toHaveLength(2);
    const grelt = b.list()[1]!.id;
    await a.takeBack(grelt);
    expect(b.refresh()).toBeUndefined();
    expect(b.list().map((f) => f.word)).toEqual(['zorp']);
  });
});

describe('the size of a request', () => {
  it("keeps 20 of the longest flags under the server's 4 KB", async () => {
    const { flags, net } = setup(
      ['offline', ...Array(19).fill('offline'), 'offline'],
      {
        version: 'abcdefg',
        online: () => false,
      },
    );
    for (let i = 0; i < 20; i++) {
      await flags.flag({
        word: `abcdefg${String.fromCharCode(97 + i)}`,
        reason: 'should-count',
        board: { rack: 'abcdefgh' },
      });
    }
    expect(net.calls).toEqual([]);
    const body = JSON.stringify({
      flags: flags.list().map((f) => ({
        id: f.id,
        word: f.word,
        ...f.board,
        reason: f.reason,
        platform: 'web',
        version: 'abcdefg',
      })),
    });
    expect(new TextEncoder().encode(body).length).toBeLessThan(4096);
  });
});
