/**
 * The footer's way to the transfer page, /transfer: for a player on a Home
 * Screen icon, the only way there, since that window has no address bar and
 * its save is its own, apart from the browser's.
 *
 * **On since 16 November 2026** (Antoine), with the App Store link ready to
 * share. It was built and kept off until then, and this one constant is the
 * switch.
 */
export const TRANSFER_LINK_SHOWN = true;

export function TransferLink() {
  return (
    <a className="colophon__transfer" href="/transfer">
      Transfer your streak to the iPhone app
    </a>
  );
}
