import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(fileURLToPath(import.meta.url), '../../..');
export const CACHE_DIR = join(REPO_ROOT, 'scripts', '.cache');
export const DATA_RAW_DIR = join(REPO_ROOT, 'scripts', 'data-raw');
export const ASSET_DIR = join(REPO_ROOT, 'public', 'data');

/**
 * The curated patch. A build input, not a shipped asset: it lives outside
 * public/ so it is never served. The client used to fetch and re-parse it on
 * every load, which is how a cached bundle could meet a newer patch and crash.
 * Its effect is baked into the shipped lists by pnpm data:bake.
 */
export const PATCH_PATH = join(DATA_RAW_DIR, 'dictionary-patch.tsv');

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Read a JSON file from the disk cache, or null if it is not there yet. */
export async function readCacheJson<T>(relPath: string): Promise<T | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, relPath), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCacheJson(
  relPath: string,
  value: unknown,
): Promise<void> {
  const full = join(CACHE_DIR, relPath);
  await ensureDir(dirname(full));
  await writeFile(full, JSON.stringify(value), 'utf8');
}

export async function writeAsset(
  name: string,
  contents: string,
): Promise<void> {
  const full = join(ASSET_DIR, name);
  await ensureDir(dirname(full));
  await writeFile(full, contents, 'utf8');
}

const RETRY_BASE_MS = 300;
const RETRY_MAX_DELAY_MS = 30_000;
const RETRY_AFTER_MAX_MS = 60_000;

/** Parse a Retry-After header (delta-seconds or HTTP-date) to milliseconds, capped. Returns null if unusable. */
export function parseRetryAfterMs(
  value: string | null,
  now: number = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed))
    return Math.min(Number(trimmed) * 1000, RETRY_AFTER_MAX_MS);
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs))
    return Math.min(Math.max(0, dateMs - now), RETRY_AFTER_MAX_MS);
  return null;
}

function backoffMs(attempt: number): number {
  const expo = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  return expo / 2 + Math.random() * (expo / 2); // half fixed, half full jitter
}

/** Fetch with retries, exponential backoff, jitter, and Retry-After support. Build-time only. */
export async function fetchText(
  url: string,
  init?: RequestInit,
  retries = 5,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Network failure or timeout
      lastError = err;
      if (attempt < retries) await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) return await res.text();

    if (res.status === 429) {
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (attempt < retries) {
        const wait =
          parseRetryAfterMs(res.headers.get('retry-after')) ??
          backoffMs(attempt);
        await sleep(wait);
      }
      continue;
    }

    if (res.status >= 500) {
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (attempt < retries) await sleep(backoffMs(attempt));
      continue;
    }

    // Non-retryable 4xx (e.g. 404): fail fast, no retry
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run tasks with a bounded number in flight at once. Preserves input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T, index);
      done++;
      onProgress?.(done, items.length);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}
