import { useMemo } from "react";
import {
  arePlayersLoaded,
  areSeasonPartsLoaded,
  areTransactionsLoaded,
  loadPlayers,
  loadSeasonParts,
  loadTransactions,
  seasons,
  throwIfLoadFailed,
  type SeasonPart,
} from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { ValidYear } from "@/constants/fantasy";

/**
 * A2: no season data is in the bundle, so anything that reads it has to wait
 * for it.
 *
 * These hooks do that the cheapest way React offers — throw the in-flight
 * promise and let the `<Suspense>` boundary already wrapping every route in
 * `App.tsx` show its spinner. Nothing below the hook renders until the data is
 * there, so every synchronous `seasons[year].rosters` read in the components
 * downstream keeps working exactly as it did when it was all eager.
 *
 * Since A2b a read that is NOT behind one of these suspends anyway — every
 * field of `seasons` throws `DataNotLoadedError` until its part is in, and so
 * does `getPlayer`. So the hooks are not what makes a page correct; they are
 * what makes it fast. A page that asks for everything it needs in one hook
 * call fetches it in one round trip, in parallel. A page that leaves it to the
 * reads finds out one missing part at a time: players, then the draft, then...
 *
 * Everything dedupes in flight and caches once resolved, so calling these on
 * every render costs a few `Set.has` after the first time.
 */

/** What a page needs before it can render. */
type Needs = {
  /** Seasons to load `parts` of. */
  years?: readonly number[];
  /** Which parts of `years`. Everything but the transactions by default. */
  parts?: readonly SeasonPart[];
  /** Seasons whose transactions to load. */
  transactions?: readonly number[];
  /** The player dictionary, which is not per season. */
  players?: boolean;
};

const ALL_PARTS: readonly SeasonPart[] = ["core", "draft", "matchups"];

/**
 * Suspend until everything in `needs` is loaded, fetching all of it at once.
 *
 * One throw for the lot rather than one hook per kind, because a hook that
 * throws stops the render, so the hooks after it never start their fetches:
 * three hooks in a row are three round trips back to back. For the same
 * reason it takes more than one `Needs` — different parts of different
 * seasons, still one round trip.
 */
export const useDataLoaded = (...needs: Needs[]): void => {
  const pending: Promise<void>[] = [];

  for (const {
    years = [],
    parts = ALL_PARTS,
    transactions = [],
    players = false,
  } of needs) {
    if (years.length && !areSeasonPartsLoaded(years, parts)) {
      pending.push(loadSeasonParts(years, parts));
    }
    if (transactions.length && !areTransactionsLoaded(transactions)) {
      pending.push(loadTransactions(transactions));
    }
    if (players && !arePlayersLoaded()) pending.push(loadPlayers());
  }

  if (pending.length) {
    // A load that already failed must not be retried by re-rendering — see
    // `DataLoadFailedError`. The error boundary offers the retry instead.
    throwIfLoadFailed();
    throw Promise.all(pending);
  }
};

/** Suspend until `years` are loaded — everything in them but the transactions. */
export const useSeasonsLoaded = (years: readonly number[]): void =>
  useDataLoaded({ years });

/** Suspend until the transactions for `years` are loaded. */
export const useTransactionsLoaded = (
  years: readonly number[],
  enabled = true
): void => useDataLoaded({ transactions: enabled ? years : [] });

/**
 * Suspend until the player dictionary is loaded — 105 kB gzipped, so only
 * for the pages that name players. `getPlayer` suspends on its own without
 * it; this is for starting the fetch alongside a page's other data.
 */
export const usePlayersLoaded = (enabled = true): void =>
  useDataLoaded({ players: enabled });

/**
 * One season, for the pages about one season. Suspends until everything in
 * it but the transactions has loaded, plus the player dictionary if `players`.
 */
export const useSeasonData = (year: number, { players = false } = {}) => {
  useDataLoaded({ years: [year], players });
  return seasons[year as ValidYear];
};

/**
 * Every season, for the all-time pages. Suspends until all of them are
 * loaded — and the player dictionary with them unless `players: false`,
 * because almost every all-time page names a player somewhere, and asking
 * for it here fetches it alongside the seasons instead of after them.
 *
 * Returns the shared `seasons` object, so callers may equally keep importing it
 * from `@/data` — the hook is what makes the page fetch it in one go.
 */
export const useAllSeasons = ({ players = true } = {}) => {
  useDataLoaded({ years: YEAR_NUMBERS, players });
  return seasons;
};

/**
 * This season's transactions, loaded separately from its matchups because they
 * are the single biggest thing in the data set (6.0 MB raw) and only two pages
 * read them.
 *
 * @param enabled - pass `false` on the tabs that do not show trades, so they
 * never pay for the fetch. Safe to flip between renders: no React hook is
 * called either side of it.
 */
export const useSeasonTransactions = (year: number, enabled = true) => {
  useTransactionsLoaded([year], enabled);
  return seasons[year as ValidYear]?.transactions;
};

/** Every season's transactions, for the all-time trades table. */
export const useAllTransactions = (enabled = true) => {
  useTransactionsLoaded(YEAR_NUMBERS, enabled);
  return seasons;
};

/**
 * Custom hook for getting available years
 * @returns Array of available years sorted descending
 */
export const useAvailableYears = () => {
  return useMemo(() => {
    return Object.keys(seasons)
      .map((year) => Number(year))
      .sort((a, b) => b - a);
  }, []);
};

/**
 * Custom hook for getting the most recent season
 * @returns Most recent season data
 */
export const useMostRecentSeason = () => {
  return useMemo(() => {
    const years = Object.keys(seasons)
      .map(Number)
      .sort((a, b) => b - a);
    return seasons[years[0] as ValidYear];
  }, []);
};
