import type { GameStorage } from '@/persistence/storage.ts';
import { daysPayload } from './days.ts';
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
  if (!fromAddress) {
    renderDays(ctx, $, words);
    return;
  }
  const streak = streakInHash(ctx.hash);

  if (!streak || !canMove(streak, ctx.todayIndex)) {
    $('none').hidden = false;
    $('none-address').hidden = false;
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

/**
 * The page opened in the browser a player plays in: everything this browser
 * holds, days and streak, copied as one piece of text for the app's Paste.
 * One action, whatever the save's size (Antoine, 5 November).
 *
 * The streak travels inside the copy, so this offers no streak link, and no
 * warning about playing in the app first: the app's import records today on
 * top of the streak it takes.
 */
function renderDays(
  ctx: TransferContext,
  $: (id: string) => HTMLElement,
  words: (id: string) => string,
): void {
  const days = Object.keys(ctx.storage.savedDays()).length;
  const saved = streakInSave(ctx.storage);
  if (days === 0 && !saved) {
    $('none-saved').hidden = false;
    return;
  }

  const going = saved && canMove(saved, ctx.todayIndex) ? saved : null;
  if (days > 0) {
    $('days-count').textContent = String(days);
    $('days-label').textContent = words(
      days === 1 ? 'say-day-to-transfer' : 'say-days-to-transfer',
    );
    if (going) {
      $('days-streak').textContent =
        going.count === 1
          ? words('say-streak-one')
          : words('say-streak').replace('{n}', String(going.count));
      $('days-streak').hidden = false;
    }
  } else if (saved) {
    // No day's words, but a streak: its days still come across as finished.
    $('days-count').textContent = String(saved.count);
    $('days-label').textContent = words(
      saved.count === 1 ? 'say-day' : 'say-days',
    );
  }
  $('days-found').hidden = false;
  $('copy-days-part').hidden = false;

  const payload = daysPayload(ctx.storage);
  const status = $('copy-days-status');
  const text = $('days-text') as HTMLTextAreaElement;
  $('copy-days').addEventListener('click', () => {
    status.textContent = '';
    ctx.copy(payload).then(
      () => {
        status.textContent = words('days-copied');
      },
      () => {
        status.textContent = words('days-not-copied');
        text.value = payload;
        text.hidden = false;
        text.select();
      },
    );
  });
}
