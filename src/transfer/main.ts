/**
 * The transfer page's entry, at /transfer. It loads no analytics: Vercel Web
 * Analytics is mounted only inside the game (src/App.tsx), and
 * noAnalytics.test.ts walks every import from here to keep it that way.
 */
import { STORAGE_EPOCH } from '@/engine/config.ts';
import { dayIndex } from '@/engine/daily.ts';
import { GameStorage } from '@/persistence/storage.ts';
import { isComputer } from '@/ui/share/shareDaily.ts';
import { renderTransfer } from './page.ts';

renderTransfer(document, {
  storage: new GameStorage(),
  // The game's own count of today, so the page and the game agree on which
  // day a streak was last extended.
  todayIndex: dayIndex(new Date(), STORAGE_EPOCH),
  hash: window.location.hash,
  origin: window.location.origin,
  computer: isComputer(),
  copy: (text) => navigator.clipboard.writeText(text),
});
