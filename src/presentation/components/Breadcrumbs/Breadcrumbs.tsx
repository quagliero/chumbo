import { Fragment } from "react";
import { Link } from "react-router-dom";

/**
 * Breadcrumbs (E4).
 *
 * Detail pages offered "← Back to Managers" and nothing else, so you could
 * retreat one step but never see where you were or jump sideways. A trail like
 *
 *   Seasons › 2024 › Matchups › Week 8 › thd vs jay
 *
 * is orientation and navigation at once: it says what you are looking at, and
 * every ancestor is one click away. That matters here more than on most sites,
 * because the whole point is wandering through fifteen years of league history
 * rather than arriving at one page and leaving.
 *
 * The last crumb is the current page and is deliberately not a link.
 */

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the page you are already on. */
  to?: string;
}

export const Breadcrumbs = ({
  crumbs,
  className = "",
}: {
  crumbs: Crumb[];
  className?: string;
}) => {
  if (!crumbs.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={`mb-4 ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li>
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={isLast ? "text-ink font-medium" : undefined}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
              {isLast ? null : (
                <li aria-hidden="true" className="text-ink-faint select-none">
                  ›
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
