import { DAILY_EPOCH } from '@/engine/config.ts';
import type { FlagReason } from './model.ts';
import { checkFlag, epochDay, MAX_PER_REQUEST } from './wire.ts';

/**
 * This device's flags: the list under `e8-flags`, and the sender.
 *
 * **Where a flag goes.** To `/api/flag` on this same site, never to a full
 * address. A preview has no store and answers 503, and the dev server has no
 * function at all, so neither can reach the live store; both leave the flag
 * waiting.
 *
 * **What a flag is dropped for.** Only these, and quietly:
 * - failing the server's own shape check, `src/flags/wire.ts`, run here on
 *   each waiting flag before a batch is made, so a corrupt flag in
 *   `e8-flags` goes alone and never takes good flags down with it;
 * - the server refusing a batch's shape anyway, a 400 or a 413, since it will
 *   never be taken. After the check above, that means a page left open since
 *   an older build, whose check the server no longer shares;
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
const BATCH = MAX_PER_REQUEST;
/** The first day a board can name, as the server counts it. */
const FIRST_DAY = epochDay(DAILY_EPOCH);
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
  /** When it was made, in milliseconds. A waiting flag's 60 days count from here. */
  madeAt: number;
  state: 'waiting' | 'sent';
  /** A POST carrying it went out, answered or not. */
  tried: boolean;
  /** When a POST carrying it last went out. */
  triedAt?: number;
  /** When the server took it. A sent flag's 60 days count from here, as the server's do. */
  sentAt?: number;
}

interface Saved {
  version: 1;
  flags: Flag[];
  /**
   * Flags taken back that the server may hold, to ask it to forget, each from
   * when it may have reached the server: its sending, or its last attempt.
   */
  forget: { id: string; since: number }[];
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
            (f) => typeof f?.id === 'string' && typeof f?.since === 'number',
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

/** Where a flag's 60 days start: its sending once sent, its making until then. */
const startOf = (f: Flag) =>
  f.state === 'sent' ? (f.sentAt ?? f.madeAt) : f.madeAt;

/**
 * TWO TABS SHARE ONE LIST. Every change reads `e8-flags` again first and
 * writes the result, so a tab never writes back a list older than another
 * tab's last change; `refresh` brings a tab's view up to date when the other
 * writes (the page listens for `storage`).
 */
export function createFlags(deps: FlagsDeps) {
  let saved = read(deps.storage);
  const listeners = new Set<() => void>();
  let sending: Promise<void> | null = null;
  let again = false;

  const isOld = (start: number) => deps.now() - start > KEEP_DAYS * DAY_MS;
  const notify = () => listeners.forEach((l) => l());

  /** Reads the list again, applies a change, and writes it. */
  function update(change: (s: Saved) => Saved) {
    saved = change(read(deps.storage));
    try {
      deps.storage.setItem(FLAGS_KEY, JSON.stringify(saved));
    } catch {
      // Storage full or denied: the list lives for this page only.
    }
    notify();
  }

  function prune() {
    const s = read(deps.storage);
    if (
      s.flags.some((f) => isOld(startOf(f))) ||
      s.forget.some((f) => isOld(f.since))
    ) {
      update((x) => ({
        ...x,
        flags: x.flags.filter((f) => !isOld(startOf(f))),
        forget: x.forget.filter((f) => !isOld(f.since)),
      }));
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

  /**
   * Drops, each on its own, the waiting flags the server's own check refuses.
   * A day the server hasn't reached yet isn't one: the server drops that flag
   * alone, so a fast clock loses only its own.
   */
  function dropRefused() {
    const refused = new Set(
      read(deps.storage)
        .flags.filter(
          (f) =>
            f.state === 'waiting' &&
            !checkFlag(wire(f, deps.version), FIRST_DAY),
        )
        .map((f) => f.id),
    );
    if (refused.size > 0) {
      update((s) => ({
        ...s,
        flags: s.flags.filter((f) => !refused.has(f.id)),
      }));
    }
  }

  /** One pass over everything waiting. Stops at the first answer that means later. */
  async function pass() {
    prune();
    dropRefused();
    for (;;) {
      const batch = read(deps.storage)
        .flags.filter((f) => f.state === 'waiting')
        .slice(0, BATCH);
      if (batch.length === 0) break;
      const ids = new Set(batch.map((f) => f.id));
      // Marked before it goes, so a page closed mid-request still counts it
      // as possibly on the server.
      const at = deps.now();
      update((s) => ({
        ...s,
        flags: s.flags.map((f) =>
          ids.has(f.id) ? { ...f, tried: true, triedAt: at } : f,
        ),
      }));
      const status = await call('POST', {
        flags: batch.map((f) => wire(f, deps.version)),
      });
      if (status === 202) {
        const took = deps.now();
        update((s) => ({
          ...s,
          flags: s.flags.map((f) =>
            ids.has(f.id) ? { ...f, state: 'sent', sentAt: took } : f,
          ),
        }));
      } else if (status === 400 || status === 413) {
        update((s) => ({ ...s, flags: s.flags.filter((f) => !ids.has(f.id)) }));
      } else {
        return;
      }
    }
    for (;;) {
      const batch = read(deps.storage).forget.slice(0, BATCH);
      if (batch.length === 0) break;
      const ids = new Set(batch.map((f) => f.id));
      const status = await call('DELETE', { ids: [...ids] });
      if (status === 204 || status === 400 || status === 413) {
        update((s) => ({
          ...s,
          forget: s.forget.filter((f) => !ids.has(f.id)),
        }));
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
    const s = read(deps.storage);
    const pending =
      s.flags.some((f) => f.state === 'waiting') || s.forget.length > 0;
    if (!pending) return;
    if (deps.online && !deps.online()) return;
    const urgent = why === 'made';
    if (!urgent && s.lastTry !== null && deps.now() - s.lastTry < RETRY_MS) {
      return;
    }
    if (sending) {
      again = true;
      return sending;
    }
    const at = deps.now();
    update((x) => ({ ...x, lastTry: at }));
    sending = pass().finally(() => {
      sending = null;
    });
    await sending;
    if (again) {
      again = false;
      await send('made');
    }
  }

  const waitingIn = (s: Saved) =>
    s.flags.filter((f) => f.state === 'waiting').length;

  return {
    /** This device's flags still in their 60 days, oldest first. */
    list(): readonly Flag[] {
      return saved.flags.filter((f) => !isOld(startOf(f)));
    },

    /** Whether the waiting list is at its cap, so the card's flag gives way. */
    full(): boolean {
      return waitingIn(saved) >= MAX_WAITING;
    },

    async flag(input: NewFlag): Promise<'made' | 'already' | 'full'> {
      prune();
      const s = read(deps.storage);
      if (
        s.flags.some((f) => f.word === input.word && f.reason === input.reason)
      ) {
        return 'already';
      }
      if (waitingIn(s) >= MAX_WAITING) return 'full';
      const flag: Flag = {
        id: deps.newId(),
        word: input.word,
        reason: input.reason,
        board: input.board,
        madeAt: deps.now(),
        state: 'waiting',
        tried: false,
      };
      update((x) => ({ ...x, flags: [...x.flags, flag] }));
      await send('made');
      return 'made';
    },

    async takeBack(id: string): Promise<void> {
      const f = read(deps.storage).flags.find((x) => x.id === id);
      if (!f) return;
      const since = f.sentAt ?? f.triedAt ?? f.madeAt;
      update((x) => ({
        ...x,
        flags: x.flags.filter((y) => y.id !== id),
        forget: f.tried ? [...x.forget, { id, since }] : x.forget,
      }));
      if (f.tried) await send('made');
    },

    send,

    /** Reads the list again after another tab has written it, and tells subscribers. */
    refresh(): void {
      saved = read(deps.storage);
      notify();
    },

    /** The saved state as it stands, a new object after each change, for React to subscribe to. */
    snapshot(): object {
      return saved;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Flags = ReturnType<typeof createFlags>;
