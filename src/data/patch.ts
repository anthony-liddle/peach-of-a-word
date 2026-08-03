/**
 * Dictionary patch layer. A small, curated, additive layer applied on top of
 * whatever the base validation boundary is (ENABLE today), so it carries over
 * unchanged when the boundary widens in a later phase.
 *
 * Two parts:
 * - allowlist: words to accept that the base list misses, each carrying a band
 *   so the classifier grades it correctly rather than letting it fall through
 *   to a rarity rung.
 * - denylist: words to reject that the base list wrongly accepts.
 * - demotions: words to take out of the common pool while leaving them valid,
 *   so they are permitted rather than required.
 *
 * The band on an allow entry is authoritative: a common-banded word joins the
 * common list and classifies as a set word, never as uncommon or mythic, even
 * though it sits beyond every SCOWL band.
 */

/** The band an allowlisted word joins. Only the common band is used today. */
export type PatchBand = 'common';

/** One allowlisted word and the band it joins. */
export interface AllowEntry {
  readonly word: string;
  readonly band: PatchBand;
}

/** The parsed patch: words to add (banded), to remove, and to demote. */
export interface DictionaryPatch {
  readonly allow: readonly AllowEntry[];
  readonly deny: readonly string[];
  /**
   * Words to take out of the common pool while leaving them valid.
   *
   * The band column cannot express this and could not be made to. A band says
   * which pool an ALLOW entry joins, and an allow entry only ever adds a word,
   * so there was no way to move a word already in the common pool out of it.
   * The only subtraction the layer had was denial, and denial removes the word
   * from validation too.
   *
   * The distinction this exists for: the common pool is what completion
   * REQUIRES, so a word in it is a demand rather than a permission. Demotion
   * moves a word off the page. It stays valid, stays scoreable, and grades on
   * the rarity ladder like any other off-page find; it just stops being
   * something a player must type to finish.
   */
  readonly demote: readonly string[];
}

/** The raw word lists the patch merges into, before they back the engine. */
export interface PatchableLists {
  readonly enable: readonly string[];
  readonly common: readonly string[];
  readonly beyond70: readonly string[];
  readonly beyond95: readonly string[];
}

const VALID_BANDS: ReadonlySet<string> = new Set<PatchBand>(['common']);

function normalizeWord(raw: string): string {
  const word = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word)) {
    throw new Error(`Patch word is not a-z only: "${raw}"`);
  }
  return word;
}

/**
 * Parse the patch TSV. Columns: word, action (allow, deny, or demote), band
 * (the band for allow; blank otherwise), note (optional). Blank lines, comment
 * lines starting with #, and a header row whose first column is "word" are
 * skipped. An unknown action throws so a typo cannot silently drop an entry.
 */
export function parsePatch(tsv: string): DictionaryPatch {
  const allow: AllowEntry[] = [];
  const deny: string[] = [];
  const demote: string[] = [];

  for (const line of tsv.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const [rawWord, rawAction, rawBand] = line.split('\t');
    if ((rawWord ?? '').trim().toLowerCase() === 'word') continue; // header

    const action = (rawAction ?? '').trim().toLowerCase();
    if (action === 'allow') {
      const band = (rawBand ?? '').trim().toLowerCase();
      if (!VALID_BANDS.has(band)) {
        throw new Error(
          `Allow entry "${rawWord}" needs a valid band, got "${rawBand ?? ''}"`,
        );
      }
      allow.push({
        word: normalizeWord(rawWord ?? ''),
        band: band as PatchBand,
      });
    } else if (action === 'deny') {
      deny.push(normalizeWord(rawWord ?? ''));
    } else if (action === 'demote') {
      demote.push(normalizeWord(rawWord ?? ''));
    } else {
      throw new Error(`Unknown action "${rawAction ?? ''}" for "${rawWord}"`);
    }
  }

  return { allow, deny, demote };
}

/** Append words not already present, preserving order. */
function withWords(
  list: readonly string[],
  additions: readonly string[],
): string[] {
  const seen = new Set(list);
  const out = [...list];
  for (const word of additions) {
    if (!seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }
  return out;
}

/**
 * Apply the patch on top of the base lists: validation and the banded pools
 * gain the allowlist, every list loses the denylist, and the common pool alone
 * loses the demotions. Downstream, createPuzzle and classifyWord then grade the
 * merged lists with no special casing: an allowlisted common word is just
 * another common word, and a demoted word is just another off-page word.
 *
 * Demotion touches the common pool and nothing else, which is the whole point.
 * The word stays in validation so it is still accepted and still scores, and it
 * stays out of the two rarity complements so it grades as uncommon rather than
 * being pushed into the mythic tail. It simply stops being required.
 */
export function applyPatch(
  lists: PatchableLists,
  patch: DictionaryPatch,
): PatchableLists {
  const deny = new Set(patch.deny);
  const remove = (list: readonly string[]) => list.filter((w) => !deny.has(w));
  const demote = new Set(patch.demote);

  const allowWords = patch.allow.map((a) => a.word);
  const commonAllow = patch.allow
    .filter((a) => a.band === 'common')
    .map((a) => a.word);

  return {
    enable: remove(withWords(lists.enable, allowWords)),
    common: remove(withWords(lists.common, commonAllow)).filter(
      (w) => !demote.has(w),
    ),
    beyond70: remove(lists.beyond70),
    beyond95: remove(lists.beyond95),
  };
}
