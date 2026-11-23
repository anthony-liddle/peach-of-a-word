// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFlagRequest, type FlagDeps } from './handler.ts';
import { ID, ID2, MemoryStore, aFlag, del, post, testData } from './testing.ts';

const SIXTY_DAYS = 60 * 24 * 60 * 60;

function deps(over: Partial<FlagDeps> = {}) {
  const store = new MemoryStore();
  const notify = vi.fn(async (_text: string) => {});
  const d: FlagDeps = {
    data: testData,
    store,
    notify,
    now: () => new Date('2026-06-23T12:00:00Z'),
    ...over,
  };
  return { d, store: d.store as MemoryStore, notify };
}

async function send(body: unknown, over: Partial<FlagDeps> = {}) {
  const t = deps(over);
  const res = await handleFlagRequest(post({ flags: [body] }), t.d);
  return { ...t, res };
}

describe('POST /api/flag, storing', () => {
  it('stores a valid flag under its ID and answers 202', async () => {
    const { res, store } = await send(aFlag());
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toEqual([`flag:${ID}`]);
    const saved = JSON.parse(store.values.get(`flag:${ID}`)!);
    expect(saved).toEqual({
      id: ID,
      word: 'bad',
      day: '2026-06-23',
      reason: 'definition',
      platform: 'web',
      version: '1.0.0',
      arrived: '2026-06-23',
    });
  });

  it('a retry with the same ID stores one flag', async () => {
    const t = deps();
    const body = { flags: [aFlag()] };
    await handleFlagRequest(post(body), t.d);
    const again = await handleFlagRequest(post(body), t.d);
    expect(again.status).toBe(202);
    expect(t.store.flagKeys()).toHaveLength(1);
  });

  it("stores an app's upper-case ID under the lower-case key", async () => {
    const { store } = await send(aFlag({ id: ID.toUpperCase() }));
    expect(store.flagKeys()).toEqual([`flag:${ID}`]);
  });

  it('keeps a flag made today on a June board for 60 days from today', async () => {
    const { res, store } = await send(aFlag(), {
      now: () => new Date('2026-11-21T09:00:00Z'),
    });
    expect(res.status).toBe(202);
    expect(store.ttls.get(`flag:${ID}`)).toBe(SIXTY_DAYS);
    expect(JSON.parse(store.values.get(`flag:${ID}`)!).arrived).toBe(
      '2026-11-21',
    );
  });

  it('stores a batch of several flags, each on its own key', async () => {
    const t = deps();
    const res = await handleFlagRequest(
      post({ flags: [aFlag(), aFlag({ id: ID2, word: 'hide' })] }),
      t.d,
    );
    expect(res.status).toBe(202);
    expect(t.store.flagKeys().sort()).toEqual([`flag:${ID}`, `flag:${ID2}`]);
  });
});

describe('POST /api/flag, which reasons fit which word', () => {
  // Day 2026-06-23's made-up long word is abdeghil. `bad` is accepted, `dab`
  // is spelled from it and refused, and the long word is its own card.
  const cases: [string, string, boolean][] = [
    ['bad', 'not-a-word', true],
    ['bad', 'offensive', true],
    ['bad', 'definition', true],
    ['bad', 'should-count', false],
    ['abdeghil', 'offensive', true],
    ['abdeghil', 'definition', true],
    ['abdeghil', 'not-a-word', false],
    ['dab', 'should-count', true],
    ['dab', 'offensive', false],
    ['dab', 'definition', false],
    ['dab', 'not-a-word', false],
  ];
  it.each(cases)('%s flagged %s is stored: %s', async (word, reason, kept) => {
    const { res, store } = await send(aFlag({ word, reason }));
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toHaveLength(kept ? 1 : 0);
  });

  describe('a grade the player disagrees with, rarer or more common', () => {
    it.each(['rarer', 'more-common'])(
      'stores an accepted word that is not the long word, flagged %s',
      async (reason) => {
        const { res, store } = await send(aFlag({ reason }));
        expect(res.status).toBe(202);
        expect(store.flagKeys()).toEqual([`flag:${ID}`]);
        expect(JSON.parse(store.values.get(`flag:${ID}`)!).reason).toBe(reason);
      },
    );

    // Nothing at all is written for these, not even the day's count: the
    // peach has no grade, and a refused word has none to disagree with.
    const dropped: [string, Record<string, unknown>][] = [
      ["the day's long word", { word: 'abdeghil' }],
      [
        "an Endless rack's long word",
        { day: undefined, rack: 'mnoprstu', word: 'mnoprstu' },
      ],
      ['a refused word', { word: 'dab' }],
    ];
    for (const reason of ['rarer', 'more-common']) {
      it.each(dropped)(
        `drops %s flagged ${reason}: 202, and the store untouched`,
        async (_name, over) => {
          const { res, store } = await send(aFlag({ ...over, reason }));
          expect(res.status).toBe(202);
          expect(store.values.size).toBe(0);
        },
      );
    }

    it('never sends the offensive message for a grade', async () => {
      const { notify } = await send(aFlag({ reason: 'rarer' }));
      expect(notify).not.toHaveBeenCalled();
    });
  });

  it("drops a word the board's letters can't spell, and still answers 202", async () => {
    const { res, store } = await send(aFlag({ word: 'sport' }));
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toHaveLength(0);
  });

  it('drops a refused word on a deny row like a stored one: 202, nothing kept, no message', async () => {
    const { res, store, notify } = await send(
      aFlag({ word: 'hag', reason: 'should-count' }),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    expect(store.values.size).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("checks an Endless flag against its rack's letters", async () => {
    const kept = await send(
      aFlag({ day: undefined, rack: 'mnoprstu', word: 'sport' }),
    );
    expect(kept.store.flagKeys()).toHaveLength(1);
    expect(JSON.parse(kept.store.values.get(`flag:${ID}`)!).rack).toBe(
      'mnoprstu',
    );
    const offRack = await send(
      aFlag({ day: undefined, rack: 'mnoprstu', word: 'bad' }),
    );
    expect(offRack.store.flagKeys()).toHaveLength(0);
  });

  it("drops an Endless flag whose rack isn't one of the calendar's long words", async () => {
    const { res, store } = await send(
      aFlag({ day: undefined, rack: 'zzzzzzzz', word: 'bad' }),
    );
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toHaveLength(0);
  });

  it("past the day's cap, stores nothing and still answers 202", async () => {
    const t = deps({ cap: 2 });
    for (const id of [ID, ID2, 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d']) {
      const res = await handleFlagRequest(
        post({ flags: [aFlag({ id })] }),
        t.d,
      );
      expect(res.status).toBe(202);
    }
    expect(t.store.flagKeys()).toHaveLength(2);
    expect(t.store.ttls.get('count:2026-06-23')).toBe(2 * 24 * 60 * 60);
  });
});

describe('POST /api/flag, refusing the shape', () => {
  const bad: [string, unknown][] = [
    ['not JSON', 'not json'],
    ['no flags list', { word: 'bad' }],
    ['an empty list', { flags: [] }],
    ['21 flags', { flags: Array.from({ length: 21 }, () => aFlag()) }],
    ['an ID that is not a UUID', { flags: [aFlag({ id: '12345' })] }],
    ['a word too short', { flags: [aFlag({ word: 'ab' })] }],
    ['a word too long', { flags: [aFlag({ word: 'abdeghilm' })] }],
    ['a word with capitals', { flags: [aFlag({ word: 'Bad' })] }],
    ['an unknown reason', { flags: [aFlag({ reason: 'strange-origin' })] }],
    ['both day and rack', { flags: [aFlag({ rack: 'mnoprstu' })] }],
    ['neither day nor rack', { flags: [aFlag({ day: undefined })] }],
    ['a malformed day', { flags: [aFlag({ day: '2026-6-23' })] }],
    ['a day that does not exist', { flags: [aFlag({ day: '2026-06-31' })] }],
    ['a day before the first board', { flags: [aFlag({ day: '2026-06-22' })] }],
    ['a day after tomorrow', { flags: [aFlag({ day: '2026-06-25' })] }],
    [
      'a rack that is not eight letters',
      { flags: [aFlag({ day: undefined, rack: 'abc' })] },
    ],
    ['another platform', { flags: [aFlag({ platform: 'android' })] }],
    ['a version with markup', { flags: [aFlag({ version: '<b>1</b>' })] }],
    ['a field nobody sends', { flags: [aFlag({ note: 'hello' })] }],
  ];
  it.each(bad)(
    'answers 400 for %s, and stores nothing',
    async (_name, body) => {
      const t = deps();
      const res = await handleFlagRequest(post(body), t.d);
      expect(res.status).toBe(400);
      expect(t.store.values.size).toBe(0);
    },
  );

  it("accepts tomorrow's board, for a player already past midnight", async () => {
    const { res, store } = await send(
      aFlag({ day: '2026-06-24', word: 'sport' }),
    );
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toHaveLength(1);
  });

  it('refuses a body over 4 KB by its length, before reading it', async () => {
    const t = deps();
    const req = post({ flags: [aFlag()] }, { 'content-length': '5000' });
    const res = await handleFlagRequest(req, t.d);
    expect(res.status).toBe(413);
    expect(t.store.values.size).toBe(0);
  });

  it('refuses a body over 4 KB that gives no length', async () => {
    const t = deps();
    const big = JSON.stringify({
      flags: [aFlag({ version: 'x'.repeat(5000) })],
    });
    const res = await handleFlagRequest(post(big), t.d);
    expect(res.status).toBe(413);
  });
});

describe('POST /api/flag, when the store is missing or down', () => {
  it('answers 503 to a valid flag when no store is set up', async () => {
    const t = deps({ store: null });
    const res = await handleFlagRequest(post({ flags: [aFlag()] }), t.d);
    expect(res.status).toBe(503);
  });

  it('still answers 400 to a bad body when no store is set up', async () => {
    const t = deps({ store: null });
    const res = await handleFlagRequest(post('nope'), t.d);
    expect(res.status).toBe(400);
  });

  it('answers 503 when the store fails, so the device tries again', async () => {
    const t = deps();
    t.store.failing = true;
    const res = await handleFlagRequest(post({ flags: [aFlag()] }), t.d);
    expect(res.status).toBe(503);
  });
});

describe('POST /api/flag, the offensive notification', () => {
  const offensive = (id = ID) => aFlag({ id, reason: 'offensive' });

  it('sends one message that names no word', async () => {
    const { notify } = await send(offensive());
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('A word was flagged as offensive.');
  });

  it('sends at most one an hour', async () => {
    const t = deps();
    await handleFlagRequest(post({ flags: [offensive()] }), t.d);
    await handleFlagRequest(post({ flags: [offensive(ID2)] }), t.d);
    expect(t.notify).toHaveBeenCalledTimes(1);
    expect(t.store.ttls.get('notify:offensive')).toBe(60 * 60);
  });

  it('sends nothing for any other reason', async () => {
    const { notify } = await send(aFlag({ reason: 'not-a-word' }));
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps the flag when the message fails', async () => {
    const notify = vi.fn(async () => {
      throw new Error('discord down');
    });
    const { res, store } = await send(offensive(), { notify });
    expect(res.status).toBe(202);
    expect(store.flagKeys()).toHaveLength(1);
  });
});

describe('DELETE /api/flag, taking flags back', () => {
  it('deletes the flags named and answers 204', async () => {
    const t = deps();
    await handleFlagRequest(
      post({ flags: [aFlag(), aFlag({ id: ID2, word: 'hide' })] }),
      t.d,
    );
    const res = await handleFlagRequest(del({ ids: [ID] }), t.d);
    expect(res.status).toBe(204);
    expect(t.store.flagKeys()).toEqual([`flag:${ID2}`]);
  });

  it('answers the same 204 for an ID it never held', async () => {
    const t = deps();
    const res = await handleFlagRequest(del({ ids: [ID] }), t.d);
    expect(res.status).toBe(204);
  });

  it("takes back an app's upper-case ID", async () => {
    const t = deps();
    await handleFlagRequest(post({ flags: [aFlag()] }), t.d);
    await handleFlagRequest(del({ ids: [ID.toUpperCase()] }), t.d);
    expect(t.store.flagKeys()).toHaveLength(0);
  });

  const bad: [string, unknown][] = [
    ['not JSON', '{'],
    ['no ids', {}],
    ['an empty list', { ids: [] }],
    ['an ID that is not a UUID', { ids: ['flag:*'] }],
    ['21 IDs', { ids: Array.from({ length: 21 }, () => ID) }],
  ];
  it.each(bad)('answers 400 for %s', async (_name, body) => {
    const t = deps();
    const res = await handleFlagRequest(del(body), t.d);
    expect(res.status).toBe(400);
  });

  it('answers 503 when no store is set up', async () => {
    const t = deps({ store: null });
    const res = await handleFlagRequest(del({ ids: [ID] }), t.d);
    expect(res.status).toBe(503);
  });
});

describe('/api/flag, everything else', () => {
  it('answers 405 to any other method', async () => {
    const t = deps();
    const res = await handleFlagRequest(
      new Request('https://example.test/api/flag'),
      t.d,
    );
    expect(res.status).toBe(405);
  });

  describe('logs nothing from a request', () => {
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    beforeEach(() => {
      for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        spies.push(vi.spyOn(console, m).mockImplementation(() => {}));
      }
    });
    afterEach(() => {
      spies.splice(0).forEach((s) => s.mockRestore());
    });

    it('stays quiet on success, refusal and failure alike', async () => {
      const t = deps();
      await handleFlagRequest(
        post({ flags: [aFlag({ reason: 'offensive' })] }),
        t.d,
      );
      await handleFlagRequest(post('not json'), t.d);
      t.store.failing = true;
      await handleFlagRequest(post({ flags: [aFlag()] }), t.d);
      await handleFlagRequest(del({ ids: [ID] }), t.d);
      for (const s of spies) expect(s).not.toHaveBeenCalled();
    });
  });
});
