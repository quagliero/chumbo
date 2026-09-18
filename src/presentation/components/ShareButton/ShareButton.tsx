/**
 * The button (G3/G4).
 *
 * Template-agnostic on purpose: it takes a `ShareCard` — or a function
 * returning one, so a card with an avatar in it is only built when somebody
 * actually shares — and knows nothing about what is on it. The G2 templates and
 * this button meet at that one type.
 *
 * What it guarantees, in order of how easy each is to get wrong:
 *
 * - **It always says something.** Success, failure and "your browser will not
 *   let us" all end in a sentence in a live region. A share button that does
 *   nothing is the worst outcome, so there is no path out of `share()` that
 *   leaves the UI unchanged — except cancelling the native sheet, which is a
 *   completed interaction and correctly silent.
 * - **It says what it will do.** "Copy image" on desktop, "Share" on a phone,
 *   "Download image" where neither API exists. Naming the wrong outcome sends
 *   people looking for a dialog that is never coming.
 * - **It is a real `<button>`**, so it is tabbable, Enter/Space work, and the
 *   busy state is `aria-busy` rather than a spinner only sighted users see.
 * - **It is a 44px tap target, drawn at 32px** (I4). The first version drew
 *   the whole 44px, a shadowed pill that dwarfed the headings it sat next to
 *   and would not line up with them. The target is still 44px — an invisible
 *   `::before` extends it — because this flow exists mainly for a phone.
 * - **It names its card.** "Copy season card", not "Copy image": with a card
 *   per season row and one for the career on the same page, a bare "Copy
 *   image" made you press it to find out what it copied.
 * - **The outcome is a toast**, fixed to the bottom of the screen, rather than
 *   a line of text beside the button that pushed the heading around.
 *
 * Placement rule, for every caller: a share control sits at the right-hand
 * end of the heading of the thing it shares — a card's `CardHeader` action, a
 * page header's action row, the end of a list row. Never floating in the body.
 */

import { useShareCard, type ShareCardInput } from "./useShareCard";
import { shareActionLabel, shareVerb } from "./shareCapabilities";

export interface ShareButtonProps {
  /** The card to share, or a function returning it (called on click). */
  card: ShareCardInput;
  /**
   * What the card is, as a noun phrase: "season card", "career card",
   * "final score". The label becomes the verb this browser will actually do
   * plus this — "Copy season card" — and the success toast names it too.
   */
  what?: string;
  /**
   * Override the label entirely. Leave unset: `what` is usually what you want,
   * because the verb has to follow the path this browser takes.
   */
  label?: string;
  /** Hide the label, keeping it as the accessible name. For list rows. */
  iconOnly?: boolean;
  className?: string;
  /** Called with the raw error on failure, for page-level logging. */
  onError?: (error: unknown) => void;
}

const ICON_CLASS = "h-4 w-4 flex-none";

/** The OS share glyph: a box with an arrow leaving the top. */
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v10" />
      <path d="M8.5 7 12 3.5 15.5 7" />
      <path d="M7 11H5.5v9h13v-9H17" />
    </g>
  </svg>
);

/** Two overlapping sheets. */
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </g>
  </svg>
);

/** A tray with an arrow going into it. */
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v10" />
      <path d="M8.5 10 12 13.5 15.5 10" />
      <path d="M5 16.5v2A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </g>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden="true" focusable="false">
    <path
      d="m5 12.5 4.5 4.5L19 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Rasterising is not instant — a card is a canvas round-trip, and on a phone it
 * is long enough to look broken without this.
 */
const SpinnerIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className={`${ICON_CLASS} animate-spin`}
    aria-hidden="true"
    focusable="false"
  >
    <circle
      cx="12"
      cy="12"
      r="8.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeOpacity="0.25"
    />
    <path
      d="M20.5 12A8.5 8.5 0 0 0 12 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const ShareButton = ({
  card,
  what,
  label,
  iconOnly = false,
  className = "",
  onError,
}: ShareButtonProps) => {
  const { share, dismiss, status, path, message } = useShareCard({
    card,
    onError,
    what,
  });

  const actionLabel =
    label ?? (what ? `${shareVerb(path)} ${what}` : shareActionLabel(path));
  const working = status === "working";
  const failed = status === "error";
  const done = status === "done";

  const icon = working ? (
    <SpinnerIcon />
  ) : done ? (
    <CheckIcon />
  ) : path === "share-sheet" ? (
    <ShareIcon />
  ) : path === "download" ? (
    <DownloadIcon />
  ) : (
    <CopyIcon />
  );

  const toast = working ? "Drawing the card…" : message;

  return (
    <>
      <button
        type="button"
        onClick={share}
        // Safe to disable because the busy state is bounded: the render carries
        // G1's ten-second decode timeout, and the clipboard rejects rather than
        // hanging. The one case that can stay busy for minutes is a native
        // share sheet the user has not dismissed yet — which is right, because
        // they are still in it.
        disabled={working}
        aria-busy={working}
        // The label is deliberately constant. Swapping it for "Working…" or
        // "Copied" renames the control mid-interaction, which a screen reader
        // reads as a different button; progress is `aria-busy` plus the
        // spinner, and the outcome is announced by the status region below.
        aria-label={iconOnly ? actionLabel : undefined}
        className={
          // `before:` is the 44px target around the 32px drawing.
          "relative inline-flex h-8 flex-none items-center justify-center gap-1.5 " +
          "rounded-md border border-line bg-surface text-xs font-medium " +
          "text-ink-muted transition-colors hover:border-line-strong hover:bg-hover " +
          "hover:text-ink focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-series-1 disabled:cursor-progress " +
          "before:absolute before:-inset-1.5 before:content-[''] " +
          (iconOnly ? "w-8" : "px-2.5") +
          (done ? " text-result-win" : "") +
          (className ? ` ${className}` : "")
        }
      >
        {icon}
        {!iconOnly && <span className="whitespace-nowrap">{actionLabel}</span>}
      </button>

      {/*
        One live region, always in the DOM. Mounting it only when there is a
        message is the classic way to make an announcement that never fires:
        some screen readers do not read a region that appears at the same moment
        as its content. Fixed to the bottom of the screen, clear of the iOS home
        indicator, so an outcome never moves the heading the button sits in.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          role="status"
          aria-live="polite"
          className={
            toast
              ? "pointer-events-auto flex max-w-md items-center gap-3 rounded-card px-4 py-2.5 text-sm shadow-card-hover " +
                (failed ? "bg-result-loss text-white" : "bg-ink text-surface")
              : "sr-only"
          }
        >
          <span>{toast}</span>
          {/* A failure stays until it is read — see `useShareCard` — so it
              needs a way to be put away. Success clears itself. */}
          {failed && toast && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="-mr-1 rounded px-1 text-base leading-none opacity-80 hover:opacity-100"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default ShareButton;
