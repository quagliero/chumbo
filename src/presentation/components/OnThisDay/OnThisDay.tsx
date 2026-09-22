/**
 * "On this day" (E6) — the home page's way in to fifteen years of archive.
 *
 * The whole point of the site is that someone wanders in, finds something, and
 * takes it to the group chat. This puts one game from each of the last few
 * seasons that was over on today's date above the tables, each one a link.
 *
 * It computes nothing: the `on-this-day` stat files every game under the day
 * it was over, at build time, and `./selection.ts` picks today's. It used to
 * be the same WEEK of the season instead, because until the play-by-play
 * (L2) the site did not know what day anything happened.
 */
import { Component, ReactNode, Suspense } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/presentation/components/Card";
import { LINK_CLASS } from "@/presentation/components/Links";
import { usePrecomputedStat } from "@/hooks/usePrecomputedStats";
import { HOME_LIMIT, selectOnThisDay, type OnThisDayEntry } from "./selection";

const HEADING = "On this day in Chumbo history";

const Module = () => {
  // The reader's date, not the build's: the file is built three times a week.
  const view = selectOnThisDay(usePrecomputedStat("on-this-day"), new Date(), HOME_LIMIT);

  // Not in the file (a stale `all-time.json`), or no game in league history
  // was over on this date — which is every Tuesday bar a few COVID ones, and
  // all summer. Saying so every day would be a rail of apologies; the module
  // simply is not there.
  if (!view || view.entries.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-ink">{HEADING}</h2>
        <p className="text-sm text-ink-muted">{view.date}</p>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {view.entries.map((entry) => (
          <Entry key={`${entry.year}-${entry.href ?? entry.subject}`} {...entry} />
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        Each game is filed under the day it was over — when its last starter
        stopped scoring, US Eastern time.
        {view.total > view.entries.length &&
          ` ${view.total} seasons had one on ${view.date}; the newest ${view.entries.length} are above.`}
        {view.approximate && " Entries marked ~ rest on reconstructed lineup data."}
      </p>
    </Card>
  );
};

/**
 * One game. The whole row is the link — at 375 px a link that is three words
 * inside a sentence is a target nobody hits.
 */
const Entry = ({ calendarYear, detail, href, approximate }: OnThisDayEntry) => {
  const body = (
    <>
      <span className="shrink-0 font-numeric tabular-nums text-sm font-semibold text-ink">
        {calendarYear}
        {approximate && (
          <span title="Reconstructed lineup data" className="text-ink-faint">
            {" ~"}
          </span>
        )}
      </span>
      <span className="text-sm text-ink">{detail}</span>
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
    {/* Nothing reserved: on most days of the year this module is not there,
        and a blank block held open for it would be the page's first thing. */}
    <Suspense fallback={null}>
      <Module />
    </Suspense>
  </Boundary>
);

export default OnThisDay;
