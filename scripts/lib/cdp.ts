import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Just enough of the Chrome DevTools Protocol to drive one headless tab: send a
 * command, evaluate an expression, listen for events.
 *
 * Every launch gets a fresh, throwaway profile, so nothing a previous run left
 * in storage can reach this one. The debugging port is chosen by Chrome and
 * read back from the profile, so two runs never collide on a fixed one.
 */
const DEFAULT_CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
}

export interface Chrome {
  send<T = unknown>(method: string, params?: object): Promise<T>;
  /** Evaluate in the page, await a returned promise, and return its value. */
  evaluate<T>(expression: string): Promise<T>;
  on(listener: (event: CdpEvent) => void): () => void;
  close(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(profile: string): Promise<number> {
  for (let i = 0; i < 200; i++) {
    try {
      const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8')
        .split('\n')
        .map(Number);
      if (port) return port;
    } catch {
      // Not written yet.
    }
    await sleep(50);
  }
  throw new Error('Chrome did not open a debugging port.');
}

export async function launchChrome(
  path = process.env.CHROME_PATH ?? DEFAULT_CHROME,
): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-profile-'));
  const proc = spawn(
    path,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const port = await waitForPort(profile);
  const targets = (await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome opened no page.');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  const listeners = new Set<(event: CdpEvent) => void>();
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data)) as {
      id?: number;
      result?: unknown;
      error?: unknown;
    } & CdpEvent;
    const waiting = data.id === undefined ? undefined : pending.get(data.id);
    if (waiting) {
      pending.delete(data.id!);
      if (data.error) waiting.reject(new Error(JSON.stringify(data.error)));
      else waiting.resolve(data.result);
    } else if (data.method) {
      listeners.forEach((l) => l(data));
    }
  };

  const send = <T>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    send,
    async evaluate<T>(expression: string) {
      const result = await send<{
        result: { value: T };
        exceptionDetails?: unknown;
      }>('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      socket.close();
      proc.kill();
      proc.once('exit', () =>
        rmSync(profile, { recursive: true, force: true }),
      );
    },
  };
}
