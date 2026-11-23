import { createFlags, type Flags } from './flags.ts';

/**
 * This browser's flags, made once. The version is the build's short commit,
 * from Vercel at build time ("dev" on a local build); see vite.config.ts.
 */
let device: Flags | null = null;

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    // Reading it can throw where storage is blocked.
    const s = window.localStorage;
    s.getItem('e8-flags');
    return s;
  } catch {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
    };
  }
}

export function deviceFlags(): Flags {
  device ??= createFlags({
    storage: browserStorage(),
    fetch: (input, init) => window.fetch(input, init),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    version: __APP_VERSION__,
    online: () => navigator.onLine,
  });
  return device;
}
