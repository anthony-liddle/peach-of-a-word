import { PeachMark } from './PeachMark.tsx';

/**
 * Cute-theme motifs: peaches, a small silly dinosaur, and a few florettes.
 * Original art (no trademarked characters). Hidden in Letterpress via CSS, and
 * aria-hidden so they are never announced. Purely decorative, behind the play.
 */
export function Decorations({ celebrate = false }: { celebrate?: boolean }) {
  return (
    <div className="decorations" aria-hidden="true">
      {/* The peach itself, so it follows the peach wherever that is edited. */}
      <PeachMark className="deco deco--peach1" />

      <svg
        className={'deco deco--dino' + (celebrate ? ' dino--celebrate' : '')}
        viewBox="0 0 120 110"
      >
        <path
          d="M30 96c0-30 16-54 44-54 22 0 34 14 34 30 0 8-4 14-10 18 4 6 2 10 2 10H40s-10-2-10-4z"
          fill="#9BDCC0"
        />
        <path d="M58 44c-3-8-10-12-10-12s2 8 0 14" fill="#9BDCC0" />
        <circle cx="92" cy="60" r="3.6" fill="#3F5D4E" />
        <circle cx="93.4" cy="58.8" r="1.1" fill="#fff" />
        <circle cx="84" cy="70" r="4.6" fill="#FF9DAE" opacity=".65" />
        <path
          d="M44 96v8M58 96v8M86 96v8M100 96v8"
          stroke="#7FC9A9"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M52 50l5-7 5 7M64 47l5-7 5 7M77 46l5-7 5 7" fill="#7FC9A9" />
      </svg>

      <svg className="deco deco--peach2" viewBox="0 0 100 100">
        <path d="M50 14c3-6 11-7 14-3-2 5-7 7-11 6z" fill="#8FD3B6" />
        <path
          d="M50 18c18 0 30 14 30 32 0 19-14 33-30 33S20 69 20 50c0-18 12-32 30-32z"
          fill="#FFB27A"
        />
        <circle cx="41" cy="54" r="2.8" fill="#7A4A33" />
        <circle cx="59" cy="54" r="2.8" fill="#7A4A33" />
        <path
          d="M45 62c3 3 7 3 10 0"
          stroke="#7A4A33"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>

      <span className="bloom bloom--1">✿</span>
      <span className="bloom bloom--2">✿</span>
      <span className="bloom bloom--3">✿</span>
      <span
        className={
          'deco deco--dino-bloom' + (celebrate ? ' is-celebrating' : '')
        }
      >
        ✿
      </span>
    </div>
  );
}
