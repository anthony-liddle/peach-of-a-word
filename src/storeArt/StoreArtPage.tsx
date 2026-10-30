import { type ReactNode, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CostumePart } from '@/ui/costumes.ts';
import { GROWTH_STAGES, bounds, type GrowthStage } from './growthStages.ts';
import cues from '@/audio/peach.cues.json';
import {
  BEATS,
  FACE_S,
  LOOP_S,
  PEACH_BOX,
  RETURN_AT,
  SETTLED_S,
  SINK_S,
  START_AT,
  peachAt,
  type Beat,
} from './motion.ts';
import {
  BACKDROP,
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
 * **In motion,** `?motion=<placement>&t=<seconds>` is the growing peach of
 * `motion.ts` at that moment, and `window.storeArtSeek(t)` moves it to
 * another without a reload, for `scripts/capture-store-motion.ts` to step
 * through frame by frame; `&bare=1` draws it on transparency, for the script
 * to lay over the background itself. `?sheet=arrivals&placement=<placement>` shows the
 * frames where each stage arrives, and `?sheet=moment&placement=<placement>`
 * one moment small, with its time under it, for the slowed loop point.
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
  const motion = params.get('motion') as PlacementId | null;
  if (motion && PLACEMENTS[motion])
    return (
      <Motion
        placement={motion}
        from={Number(params.get('t') ?? 0)}
        guides={guides}
        bare={params.get('bare') === '1'}
      />
    );
  const sheet = params.get('sheet');
  if (sheet === 'side') return <SideBySide guides={guides} />;
  if (sheet === 'light' || sheet === 'dark') return <OnAPhone kind={sheet} />;
  const placement = (params.get('placement') ?? 'header') as PlacementId;
  if (sheet === 'arrivals') return <Arrivals placement={placement} />;
  if (sheet === 'moment')
    return <Moment placement={placement} from={Number(params.get('t') ?? 0)} />;
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
  return (
    <Canvas placement={placement} guides={guides}>
      <Growth safe={PLACEMENTS[placement].safe} />
    </Canvas>
  );
}

/**
 * The page an artwork is drawn on, at Apple's pixel size: cute's background
 * and florettes, what's drawn, and the safe area over it if asked. `bare`
 * leaves the background out, on transparency.
 */
function Canvas({
  placement,
  guides,
  bare = false,
  children,
}: {
  placement: PlacementId;
  guides: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
  const { width, height, safe } = PLACEMENTS[placement];
  return (
    <div
      className={bare ? 'store-art store-art--bare' : 'store-art'}
      data-art={placement}
      data-safe={JSON.stringify(safe)}
      style={{
        width,
        height,
        background: bare
          ? 'transparent'
          : `linear-gradient(180deg, ${BACKDROP[0]}, ${BACKDROP[1]})`,
      }}
    >
      <Scatter width={width} height={height} />
      {children}
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

// ---- In motion ----------------------------------------------------------------

/**
 * How much of the safe area's height the peach's box fills. The rest is room
 * for a stage's grow-in, which overshoots its size by about a tenth of a
 * percent (`LARGEST_SCALE`).
 */
const PEACH_FILL = 0.99;

/**
 * The growing peach at `t` seconds, centred in the safe area, as big as its
 * box allows. Every stage is drawn in the same box, so the peach never moves;
 * only the drawing changes.
 */
function GrowingPeach({ safe, t }: { safe: Rect; t: number }) {
  const box = PEACH_BOX;
  const unit = Math.min(safe.w / box.w, safe.h / box.h) * PEACH_FILL;
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
      <svg
        data-focal
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        width={box.w * unit}
        height={box.h * unit}
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label="The peach, growing"
      >
        {peachAt(t)
          .filter((l) => l.opacity > 0)
          .map(({ key, parts, opacity, scale, anchor: [x, y] }) => (
            <g
              key={key}
              data-stage={key}
              opacity={opacity}
              transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}
            >
              <Parts parts={parts} />
            </g>
          ))}
      </svg>
    </div>
  );
}

declare global {
  interface Window {
    /** Move the growing peach to `t` seconds, and resolve once it's painted. */
    storeArtSeek?: (t: number) => Promise<void>;
  }
}

/** A time that starts at `from` and moves when `window.storeArtSeek` asks. */
function useSeek(from: number): number {
  const [t, setT] = useState(from);
  useEffect(() => {
    window.storeArtSeek = (to) =>
      new Promise((done) => {
        flushSync(() => setT(to));
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      });
    return () => {
      delete window.storeArtSeek;
    };
  }, []);
  return t;
}

/** One artwork in motion, at `t` seconds. */
export function MotionFrame({
  placement,
  t,
  guides = false,
  bare = false,
}: {
  placement: PlacementId;
  t: number;
  guides?: boolean;
  bare?: boolean;
}) {
  return (
    <Canvas placement={placement} guides={guides} bare={bare}>
      <GrowingPeach safe={PLACEMENTS[placement].safe} t={t} />
    </Canvas>
  );
}

/** One artwork in motion, held at `from` seconds until it's moved. */
function Motion({
  placement,
  from,
  guides,
  bare,
}: {
  placement: PlacementId;
  from: number;
  guides: boolean;
  bare: boolean;
}) {
  const t = useSeek(from);
  return (
    <MotionFrame placement={placement} t={t} guides={guides} bare={bare} />
  );
}

/**
 * The art scaled to `width`, or cropped to `crop` (a width over height) about
 * its centre and then scaled, as a 16:9 asset shows in a 3:2 search card. The
 * still, or the art in motion at `t` seconds.
 */
function Fit({
  placement,
  width,
  crop,
  guides = false,
  t,
}: {
  placement: PlacementId;
  width: number;
  crop?: number;
  guides?: boolean;
  /** The moment in motion to show, rather than the still. */
  t?: number;
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
        {t === undefined ? (
          <Art placement={placement} guides={guides} />
        ) : (
          <MotionFrame placement={placement} t={t} guides={guides} />
        )}
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
            <a href={`?art=${p}`}>{PLACEMENTS[p].label}</a>, and{' '}
            <a href={`?motion=${p}`}>in motion</a>
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

// ---- The sheets in motion -------------------------------------------------------

const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

/** A MIDI pitch's name, to the nearest semitone: 67 is G4. */
const noteName = (pitch: number) => {
  const n = Math.round(pitch);
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
};

/** The cue a beat plays, by its name in the cue file. */
const cueOf = (beat: Beat) =>
  beat.call === 'edition' ? 'edition' : `found-${beat.length}-set`;

/**
 * The notes a cue starts on, by name: a find's own note (its octave above, a
 * fifth as loud, is left out), or every note of Edition Complete.
 */
function notesOf(beat: Beat): string {
  const notes = (cues.cues as Record<string, { notes: { pitch: number }[] }>)[
    cueOf(beat)
  ]!.notes;
  return (beat.call === 'edition' ? notes : notes.slice(0, 1))
    .map((n) => noteName(n.pitch))
    .join(' ');
}

/** The moments after an arrival that the arrivals sheet shows. */
const AFTER = [0, 0.1, 0.2, 0.4, SETTLED_S];

/**
 * For each stage, the frame where it arrives and the frames after, until it
 * has settled, with the cue it plays; then the crown sinking into the soil's
 * mound as it comes back, and the soil's face once the crown has gone. Each frame is cropped to 4:3
 * about the peach.
 */
function Arrivals({ placement }: { placement: PlacementId }) {
  const rows = [
    ...BEATS.map((beat) => ({
      title: GROWTH_STAGES.find((s) => s.id === beat.stage)!.spoken,
      at: beat.at,
      sound: `${cueOf(beat)}: ${notesOf(beat)}`,
      after: AFTER,
      first: 'arrives',
    })),
    {
      title: 'sinking into the soil, as the mound comes back under it',
      at: RETURN_AT,
      sound: 'silent',
      after: [0, 0.1, 0.2, 0.3, 0.4],
      first: 'starts',
    },
    {
      title: "the soil's face, once the crown has gone",
      at: RETURN_AT + SINK_S,
      sound: 'silent',
      after: [0, 0.1, 0.2, 0.3, FACE_S],
      first: 'starts',
    },
  ];
  return (
    <main className="store-art-sheet" data-sheet="arrivals">
      <h1>
        {PLACEMENTS[placement].label}: a {LOOP_S.toFixed(2)} s loop, each file
        starting at {START_AT.toFixed(2)} s
      </h1>
      {rows.map((row) => (
        <section key={row.title}>
          <h2>
            {row.title}, at {row.at.toFixed(2)} s <span>{row.sound}</span>
          </h2>
          <div className="store-art-sheet__row">
            {row.after.map((d) => (
              <figure key={d}>
                <Fit
                  placement={placement}
                  crop={4 / 3}
                  width={220}
                  t={row.at + d}
                />
                <figcaption>
                  {d === 0 ? row.first : `+${d.toFixed(1)} s`}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

/**
 * One moment, small, with its time in the loop under it, for the loop point
 * slowed down. A time past the loop's end is the next loop's start.
 */
function Moment({ placement, from }: { placement: PlacementId; from: number }) {
  const t = useSeek(from);
  const u = ((t % LOOP_S) + LOOP_S) % LOOP_S;
  return (
    <main
      className="store-art-sheet store-art-sheet--moment"
      data-sheet="moment"
    >
      <Fit placement={placement} width={960} t={t} />
      <p>
        {u.toFixed(2)} s{t >= LOOP_S ? ', the loop again' : ''}
      </p>
    </main>
  );
}
