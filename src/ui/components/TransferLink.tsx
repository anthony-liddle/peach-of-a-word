/**
 * The footer's way to the transfer page, /transfer: for a player on a Home
 * Screen icon, the only way there, since that window has no address bar and
 * its save is its own, apart from the browser's.
 *
 * **Built and kept off** (Antoine, 16 November 2026): it stays hidden until
 * the App Store link is ready to share. Turning it on is this one constant.
 */
export const TRANSFER_LINK_SHOWN = false;

export function TransferLink() {
  return (
    <a className="colophon__transfer" href="/transfer">
      Transfer your streak to the iPhone app
    </a>
  );
}
