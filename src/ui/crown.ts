/**
 * The crown the completion card's peach wears: the iPhone's, not a new one.
 *
 * SVG path data in the crown's own 100 by 100 box, stretched to its frame.
 * Absolute M, L, C and Z, as the costumes are, so the iOS app parses this same
 * string: it holds it as `CompletionCrown.d` in its PeachEngine, and draws it
 * the same way. The illustrations' import writes both, from the crown edited
 * in Inkscape, where it is drawn in the peach's box as it looks on the card.
 *
 * Placed as the iPhone places it, from the iPhone's own numbers, so it stands
 * above the peach's box rather than inside it: crown.test.ts holds it to the
 * peach's width and to the iPhone's rise, in place of the costumes' box.
 *
 * Both repos pin the canonical text to one hash: CROWN_SHA256 in
 * crown.test.ts here, and `CrownTests.crownSHA256` on iOS.
 */

/** The crown's outline and colour: the cute theme's peach, `--crown`. */
export const CROWN = {
  d: 'M0 100 L8 18 L30 62 L50 0 L70 62 L92 18 L100 100 Z',
  fill: '#FF9E58',
} as const;

/**
 * Where the iPhone puts it, in points, as `CompletionOrnament` lays it out:
 * the peach framed at 112 with 16 of padding above it, and the crown framed at
 * 46 by 26, centred at the top and offset 2 further up. So the crown stands 18
 * above the peach's box and comes 8 down into it, over the leaf.
 */
export const CROWN_ON_PEACH = {
  peach: 112,
  paddingTop: 16,
  width: 46,
  height: 26,
  offsetY: -2,
} as const;

/** The crown's box in the peach's own 100 by 100 units. */
export function crownBox(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { peach, paddingTop, width, height, offsetY } = CROWN_ON_PEACH;
  const unit = 100 / peach;
  return {
    x: ((peach - width) / 2) * unit,
    y: (offsetY - paddingTop) * unit,
    width: width * unit,
    height: height * unit,
  };
}

/** Maps the crown's own box onto its place in the peach's box. */
export function crownTransform(): string {
  const { x, y, width, height } = crownBox();
  return `matrix(${width / 100} 0 0 ${height / 100} ${x} ${y})`;
}

/**
 * The crown as one canonical text, which both apps hash: the outline and its
 * colour, then the iPhone's placement, fields joined by `|`. The outline is
 * carried as its own text, never printed from parsed numbers, and the
 * placement's numbers are whole, so JavaScript and Swift print them alike.
 * `crown` is the one the import is about to write, to hash it first.
 */
export function canonicalCrown(
  crown: { d: string; fill: string } = CROWN,
): string {
  const { peach, paddingTop, width, height, offsetY } = CROWN_ON_PEACH;
  return [
    `crown|${crown.d}|${crown.fill}`,
    `placement|${peach}|${paddingTop}|${width}|${height}|${offsetY}`,
  ].join('\n');
}
