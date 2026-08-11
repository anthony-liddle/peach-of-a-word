/**
 * The shape of meta.json, in one place, because two writers produce it.
 *
 * pnpm data:build wrote this file once, on 2026-06-24. pnpm data:bake then
 * rewrote the five word lists on 2026-08-03 and left the metadata alone, so
 * every count in it described a build that no longer shipped. The boundary was
 * wrong by 2,882 words, and the figure escaped into a published essay.
 *
 * Two fixes, and this module is the second one. The first is that data:bake now
 * writes the file too, so the lists and the counts move together. That alone
 * would leave two independent literals describing one format, which is the same
 * defect one level up, so the object is built here and both writers call it.
 *
 * ---------------------------------------------------------------------------
 * TWO FIELDS WERE DELIBERATELY DROPPED. Recorded because their absence looks
 * like an oversight and is not.
 *
 *   generatedAt  a fresh ISO timestamp on every run. It made the file look
 *                current while its contents were stale, which is the whole
 *                defect in one field. It is also actively harmful now that the
 *                bake is idempotent: public/data is content-hashed into its
 *                own URL (see lib/dataVersion.ts), so a timestamp that changes
 *                on every bake changes the data URL on every bake, and every
 *                returning player re-downloads 17MB of word lists that did not
 *                change. The bake is a pure function of committed inputs, so
 *                there is no build time worth recording.
 *
 *   definitionUnion  how many distinct words are formable across every rack.
 *                Build telemetry, not a description of anything shipped, and
 *                the only count that cannot be re-derived from a committed
 *                artifact without a 16-second recomputation. A number no test
 *                can cheaply check is a number that drifts, which is how this
 *                file got into trouble. It is still printed by data:build,
 *                where a build statistic belongs.
 * ---------------------------------------------------------------------------
 *
 * Every remaining count is checked against the artifact it describes by
 * src/data/meta.test.ts. Add a field only with the assertion that pins it.
 */

/** Counts describing the shipped data. Every one is re-derivable from it. */
export interface MetaCounts {
  /** Words in enable.txt. */
  readonly enable: number;
  /** Words in scowl95-additions.txt. */
  readonly scowl95Additions: number;
  /** The validation boundary the runtime assembles: the two above, unioned. */
  readonly boundary: number;
  /** Words in common-pool.txt. */
  readonly common: number;
  /** Words in beyond-size-70.txt. */
  readonly beyond70: number;
  /** Words in beyond-size-95.txt. */
  readonly beyond95: number;
  /** Crowns in source-pool.json. */
  readonly sourcePool: number;
  /** Distinct words carrying a gloss in some shipped bundle. */
  readonly definitionsCovered: number;
}

export interface Meta {
  readonly counts: MetaCounts;
  readonly attribution: Readonly<Record<string, string>>;
}

/**
 * The attribution the upstream licences require. ENABLE is public domain and
 * asks for nothing; SCOWL and Wiktionary both do, and this is the record that
 * travels with the data rather than only with the repository.
 */
const ATTRIBUTION = {
  enable: 'ENABLE word list. Public domain.',
  scowl:
    'SCOWL (Spell Checker Oriented Word Lists) by Kevin Atkinson. See ATTRIBUTION.md.',
  wiktionary:
    'Definitions and etymologies from Wiktionary, CC BY-SA 4.0. See ATTRIBUTION.md.',
} as const;

/** Assemble meta.json from counts the caller has already measured. */
export function buildMeta(counts: MetaCounts): Meta {
  return { counts, attribution: { ...ATTRIBUTION } };
}

/** Serialise it the way the file is committed: two-space indent, newline-free. */
export function serialiseMeta(meta: Meta): string {
  return JSON.stringify(meta, null, 2);
}
