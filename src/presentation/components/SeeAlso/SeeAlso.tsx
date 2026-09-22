/**
 * The "see also" rail (E2).
 *
 * Presentational only — what goes in it is decided by `matchupRail.ts` and
 * `playerRail.ts`, which are pure and tested. This renders sections of links
 * and, crucially, renders NOTHING when there are none: an empty bordered box
 * headed "See also" is the exact thing that teaches people to stop looking at
 * the rail.
 *
 * The whole row is the link. At 375 px a target that is three words inside a
 * sentence is one nobody hits — the same reasoning as `OnThisDay`.
 */
import { Link } from "react-router-dom";
import { Card } from "@/presentation/components/Card";
import { LINK_CLASS } from "@/presentation/components/Links";
import type { RailSection } from "./rail";

export const SeeAlso = ({
  sections,
  title = "See also",
  className,
}: {
  sections: RailSection[];
  title?: string;
  className?: string;
}) => {
  const filled = sections.filter((section) => section.items.length > 0);
  if (!filled.length) return null;

  return (
    <Card className={className}>
      <nav aria-label={title}>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>

        {filled.map((section, index) => (
          <div key={section.heading ?? index} className={index > 0 ? "mt-4" : ""}>
            {section.heading && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {section.heading}
              </h3>
            )}
            <ul className="mt-1 divide-y divide-line">
              {section.items.map((item) => (
                <li key={item.id} className="py-2">
                  <Link
                    to={item.to}
                    className={`block ${LINK_CLASS} no-underline hover:underline`}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.detail && (
                      <span className="mt-0.5 block text-sm font-normal text-ink-muted">
                        {item.detail}
                        {/* 2019's per-player data is reconstructed, not
                            recorded. Marked, never quietly presented flat. */}
                        {item.approximate && (
                          <span
                            className="text-ink-faint"
                            title="Rests on 2019's bench scores, which are incomplete"
                          >
                            {" · reconstructed"}
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </Card>
  );
};
