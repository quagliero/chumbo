import { useMemo } from "react";
import {
  areSeasonsLoaded,
  areTransactionsLoaded,
  loadSeasons,
  loadTransactions,
  seasons,
} from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { ValidYear } from "@/constants/fantasy";

/**
 * A2a: matchups and transactions are no longer in the main bundle, so anything
 * that reads them has to wait for them.
 *
 * These hooks do that the cheapest way React offers — throw the in-flight
 * promise and let the `<Suspense>` boundary already wrapping every route in
 * `App.tsx` show its spinner. Nothing below the hook renders until the data is
 * there, so every existing synchronous `seasons[year].matchups[week]` read in
 * the components downstream keeps working exactly as it did.
 *
 * `loadSeasons` / `loadTransactions` dedupe in flight and cache once resolved,
 * so calling these on every render costs a `Set.has` after the first time.
 */

/** Suspend until the matchups for `years` are loaded. */
export const useSeasonsLoaded = (years: readonly number[]): void => {
  if (!areSeasonsLoaded(years)) throw loadSeasons(years);
};

/** Suspend until the transactions for `years` are loaded. */
export const useTransactionsLoaded = (
  years: readonly number[],
  enabled = true
): void => {
  if (enabled && !areTransactionsLoaded(years)) throw loadTransactions(years);
};

/**
 * Custom hook for getting season data
 * @param year - The year to get data for
 * @returns Season data or undefined if not found
 *
 * Suspends until that season's matchups have loaded.
 */
export const useSeasonData = (year: number) => {
  useSeasonsLoaded([year]);
  return seasons[year as ValidYear];
};

/**
 * Every season, for the all-time pages. Suspends until all of them are loaded.
 *
 * Returns the shared `seasons` object, so callers may equally keep importing it
 * from `@/data` — the hook is what guarantees it is populated.
 */
export const useAllSeasons = () => {
  useSeasonsLoaded(YEAR_NUMBERS);
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
