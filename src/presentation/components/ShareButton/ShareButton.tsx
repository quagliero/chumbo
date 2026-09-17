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
 * - **It is a 44px tap target**, because this flow exists mainly for a phone.
 */

import { useShareCard, type ShareCardInput } from "./useShareCard";
import { fallbackMessage } from "./shareOutcome";
import { shareActionLabel } from "./shareCapabilities";

export interface ShareButtonProps {
  /** The card to share, or a function returning it (called on click). */
  card: ShareCardInput;
  /**
   * Override the label. Leave unset to let it name the actual outcome, which is
   * usually what you want.
   */
  label?: string;
  /** Hide the label, keeping it as the accessible name. For dense toolbars. */
  iconOnly?: boolean;
  className?: string;
  /** Called with the raw error on failure, for page-level logging. */
  onError?: (error: unknown) => void;
}

const ICON_CLASS = "h-[1.125rem] w-[1.125rem] flex-none";

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
  label,
  iconOnly = false,
  className = "",
  onError,
}: ShareButtonProps) => {
  const { share, status, path, decision, message } = useShareCard({ card, onError });

  const actionLabel = label ?? shareActionLabel(path);
  const working = status === "working";
  const failed = status === "error";
  const done = status === "done";

  // Shown as the tooltip rather than as body text: it explains a downgrade
  // ("this browser cannot copy images"), which is worth having available but
  // not worth a line of prose next to every button.
  const note = decision.reason ? fallbackMessage(decision.reason) : undefined;

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

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
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
        title={note ? `${actionLabel} — ${note}` : actionLabel}
        className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-card border border-line bg-surface px-3.5 text-sm font-semibold text-ink shadow-card transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 disabled:cursor-progress disabled:text-ink-muted sm:min-h-[2.25rem]"
      >
        {icon}
        {!iconOnly && <span>{actionLabel}</span>}
      </button>

      {/*
        One live region, always in the DOM. Mounting it only when there is a
        message is the classic way to make an announcement that never fires:
        some screen readers do not read a region that appears at the same moment
        as its content.
      */}
      <span
        role="status"
        aria-live="polite"
        className={`text-xs ${failed ? "text-result-loss" : "text-ink-muted"}`}
      >
        {working ? "Drawing the card…" : message}
      </span>
    </div>
  );
};

export default ShareButton;
