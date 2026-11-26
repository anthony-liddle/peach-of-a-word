/**
 * A run's Share, the app's three lines. It never names the peach of a word: a
 * run that found it adds the peach to the tally, as the basket's block never
 * names it either.
 */
import type { RunRecord } from '@/persistence/storage.ts';
import { shortDate } from '@/ui/share/shareText.ts';
import { runTally } from './record.ts';

export function runShareText(
  run: Pick<RunRecord, 'words' | 'points' | 'peach'>,
  title: string,
  name: string,
  date: Date,
  clock: string,
): string {
  return [
    `🍑 ${title} · ${shortDate(date)}`,
    `⏱️ ${name} · ${clock}`,
    runTally(run) + (run.peach ? ' 🍑' : ''),
  ].join('\n');
}
