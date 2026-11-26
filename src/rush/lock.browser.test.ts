import { afterEach, describe, expect, it } from 'vitest';
import { browserLock, type RushLock } from './lock.ts';

/*
 * The run's lock against each browser's own Web Locks. A page's requests
 * contend with each other as two tabs' do, so one page stands in for two.
 */

const releases: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(releases.splice(0).map((release) => release()));
});

function lock(): RushLock {
  const l = browserLock();
  expect(l).not.toBeNull();
  return l!;
}

async function take(l: RushLock) {
  const release = await l.take();
  if (release) releases.push(release);
  return release;
}

describe("the run's lock", () => {
  it('is taken by one holder at a time', async () => {
    const l = lock();
    expect(await take(l)).not.toBeNull();
    expect(await take(l)).toBeNull();
  });

  it('says whether it is held', async () => {
    const l = lock();
    expect(await l.held()).toBe(false);
    const release = await take(l);
    expect(await l.held()).toBe(true);
    await release!();
    expect(await l.held()).toBe(false);
  });

  it('can be taken again once let go', async () => {
    const l = lock();
    const release = await take(l);
    await release!();
    expect(await take(l)).not.toBeNull();
  });

  it('tells a waiting tab when the holder lets go', async () => {
    const l = lock();
    const release = await take(l);
    let free = false;
    const waiting = l.whenFree(new AbortController().signal).then(() => {
      free = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(free).toBe(false);
    await release!();
    await waiting;
    expect(free).toBe(true);
  });

  it('stops waiting when the wait is called off', async () => {
    const l = lock();
    const release = await take(l);
    const stop = new AbortController();
    let free = false;
    void l.whenFree(stop.signal).then(() => {
      free = true;
    });
    stop.abort();
    await release!();
    await new Promise((r) => setTimeout(r, 50));
    expect(free).toBe(false);
    // And the lock is free for the next holder, not held by the called-off wait.
    expect(await take(l)).not.toBeNull();
  });
});
