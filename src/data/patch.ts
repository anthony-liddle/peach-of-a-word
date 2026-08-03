/**
 * Dictionary patch layer. A small, curated, additive layer applied on top of
 * whatever the base validation boundary is (ENABLE today), so it carries over
 * unchanged when the boundary widens in a later phase.
 *
 * ---------------------------------------------------------------------------
 * THE THREE CATEGORIES. Written down because the distinction keeps needing to
 * be restated, and getting it wrong is how an ordinary word ends up rejected or
 * a word nobody should have to type ends up required.
 *
 *   deny    is for slurs: no ordinary meaning, targets a group. Not accepted at
 *           all. A denied word answers exactly as if it were not a word.
 *
 *   demote  is for legitimate words that should never be required. Accepted,
 *           scored, off-page only: out of the common pool, on the rarity ladder
 *           like any other find.
 *
 *   neither is everything else, which is nearly every word.
 *
 * Vulgar is not the same as slur, and the difference decides the category.
 * bitch, cunt, slut and whore are coarse, several are reclaimed, and each is an
 * ordinary English word with a real meaning that targets no group. They are
 * profanity, and removing profanity is not what the denylist is for. They
 * belong in demote. A source list built for a different game with a different
 * threshold will not draw this line for us, so it gets drawn here.
 * ---------------------------------------------------------------------------
 *
 * Three parts:
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

/**
 * Errors here name the line, never the cell.
 *
 * These lists hold words a player is deliberately being protected from, so an
 * error that interpolates one carries it wherever the error goes. That is not
 * hypothetical: a parse failure quoting a slur was rendered full screen once.
 * A line number is also the better debugging aid, since it points at the row to
 * open rather than at a value that may appear on many rows. The columns are
 * data, so none of them is echoed, not even the action: on a misaligned row any
 * column can hold a word.
 */
function normalizeWord(raw: string, line: number): string {
  const word = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word)) {
    throw new Error(`Patch line ${line}: word is not a-z only.`);
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

  // The physical line number, counted over every line including the ones that
  // are skipped. A counter of parsed rows would point at the wrong row: the
  // committed patch opens with a comment header, so the two diverge from the
  // very first entry.
  for (const [index, line] of tsv.split('\n').entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const [rawWord, rawAction, rawBand] = line.split('\t');
    if ((rawWord ?? '').trim().toLowerCase() === 'word') continue; // header

    const action = (rawAction ?? '').trim().toLowerCase();
    if (action === 'allow') {
      const band = (rawBand ?? '').trim().toLowerCase();
      if (!VALID_BANDS.has(band)) {
        throw new Error(
          `Patch line ${lineNumber}: allow entry needs a valid band, ` +
            `one of ${[...VALID_BANDS].join(', ')}.`,
        );
      }
      allow.push({
        word: normalizeWord(rawWord ?? '', lineNumber),
        band: band as PatchBand,
      });
    } else if (action === 'deny') {
      deny.push(normalizeWord(rawWord ?? '', lineNumber));
    } else if (action === 'demote') {
      demote.push(normalizeWord(rawWord ?? '', lineNumber));
    } else {
      throw new Error(`Patch line ${lineNumber}: unknown action.`);
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
