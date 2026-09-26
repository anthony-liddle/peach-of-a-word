# Attribution

This game is built on public and openly licensed word data. Credit where it is due.

## ENABLE word list (validation)

The validation dictionary is ENABLE (Enhanced North American Benchmark
LExicon). ENABLE is in the public domain and is the standard list for hobby
word games. No restrictions apply.

## SCOWL (common pool and source words)

The common-word pool and the eight-letter source words are derived from SCOWL
(Spell Checker Oriented Word Lists), compiled by Kevin Atkinson.

> The collective work is Copyright 2000-2020 by Kevin Atkinson as well as any
> of the copyrights mentioned below:
>
> Copyright 2000-2020 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute and sell these word lists, the
> associated scripts, the output created from the scripts, and its documentation
> for any purpose is hereby granted without fee, provided that the above
> copyright notice appears in all copies and that both that copyright notice and
> this permission notice appear in supporting documentation. Kevin Atkinson
> makes no representations about the suitability of this array for any purpose.
> It is provided "as is" without express or implied warranty.

The full SCOWL readme and the per-source copyrights are available at
<http://wordlist.aspell.net/>.

## Wiktionary (definitions and etymologies)

Short definitions and etymologies come from the English Wiktionary, licensed
under the Creative Commons Attribution-ShareAlike 4.0 License (CC BY-SA 4.0).
They are built in orchard and vendored here from a pinned release; see
`scripts/lexicon.lock.json` for the version and its checksums.

- `vendor/lexicon/definitions.tsv`: 24,896 rows. Baked into
  `public/data/defs/`, 793 per-rack files carrying 127,486 gloss entries across
  24,597 distinct words, for the tappable definitions.
- `vendor/lexicon/etymology.tsv`: 799 rows. Baked into
  `public/data/source-pool.json`, 793 source words, 766 of them with an
  etymology, for the source-word reveal.

**The definitions are adapted, not copied. The etymologies mostly are not.**
The two corpora were measured separately, because they do not behave the same
way:

- **No Wiktionary-derived definition is verbatim.** All 24,856 ship as a
  composed string, a part-of-speech label joined to one sense, which is not a
  string the entry contains: `noun. ` and then the gloss. Not one row lacks it.
- **13,216 of them had more than one sense to choose from**, 83,750 senses in
  total across them, and exactly one is kept per word. The rest are discarded.
- **628 are shorter than the sense they came from**, cut to the first sentence
  or to a character cap.
- **442 of the 799 etymologies differ from the entry's rendered prose. The
  other 357 are that prose unchanged**, give or take collapsed whitespace, and
  it would be wrong to call them adapted. Of the 442: 382 had zero-width or
  bidirectional marks removed, 174 join two or more Etymology sections into one
  line, 87 had footnote markers such as `[1]` removed, and HTML entities are
  decoded throughout.

The pipeline also rewrites em dashes to commas, since this project's house
style forbids them. How many definitions that changed cannot be recovered: the
committed sense cache stores text that rule has already been applied to. Where
the raw source is still on hand, the etymology cache, none of the 799 entries
contained an em dash, so there it changed nothing.

**40 of the 24,896 definitions are not from Wiktionary at all.** They were
written for this game, and `vendor/lexicon/gloss-provenance.tsv` names every
one. Those rows are this project's own words and carry no third-party licence.
The definition card and the source-word reveal caption them accordingly, and
never credit Wiktionary for them.

Two of those 40 words, `eighteen` and `fourteen`, are also source words with an
etymology. Their rows are split: the definition is this project's, the etymology
is Wiktionary's, and the reveal credits both in one line.

- Source: <https://en.wiktionary.org/>
- License: <https://creativecommons.org/licenses/by-sa/4.0/>

Per the license, derivative use of the Wiktionary-derived text is shared under
the same terms. The colophon, the definition card and the source-word reveal
each carry a short attribution line, and the baked data files record the source.
Orchard is private; the vendored files and the baked data are in this
repository, which is public.

**Corrected 2026-09-25.** This section said the text was "pulled from the
English Wiktionary at build time" and named `scripts/data-raw/definitions.tsv`.
Neither was still true: the corpora are vendored from a pinned orchard release,
and that path does not exist. It also said nothing about the text being
modified, and nothing about the 38.

**Corrected 2026-09-26, for orchard v1.8.0.** Two curated rows, `fagot` and
`sulla`, became this project's in that release, so 38 became 40 and 24,858
became 24,856. The multi-sense figures were also corrected to describe the
Wiktionary-derived rows they sit under: 13,220 had been counted over the whole
generated corpus, and 95,418 is the whole sense cache's total.

## Fonts

Set in Fraunces and Spectral, both available under the SIL Open Font License.
