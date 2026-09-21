/**
 * The records watch (J3) — what this season could still do.
 *
 * The counterpart to "On this day" next to it: that one is the archive
 * reaching forward, this one is the live season reaching for the archive. Both
 * are rails on the home page, both compute nothing — `records-watch` is a
 * registry stat, so the answers are in `public/data/all-time.json` and the
 * weekly update (J1) refreshes them with the week's results.
 *
 * Three rules it keeps, which are really one rule:
 *
 * - **It disappears rather than reaching.** Nothing on pace, nothing near a
 *   record, no season being played: no card. A watch that always has something
 *   to say is a watch nobody believes.
 * - **A pace says what it is.** The sentence carries the games played and the
 *   games left, because "on pace for 1,602" without them is a forecast
 *   pretending to be a fact.
 * - **Every line links to the list it is measured against**, the same rule the
 *   narrative notes follow: a claim about a record goes to the record.
 */
import { Component, ReactNode, Suspense } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/presentation/components/Card";
import { LINK_CLASS } from "@/presentation/components/Links";
import { getManagerAccent } from "@/domain/managerColors";
import { usePrecomputedStat } from "@/hooks/usePrecomputedStats";
import { holderName } from "@/utils/narrative/narrate";

const HEADING = "The records watch";

/** Four on the home page: a rail people scan, not a table they read. */
export const HOME_LIMIT = 4;

const Module = ({ limit, year }: { limit: number; year?: number }) => {
  const stat = usePrecomputedStat("records-watch");
  // Not in the file (a stale `all-time.json`), or nothing worth watching.
  if (!stat?.entries.length) return null;

  const entries = stat.entries
    .filter((entry) => year === undefined || entry.year === year)
    .slice(0, limit);
  if (entries.length === 0) return null;

  const season = entries[0].year;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-ink">{HEADING}</h2>
        <p className="text-sm text-ink-muted">
          What the {season} season could still do
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {entries.map((entry, index) => (
          <li key={`${entry.subject}-${index}`} className="py-2">
            <Link
              to={entry.href ?? "/records"}
              className={`flex items-baseline gap-3 ${LINK_CLASS} no-underline hover:underline`}
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: getManagerAccent(entry.subject) }}
              />
              <span className="text-sm text-ink">
                <span className="font-semibold">{holderName(entry.subject)}</span>{" "}
                {entry.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        Paces are this season's points per game over the games that are left —
        arithmetic, not a forecast.
      </p>
    </Card>
  );
};

/**
 * Same reasoning as `OnThisDay`'s: `usePrecomputedStat` suspends on the fetch
 * and throws for real when the file is missing, and neither should be allowed
 * to take the home page down over an optional rail.
 */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/**
 * `year` limits the rail to one season's watch — for the week pages, which
 * exist for every season the league has played and must not offer a 2014 week
 * a list of what 2026 might still do.
 */
const RecordsWatch = ({ limit = HOME_LIMIT, year }: { limit?: number; year?: number }) => (
  <Boundary>
    {/* No height reserved: unlike On this day, this one is often empty, and a
        blank block held open for a card that never arrives is worse than the
        page settling. */}
    <Suspense fallback={null}>
      <Module limit={limit} year={year} />
    </Suspense>
  </Boundary>
);

export default RecordsWatch;
