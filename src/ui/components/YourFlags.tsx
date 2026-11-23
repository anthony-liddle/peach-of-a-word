import { useEffect, useRef } from 'react';
import { useFlagList, useFlagsUI } from '@/flags/context.ts';
import { MAX_WAITING } from '@/flags/flags.ts';
import { shortForm } from '@/flags/model.ts';

/**
 * Your flags, on its own (Antoine, 22 November): never inside the settings
 * panel, so the list can't push the game's settings out of view. A modal in
 * the quiet card's skin, with HowItWorks's focus trap and Escape. Opened from
 * Settings' row, or over a card from its line; the caller puts the focus back
 * where it came from.
 *
 * Each flag: the word and its reason, Sent or Waiting to send, and Take back.
 * Taking back the last one closes it.
 */
export function YourFlags({
  onClose,
  overCard,
}: {
  onClose: () => void;
  /** Opened from a card, so it sits over the card. */
  overCard: boolean;
}) {
  const ui = useFlagsUI();
  const list = useFlagList(ui?.flags ?? null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const hadFlags = useRef(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Taking back the last flag leaves nothing to show, so the list closes.
  useEffect(() => {
    if (list.length > 0) hadFlags.current = true;
    else if (hadFlags.current) onClose();
  }, [list.length, onClose]);

  if (!ui) return null;
  const { flags } = ui;
  const newest = [...list].reverse();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables =
      dialogRef.current?.querySelectorAll<HTMLElement>('button');
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={
        overCard ? 'reveal-backdrop reveal-backdrop--over' : 'reveal-backdrop'
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="reveal reveal--quiet your-flags"
        role="dialog"
        aria-modal="true"
        aria-labelledby="your-flags-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 className="reveal__word your-flags__title" id="your-flags-title">
          Your flags
        </h2>
        <ul className="your-flags__list">
          {newest.map((f) => (
            <li key={f.id} className="flag__line">
              <span className="flag__what">
                <span aria-hidden="true" className="flag__state">
                  {f.state === 'sent' ? '✓' : '◷'}
                </span>
                <span>
                  <span className="flag__reason-line">
                    {f.word}, {shortForm(f.reason)}
                  </span>
                  <span className="flag__status">
                    {f.state === 'sent' ? 'Sent' : 'Waiting to send'}
                  </span>
                </span>
              </span>
              <button
                type="button"
                className="flag__take-back"
                onClick={() => void flags.takeBack(f.id)}
              >
                Take back
              </button>
            </li>
          ))}
        </ul>
        <p className="flag__note">
          Flags send right away, or once you're back online. You can take one
          back for 60 days.
          {flags.full() &&
            ` ${MAX_WAITING} flags are waiting to send. They'll go once you're online.`}
        </p>
        <div className="reveal__way-out">
          <button type="button" className="reveal__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
