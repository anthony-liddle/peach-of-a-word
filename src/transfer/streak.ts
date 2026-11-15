import type { GameStorage } from '@/persistence/storage.ts';

export interface TransferStreak {
  readonly count: number;
  readonly lastClearedDayIndex: number;
}

const notYet = (): never => {
  throw new Error('not built yet');
};

export const streakInSave = (_storage: GameStorage): TransferStreak | null =>
  notYet();
export const streakInHash = (_hash: string): TransferStreak | null => notYet();
export const canMove = (_s: TransferStreak, _today: number): boolean =>
  notYet();
export const endedYesterday = (_s: TransferStreak, _today: number): boolean =>
  notYet();
export const appLink = (_s: TransferStreak): string => notYet();
export const addressCarrying = (_origin: string, _s: TransferStreak): string =>
  notYet();
