/**
 * Build-time patch baking.
 *
 * The patch used to be fetched and re-parsed by the client on every load, which
 * is what let a cached bundle meet a newer patch file and crash. The merged
 * pools are fully determined at build time, so they are computed here once and
 * the shipped lists carry the result. The client fetches word lists and nothing
 * else.
 *
 * The five shipped lists and what the patch does to each:
 *
 *   enable.txt             deny removed, allowlist added
 *   scowl95-additions.txt  deny removed
 *   common-pool.txt        deny removed, common-banded allowlist added, demotions removed
 *   beyond-size-70.txt     deny removed
 *   beyond-size-95.txt     deny removed
 *
 * enable.txt and scowl95-additions.txt are complements: the build ships each
 * boundary word exactly once across the pair, and the runtime unions them. So an
 * allowlisted word joins enable.txt only if the union does not already have it,
 * or the pair would list it twice.
 */
import { applyPatch, type DictionaryPatch } from './patch.ts';

/** The five shipped lists, before or after baking. */
export interface ShippedLists {
  readonly enable: readonly string[];
  readonly additions: readonly string[];
  readonly common: readonly string[];
  readonly beyond70: readonly string[];
  readonly beyond95: readonly string[];
}

const sorted = (words: Iterable<string>): string[] => [...words].sort();

/**
 * Apply the patch to the five lists. The result is what ships, so the runtime
 * needs no patch layer at all.
 *
 * Sorted on the way out because the committed lists are sorted, and appending
 * the allowlist at the end would otherwise leave them almost-sorted, which is
 * the kind of difference that survives review and confuses the next reader.
 */
export function bakeLists(
  base: ShippedLists,
  patch: DictionaryPatch,
): ShippedLists {
  const deny = new Set(patch.deny);
  const demote = new Set(patch.demote);
  const kept = (words: readonly string[]) => words.filter((w) => !deny.has(w));

  // Only the words the boundary does not already carry, so the complement pair
  // keeps listing each word exactly once.
  const boundary = new Set([...base.enable, ...base.additions]);
  const newAllows = patch.allow
    .map((a) => a.word)
    .filter((w) => !boundary.has(w));

  const commonAllow = patch.allow
    .filter((a) => a.band === 'common')
    .map((a) => a.word);
  const commonHas = new Set(base.common);

  return {
    enable: sorted(kept([...base.enable, ...newAllows])),
    additions: sorted(kept(base.additions)),
    common: sorted(
      kept([
        ...base.common,
        ...commonAllow.filter((w) => !commonHas.has(w)),
      ]).filter((w) => !demote.has(w)),
    ),
    beyond70: sorted(kept(base.beyond70)),
    beyond95: sorted(kept(base.beyond95)),
  };
}

/**
 * Prove the bake is a representation change and not a curation change.
 *
 * The claim: the pools the engine sees after baking are the same sets the old
 * runtime built by fetching the lists and applying the patch itself. This runs
 * that old merge over the unbaked inputs and compares set for set. It is the
 * check that no word is added, dropped, or moved between pools by the bake, so
 * the shipped lists can be rewritten without anyone re-reviewing the curation.
 *
 * Throws with the first pool that disagrees and the size of the disagreement.
 * Words are never named: these lists hold words a player is protected from.
 */
export function assertBakedEquivalent(
  base: ShippedLists,
  patch: DictionaryPatch,
  baked: ShippedLists,
): void {
  // What the retired runtime path produced: union the complement pair, then
  // apply the patch to the merged lists.
  const expected = applyPatch(
    {
      enable: [...base.enable, ...base.additions],
      common: base.common,
      beyond70: base.beyond70,
      beyond95: base.beyond95,
    },
    patch,
  );

  const actual = {
    // The runtime unions the pair, so the baked pair is compared the same way.
    enable: [...baked.enable, ...baked.additions],
    common: baked.common,
    beyond70: baked.beyond70,
    beyond95: baked.beyond95,
  };

  for (const pool of ['enable', 'common', 'beyond70', 'beyond95'] as const) {
    const want = new Set(expected[pool]);
    const got = new Set(actual[pool]);
    const missing = [...want].filter((w) => !got.has(w)).length;
    const extra = [...got].filter((w) => !want.has(w)).length;
    if (missing || extra) {
      throw new Error(
        `Bake changed the ${pool} pool: ${missing} missing, ${extra} unexpected. ` +
          `The bake must be a representation change only.`,
      );
    }
  }

  // The pair must stay a true complement, or the boundary ships a word twice.
  const inEnable = new Set(baked.enable);
  const overlap = baked.additions.filter((w) => inEnable.has(w)).length;
  if (overlap > 0) {
    throw new Error(
      `Bake left ${overlap} words in both enable and the additions ` +
        `complement; each boundary word must ship exactly once.`,
    );
  }
}
