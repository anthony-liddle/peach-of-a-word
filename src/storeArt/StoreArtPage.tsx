import type { CostumePart } from '@/ui/costumes.ts';
import { GROWTH_STAGES, bounds, type GrowthStage } from './growthStages.ts';
import {
  PLACEMENTS,
  SEARCH_POINTS_ON_A_PHONE,
  type PlacementId,
  type Rect,
} from './storeArtSpec.ts';

/**
 * The App Store's header and search results art: the growing peach's seven
 * stages in a row, from the first sprout to the crown, each a little bigger
 * than the last, on cute's page with the app's florettes. No words, since
 * the app's icon and name sit beside the art in both places. Nothing here is
 * drawn that the game doesn't already draw.
 *
 * With `?art=<placement>` the page is that one artwork alone, at Apple's pixel
 * size, for `scripts/capture-store-art.ts`; `&guides=1` draws the safe area
 * over it, for checking only. `?sheet=side` shows the three placements side
 * by side, and `?sheet=light` and `?sheet=dark` show the art on a phone's
 * product page and in its search results. With no query, it links to them.
 *
 * **The row fills the safe area's width** and is centred in it, marked
 * `data-focal`; the capture script fails if any of it strays. The rest of
 * the canvas is background and florettes, which a device may crop.
 */
export function StoreArtPage() {
  const params = new URLSearchParams(window.location.search);
  const guides = params.get('guides') === '1';
  const art = params.get('art') as PlacementId | null;
  if (art && PLACEMENTS[art]) return <Art placement={art} guides={guides} />;
  const sheet = params.get('sheet');
  if (sheet === 'side') return <SideBySide guides={guides} />;
  if (sheet === 'light' || sheet === 'dark') return <OnAPhone kind={sheet} />;
  return <Index />;
}

// ---- The pieces --------------------------------------------------------------

const LEAF = '#8fd3b6';

function Parts({ parts }: { parts: readonly CostumePart[] }) {
  return parts.map((p, i) => (
    <path
      key={i}
      d={p.d}
      fill={p.fill ?? 'none'}
      opacity={p.opacity}
      stroke={p.stroke}
      strokeWidth={p.strokeWidth}
      strokeLinecap={p.stroke ? 'round' : undefined}
      strokeLinejoin={p.stroke ? 'round' : undefined}
    />
  ));
}

/** One stage of the growing peach, cropped to its drawing, `height` tall. */
function Stage({ of, height }: { of: GrowthStage; height: number }) {
  const b = bounds(of.parts);
  return (
    <svg
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      width={(height * b.w) / b.h}
      height={height}
      style={{ display: 'block' }}
      role="img"
      aria-label={`The peach ${of.spoken}`}
      data-stage={of.id}
    >
      <Parts parts={of.parts} />
    </svg>
  );
}

/** The app's decoration: a florette in the leaf's mint, faint. */
function Florette({
  x,
  y,
  size,
  opacity,
}: {
  x: number;
  y: number;
  size: number;
  opacity: number;
}) {
  return (
    <span
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        fontSize: size,
        lineHeight: 1,
        color: LEAF,
        opacity,
      }}
    >
      {'✿'}
    </span>
  );
}

/** Faint florettes at the canvas's edges, well clear of the safe area. */
function Scatter({ width, height }: { width: number; height: number }) {
  const u = height / 100;
  const at = (fx: number, fy: number, size: number, opacity: number) => (
    <Florette
      key={`${fx}-${fy}`}
      x={width * fx}
      y={height * fy}
      size={size * u}
      opacity={opacity}
    />
  );
  return (
    <>
      {at(0.06, 0.22, 7, 0.7)}
      {at(0.13, 0.68, 5, 0.55)}
      {at(0.035, 0.84, 4, 0.5)}
      {at(0.94, 0.18, 6, 0.65)}
      {at(0.87, 0.6, 4.5, 0.55)}
      {at(0.965, 0.86, 5.5, 0.6)}
    </>
  );
}

// ---- The growth ----------------------------------------------------------------

/** Each stage's share of the crown's scale: the first sprout at 0.6. */
const scale = (i: number) => 0.6 + (0.4 * i) / (GROWTH_STAGES.length - 1);

/** The gap between two stages, in the peach box's units at full scale. */
const GAP = 6;

/** How much of the safe area's width the row fills, short of rounding. */
const FILL = 0.99;

/**
 * The seven stages in a row, standing on one line, as wide as the safe area
 * allows and as tall as that makes them, centred in it.
 */
function Growth({ safe }: { safe: Rect }) {
  const sized = GROWTH_STAGES.map((st, i) => ({
    st,
    b: bounds(st.parts),
    k: scale(i),
  }));
  // Pixels per unit of the peach's box: the row's drawings and its gaps
  // across the safe area's width, or its tallest stage down its height.
  const across =
    sized.reduce((sum, { b, k }) => sum + b.w * k, 0) +
    GAP * (sized.length - 1);
  const tallest = Math.max(...sized.map(({ b, k }) => b.h * k));
  const unit = Math.min((safe.w * FILL) / across, safe.h / tallest);
  return (
    <div
      style={{
        position: 'absolute',
        left: safe.x,
        top: safe.y,
        width: safe.w,
        height: safe.h,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        data-focal
        style={{ display: 'flex', alignItems: 'flex-end', gap: GAP * unit }}
      >
        {sized.map(({ st, b, k }) => (
          <Stage key={st.id} of={st} height={b.h * k * unit} />
        ))}
      </div>
    </div>
  );
}

// ---- The canvas ----------------------------------------------------------------

/** One artwork at Apple's pixel size, with its safe area over it if asked. */
export function Art({
  placement,
  guides = false,
}: {
  placement: PlacementId;
  guides?: boolean;
}) {
  const { width, height, safe } = PLACEMENTS[placement];
  return (
    <div
      className="store-art"
      data-art={placement}
      data-safe={JSON.stringify(safe)}
      style={{ width, height }}
    >
      <Scatter width={width} height={height} />
      <Growth safe={safe} />
      {guides && (
        <div
          className="store-art__safe"
          style={{
            left: safe.x,
            top: safe.y,
            width: safe.w,
            height: safe.h,
            borderWidth: Math.round(height / 250),
          }}
        />
      )}
    </div>
  );
}

/**
 * The art scaled to `width`, or cropped to `crop` (a width over height) about
 * its centre and then scaled, as a 16:9 asset shows in a 3:2 search card.
 */
function Fit({
  placement,
  width,
  crop,
  guides = false,
}: {
  placement: PlacementId;
  width: number;
  crop?: number;
  guides?: boolean;
}) {
  const p = PLACEMENTS[placement];
  const shown = crop ? p.height * crop : p.width;
  const s = width / shown;
  return (
    <div
      style={{
        width,
        height: p.height * s,
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      <div
        style={{
          transform: `translateX(${(-(p.width - shown) / 2) * s}px) scale(${s})`,
          transformOrigin: '0 0',
        }}
      >
        <Art placement={placement} guides={guides} />
      </div>
    </div>
  );
}

// ---- The sheets -----------------------------------------------------------------

const PLACES = Object.keys(PLACEMENTS) as PlacementId[];

function Index() {
  return (
    <main className="store-art-index">
      <h1>Store Art</h1>
      <p>
        The App Store&apos;s header and search results art: the growing peach. A
        development page only.
      </p>
      <ul>
        <li>
          <a href="?sheet=side">Side by side</a> and{' '}
          <a href="?sheet=side&guides=1">with the safe areas</a>
        </li>
        <li>
          <a href="?sheet=light">On a phone</a> and{' '}
          <a href="?sheet=dark">on a dark page</a>
        </li>
        {PLACES.map((p) => (
          <li key={p}>
            <a href={`?art=${p}`}>{PLACEMENTS[p].label}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** The three placements at one height. */
function SideBySide({ guides }: { guides: boolean }) {
  const tall = 400;
  const wide = (p: PlacementId) =>
    (tall * PLACEMENTS[p].width) / PLACEMENTS[p].height;
  return (
    <main className="store-art-side" data-sheet="side">
      <div className="store-art-side__row">
        {PLACES.map((p) => (
          <figure key={p} style={{ width: wide(p) }}>
            <figcaption>
              {PLACEMENTS[p].label}
              {PLACEMENTS[p].upload ? '' : ', not uploaded'}
            </figcaption>
            <Fit placement={p} guides={guides} width={wide(p)} />
          </figure>
        ))}
      </div>
    </main>
  );
}

/** The app's row in the store: icon, name, subtitle and Get. */
function AppRow() {
  return (
    <div className="phone__app">
      <img src="/icon-512.png" alt="" />
      <div>
        <strong>Peach of a Word</strong>
        <span>A word game with roots</span>
      </div>
      <b>Get</b>
    </div>
  );
}

/**
 * The art on a phone, placed as Apple's own illustrations place it: the
 * header across the top of the product page, under the status bar with the
 * back and share buttons over its corners and the app's row below; and the
 * search asset as a rounded card under the app's row in search results, at
 * its width on a phone. Beside it, the 16:9 universal asset in the same card,
 * cropped to 3:2 about its centre, for comparison. How a device crops the
 * header is the Preview's to show; here it is whole.
 */
function OnAPhone({ kind }: { kind: 'light' | 'dark' }) {
  const width = 402;
  return (
    <main className={`phones phones--${kind}`} data-sheet={kind}>
      <figure className="phone" style={{ width }}>
        <div className="phone__header">
          <Fit placement="header" width={width} />
          <span className="phone__clock">9:41</span>
          <span className="phone__button phone__button--back">‹</span>
          <span className="phone__button phone__button--share">↑</span>
        </div>
        <div className="phone__inset">
          <AppRow />
        </div>
        <div className="phone__search">
          <div className="phone__field">word game</div>
          <AppRow />
          <div className="phone__card">
            <Fit placement="search" width={SEARCH_POINTS_ON_A_PHONE} />
          </div>
        </div>
        <figcaption>The header and the 3:2 search asset</figcaption>
      </figure>
      <figure className="phone" style={{ width }}>
        <div className="phone__search phone__search--alone">
          <div className="phone__field">word game</div>
          <AppRow />
          <div className="phone__card">
            <Fit
              placement="universal"
              crop={3 / 2}
              width={SEARCH_POINTS_ON_A_PHONE}
            />
          </div>
        </div>
        <figcaption>
          For comparison: the 16:9 asset in search results
        </figcaption>
      </figure>
    </main>
  );
}
