import type { CostumeId } from '../costumes.ts';
import { peachParts, sourceMarkParts, type PeachPart } from '../peachArt.ts';

/**
 * The peach mark: the app's one peach drawing, the same geometry as
 * public/favicon-cute.svg, which is also the peach on the OG card and the share
 * signature. Reused rather than redrawn so the completion ornament matches the
 * peach everywhere else. PeachMark.test.tsx reads the favicon file and pins the
 * two together, because an SVG asset cannot import a component.
 *
 * Always decorative: every place it renders has its own accessible name.
 * Decorations.tsx still carries its own inline copy of the same paths, which
 * could adopt this component later; that file holds the dino and is out of
 * scope here.
 *
 * A costume, if one is given, is drawn over the peach in the same box, so it
 * never changes the peach's footprint. See costumes.ts.
 */
export function PeachMark({
  className,
  costume,
  face = true,
}: {
  className?: string;
  costume?: CostumeId | null;
  face?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      {peachParts({ costume, face }).map((p, i) => (
        <Part key={i} part={p} />
      ))}
    </svg>
  );
}

/**
 * The source-word mark's own peach, from index.css, as a component so a costume
 * can sit on it. The stylesheet's data URI stays the mark on every other day;
 * PeachMark.test.tsx pins the two together.
 */
export function SourcePeach({
  className,
  costume,
}: {
  className?: string;
  costume?: CostumeId | null;
}) {
  const { base, worn, transform } = sourceMarkParts(costume);
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      {base.map((p, i) => (
        <Part key={i} part={p} />
      ))}
      <g transform={transform}>
        {worn.map((p, i) => (
          <Part key={i} part={p} />
        ))}
      </g>
    </svg>
  );
}

function Part({ part: p }: { part: PeachPart }) {
  const paint = {
    fill: p.fill ?? 'none',
    opacity: p.opacity,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    strokeLinecap: p.stroke ? ('round' as const) : undefined,
    strokeLinejoin: p.stroke ? ('round' as const) : undefined,
  };
  if (p.circle) {
    const [cx, cy, r] = p.circle;
    return <circle cx={cx} cy={cy} r={r} {...paint} />;
  }
  return <path d={p.d} {...paint} />;
}
