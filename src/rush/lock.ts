/**
 * The run's lock, so two tabs can tell whether the run the save calls
 * "running" still has a tab playing it.
 *
 * The tab with the run going holds a Web Lock named `peach-rush`, and the
 * browser lets it go when that tab pauses, ends the run, closes or dies. A tab
 * that crashes writes nothing, so the save alone can't tell a run in play
 * from a run left behind; the lock can. Web Locks are in Safari from 15.4,
 * Chrome from 69 and Firefox from 96. Without them, `browserLock` is null,
 * and a run the save calls running comes back paused at its last saved time.
 */

export const LOCK_NAME = 'peach-rush';

export interface RushLock {
  /**
   * Take the lock if no tab holds it, resolving with its release, or null
   * when another tab has it. The release resolves once the browser has let
   * the lock go.
   */
  take(): Promise<(() => Promise<void>) | null>;
  /** Whether any tab holds it now. */
  held(): Promise<boolean>;
  /**
   * Resolves once the lock is free: its holder let it go, or died. Never
   * resolves if `signal` aborts first.
   */
  whenFree(signal: AbortSignal): Promise<void>;
}

/** The browser's own locks, or null where the browser has none. */
export function browserLock(): RushLock | null {
  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  if (!locks) return null;
  return {
    take: () =>
      new Promise((resolve, reject) => {
        // Settles once the lock is let go, after the callback's promise does.
        const done: Promise<unknown> = locks.request(
          LOCK_NAME,
          { ifAvailable: true },
          (lock) => {
            if (!lock) {
              resolve(null);
              return undefined;
            }
            // Held until the release is called.
            return new Promise<void>((letGo) =>
              resolve(async () => {
                letGo();
                await done;
              }),
            );
          },
        );
        done.catch(reject);
      }),
    held: async () =>
      ((await locks.query()).held ?? []).some((l) => l.name === LOCK_NAME),
    whenFree: (signal) =>
      new Promise((resolve) => {
        // Granted, held for no time, and let go: it settles once the browser
        // has let it go again, so the next holder finds it free. An abort
        // rejects the request, and the wait never resolves.
        locks
          .request(LOCK_NAME, { signal }, () => undefined)
          .then(
            () => resolve(),
            () => {},
          );
      }),
  };
}
