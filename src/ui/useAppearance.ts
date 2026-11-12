/** The player's appearance: System, Light or Dark. Not built yet. */
export type Appearance = 'system' | 'light' | 'dark';

export const appearanceStore = {
  get(): Appearance {
    return 'system';
  },
  set(_next: Appearance): void {},
  refresh(): void {},
};
