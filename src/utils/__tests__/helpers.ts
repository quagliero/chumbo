import { seasons } from "@/data";
import { CURRENT_YEAR, YEARS } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";

/**
 * Shared helpers for the stat snapshot / invariant suites.
 *
 * These exist only so that the snapshots stay a readable size. Several
 * `getManagerStats` fields are very long lists (a manager can have 1,700+
 * `topPerformances`); serialising them in full produces ~8 MB of snapshots,
 * which is unreviewable. Instead we snapshot the head of the list plus a
 * digest of the whole thing, so *any* change anywhere in the list still fails
 * the snapshot while the diff stays legible.
 */
/**
 * cyrb53 — a small, well-distributed 53-bit string hash. Used instead of
 * `node:crypto` so these helpers stay inside the app's DOM-only tsconfig with
 * no `@types/node` dependency.
 */
const cyrb53 = (input: string, seed: number): number => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

export const digest = (value: unknown): string => {
  const json = JSON.stringify(value) ?? "undefined";
  return [
    json.length.toString(16),
    cyrb53(json, 0).toString(16),
    cyrb53(json, 0x9e3779b9).toString(16),
  ].join("-");
};

export interface ListSummary<T> {
  count: number;
  head: T[];
  digest: string;
}

export const summariseList = <T>(list: T[], head = 10): ListSummary<T> => ({
  count: list.length,
  head: list.slice(0, head),
  digest: digest(list),
});

/** Rosters for a season, in a stable roster_id order. */
export const rostersFor = (year: number): ExtendedRoster[] =>
  [...(seasons[year]?.rosters ?? [])].sort(
    (a, b) => a.roster_id - b.roster_id
  );

/** Matchup weeks present for a season, ascending. */
export const weeksFor = (year: number): number[] =>
  Object.keys(seasons[year]?.matchups ?? {})
    .map(Number)
    .sort((a, b) => a - b);

/** Every matchup entry in the league, year/week/roster ordered. */
export const everyMatchup = (): Array<{
  year: number;
  week: number;
  matchup: ExtendedMatchup;
}> => {
  const out: Array<{ year: number; week: number; matchup: ExtendedMatchup }> =
    [];
  YEARS.forEach((year) => {
    const season = seasons[year];
    if (!season?.matchups) return;
    weeksFor(year).forEach((week) => {
      const weekMatchups = (
        season.matchups as unknown as Record<string, ExtendedMatchup[]>
      )[String(week)];
      if (!weekMatchups) return;
      [...weekMatchups]
        .sort((a, b) => a.roster_id - b.roster_id)
        .forEach((matchup) => out.push({ year, week, matchup }));
    });
  });
  return out;
};

/** Round to 4dp so float noise doesn't make reconciliation tests flaky. */
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * The last season the hand-checked facts in these suites were checked against.
 *
 * The automatic update (J1) fetches the live season two or three times a week
 * and publishes it only if this suite passes, so no test may fail because the
 * live season did something new: set a record, crown a Scumbo, top a
 * leaderboard. A fact checked by hand is pinned to the seasons that had
 * finished when it was checked. Anything that takes in the live season is a
 * snapshot instead, and the update re-records those.
 */
export const PINNED_THROUGH = 2025;

/** Whether the newest season is still being played. */
export const liveSeasonInProgress = (): boolean =>
  seasons[CURRENT_YEAR]?.league?.status !== "complete";
