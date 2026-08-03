# Peach of a Word

A word game built around the quiet pleasure of finding the long word. Set eight
letters into words, climb the tiers by score, and crown the puzzle by finding
the eight-letter source word the rack was built around, then read its definition
and etymology.

Two themes ship: a soft cute theme (the default) and a letterpress theme, where
the letters are metal type sorts and the source word is the word the type was
cut for. This is the v1 Remix: untimed, daily, completion-driven. Built as a
gift.

## Features

- **Daily and endless puzzles.** The daily is deterministic, a pure function of
  the local calendar date, identical on any reload. Endless deals a fresh
  puzzle on demand and never touches the streak.
- **Real dictionary validation.** Guesses are checked against a merged boundary
  of ENABLE and SCOWL size 95 plus a small curated patch layer (about 430k
  words), so common modern words like meme and email are accepted. Any valid
  word scores.
- **A points tier ladder, not a pass-or-fail gate.** Every valid word moves you
  up the named tiers, and rarer finds pay more, so progress is always earnable
  and never gated on an arbitrary subset. The tier names are skinned per theme.
- **A completion peak.** Above the tier ladder sits the true crown: finding
  every common word the rack can spell (measured against a curated SCOWL common
  pool). It is reachable and rare, never required for the day to feel done.
- **A rarity ladder for off-page finds.** A valid word beyond the common pool is
  graded Uncommon, Rare, or Mythic by how far past the common cutoff it sits, a
  discovery reward rather than a consolation prize. It never carries a
  denominator, so open-ended finding never becomes a grind.
- **A tappable glossary.** Every word you find is tappable for a short
  definition. Finding the eight-letter source word unlocks its full definition
  and etymology, the emotional center of the game.
- **Two themes.** Cute (the default) and letterpress, each with its own type,
  palette, marks, and tier names, swappable live with no flash on load.
- **Built to be played by anyone.** Full keyboard play, screen-reader
  announcements, visible focus, reduced-motion support, and color is never the
  only signal.
- **Prototype audio behind a clean interface,** muteable, ready for a real synth
  to drop in later.

## Getting started

```bash
pnpm install
pnpm dev          # start the dev server
```

The baked word data lives under `public/data` and is committed, so a fresh
clone runs without a build step. You only need the data pipeline below if you
are rebuilding that data.

## Data pipeline

The word data is baked offline in stages. The network-touching stages are
manual and run by hand; their outputs are committed so the build and CI stay
offline.

- `pnpm data:vendor` downloads the raw ENABLE list and SCOWL bands into
  `scripts/data-raw`. One time, rarely rerun.
- `pnpm defs:acquire` fetches a short Wiktionary gloss for every formable word
  into `scripts/data-raw/definitions.tsv`. Resumable and cached.
- `pnpm defs:rederive` recomputes the glosses from the existing cache with
  better sense selection (demoting language codes, abbreviations, and other
  junk first senses), offline and idempotent. Run it after acquisition to
  clean up short-word definitions.
- `pnpm data:build` reads those vendored files and bakes the static assets into
  `public/data`. It is offline except for source-word etymologies, which it
  still fetches from Wiktionary on a cache miss and caches under
  `scripts/.cache`.
- `pnpm data:bake` applies the curated dictionary patch in
  `scripts/data-raw/dictionary-patch.tsv` to the shipped word lists. Pure,
  offline, and idempotent. Run it after any change to the patch.

### The committed files are the source of truth

`pnpm data:build` is effectively one-way and should not be reached for casually.
It touches the network, and a rerun rewrites `meta.json` with a fresh timestamp,
re-derives every per-puzzle bundle under `public/data/defs`, and reorders
`source-pool.json`. The result is a large diff nobody reviewed in files the daily
calendar is anchored to.

So `public/data` is maintained by the narrow tools, not by rerunning the
pipeline: `pnpm data:bake` for the patch, `pnpm data:denylist` for the denylist
rows, `pnpm data:calendar` for the calendar, `pnpm defs:rederive` for glosses.
Rerun `pnpm data:build` only when deliberately re-vendoring the source lexicons,
and review the calendar and the crowns afterwards.

### The data directory is versioned by its contents

Vite content-hashes the JS bundle, so every deploy gives it a new filename, but
files under `public/` keep the same URL forever. A returning visitor could
therefore pair a cached bundle with data from a later deploy, which is exactly
how the game broke: an old bundle fetched a newer patch file and threw on an
action it did not know.

So the built data directory carries a hash of its own contents,
`dist/data-<hash>/`, and the app is handed the same suffix at build time. A
bundle only ever requests the data it was built against. If that data has moved
on, the path is not in the current deploy, the fetch 404s, and the app reloads
itself once to pick up the current bundle. It never parses data it was not built
for.

Hashing the contents rather than stamping a build id keeps the cache useful: a
deploy that changes only the app leaves the data URL alone, so returning visitors
do not re-download 8MB of word lists that did not change.

In dev the suffix is empty and the files are served from `public/data` as usual.

### The patch is applied at build time, not at runtime

The word lists in `public/data` ship with the allowlist, denylist, and demotions
already baked in. The client fetches lists that are already correct: it does not
download the patch and does not parse it.

This is deliberate. The patch used to be fetched and re-parsed on every load,
which meant a browser holding a cached JS bundle could fetch a newer patch file
and crash on an action the old bundle did not know about. The merged pools are
fully determined at build time, so they are computed once, at build time.

The build parser stays strict and throws on a malformed row. That is correct
there: a typo must hard-fail the build. It was only ever wrong at runtime.

## Scripts

- `pnpm dev` start the Vite dev server
- `pnpm build` type-check and build the static site
- `pnpm test` run the engine and persistence unit tests
- `pnpm lint` / `pnpm format` lint and format
- `pnpm data:bake` apply the dictionary patch to the shipped word lists
- `pnpm data:build` rebuild the baked word data from the vendored lists (one-way, see above)
- `pnpm data:vendor` download the raw ENABLE and SCOWL lists (maintainer, one time)
- `pnpm defs:acquire` fetch Wiktionary glosses into the definitions TSV (maintainer)
- `pnpm defs:rederive` re-derive glosses from the cache with better sense selection (maintainer)
- `pnpm icons:build` regenerate the favicons, home-screen icons, and Open Graph image from source SVGs

## Metadata and icons

The theme-aware favicons, the PWA home-screen icons, and the 1200x630 Open Graph
image are generated from source SVGs by `scripts/build-icons.ts`. The favicons
swap by theme (a peach on cute, the source-word crown on letterpress); the
home-screen icons and the Open Graph image use the peach on the cute background,
with the home-screen icon composed to survive maskable cropping. They are
byproducts, not hand-exported binaries: rerun `pnpm icons:build` to rebuild
them.

Open Graph and canonical URLs must be absolute, so the site URL is configurable
via `VITE_SITE_URL` in `.env`, injected into `index.html` at build time. It
currently points at `https://peachofaword.com`; change that one line if the
production domain moves.

## Project structure

```
scripts/        build-time data pipeline (ENABLE, SCOWL, Wiktionary -> JSON)
scripts/data-raw/ vendored ENABLE, SCOWL, and definitions TSV, committed for offline builds
src/engine/     pure, framework-free, fully unit-tested game logic
src/data/       word-list loaders behind the engine's Dictionary interface
src/persistence/ local storage for streak and per-day progress
src/audio/      Web Audio synth behind an AudioEngine interface
src/ui/         thin React layer over the engine
public/data/    baked static assets the engine loads at runtime
```

The engine is pure and decoupled from React, the dictionary, and audio. Each of
those sits behind an interface so it can be swapped: a smaller word list, a real
Soundscape audio engine, or the timed Faithful Copy mode are all additive.

## Tech

React, Vite, TypeScript (strict), pnpm. Deployed on Vercel as a static site,
with privacy-light Vercel Analytics and no backend.

## Credits

Word data from ENABLE (public domain), SCOWL, and Wiktionary (CC BY-SA 4.0),
combined into the validation boundary with a small curated patch layer. See
[ATTRIBUTION.md](./ATTRIBUTION.md). Licensed MIT, see [LICENSE](./LICENSE).
