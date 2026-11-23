import type { FlagReason } from './model.ts';

/**
 * This device's flags: the list under `e8-flags`, and the sender.
 *
 * **Where a flag goes.** To `/api/flag` on this same site, never to a full
 * address. A preview has no store and answers 503, and the dev server has no
 * function at all, so neither can reach the live store; both leave the flag
 * waiting.
 *
 * **What a flag is dropped for.** Only two things, and quietly:
 * - the server refusing its shape, a 400 or a 413, since it will never be
 *   taken;
 * - 60 days without going, so nothing waits forever.
 *
 * Anything else keeps it waiting: a 403 is the kill switch, a 429 the rate
 * limit, a 5xx or no connection a server or a network that will come back.
 *
 * **Taking one back.** A flag that never went leaves the device only. One
 * whose POST went out, answered or not, may be on the server, so the device
 * asks the server to forget it too, and keeps asking until it has: the
 * privacy page promises a take-back for 60 days.
 *
 * **When it sends:** the moment a flag is made or taken back, and on page
 * load, on `online` and when the tab is visible again, those three no more
 * than once every 10 minutes. `keepalive`, so a flag made just before the tab
 * closes still goes.
 */

export const FLAGS_KEY = 'e8-flags';
/** At most this many wait at once; the card says so in place of its flag. */
export const MAX_WAITING = 50;
/** How long a flag lasts, on the server and here. */
export const KEEP_DAYS = 60;
const DAY_MS = 86_400_000;
const RETRY_MS = 10 * 60_000;
const BATCH = 20;
const ENDPOINT = '/api/flag';

/** A daily board names its day; the web's Endless names its rack. */
export type Board = { day: string } | { rack: string };

export interface NewFlag {
  word: string;
  reason: FlagReason;
  board: Board;
}

export interface Flag {
  id: string;
  word: string;
  reason: FlagReason;
  board: Board;
  /** When it was made, in milliseconds. Its 60 days count from here. */
  madeAt: number;
  state: 'waiting' | 'sent';
  /** A POST carrying it went out, answered or not. */
  tried: boolean;
}

interface Saved {
  version: 1;
  flags: Flag[];
  /** Flags taken back that the server may hold, to ask it to forget. */
  forget: { id: string; madeAt: number }[];
  lastTry: number | null;
}

export interface FlagsDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  fetch: typeof fetch;
  now: () => number;
  newId: () => string;
  /** The web's build, sent as the flag's version. */
  version: string;
  /** Whether the browser thinks it's online. Absent, it's assumed to be. */
  online?: () => boolean;
}

export type SendReason = 'made' | 'load' | 'online' | 'visible';

const empty = (): Saved => ({
  version: 1,
  flags: [],
  forget: [],
  lastTry: null,
});

function isFlag(f: unknown): f is Flag {
  const x = f as Flag;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof x.id === 'string' &&
    typeof x.word === 'string' &&
    typeof x.reason === 'string' &&
    typeof x.madeAt === 'number' &&
    (x.state === 'waiting' || x.state === 'sent') &&
    typeof x.tried === 'boolean' &&
    typeof x.board === 'object' &&
    x.board !== null
  );
}

function read(storage: FlagsDeps['storage']): Saved {
  try {
    const raw = storage.getItem(FLAGS_KEY);
    if (!raw) return empty();
    const v = JSON.parse(raw) as Partial<Saved>;
    if (v?.version !== 1 || !Array.isArray(v.flags)) return empty();
    return {
      version: 1,
      flags: v.flags.filter(isFlag),
      forget: Array.isArray(v.forget)
        ? v.forget.filter(
            (f) => typeof f?.id === 'string' && typeof f?.madeAt === 'number',
          )
        : [],
      lastTry: typeof v.lastTry === 'number' ? v.lastTry : null,
    };
  } catch {
    return empty();
  }
}

/** The flag as the server takes it: these fields and no others. */
function wire(f: Flag, version: string) {
  return {
    id: f.id,
    word: f.word,
    ...f.board,
    reason: f.reason,
    platform: 'web' as const,
    version,
  };
}

export function createFlags(deps: FlagsDeps) {
  let saved = read(deps.storage);
  const listeners = new Set<() => void>();
  let sending: Promise<void> | null = null;
  let again = false;

  const isOld = (madeAt: number) => deps.now() - madeAt > KEEP_DAYS * DAY_MS;

  function commit(next: Saved) {
    saved = next;
    try {
      deps.storage.setItem(FLAGS_KEY, JSON.stringify(saved));
    } catch {
      // Storage full or denied: the list lives for this page only.
    }
    listeners.forEach((l) => l());
  }

  function prune() {
    if (
      saved.flags.some((f) => isOld(f.madeAt)) ||
      saved.forget.some((f) => isOld(f.madeAt))
    ) {
      commit({
        ...saved,
        flags: saved.flags.filter((f) => !isOld(f.madeAt)),
        forget: saved.forget.filter((f) => !isOld(f.madeAt)),
      });
    }
  }

  async function call(method: 'POST' | 'DELETE', body: unknown) {
    try {
      const res = await deps.fetch(ENDPOINT, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      });
      return res.status;
    } catch {
      return null;
    }
  }

  /** One pass over everything waiting. Stops at the first answer that means later. */
  async function pass() {
    prune();
    for (;;) {
      const batch = saved.flags
        .filter((f) => f.state === 'waiting')
        .slice(0, BATCH);
      if (batch.length === 0) break;
      const ids = new Set(batch.map((f) => f.id));
      // Marked before it goes, so a page closed mid-request still counts it
      // as possibly on the server.
      commit({
        ...saved,
        flags: saved.flags.map((f) =>
          ids.has(f.id) ? { ...f, tried: true } : f,
        ),
      });
      const status = await call('POST', {
        flags: batch.map((f) => wire(f, deps.version)),
      });
      if (status === 202) {
        commit({
          ...saved,
          flags: saved.flags.map((f) =>
            ids.has(f.id) ? { ...f, state: 'sent' } : f,
          ),
        });
      } else if (status === 400 || status === 413) {
        commit({ ...saved, flags: saved.flags.filter((f) => !ids.has(f.id)) });
      } else {
        return;
      }
    }
    for (;;) {
      const batch = saved.forget.slice(0, BATCH);
      if (batch.length === 0) break;
      const ids = new Set(batch.map((f) => f.id));
      const status = await call('DELETE', { ids: [...ids] });
      if (status === 204 || status === 400 || status === 413) {
        commit({
          ...saved,
          forget: saved.forget.filter((f) => !ids.has(f.id)),
        });
      } else {
        return;
      }
    }
  }

  /**
   * Sends what's waiting. A flag just made or taken back goes at once; the
   * other moments retry no more than once every 10 minutes.
   */
  async function send(why: SendReason): Promise<void> {
    prune();
    const pending =
      saved.flags.some((f) => f.state === 'waiting') || saved.forget.length > 0;
    if (!pending) return;
    if (deps.online && !deps.online()) return;
    const urgent = why === 'made';
    if (
      !urgent &&
      saved.lastTry !== null &&
      deps.now() - saved.lastTry < RETRY_MS
    ) {
      return;
    }
    if (sending) {
      again = true;
      return sending;
    }
    commit({ ...saved, lastTry: deps.now() });
    sending = pass().finally(() => {
      sending = null;
    });
    await sending;
    if (again) {
      again = false;
      await send('made');
    }
  }

  return {
    /** The flags this device has made in the last 60 days, oldest first. */
    list(): readonly Flag[] {
      return saved.flags.filter((f) => !isOld(f.madeAt));
    },

    /** Whether the waiting list is at its cap, so the card's flag gives way. */
    full(): boolean {
      return (
        saved.flags.filter((f) => f.state === 'waiting').length >= MAX_WAITING
      );
    },

    async flag(input: NewFlag): Promise<'made' | 'already' | 'full'> {
      prune();
      if (
        saved.flags.some(
          (f) => f.word === input.word && f.reason === input.reason,
        )
      ) {
        return 'already';
      }
      if (this.full()) return 'full';
      commit({
        ...saved,
        flags: [
          ...saved.flags,
          {
            id: deps.newId(),
            word: input.word,
            reason: input.reason,
            board: input.board,
            madeAt: deps.now(),
            state: 'waiting',
            tried: false,
          },
        ],
      });
      await send('made');
      return 'made';
    },

    async takeBack(id: string): Promise<void> {
      const f = saved.flags.find((x) => x.id === id);
      if (!f) return;
      commit({
        ...saved,
        flags: saved.flags.filter((x) => x.id !== id),
        forget: f.tried
          ? [...saved.forget, { id, madeAt: f.madeAt }]
          : saved.forget,
      });
      if (f.tried) await send('made');
    },

    send,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Flags = ReturnType<typeof createFlags>;
