/**
 * The card treatment as a class string (B2). In its own file rather than
 * beside the components in `Card.tsx`, because a `.tsx` that exports a plain
 * function breaks React fast refresh for the whole module.
 */

export type Padding = "none" | "sm" | "md" | "lg";

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
