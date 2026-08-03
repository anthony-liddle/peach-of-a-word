# Sensitive words: what is left, and what is Antoine's call

Two open questions from the slur denylist work. Both are reported here rather
than acted on, because where the line sits is Antoine's call. Nothing in this
document has been changed in the data.

Measured against the shipped assets after the denylist landed: 544 crowns, the
patched pools the calendar build now derives from, and 243 denied words.

The profanity class is a separate decision that is not covered here or by the
denylist. Sweeping the OSPD expurgations that are not slurs against the boundary
and the racks turns up 22 reachable words (`arse` on 27 racks, `clit` on 14,
`fart` on 9, `piss` on 8, `shit` on 6, and so on down). The denylist is
deliberately a slur cull, not a profanity cull, so none of these were touched. A
game family members play may well want them gone too, but that is a different
call and a different list.

## Part 3: sensitive words in the common pool

A word in the common pool is _required_ for completion, not merely permitted. To
reach Peachy Keen Supreme on an affected rack, a player has to type it. That is a
stronger statement than letting a word be found, and it is the distinction that
matters here.

### The problem is smaller than it looked

Five of the nine words on the original list are in the common pool but are **not
formable from any of the 544 racks**. They are never required, never offered, and
never seen. Removing them would change nothing a player can observe.

| Word       | In common pool | Racks that can spell it |
| ---------- | -------------- | ----------------------- |
| `abortion` | yes            | 0                       |
| `sexual`   | yes            | 0                       |
| `sexually` | yes            | 0                       |
| `suicide`  | yes            | 0                       |
| `violence` | yes            | 0                       |

Note that `sexually`, `violence` and `abortion` are still in the common pool.
Removing them as crowns did not remove them from the pool: those are two separate
lists, and only the crown list changed.

### The four that actually bind

| Word       | Racks  | Affected racks                                                                                                                                                                     |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rape`     | **18** | apparent, manpower, metaphor, operator, pacifier, paradise, particle, peculiar, personal, persuade, pleasure, portable, practice, pregnant, probable, rephrase, separate, taxpayer |
| `oriental` | 2      | oriental, relation                                                                                                                                                                 |
| `sex`      | 1      | exposure                                                                                                                                                                           |
| `terror`   | 1      | reporter                                                                                                                                                                           |

`rape` is the one that matters. It is required on 18 racks, including `pregnant`,
which is a genuinely bad pairing.

`oriental` is also a crown, so it appears in the crown sweep below as well. It is
the only one of the four that is itself an 8-letter word, which is why its par
delta is the largest.

### Before and after, if all four were removed from the common pool

Completion count is `commonWords.size`, the "X of Y" denominator. Par is
`reachableScore`, the set points the named ladder runs against.

| Rack       | Count   | Par       | Drops      |
| ---------- | ------- | --------- | ---------- |
| `apparent` | 38 → 37 | 102 → 99  | `rape`     |
| `exposure` | 28 → 27 | 94 → 93   | `sex`      |
| `manpower` | 55 → 54 | 143 → 140 | `rape`     |
| `metaphor` | 67 → 66 | 165 → 162 | `rape`     |
| `operator` | 44 → 43 | 118 → 115 | `rape`     |
| `oriental` | 81 → 80 | 261 → 246 | `oriental` |
| `pacifier` | 30 → 29 | 78 → 75   | `rape`     |
| `paradise` | 62 → 61 | 224 → 221 | `rape`     |
| `particle` | 77 → 76 | 229 → 226 | `rape`     |
| `peculiar` | 41 → 40 | 109 → 106 | `rape`     |
| `personal` | 73 → 72 | 267 → 264 | `rape`     |
| `persuade` | 47 → 46 | 161 → 158 | `rape`     |
| `pleasure` | 41 → 40 | 145 → 142 | `rape`     |
| `portable` | 68 → 67 | 182 → 179 | `rape`     |
| `practice` | 52 → 51 | 134 → 131 | `rape`     |
| `pregnant` | 48 → 47 | 122 → 119 | `rape`     |
| `probable` | 28 → 27 | 82 → 79   | `rape`     |
| `relation` | 81 → 80 | 261 → 246 | `oriental` |
| `rephrase` | 38 → 37 | 134 → 131 | `rape`     |
| `reporter` | 20 → 19 | 68 → 61   | `terror`   |
| `separate` | 60 → 59 | 206 → 203 | `rape`     |
| `taxpayer` | 34 → 33 | 82 → 79   | `rape`     |

22 racks affected, 22 set words removed in total, 92 par points. Every rack loses
exactly one word. No rack falls below the set-size floor of 15; the smallest
after the change is `reporter` at 19.

### Two things worth knowing before deciding

**These words stay findable.** Removing a word from the common pool does not deny
it. It stops being required and becomes an ordinary off-page find, still valid
and still scored, just on the rarity ladder instead of in the set. That is the
whole point of the distinction: _permitted_ rather than _required_.

**No migration is needed, and this is verified rather than assumed.** Progress
persists as `{ sourceWord, found: string[] }` and nothing else
(`src/persistence/storage.ts:11`). Completion, par and the tier are all recomputed
from the live puzzle on load, and the restore path keeps only words the current
validation set still knows (`src/ui/useGame.ts:196`). A previously incomplete
board may simply become complete. There is a test for the equivalent denial case
in `src/ui/useGame.test.ts`.

### Recommendation

Remove `rape`, `oriental`, `sex` and `terror` from the common pool, and the five
unreachable words too since they cost nothing. Leave all nine valid to find and
score. The effect on play is one word per affected rack and par drops of 1 to 15
points, which is inside the noise of the ladder.

---

## Part 2 follow-up: the rest of the crown sweep

`sexually`, `violence` and `abortion` are already substituted. Sweeping the
remaining 541 for anything else that would be odd to celebrate in a cute-themed
game, grouped by how strongly it reads that way. Reported, not acted on.

A crown is the word the whole day is built around and the word the reveal card
congratulates you for finding, so the bar is higher than for an ordinary find.

### Strongly recommend substituting

| Word       | Why                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `genocide` | The clearest case in the list by some distance. Not a thing to celebrate finding.                                                                                  |
| `atrocity` | Same register.                                                                                                                                                     |
| `oriental` | Dated racial term. Also required in the common pool, see Part 3 above.                                                                                             |
| `handicap` | Dated term for disability. The 2020 revision cut adjacent forms (`nonhandicapped`, `harelipped`) but not this one, so it is a judgment call rather than precedent. |

### Worth a decision: dated or othering usage

| Word                               | Why                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `chairman`, `salesman`, `manpower` | Gendered generics. `chairman` is a crown and `manpower` is a crown too. |
| `dictator`, `sabotage`             | Grim, though ordinary vocabulary.                                       |

### Noted, probably fine

`criminal`, `prisoner`, `offender`, `disaster`, `demolish`, `threaten`,
`frighten`, `sinister`, `dreadful`, `wretched`, `hopeless`, `helpless`,
`bankrupt`, `hangover`, `pregnant`, `military`, `paranoid`, `delusion`,
`cobblers`.

These are all ordinary English a child will meet in a book. The list is here so
the sweep is visible rather than because any of them should move. `cobblers` is
the only mild surprise: it carries a vulgar British sense alongside the shoemaker
one, and the game will show the shoemaker definition.

### If any of these are substituted

The same constraint applies as in Part 2, and it is not a small one. The eligible
pool minus the Phase 2 cull is exactly the 544 committed crowns, so a substitution
has nothing to draw on until the source pool is widened. The cull cannot supply a
replacement: every word in it breaks one of the three rules by construction, and a
plural has no etymology of its own to reveal, which is the whole point of a crown.

So each substitution costs one admission through `pnpm data:admit`, recorded in
`scripts/data-raw/source-admissions.tsv`. There is plenty of headroom (see the
next section), but it is a network step and it needs `pnpm defs:acquire` after it.

## The source pool is much smaller than it should be

Worth knowing before deciding anything above. There are 1,575 eight-letter words
in the common pool at the right band, and only 710 in the source pool. The other
865 were dropped for missing a definition or an etymology.

For a large share of them that is an artefact, not a fact about the word.
`enrichWord` re-fetches a cached raw response when the _definition_ is null, but
not when the _etymology_ is null, so a throttled etymology fetch is trusted
forever. `distance`, `restrain` and `integral` were all in that state; re-fetching
returns a full etymology for each, which is how they were admitted here.

Widening that guard would be correct, but it would admit hundreds of source words
on the next `pnpm data:build` and append that many crowns to the calendar. That is
a decision of its own, so it is reported rather than done. See the note on
`enrichWord` in `scripts/lib/wiktionary.ts`.

---

## Known divergence, reported not fixed

The calendar build derives eligibility from ENABLE alone, while the runtime
validates against ENABLE union SCOWL 95, and the build applies only the deny half
of the dictionary patch. Both predate this work. Closing either one grows the
calendar: applying the allowlist lifts `appalled` and `approach` over the floor,
appending two crowns. Since this change is subtraction and a wider boundary is
addition, they are left alone. See the comment in `scripts/lib/pools.ts`.
