import { useRandomMatchup } from "./useRandomMatchup";

/** A die, drawn rather than imported: five pips, no icon dependency. */
const DiceIcon = ({ spinning }: { spinning: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`}
    aria-hidden="true"
    focusable="false"
  >
    <rect
      x="3.5"
      y="3.5"
      width="17"
      height="17"
      rx="4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <g fill="currentColor">
      <circle cx="8.5" cy="8.5" r="1.5" />
      <circle cx="15.5" cy="8.5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="8.5" cy="15.5" r="1.5" />
      <circle cx="15.5" cy="15.5" r="1.5" />
    </g>
  </svg>
);

/**
 * The dice in the header (E5). A tap target in its own right, so it works on a
 * phone without a keyboard — the palette's "Random matchup" row is the same
 * action for people who are already typing.
 */
export const RandomMatchupButton = () => {
  const { roll, pending } = useRandomMatchup();

  return (
    <button
      type="button"
      onClick={roll}
      aria-label="Go to a random matchup from league history"
      title="Random matchup"
      aria-busy={pending}
      className="flex-none flex h-9 w-9 items-center justify-center rounded-card text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1"
    >
      <DiceIcon spinning={pending} />
    </button>
  );
};

export default RandomMatchupButton;
