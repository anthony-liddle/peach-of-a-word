import { Children, type ReactNode } from 'react';
import type { CostumePart } from '@/ui/costumes.ts';
import { GROWTH_STAGES, bounds, type GrowthStage } from './growthStages.ts';
import {
  DIRECTIONS,
  PLACEMENTS,
  SEARCH_POINTS_ON_A_PHONE,
  type DirectionId,
  type PlacementId,
  type Rect,
} from './storeArtSpec.ts';

/**
 * The App Store's header and search results art, drawn from the game's own
 * pieces: the growing peach's stages, the tiles, Fredoka and Nunito, and
 * cute's palette. Nothing here is drawn that the game doesn't already draw.
 *
 * With `?art=<direction>-<placement>` the page is that one artwork alone, at
 * Apple's pixel size, for `scripts/capture-store-art.ts`; `&guides=1` draws
 * the safe area over it, for checking only. `?sheet=side` puts the directions
 * side by side, and `?sheet=light` and `?sheet=dark` show each on a phone's
 * product page and in its search results. With no query, it links to them.
 *
 * **Everything that matters sits in the safe area,** laid out in hundredths of
 * its height, and is marked `data-focal`; the capture script fails if any of
 * it strays. The rest of the canvas is background and florettes, which a
 * device may crop.
 */
export function StoreArtPage() {
  const params = new URLSearchParams(window.location.search);
  const guides = params.get('guides') === '1';
  const art = params.get('art');
  if (art) {
    const [direction, placement] = art.split('-') as [DirectionId, PlacementId];
    if (DIRECTIONS[direction] && PLACEMENTS[placement])
      return (
        <Art direction={direction} placement={placement} guides={guides} />
      );
  }
  const sheet = params.get('sheet');
  if (sheet === 'side') return <SideBySide guides={guides} />;
  if (sheet === 'light' || sheet === 'dark') return <OnAPhone kind={sheet} />;
  return <Index />;
}

// ---- The pieces --------------------------------------------------------------

const INK = '#6b4636';
const INK_SOFT = '#6f5142';
const ACCENT = '#c42e60';
const ACCENT_DEEP = '#a8264f';
const LEAF = '#8fd3b6';
/** The iOS wordmark's hand shear, `CuteFont.displayOblique`: c = 0.18. */
const OBLIQUE = `skewX(${(-Math.atan(0.18) * 180) / Math.PI}deg)`;

const stage = (id: string): GrowthStage =>
  GROWTH_STAGES.find((s) => s.id === id)!;

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
    >
      <Parts parts={of.parts} />
    </svg>
  );
}

/** "Peach of a Word", as the iOS title sets it. */
function Wordmark({ size }: { size: number }) {
  return (
    <div
      style={{
        fontFamily: 'Fredoka',
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        color: INK,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{ display: 'inline-block', color: ACCENT, transform: OBLIQUE }}
      >
        Peach
      </span>{' '}
      of a Word
    </div>
  );
}

/** "Pick the peaches", the title's line under the name. */
function Subline({ size }: { size: number }) {
  return (
    <div
      style={{
        fontFamily: 'Nunito',
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '0.367em',
        paddingLeft: '0.367em',
        textTransform: 'uppercase',
        color: ACCENT_DEEP,
        whiteSpace: 'nowrap',
      }}
    >
      Pick the peaches
    </div>
  );
}

/** The rack's tiles, spelling `word`, each `width` pixels wide. */
function Tiles({ word, width }: { word: string; width: number }) {
  return (
    <div style={{ display: 'flex', gap: width * 0.16 }}>
      {[...word].map((letter, i) => (
        <div
          key={i}
          data-tile
          style={{
            width,
            height: width * (4 / 3),
            boxSizing: 'border-box',
            border: `${Math.max(1, width * 0.012)}px solid #ffd9c8`,
            borderRadius: width * 0.22,
            background: '#ffffff',
            boxShadow: `0 ${width * 0.07}px 0 #ffc9b4`,
            marginBottom: width * 0.07,
            display: 'grid',
            placeContent: 'center',
            fontFamily: 'Fredoka',
            fontWeight: 600,
            fontSize: width * 0.66,
            lineHeight: 1,
            color: INK,
            paddingBottom: width * 0.06,
          }}
        >
          {letter}
        </div>
      ))}
    </div>
  );
}

/** Where `industry` came from, in a few words. */
function Etymology({ size }: { size: number }) {
  return (
    <div
      style={{
        fontFamily: 'Nunito',
        fontStyle: 'italic',
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.2,
        color: INK_SOFT,
        whiteSpace: 'nowrap',
      }}
    >
      From Latin <span style={{ color: INK }}>industria</span>, “diligence”
    </div>
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

// ---- The layout ----------------------------------------------------------------

interface Frame {
  width: number;
  height: number;
  safe: Rect;
  /** A hundredth of the safe area's height, the unit the focal sizes are in. */
  s: number;
  /** A hundredth of the canvas's height, the unit the florettes are in. */
  u: number;
}

/**
 * The focal point: laid out in the safe area, centred in it, each child marked
 * `data-focal` for the capture script's check.
 */
function Focal({
  frame,
  row = false,
  gap,
  children,
}: {
  frame: Frame;
  row?: boolean;
  gap: number;
  children: ReactNode;
}) {
  const { safe } = frame;
  return (
    <div
      style={{
        position: 'absolute',
        left: safe.x,
        top: safe.y,
        width: safe.w,
        height: safe.h,
        display: 'flex',
        flexDirection: row ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
      }}
    >
      {Children.map(children, (c) => (
        <div data-focal style={{ display: 'flex', justifyContent: 'center' }}>
          {c}
        </div>
      ))}
    </div>
  );
}

/** A column inside a focal row: its children centred under each other. */
function Column({ gap, children }: { gap: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap,
      }}
    >
      {children}
    </div>
  );
}

/** Faint florettes at the canvas's edges, well clear of the safe area. */
function Scatter({ width, height, u }: Frame) {
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

// ---- The directions ------------------------------------------------------------

/**
 * A: the peach large, with the name and "Pick the peaches". Side by side in
 * the header's and the search asset's wide safe areas; stacked, as on the
 * title, in the universal asset's narrower one.
 */
function ThePeach(f: Frame, placement: PlacementId) {
  const { s } = f;
  const peach = stage('perfectly-peachy');
  if (placement === 'universal')
    return (
      <>
        <Scatter {...f} />
        <Focal frame={f} gap={4.5 * s}>
          <Stage of={peach} height={58 * s} />
          <Column gap={4 * s}>
            <Wordmark size={17 * s} />
            <Subline size={5 * s} />
          </Column>
        </Focal>
      </>
    );
  const wide = placement === 'header';
  return (
    <>
      <Scatter {...f} />
      <Focal frame={f} row gap={(wide ? 10 : 8) * s}>
        <Stage of={peach} height={(wide ? 88 : 90) * s} />
        <Column gap={(wide ? 5.5 : 4.4) * s}>
          <Wordmark size={(wide ? 21 : 16.5) * s} />
          <Subline size={(wide ? 6.2 : 5) * s} />
        </Column>
      </Focal>
    </>
  );
}

/** B: the stages in a row, sprout to crown, each a little bigger. */
function TheGrowth(f: Frame, placement: PlacementId) {
  const { s } = f;
  const fit = {
    header: { width: 238, gap: 4.5, tallest: 62, name: 15, under: 8 },
    search: { width: 200, gap: 3.5, tallest: 62, name: 15, under: 7 },
    universal: { width: 140, gap: 2.2, tallest: 50, name: 13, under: 6 },
  }[placement];
  const n = GROWTH_STAGES.length;
  const sized = GROWTH_STAGES.map((st, i) => ({
    st,
    b: bounds(st.parts),
    k: 0.6 + (0.4 * i) / (n - 1),
  }));
  // Drawing units to safe-area hundredths: as large as the row's width and
  // its tallest stage allow.
  const across = sized.reduce((sum, { b, k }) => sum + b.w * k, 0);
  const unit = Math.min(
    (fit.width - fit.gap * (n - 1)) / across,
    fit.tallest / Math.max(...sized.map(({ b, k }) => b.h * k)),
  );
  return (
    <>
      <Scatter {...f} />
      <Focal frame={f} gap={fit.under * s}>
        <div
          style={{ display: 'flex', alignItems: 'flex-end', gap: fit.gap * s }}
        >
          {sized.map(({ st, b, k }) => (
            <Stage key={st.id} of={st} height={b.h * k * unit * s} />
          ))}
        </div>
        <Wordmark size={fit.name * s} />
      </Focal>
    </>
  );
}

/** C: the eight tiles of `industry`, its crowned peach, and where it came from. */
function TheWord(f: Frame, placement: PlacementId) {
  const { s } = f;
  const fit = {
    header: { peach: 34, tile: 21.5, line: 7.5, gap: 5 },
    search: { peach: 40, tile: 20, line: 7, gap: 5 },
    universal: { peach: 36, tile: 15, line: 7, gap: 4.5 },
  }[placement];
  return (
    <>
      <Scatter {...f} />
      <Focal frame={f} gap={fit.gap * s}>
        <Stage of={stage('crown')} height={fit.peach * s} />
        <Tiles word="industry" width={fit.tile * s} />
        <Etymology size={fit.line * s} />
      </Focal>
    </>
  );
}

const DRAW: Record<
  DirectionId,
  (f: Frame, placement: PlacementId) => ReactNode
> = { a: ThePeach, b: TheGrowth, c: TheWord };

// ---- The canvas ----------------------------------------------------------------

/** One artwork at Apple's pixel size, with its safe area over it if asked. */
export function Art({
  direction,
  placement,
  guides = false,
}: {
  direction: DirectionId;
  placement: PlacementId;
  guides?: boolean;
}) {
  const { width, height, safe } = PLACEMENTS[placement];
  const f: Frame = { width, height, safe, s: safe.h / 100, u: height / 100 };
  return (
    <div
      className="store-art"
      data-art={`${direction}-${placement}`}
      data-safe={JSON.stringify(safe)}
      style={{ width, height }}
    >
      {DRAW[direction](f, placement)}
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

/** The art drawn `width` pixels wide, in a box of that size. */
function Fit({
  direction,
  placement,
  width,
  guides = false,
}: {
  direction: DirectionId;
  placement: PlacementId;
  width: number;
  guides?: boolean;
}) {
  const p = PLACEMENTS[placement];
  const scale = width / p.width;
  return (
    <div
      style={{
        width,
        height: p.height * scale,
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <Art direction={direction} placement={placement} guides={guides} />
      </div>
    </div>
  );
}

// ---- The sheets -----------------------------------------------------------------

const IDS = Object.keys(DIRECTIONS) as DirectionId[];
const PLACES = Object.keys(PLACEMENTS) as PlacementId[];

function Index() {
  return (
    <main className="store-art-index">
      <h1>Store Art</h1>
      <p>
        The App Store&apos;s header and search results art, in {IDS.length}{' '}
        directions. A development page only.
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
        {IDS.flatMap((d) =>
          PLACES.map((p) => (
            <li key={`${d}-${p}`}>
              <a href={`?art=${d}-${p}`}>
                {DIRECTIONS[d].name}: {PLACEMENTS[p].label}
              </a>
            </li>
          )),
        )}
      </ul>
    </main>
  );
}

/** Each direction's three artworks at one height, a direction to a row. */
function SideBySide({ guides }: { guides: boolean }) {
  const tall = 400;
  const wide = (p: PlacementId) =>
    (tall * PLACEMENTS[p].width) / PLACEMENTS[p].height;
  return (
    <main className="store-art-side" data-sheet="side">
      <div className="store-art-side__row">
        {PLACES.map((p) => (
          <span
            key={p}
            className="store-art-side__head"
            style={{ width: wide(p) }}
          >
            {PLACEMENTS[p].label}
          </span>
        ))}
      </div>
      {IDS.map((id) => (
        <section key={id}>
          <h2>{DIRECTIONS[id].name}</h2>
          <div className="store-art-side__row">
            {PLACES.map((p) => (
              <Fit
                key={p}
                direction={id}
                placement={p}
                guides={guides}
                width={wide(p)}
              />
            ))}
          </div>
        </section>
      ))}
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
 * Each direction on a phone, placed as Apple's own illustrations place them:
 * the header across the top of the product page, under the status bar with
 * the back and share buttons over its corners and the app's row below; and
 * the search asset as a rounded card under the app's row in search results,
 * at its width on a phone. How a device crops the header is the Preview's to
 * show; here it is whole.
 */
function OnAPhone({ kind }: { kind: 'light' | 'dark' }) {
  const width = 402;
  return (
    <main className={`phones phones--${kind}`} data-sheet={kind}>
      {IDS.map((id) => (
        <figure key={id} className="phone" style={{ width }}>
          <div className="phone__header">
            <Fit direction={id} placement="header" width={width} />
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
              <Fit
                direction={id}
                placement="search"
                width={SEARCH_POINTS_ON_A_PHONE}
              />
            </div>
          </div>
          <figcaption>{DIRECTIONS[id].name}</figcaption>
        </figure>
      ))}
    </main>
  );
}
