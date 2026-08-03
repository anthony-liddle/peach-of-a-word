/**
 * The slur denylist: parsing the vendored source, the reviewed exclusions, and
 * the derivation that turns the two into deny rows for dictionary-patch.tsv.
 *
 * Provenance. The source is the 2020 NASPA Word List purge: the 259 slurs the
 * North American Scrabble tournament lexicon removed in its 2020 revision. That
 * revision is this exact problem solved publicly and carefully by people who had
 * to defend every entry, which is why it is preferred over generating a list ad
 * hoc. It is vendored to scripts/data-raw/nwl2020-purged.txt by pnpm data:vendor
 * and committed, so the derivation is offline and reproducible.
 *
 * Exact match, never substring. Every function here works on whole words in a
 * Set. Nothing in this module does prefix or substring matching, and nothing
 * downstream should either: niggardly and denigrate are the classic casualties,
 * and at the lengths this game reaches, nip (28 racks) and nips (14) are the
 * ones that would actually bite. The chosen source already excludes all of them.
 */

/** The count NASPA published for the 2020 purge. A guard on the extraction. */
export const NWL2020_EXPECTED = 259;

/**
 * Pull the 2020 slur purge out of the vendored expurgation page.
 *
 * The page tracks OSPD expurgations across editions and marks each word with why
 * it was cut. Only two of those classes are the 2020 slur purge, and only those
 * are taken:
 *
 *   nwl2020purge      already expurgated from OSPD, now purged from NWL2020
 *   nwl2020newexpurge newly expurgated and purged in the 2020 revision
 *
 * Everything unmarked or marked for an earlier OSPD edition is general vulgarity
 * rather than a slur, and is left alone: this game is culling slurs, not
 * profanity. Words in [BRACKETS] are the page's own marker for related words
 * that DO have a non-offensive definition, so they are dropped. That bracket
 * convention is a hand-built over-blocking guard, and it would be perverse to
 * import the list while discarding it. {CURLY BRACES} only record which OSPD
 * edition dropped a word, so the braces are stripped and the word is kept.
 *
 * Parsing the markup rather than the rendered text is what makes this auditable:
 * the class names carry the provenance, and the caller checks the count against
 * the 259 NASPA published so a silent page change cannot pass unnoticed.
 */
export function extractNwl2020Purged(html: string): string[] {
  const pre = html.slice(html.indexOf('<pre>') + 5, html.indexOf('</pre>'));
  const purged = new Set<string>();
  const spans = pre.matchAll(
    /<span class="(?:nwl2020purge|nwl2020newexpurge)">([\s\S]*?)<\/span>/g,
  );
  for (const [, chunk] of spans) {
    const text = (chunk ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ') // acceptable related words: never deny
      .replace(/[{}]/g, ' '); // edition marker only: keep the word
    for (const word of text.match(/[A-Za-z]{2,}/g) ?? []) {
      purged.add(word.toLowerCase());
    }
  }
  return [...purged].sort();
}

/** One reviewed exclusion: a source entry deliberately not denied, and why. */
export interface DenyExclusion {
  readonly word: string;
  readonly reason: string;
}

function normalize(raw: string): string | null {
  const word = raw.trim().toLowerCase();
  return /^[a-z]+$/.test(word) ? word : null;
}

/**
 * Parse a vendored one-word-per-line list. Blank lines and # comments are
 * skipped. A line that is not plain a-z throws rather than being dropped, so a
 * mangled vendor run cannot silently shrink the list.
 */
export function parsePurgedList(text: string): string[] {
  const out = new Set<string>();
  // Identified by line, never by value. This list is the purged slurs, so an
  // error quoting an entry puts a slur wherever the error goes, and the line
  // number points at the row to open regardless.
  for (const [index, line] of text.split('\n').entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const word = normalize(trimmed);
    if (word === null) {
      throw new Error(`Purged list line ${index + 1}: entry is not a-z only.`);
    }
    out.add(word);
  }
  return [...out].sort();
}

/**
 * Parse a word-and-reason TSV. Columns: word, reason. The reason column is the
 * audit trail, so an entry without one throws rather than being accepted.
 */
export function parseReasonedWords(
  tsv: string,
  label: string,
): DenyExclusion[] {
  const out: DenyExclusion[] = [];
  for (const [index, line] of tsv.split('\n').entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [rawWord, rawReason] = line.split('\t');
    const word = normalize(rawWord ?? '');
    if (word === null || word === 'word') continue; // header or blank
    const reason = (rawReason ?? '').trim();
    if (reason === '') {
      throw new Error(`${label} on line ${index + 1} needs a reason.`);
    }
    out.push({ word, reason });
  }
  return out;
}

/**
 * Parse the reviewed exclusion list: words present in the source list that this
 * game deliberately keeps valid, because their primary sense in ordinary English
 * is neutral.
 */
export function parseDenyExclusions(tsv: string): DenyExclusion[] {
  return parseReasonedWords(tsv, 'Deny exclusion');
}

/**
 * Parse the reviewed supplement: slurs the source list does not cover.
 *
 * The 2020 revision was written for a tournament lexicon, so it kept words that
 * carry a non-offensive sense somewhere: faggot survives as a bundle of sticks,
 * fag as a cigarette, coon as a raccoon. That is the right call for competitive
 * Scrabble and the wrong one for a game Bea plays, where the reading that lands
 * is the only one that matters. The revision also predates transphobic slurs
 * being a category anyone audited, so it covers none of them.
 *
 * No public list solves this the way NWL2020 solves the main case, so these are
 * hand-curated and every one carries its reason. Held to the same bar as the
 * exclusions: a word stays valid when its primary sense in ordinary modern
 * English is neutral, which is why lame, deaf, queer, creole, dyke and poof are
 * not here and are documented in the file header instead.
 */
export function parseSupplementSlurs(tsv: string): DenyExclusion[] {
  return parseReasonedWords(tsv, 'Supplement entry');
}

/** What the derivation produced, and the counts the build reports. */
export interface DerivedDenylist {
  /** The words to deny: in the source, in the boundary, not excluded. */
  readonly denied: string[];
  /** Source entries the boundary does not contain, so denying them is a no-op. */
  readonly noOps: string[];
  /** Source entries held back by the reviewed exclusion list. */
  readonly excluded: DenyExclusion[];
}

/**
 * Derive the denylist: the source list, intersected with the validation
 * boundary, minus the reviewed exclusions.
 *
 * The intersection is the point. Importing a published list wholesale would deny
 * words the game never had, and would hide how much of the list is actually
 * doing work. An exclusion naming a word absent from the source throws, so the
 * audit list cannot rot into a set of stale entries that look like review but
 * exclude nothing.
 */
export function deriveDenylist(
  purged: readonly string[],
  exclusions: readonly DenyExclusion[],
  boundary: ReadonlySet<string>,
): DerivedDenylist {
  const source = new Set(purged);
  // Positional rather than by value, for the same reason the parsers above are:
  // these entries are drawn from the purged slur list. Counted over parsed
  // entries, since the exclusions have been through the parser by this point and
  // their file lines are no longer in hand.
  for (const [index, { word }] of exclusions.entries()) {
    if (!source.has(word)) {
      throw new Error(
        `Deny exclusion ${index + 1} of ${exclusions.length} is not in the ` +
          `source list; it excludes nothing.`,
      );
    }
  }
  const held = new Set(exclusions.map((e) => e.word));

  const denied: string[] = [];
  const noOps: string[] = [];
  for (const word of [...source].sort()) {
    if (held.has(word)) continue;
    if (boundary.has(word)) denied.push(word);
    else noOps.push(word);
  }
  return { denied, noOps, excluded: [...exclusions] };
}
