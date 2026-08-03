import type { Dictionary, WordSource } from '@/engine/types.ts';
import { createListDictionary, createListWordSource } from './listSource.ts';
import type { SourceEntry } from './types.ts';

/** The local calendar epoch baked into the daily calendar. */
export interface EpochDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The frozen, append-only daily calendar: the ordered eligible source words. */
export interface DailyCalendar {
  readonly epoch: EpochDate;
  readonly words: readonly string[];
}

/** Everything the engine and UI need, loaded once from the baked assets. */
export interface GameData {
  /** Validation dictionary: ENABLE union SCOWL 95, with the patch layer applied. */
  readonly dictionary: Dictionary;
  /** SCOWL-small set pool, the completion denominator source. */
  readonly commonPool: WordSource;
  /** ENABLE words beyond SCOWL size 70: the uncommon cutoff for the rarity ladder. */
  readonly beyond70Pool: WordSource;
  /** ENABLE words beyond SCOWL size 95: the rare/mythic cutoff for the rarity ladder. */
  readonly beyond95Pool: WordSource;
  /**
   * The frozen daily calendar: only source words that clear MIN_SET_SIZE. Both
   * daily (by date) and endless (random) draw from this list, so a sub-floor
   * word never headlines either mode.
   */
  readonly dailyCalendar: DailyCalendar;
  /** Lookup from source word to its definition and etymology. */
  readonly sourceEntry: (word: string) => SourceEntry | undefined;
}

/**
 * The data directory carries a hash of its own contents, so a bundle only ever
 * asks for the data it was built against. If the data has moved on, this path is
 * not in the current deploy and the fetch fails loudly instead of handing the
 * bundle files it was not built to parse.
 */
export function assetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}data${__DATA_VERSION__}/${name}`;
}

/**
 * A word list arriving as HTML is the failure that matters here. If a host ever
 * answers a missing asset with a rewrite to index.html rather than a 404, res.ok
 * is true and the word-list parser turns markup into thousands of junk words: no
 * error, no safe message, a game that is quietly wrong. A JSON asset would throw
 * on parse, but a word list fails open, so the content type is checked.
 */
function assertNotMarkup(name: string, res: Response): void {
  const type = res.headers?.get?.('content-type') ?? '';
  if (type.includes('text/html')) {
    throw new Error(`Asset ${name} came back as HTML, not data.`);
  }
}

/** A data asset the deploy did not serve, carrying the status that said so. */
export class AssetHttpError extends Error {
  constructor(
    name: string,
    readonly status: number,
  ) {
    super(`Failed to load ${name}: HTTP ${status}`);
    this.name = 'AssetHttpError';
  }
}

/**
 * Whether a load failure means this bundle is stale rather than something else.
 *
 * Only a 404 on a data asset says that, and it says it unambiguously: the data
 * directory is named for its own contents, so a path that is absent from the
 * deploy is one this bundle was built against and the deploy has moved past.
 *
 * Deliberately narrow. A dropped connection, a 500, or an asset served as HTML
 * are all load failures too, and none of them is fixed by fetching the page
 * again. Reloading on those would turn one broken deploy into a reload for every
 * visitor against an origin that is already failing.
 */
export function isStaleBundleError(err: unknown): boolean {
  return err instanceof AssetHttpError && err.status === 404;
}

async function fetchText(name: string): Promise<string> {
  const res = await fetch(assetUrl(name));
  if (!res.ok) throw new AssetHttpError(name, res.status);
  assertNotMarkup(name, res);
  return res.text();
}

function parseWordList(text: string): string[] {
  return text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Load and wire up the baked assets behind the engine interfaces. The dictionary
 * lives behind the Dictionary interface so it can be swapped (a smaller list, a
 * remote service) without touching the engine or UI.
 */
export async function loadGameData(): Promise<GameData> {
  const [
    enableText,
    additionsText,
    commonText,
    beyond70Text,
    beyond95Text,
    sourceJson,
    calendarJson,
  ] = await Promise.all([
    fetchText('enable.txt'),
    fetchText('scowl95-additions.txt'),
    fetchText('common-pool.txt'),
    fetchText('beyond-size-70.txt'),
    fetchText('beyond-size-95.txt'),
    fetchText('source-pool.json'),
    fetchText('daily-calendar.json'),
  ]);

  // The validation boundary is ENABLE union SCOWL 95: ENABLE plus the within-95
  // SCOWL words it lacks (shipped as the additions complement so nothing is
  // listed twice). The bands stay derived from the same SCOWL v1 list, so the
  // newly valid words land in their true rung and the mythic tail is unchanged.
  //
  // These lists arrive patched. The allowlist, denylist, and demotions are baked
  // in at build time by pnpm data:bake, so there is no patch to fetch and no
  // patch to parse here. That is deliberate: the merged pools are fully
  // determined at build time, and re-deriving them per load meant a cached
  // bundle could meet a newer patch file and crash on an action it did not know.
  const validation = [
    ...parseWordList(enableText),
    ...parseWordList(additionsText),
  ];

  const dictionary = createListDictionary(validation);
  const commonPool = createListWordSource(parseWordList(commonText));
  const beyond70Pool = createListWordSource(parseWordList(beyond70Text));
  const beyond95Pool = createListWordSource(parseWordList(beyond95Text));

  const entries = JSON.parse(sourceJson) as SourceEntry[];
  const byWord = new Map(entries.map((e) => [e.word, e]));
  const dailyCalendar = JSON.parse(calendarJson) as DailyCalendar;

  return {
    dictionary,
    commonPool,
    beyond70Pool,
    beyond95Pool,
    dailyCalendar,
    sourceEntry: (word) => byWord.get(word),
  };
}
