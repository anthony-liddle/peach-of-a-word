# Date Night Puzzle

A one-off page, for one person, for one evening. The date was **14 September 2026**.

It was live at `peachofaword.com/date-night` and is not any more. Nothing links here, and nothing builds it.

## What it was

Eight letters scrambled into a stable rack, and twenty words to find in them. The crown was `together`. Finding it opened the source-word card with the definition and etymology; filling the basket opened a note and a poem.

The deliberate difference from the daily: the accepted words were the twenty common-pool words for that rack and nothing else. The daily's basket is far too big to empty, and this one was meant to be finishable on a blanket.

The twenty words were generated from `~/Development/orchard/dist/common-pool.txt` at three letters or more, with no letter used more often than `together` holds it, then inlined. They are in `puzzle.ts`.

## How it was built

A second Vite entry beside `index.html`, assembled from the game's own components: the rack, the tiles, the compose row, the basket, the definition card and the decorations are the daily's, and the palette and type scale are the daily's stylesheet. Play ran through the daily's own reducer, so a rejection behaved exactly as it does in the game.

It had its own storage key, `peach-date-night/v1`. It never read or wrote `eight-letters/v1`, which holds the streak.

## How it was retired

The entry came out of `build.rollupOptions.input` and the rewrite came out of `vercel.json`. Removing both is what makes it unreachable. Putting the source in `public/` would have kept it served, underscore prefix or not.

## Reading this later

It is a record, not code. It is excluded from tsconfig, eslint and vitest, and its imports from `src/` will go stale the first time anything there moves. That is expected. To run it again you would put the files back under `src/`, restore the entry and the rewrite, and fix whatever has drifted.

The note and the poem also live in the vault, at `Projects/Peach of a Word/Archive/Date Night Puzzle.md`, because nobody finds a poem by going through git history a year later.
