import type { GameStorage } from '@/persistence/storage.ts';

export interface TransferContext {
  storage: GameStorage;
  todayIndex: number;
  hash: string;
  origin: string;
  computer: boolean;
  copy: (text: string) => Promise<void>;
}

export function renderTransfer(_doc: Document, _ctx: TransferContext): void {
  throw new Error('not built yet');
}
