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
 */
export function PeachMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M50 12c4-8 14-9 18-4-2 6-9 9-14 8z" fill="#8FD3B6" />
      <path
        d="M50 16c20 0 34 16 34 36 0 22-16 38-34 38S16 74 16 52c0-20 14-36 34-36z"
        fill="#FFC27A"
      />
      <path
        d="M50 16c-9 0-17 4-23 11 7 4 15 5 23 5s16-1 23-5c-6-7-14-11-23-11z"
        fill="#FFD79B"
        opacity=".7"
      />
      <circle cx="40" cy="58" r="3.4" fill="#7A4A33" />
      <circle cx="60" cy="58" r="3.4" fill="#7A4A33" />
      <circle cx="34" cy="66" r="4.5" fill="#FF9DAE" opacity=".7" />
      <circle cx="66" cy="66" r="4.5" fill="#FF9DAE" opacity=".7" />
      <path
        d="M45 67c3 3 7 3 10 0"
        stroke="#7A4A33"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
