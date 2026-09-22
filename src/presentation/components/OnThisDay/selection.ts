/**
 * Picking what "On this day" shows (E6).
 *
 * The games themselves are worked out at build time — `on-this-day` in the
 * stat registry, shipped whole in `public/data/all-time.json`, one game per
 * season per calendar day, each filed under the day it was over. What is left
 * for the page is the one thing the build cannot know: what day it is for the
 * person reading. That choosing lives here, apart from the component, so it
 * can be tested with a fixed date.
 *
 * ## What "this day" means
 *
 * The reader's own calendar date, against the day each game was over in US
 * Eastern time — the day its last starter stopped scoring, from the
 * play-by-play. So on a Monday it shows games that went to Monday night, on a
 * Sunday the ones settled by Sunday night, and on most Tuesdays, and all
 * summer, nothing: no game in league history was over on that date. That is
 * the honest answer and the module gives it by not appearing, rather than by
 * reaching for the nearest week as it used to.
 */
import type { PrecomputedStat } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";

/** Four is a glance; every season is a page of its own. */
export const HOME_LIMIT = 4;

export interface OnThisDayEntry extends StatEntry {
  /** The year it was played in, which for a January game is not its season. */
  calendarYear: number;
}

export interface OnThisDayView {
  /** "22 September". */
  date: string;
  /** The newest seasons' games on this date, newest first. */
  entries: OnThisDayEntry[];
  /** How many past seasons had a game over on this date, before the cap. */
  total: number;
  /** True when any shown entry rests on reconstructed lineup data (2019). */
  approximate: boolean;
}

/** How the stat files a day: 922 for 22 September. */
const monthDay = (date: Date) => (date.getMonth() + 1) * 100 + date.getDate();

/**
 * A season runs September to January, so a game filed under a January day
 * was played the calendar year after the season it belongs to.
 */
export const calendarYearOf = (entry: StatEntry): number =>
  (entry.year ?? 0) + (Math.floor(entry.value / 100) < 7 ? 1 : 0);

/**
 * The home page's slice of the stat for `today`, or `null` when the stat is
 * not in the file at all — a stale or failed `all-time.json`, which is a fact
 * about the build and not about the league.
 *
 * Only earlier calendar years: a game that was over earlier today is news,
 * not history.
 */
export const selectOnThisDay = (
  stat: PrecomputedStat | undefined,
  today: Date,
  limit: number = HOME_LIMIT
): OnThisDayView | null => {
  if (!stat) return null;

  const day = monthDay(today);
  const matching = stat.entries
    .filter((entry) => entry.value === day)
    .map((entry) => ({ ...entry, calendarYear: calendarYearOf(entry) }))
    .filter((entry) => entry.calendarYear < today.getFullYear())
    .sort((a, b) => b.calendarYear - a.calendarYear);

  const entries = limit > 0 ? matching.slice(0, limit) : matching;

  return {
    date: today.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
    entries,
    total: matching.length,
    approximate: entries.some((entry) => entry.approximate === true),
  };
};
