import { loadFlagData } from '../server/flag/data.ts';
import { handleFlagRequest } from '../server/flag/handler.ts';
import { notifierFromEnv } from '../server/flag/notify.ts';
import { storeFromEnv } from '../server/flag/store.ts';

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
