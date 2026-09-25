// src/data/glossProvenance.ts
//
// Which shipped definitions are this project's own words, and what each card
// credits as a result.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS.
//
// Three surfaces credited Wiktionary for every definition: the colophon, the
// definition card and the source-word reveal. For 38 words that is false. Those
// glosses were written for this project and owe nobody, and orchard's
// gloss-provenance.tsv has named them since v1.7.0.
//
// They are also the words most likely to be read. They are the odd ones a
// player stops on, which is why they were curated by hand in the first place.
//
// THE FILE IS READ AT BUILD TIME, not copied into this module. orchard writes
// it, the release carries it, `pnpm lexicon:update` vendors it, and Vite inlines
// it here. A list typed out in this file would be a second place to forget, and
// forgetting is what this whole pass is about.
//
// It is inlined rather than fetched because it is 38 words and a few hundred
// bytes. A file in public/data would be a second request per session and would
// move the content hash that versions the whole data directory, which
// re-downloads every list for every returning player. See lib/dataVersion.ts.
// ---------------------------------------------------------------------------
import provenanceTsv from '../../vendor/lexicon/gloss-provenance.tsv?raw';

/**
 * The words whose gloss was written for this project.
 *
 * Membership is the question, so the value is not kept: the file lists only
 * rows that are NOT Wiktionary derived, and today every one of them reads
 * `project`. If orchard ever adds a third value this set would quietly widen,
 * which is why the parse keeps only `project` rather than everything present.
 */
export const PROJECT_WORDS: ReadonlySet<string> = new Set(
  provenanceTsv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter(([, value]) => value === 'project')
    .map(([word]) => word as string),
);

export function isProjectGloss(word: string): boolean {
  return PROJECT_WORDS.has(word.toLowerCase());
}

/**
 * The credit line for one card, as the exact sentence it prints.
 *
 * Pure and exported so a test can read the real sentence rather than a
 * restatement of it. These are the licence notice on the screen, and the only
 * place most readers will ever meet it.
 *
 * ONE LINE RATHER THAN TWO on a crown whose definition is ours. The card shows
 * a definition and an etymology from different places, so the claim has to
 * split, but it splits inside one sentence rather than into a second paragraph
 * under each section. On a phone a second credit line costs more height than
 * the distinction is worth, and the combined sentence says exactly the same
 * thing: which text came from where.
 *
 * `hasEtymology` exists because eleven crowns have no usable English etymology
 * and their card is quiet. Crediting a source that is not on screen is the
 * thing this app already refuses to do on the definition card.
 */
export function creditFor(card: {
  word: string;
  /** `quiet` is the tapped found word; only `crown` ever shows an etymology. */
  register: 'quiet' | 'crown';
  hasEtymology?: boolean;
}): string {
  const ours = isProjectGloss(card.word);
  const etymology = card.register === 'crown' && (card.hasEtymology ?? true);

  if (!etymology) {
    return ours
      ? 'Written for this game.'
      : 'Definition from Wiktionary, CC BY-SA 4.0.';
  }
  return ours
    ? 'Definition written for this game. Etymology from Wiktionary, CC BY-SA 4.0.'
    : 'Definition and etymology from Wiktionary, CC BY-SA 4.0.';
}
