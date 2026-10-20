import { useEffect, useRef, type ReactNode } from 'react';
import { COSTUMES, COSTUME_ORDER, type CostumeId } from '@/ui/costumes.ts';
import { drawPeach, peachSvg } from '@/ui/peachArt.ts';
import { PeachMark, SourcePeach } from '@/ui/components/PeachMark.tsx';

/**
 * Every costume beside the plain peach, at every size the cute peach appears
 * on the web: the source-word mark at each text size, the completion card's
 * ornament, the tab icon on a light and a dark tab strip, and the confetti.
 */
const ROWS: readonly (CostumeId | null)[] = [null, ...COSTUME_ORDER];

/** The text-size steps index.css defines, as multiples of the chip's 1.1rem. */
const TEXT_SIZES = [
  { name: 'default', scale: 1 },
  { name: 'large', scale: 1.125 },
  { name: 'largest', scale: 1.25 },
] as const;

function title(id: CostumeId | null): string {
  return id
    ? `The peach ${COSTUMES[id].spoken}`
    : 'The plain peach, as it is today';
}

export function CostumesPage() {
  return (
    <main className="costumes">
      <h1>Costumes</h1>
      <p className="costumes__lede">
        Each costume beside the plain peach, at every size the cute peach is
        drawn on the web. A development page only.
      </p>
      {ROWS.map((id) => (
        <section className="costumes__row" key={id ?? 'plain'}>
          <h2>{title(id)}</h2>
          <div className="costumes__cells">
            <Cell label="Large">
              <PeachMark className="costumes__big" costume={id} />
            </Cell>
            <Cell label="Completion card, 3rem">
              <div className="costumes__card">
                <PeachMark className="costumes__ornament" costume={id} />
                <span className="costumes__card-line">Peachy Keen Supreme</span>
              </div>
            </Cell>
            <Cell label="Source-word mark, three text sizes">
              <div className="costumes__chips">
                {TEXT_SIZES.map(({ name, scale }) => (
                  <span
                    className="found__word found__word--source"
                    key={name}
                    style={{ fontSize: `${1.1 * scale}rem` }}
                  >
                    {id ? (
                      <SourcePeach className="costumes__mark" costume={id} />
                    ) : (
                      <span className="mark mark--source" aria-hidden="true" />
                    )}
                    <span className="found__wordtext">genetics</span>
                  </span>
                ))}
              </div>
            </Cell>
            <Cell label="Tab icon, 16 and 32 px">
              <TabStrip costume={id} />
            </Cell>
            <Cell label="Confetti, 14 to 30 px">
              <ConfettiSample costume={id} />
            </Cell>
          </div>
        </section>
      ))}
    </main>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="costumes__cell">
      {children}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function TabStrip({ costume }: { costume: CostumeId | null }) {
  const href = `data:image/svg+xml,${encodeURIComponent(peachSvg({ costume, face: true }))}`;
  return (
    <div className="costumes__tabs">
      {(['light', 'dark'] as const).map((tone) => (
        <div className={`costumes__strip costumes__strip--${tone}`} key={tone}>
          <span className="costumes__tab">
            <img src={href} width={16} height={16} alt="" />
            Peach of a Word
          </span>
          <img src={href} width={32} height={32} alt="" />
        </div>
      ))}
    </div>
  );
}

/**
 * The confetti draws on a canvas, so its peach is drawn here the way the
 * burst would draw it. Today's burst throws the peach emoji; a costume needs
 * the drawn peach instead, and the plain row shows both.
 */
function ConfettiSample({ costume }: { costume: CostumeId | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = 220 * ratio;
    canvas.height = 48 * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    let x = 12;
    for (const size of [14, 18, 22, 26, 30]) {
      drawPeach(ctx, x + size / 2, 24, size, { costume, face: false });
      x += size + 10;
    }
    if (!costume) {
      ctx.font = '22px serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u{1F351}', x + 4, 25);
    }
  }, [costume]);
  return (
    <canvas
      ref={ref}
      className="costumes__confetti"
      style={{ width: 220, height: 48 }}
    />
  );
}
