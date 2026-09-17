import type { ReactNode } from "react";

/**
 * The card surface (B2).
 *
 * An audit found **eighteen** distinct spellings of the same idea across the
 * app — `bg-white rounded-lg shadow overflow-hidden p-6`, `bg-white p-6
 * rounded-lg shadow overflow-hidden`, `shadow` vs `shadow-md`, five different
 * padding combinations — for what is really three variants: a plain surface, a
 * clickable one, and a modal.
 *
 * Border, fill, radius and shadow each say "separate object", so they are spent
 * by role here rather than stamped on every block. A card is a container for
 * one thing; if everything on a page is a card, nothing on it is grouped.
 */

type Padding = "none" | "sm" | "md" | "lg";

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

/**
 * The card treatment as a class string, for elements that cannot be a `<div>` —
 * chiefly cards that are themselves `<Link>`s. Prefer `<Card>` everywhere else;
 * this exists so a link-card doesn't have to re-spell the idiom by hand.
 */
export const cardClassName = ({
  padding = "md",
  interactive = false,
  className = "",
}: {
  padding?: Padding;
  interactive?: boolean;
  className?: string;
} = {}): string =>
  [
    "bg-surface rounded-card shadow-card overflow-hidden",
    PADDING[padding],
    interactive
      ? "border border-line hover:shadow-card-hover hover:border-line-strong transition-all cursor-pointer group"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

export interface CardProps {
  children: ReactNode;
  /** Inner padding. `none` when the card holds a table that pads its own cells. */
  padding?: Padding;
  /** Lifts on hover and takes a pointer. For cards that are themselves links. */
  interactive?: boolean;
  className?: string;
}

export const Card = ({
  children,
  padding = "md",
  interactive = false,
  className = "",
}: CardProps) => (
  <div className={cardClassName({ padding, interactive, className })}>
    {children}
  </div>
);

/**
 * A card's title block. Sits above the body and carries the heading, so the
 * heading style is set in one place rather than at every call site.
 */
export const CardHeader = ({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={`flex items-start justify-between gap-4 px-6 pt-6 pb-4 ${className}`}
  >
    <div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      ) : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

/** The padded content region of a card whose own padding is `none`. */
export const CardBody = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => <div className={`px-6 pb-6 ${className}`}>{children}</div>;

export default Card;
