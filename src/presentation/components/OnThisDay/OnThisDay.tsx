/**
 * "On this day" (E6) — the home page's way in to fifteen years of archive.
 *
 * The whole point of the site is that someone wanders in, finds something, and
 * takes it to the group chat. Until now the way in was a table of cumulative
 * totals; this puts one concrete game from each of the last few seasons — this
 * same week, played out before — above it, each one a link.
 *
 * It computes NOTHING. C6c already registered the `on-this-day` stat and the
 * build writes its answers into `public/data/all-time.json`; this reads them.
 *
 * On honesty, which is the one rule the module has: it is the same WEEK of the
 * season, not the same calendar date, so the heading names the week. And when
 * the archive has nothing for that week it says nothing is there rather than
 * reaching for the nearest thing it can find. See `./selection.ts`.
 */
import { Component, ReactNode, Suspense } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/presentation/components/Card";
import { LINK_CLASS } from "@/presentation/components/Links";
import { usePrecomputedStat } from "@/hooks/usePrecomputedStats";
import { HOME_LIMIT, selectOnThisDay, withoutYearPrefix } from "./selection";

const HEADING = "On this day in Chumbo history";

const Module = () => {
  const view = selectOnThisDay(usePrecomputedStat("on-this-day"), HOME_LIMIT);

  // The stat is not in the file — a stale `all-time.json`. That is a fact
  // about the build, not about the league, so there is nothing to say.
  if (!view) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-ink">{HEADING}</h2>
        {view.week !== null && (
          <p className="text-sm text-ink-muted">
            Week {view.week}, in the seasons before this one
          </p>
        )}
      </div>

      {view.entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Nothing in the archive for this week yet — there is no completed week
          with an earlier season to set it against.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line">
            {view.entries.map((entry) => (
              <Entry key={`${entry.year}-${entry.href ?? entry.subject}`} {...entry} />
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-faint">
            {view.total === 1
              ? "The one game the league has ever played in this week."
              : `${view.total} games have been played in ` +
                `${view.week === null ? "this week" : `Week ${view.week}`}` +
                ` across the seasons before this one.` +
                ` ${view.entries.length} of them are above, one per season.`}
            {view.approximate &&
              " Entries marked ~ rest on reconstructed lineup data."}
          </p>
        </>
      )}
    </Card>
  );
};

/**
 * One game. The whole row is the link — at 375 px a link that is three words
 * inside a sentence is a target nobody hits.
 */
const Entry = ({
  year,
  value,
  detail,
  href,
  approximate,
}: {
  year?: number;
  value: number;
  detail?: string;
  href?: string;
  approximate?: boolean;
}) => {
  const season = year ?? value;
  const body = (
    <>
      <span className="shrink-0 font-numeric tabular-nums text-sm font-semibold text-ink">
        {season}
        {approximate && (
          <span title="Reconstructed lineup data" className="text-ink-faint">
            {" ~"}
          </span>
        )}
      </span>
      <span className="text-sm text-ink">
        {withoutYearPrefix(detail, season)}
      </span>
    </>
  );

  return (
    <li className="py-2">
      {href ? (
        <Link
          to={href}
          className={`flex items-baseline gap-3 ${LINK_CLASS} no-underline hover:underline`}
        >
          {body}
        </Link>
      ) : (
        <span className="flex items-baseline gap-3">{body}</span>
      )}
    </li>
  );
};

/**
 * `usePrecomputedStat` throws the in-flight fetch, and throws for real when the
 * file is missing or from an older deploy. On the Hall of Fame that would cost
 * a page nobody was mid-sentence on; on the HOME page it would be the whole
 * site, blank, because of one optional module. So this module carries its own
 * boundary and disappears instead.
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

const OnThisDay = () => (
  <Boundary>
    {/* Reserves roughly the module's own height, so the standings below it do
        not jump once the file lands. */}
    <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
      <Module />
    </Suspense>
  </Boundary>
);

export default OnThisDay;
