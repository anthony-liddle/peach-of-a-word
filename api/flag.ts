import { loadFlagData } from '../server/flag/data.js';
import { handleFlagRequest } from '../server/flag/handler.js';
import { notifierFromEnv } from '../server/flag/notify.js';
import { storeFromEnv } from '../server/flag/store.js';

/**
 * `/api/flag`, a Vercel Function. POST sends flags, DELETE takes them back.
 * Everything it does is in `server/flag/handler.ts`; this only wires in the
 * environment. See that file for what is refused, what is dropped, and why
 * nothing is logged.
 */
function deps() {
  return {
    data: loadFlagData,
    store: storeFromEnv(process.env),
    notify: notifierFromEnv(process.env),
    now: () => new Date(),
  };
}

export function POST(request: Request): Promise<Response> {
  return handleFlagRequest(request, deps());
}

export function DELETE(request: Request): Promise<Response> {
  return handleFlagRequest(request, deps());
}
