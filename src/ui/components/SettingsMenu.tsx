import { useEffect, useId, useRef } from 'react';
import { useTheme, type Theme } from '../useTheme.ts';
import { useAppearance, type Appearance } from '../useAppearance.ts';
import { useTextSize, type TextSize } from '../useTextSize.ts';

/**
 * The settings popover: the theme, the appearance, the text size and sound,
 * behind one button in the toolbar (Antoine, 11 November 2026). It cleared the
 * toolbar, which had no room left at 320px and the largest text, and gave the
 * new appearance a home.
 *
 * **Native controls, so the keyboard and screen readers get them for free.**
 * Each choice is a group of radio buttons in a `fieldset` named by its
 * `legend`: Tab reaches the chosen one, the arrow keys move and choose, and a
 * screen reader says "Appearance, Dark, 3 of 3". Sound is a checkbox.
 *
 * **A non-modal dialog.** The button says it opens one (`aria-haspopup`) and
 * whether it is open (`aria-expanded`). Opening moves focus to the first
 * group's choice; Escape closes it and puts focus back on the button, as does
 * clicking the button again; a click anywhere else closes it where the click
 * landed. While it is open the game leaves the keyboard alone (`Game.tsx`), so
 * an arrow or Space never reaches the board.
 *
 * Every choice takes effect at once and is kept per device, as the toolbar's
 * controls were. Letterpress has no dark yet, so in letterpress the appearance
 * is light and its choices are held, with a line saying why.
 */
export function SettingsMenu({
  open,
  onOpenChange,
  muted,
  onToggleMute,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const [theme, setTheme] = useTheme();
  const [appearance, setAppearance] = useAppearance();
  const [size, setSize] = useTextSize();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const noteId = useId();

  const close = (returnFocus: boolean) => {
    onOpenChange(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Into the popover on opening: the chosen theme, the first control.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLInputElement>('input:checked, input')
      ?.focus();
  }, [open]);

  // Escape, from anywhere, and a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
    // close is stable enough: it only calls the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const themes: [Theme, string][] = [
    ['cute', 'Cute'],
    ['letterpress', 'Letterpress'],
  ];
  const appearances: [Appearance, string][] = [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  const sizes: [TextSize, string][] = [
    ['regular', 'Regular'],
    ['large', 'Large'],
    ['largest', 'Largest'],
  ];
  const noDark = theme !== 'cute';

  return (
    <div className="settings">
      <button
        ref={buttonRef}
        type="button"
        className="iconbtn settings__button"
        aria-label="Settings"
        title="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Enter opens it, as a native button's would: the game leaves Enter
        // to anything marked so. See useGlobalKeys.
        data-opens-card=""
        onClick={() => (open ? close(true) : onOpenChange(true))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.2 4.7-1.7-.4a6.9 6.9 0 0 1-.6 1.5l.9 1.5-1.6 1.6-1.5-.9c-.5.3-1 .5-1.5.6l-.4 1.7h-2.3l-.4-1.7a6.9 6.9 0 0 1-1.5-.6l-1.5.9-1.6-1.6.9-1.5a6.9 6.9 0 0 1-.6-1.5l-1.7-.4v-2.3l1.7-.4c.1-.5.3-1 .6-1.5l-.9-1.5 1.6-1.6 1.5.9c.5-.3 1-.5 1.5-.6l.4-1.7h2.3l.4 1.7c.5.1 1 .3 1.5.6l1.5-.9 1.6 1.6-.9 1.5c.3.5.5 1 .6 1.5l1.7.4v2.3Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="settings__panel"
          role="dialog"
          aria-label="Settings"
        >
          <fieldset className="settings__group">
            <legend>Theme</legend>
            {themes.map(([value, label]) => (
              <label className="settings__choice" key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset
            className="settings__group"
            disabled={noDark}
            aria-describedby={noDark ? noteId : undefined}
          >
            <legend>Appearance</legend>
            {appearances.map(([value, label]) => (
              <label className="settings__choice" key={value}>
                <input
                  type="radio"
                  name="appearance"
                  value={value}
                  checked={appearance === value}
                  onChange={() => setAppearance(value)}
                />
                {label}
              </label>
            ))}
            {noDark && (
              <p className="settings__note" id={noteId}>
                This theme has no dark yet.
              </p>
            )}
          </fieldset>
          <fieldset className="settings__group">
            <legend>Text size</legend>
            {sizes.map(([value, label]) => (
              <label className="settings__choice" key={value}>
                <input
                  type="radio"
                  name="text-size"
                  value={value}
                  checked={size === value}
                  onChange={() => setSize(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="settings__choice settings__sound">
            <input type="checkbox" checked={!muted} onChange={onToggleMute} />
            Sound
          </label>
        </div>
      )}
    </div>
  );
}
