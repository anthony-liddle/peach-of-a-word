import type { GameStorage } from '@/persistence/storage.ts';
import {
  addressCarrying,
  appLink,
  canMove,
  endedYesterday,
  streakInHash,
  streakInSave,
} from './streak.ts';

/** What the page needs from the browser, handed in so a test can be the browser. */
export interface TransferContext {
  storage: GameStorage;
  todayIndex: number;
  /** The address's part after `#`, with the `#`. Empty when there's none. */
  hash: string;
  origin: string;
  /** A computer, by the share button's rule: a mouse or a trackpad. */
  computer: boolean;
  copy: (text: string) => Promise<void>;
}

/**
 * Show the parts of transfer.html that fit. Its words are all in the page;
 * this only chooses among them and fills in the number and the links.
 *
 * **An address that carries a streak is read instead of the save,** never as
 * well. It was copied from the browser the player plays in, and this browser
 * may hold another save, or none.
 */
export function renderTransfer(doc: Document, ctx: TransferContext): void {
  const $ = (id: string): HTMLElement => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`transfer.html has no #${id}`);
    return el;
  };
  const words = (id: string) => $(id).textContent!.replace(/\s+/g, ' ').trim();

  const fromAddress = ctx.hash !== '' && ctx.hash !== '#';
  const streak = fromAddress
    ? streakInHash(ctx.hash)
    : streakInSave(ctx.storage);

  if (!streak || !canMove(streak, ctx.todayIndex)) {
    $('none').hidden = false;
    $(fromAddress ? 'none-address' : 'none-browser').hidden = false;
    return;
  }

  $('count').textContent = String(streak.count);
  $('count-label').textContent = words(
    streak.count === 1 ? 'say-day' : 'say-days',
  );
  $('found').hidden = false;
  if (endedYesterday(streak, ctx.todayIndex))
    $('ended-yesterday').hidden = false;

  if (!ctx.computer) {
    $('send').setAttribute('href', appLink(streak));
    $('on-phone').hidden = false;
    return;
  }

  const address = addressCarrying(ctx.origin, streak);
  $('address').textContent = address;
  $('on-computer').hidden = false;
  const status = $('copy-status');
  $('copy').addEventListener('click', () => {
    status.textContent = '';
    ctx.copy(address).then(
      () => {
        status.textContent = words('copy-done');
      },
      () => {
        status.textContent = words('copy-failed');
      },
    );
  });
}
