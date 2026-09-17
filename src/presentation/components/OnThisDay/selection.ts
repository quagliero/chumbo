/**
 * Picking what "On this day" shows (E6).
 *
 * The answer itself is computed at build time — `on-this-day` in the stat
 * registry, shipped in `public/data/all-time.json`. Nothing here recomputes
 * anything; it chooses which of the 25 shipped entries make it onto the home
 * page, and it is separated from the component so the choosing can be tested
 * in the node-environment vitest setup the rest of the repo uses.
 *
 * ## What the stat actually means, and why the heading says so
 *
 * It is NOT a calendar date. It is *the same week of the season* in every year
 * before this one, and the week is read off the latest result in the data. So
 * in mid-September it is Week 1 and in January it is still Week 17, because
 * Week 17 is the last week that was played. A module headed "on this day" that
 * silently showed the nearest thing it had would be lying twice over — about
 * the date, and about there being anything to show at all — so the week is
 * named on the page and an empty archive says it is empty.
 */
import type { PrecomputedStat } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";

/** Four is a glance; the whole list of 25 is a page of its own. */
export const HOME_LIMIT = 4;

export interface OnThisDayView {
  /**
   * The week every entry is from, or null when there is nothing to look back
   * on. Every entry shares it — that is what the stat is.
   */
  week: number | null;
  /** One game per season, loudest first, newest season first. */
  entries: StatEntry[];
  /** How many games the stat found in all, before any cap. */
  total: number;
  /** True when any shown entry rests on reconstructed lineup data (2019). */
  approximate: boolean;
}

/**
 * The home page's slice of the stat, or `null` when the stat is not in the
 * file at all — a stale or failed `all-time.json`, which is a fact about the
 * build and not a story about the league, so the module simply does not
 * appear.
 *
 * An empty `entries` with a non-null result is the honest empty state: the
 * stat ran and found nothing for this week.
 */
export const selectOnThisDay = (
  stat: PrecomputedStat | undefined,
  limit: number = HOME_LIMIT
): OnThisDayView | null => {
  if (!stat) return null;

  // One game per season, newest season first.
  const byYear = new Map<number, StatEntry[]>();
  for (const entry of stat.entries) {
    const year = entry.year ?? entry.value;
    const bucket = byYear.get(year);
    if (bucket) bucket.push(entry);
    else byYear.set(year, [entry]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  // Within a season the stat emits the loudest game first, so taking the first
  // of each season gives four lines that all end "the highest-scoring game of
  // the week" — true every time, and a mail merge to read. So a season yields
  // its loudest game UNLESS a later one has a different kind of story to tell:
  // a title game, the closest finish, the heaviest beating. First choice still
  // goes to the newest season, which is the one people remember.
  const usedKinds = new Set<string>();
  const entries: StatEntry[] = [];
  for (const year of years) {
    if (limit > 0 && entries.length >= limit) break;
    const candidates = byYear.get(year) ?? [];
    const chosen =
      candidates.find((entry) => !usedKinds.has(stakeKind(entry.detail))) ??
      candidates[0];
    if (!chosen) continue;
    usedKinds.add(stakeKind(chosen.detail));
    entries.push(chosen);
  }

  const weeks = new Set(
    entries.map((entry) => entry.week).filter((week): week is number => !!week)
  );

  return {
    // One week or nothing: if the file somehow carries a mix, saying "Week 3"
    // over a list that is not all Week 3 is exactly the lie E6 must not tell.
    week: weeks.size === 1 ? [...weeks][0] : null,
    entries,
    total: stat.total,
    approximate: entries.some((entry) => entry.approximate === true),
  };
};

/**
 * What sort of story a detail line is telling, so four of them are not the
 * same story four times: the clause the stat appends after an em dash, up to
 * its first comma ("the highest-scoring game of the week", "the 2019 title
 * game"). A game with nothing riding on it has no clause and answers "".
 *
 * A deliberately loose read of `identityStats.ts`'s prose. If that prose
 * changes, the worst case is that the variety rule stops finding duplicates —
 * the list is still correct, just less varied — which is the right way round
 * for a presentational nicety to fail.
 */
export const stakeKind = (detail: string | undefined): string => {
  if (!detail) return "";
  const at = detail.lastIndexOf(" — ");
  if (at === -1) return "";
  return detail.slice(at + 3).split(",")[0].trim().toLowerCase();
};

/**
 * The stat's `detail` opens with the year it already shows in a badge
 * ("2025 · ant beat fin, …"). Strips that, and only that.
 */
export const withoutYearPrefix = (
  detail: string | undefined,
  year: number | undefined
): string => {
  if (!detail) return "";
  const prefix = `${year} · `;
  return detail.startsWith(prefix) ? detail.slice(prefix.length) : detail;
};
