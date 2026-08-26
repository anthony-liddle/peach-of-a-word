import { TIERS, type TierStanding } from '@/engine/index.ts';
import type { Theme } from '../useTheme.ts';
import { crownName, tierName, copy } from '../themeCopy.ts';

interface Props {
  tier: TierStanding;
  theme: Theme;
  /**
   * Days cleared in a row, shown as a flame in the caption row the way the app
   * does. Omitted at two-column widths, where the toolbar pill is the streak's
   * home: exactly one home at any given width, never two at the same one.
   */
  streak?: number;
}

/**
 * The streak flame. An inline SVG rather than the 🔥 emoji, for the same reason
 * every other glyph on this page is drawn or typeset: an emoji arrives with its
 * own palette and its own platform-specific drawing, which reads as a sticker
 * pasted onto letterpress. This takes `currentColor`, so it is amber in one
 * theme and peach in the other by inheriting, and it scales with the type.
 */
function Flame() {
  return (
    <svg
      className="tier__flame"
      viewBox="0 0 12 16"
      width="0.75em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M6 1c.6 2.6 1.9 4 3 5.3 1.1 1.3 1.8 2.6 1.8 4.3 0 2.7-2.2 4.7-4.8 4.7s-4.8-2-4.8-4.7c0-1.1.3-2 .9-2.7 0 1.4 1.1 2.5 2.5 2.5S7.1 9.3 7.1 7.9c0-1.1-.4-1.6-.8-2.4C5.5 4 5.7 2.5 6 1Z"
      />
    </svg>
  );
}

/**
 * The goal bar, now a points climb toward the rack's reachable score. The fill
 * is two-color by where the points came from (set points in the on-page colour,
 * off-page points in the discovery colour), so the bar Bea loves survives and
 * reads as the climb. The current named rank is the label, theme-skinned.
 */
export function TierMeter({ tier, theme, streak = 0 }: Props) {
  // Off-page points can push the score past reachable; the bar fills to full and
  // the named rank caps at the top. The overflow is the climb toward the Stage 2
  // completion peak, which this bar does not measure.
  const pct = Math.min(100, Math.round(tier.fraction * 100));
  // Completion is the word-count peak above the named ladder: every common word
  // found. Once reached, the label quietly holds the themed crown so the
  // achievement stays visible while play continues. It is not a points rank.
  const completed = tier.setTotal > 0 && tier.setFound >= tier.setTotal;
  const label = completed ? crownName(theme) : tierName(theme, tier.index);
  const rest = Math.max(0, tier.reachable - tier.score);

  return (
    <section className="tier" aria-label="Progress">
      <div className="tier__head">
        <span className={'tier__label' + (completed ? ' is-complete' : '')}>
          {label}
        </span>
        <span className="tier__score">
          {tier.score} {tier.score === 1 ? 'point' : 'points'}
        </span>
      </div>
      <div
        className="tier__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={tier.reachable}
        aria-valuenow={Math.min(tier.score, tier.reachable)}
        aria-valuetext={`${pct} percent of reachable points, ${label}`}
      >
        {/* Three flex segments fill the track: on-page set points, off-page
            discovery points, then the transparent remainder. Set plus off-page
            is the score, so the coloured fill is exactly the fraction reached. */}
        <div className="tier__segs">
          <span
            className="tier__seg tier__seg--set"
            style={{ flexGrow: tier.setPoints }}
            aria-hidden="true"
          />
          <span
            className="tier__seg tier__seg--offpage"
            style={{ flexGrow: tier.offPagePoints }}
            aria-hidden="true"
          />
          <span
            className="tier__seg tier__seg--rest"
            style={{ flexGrow: rest }}
            aria-hidden="true"
          />
        </div>
        {/* Threshold markers for the named ranks above the first. */}
        {TIERS.slice(1).map((t) => (
          <span
            key={t.id}
            className="tier__tick"
            style={{ left: `${t.threshold * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {/* The caption row. The percent and the next-rank note are hidden per
          child rather than on the row, which is the load-bearing detail once
          the streak joins them: aria-hidden on the row would take the streak
          down with it, and the toolbar pill it replaces is readable text today.
          A silent accessibility regression behind a visual parity win is the
          worst trade available here.

          The two that stay hidden are hidden for the reason they always were:
          the progressbar's aria-valuetext already speaks the percent and the
          rank, so reading this row too would say it all twice. */}
      <div className="tier__ticks">
        <span aria-hidden="true">{pct}%</span>
        {tier.next ? (
          <span className="tier__next" aria-hidden="true">
            Next: {tierName(theme, tier.next.index)} at{' '}
            {Math.round(tier.next.threshold * 100)}%
          </span>
        ) : (
          <span className="tier__next" aria-hidden="true">
            {copy(theme).ladderPeak}
          </span>
        )}
        {streak > 0 && (
          <span className="tier__streak">
            <Flame />
            {/* A flame and a number said nothing about what it counted, so the
                app prints the word. The pill said "Days cleared in a row" in a
                title attribute, which touch never sees; this says it in text. */}
            <span className="visually-hidden">Streak: </span>
            {streak} {streak === 1 ? 'day' : 'days'}
            <span className="visually-hidden"> cleared in a row</span>
          </span>
        )}
      </div>
      {/* The explicit split beneath the bar: the same set-versus-off-page points
          the two-color fill shows, named and numbered so it survives colour-blind
          play and reads without decoding the bar. */}
      <p className="tier__key">
        <span className="tier__keyitem tier__keyitem--set">
          <span className="tier__swatch tier__swatch--set" aria-hidden="true" />
          {copy(theme).onPageLabel} {tier.setPoints}
        </span>
        <span className="tier__keyitem tier__keyitem--offpage">
          <span
            className="tier__swatch tier__swatch--offpage"
            aria-hidden="true"
          />
          {copy(theme).offPageLabel} {tier.offPagePoints}
        </span>
      </p>
    </section>
  );
}
